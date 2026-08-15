// POST /api/self-serve/order
// Creates a self-serve order from the public vitrine.
//
// 1. Saves the order as a ClientRequestDb (source = "self_serve").
// 2. If MERCADOPAGO_ACCESS_TOKEN is configured, creates a Checkout Pro
//    preference and returns the init_point URL for redirect.
// 3. If no payment gateway is configured, returns success with a WhatsApp
//    follow-up (manual payment via Pix/WhatsApp).

// ── AS GUARDAS DESTA ROTA (raio-x de 05/08/2026) ────────────────────────────
// Ela é PÚBLICA por contrato de produto: quem chega pela vitrine não tem sessão.
// Mas ela ESCREVE no banco, e não tinha guarda nenhuma — nem sessão, nem
// assinatura, nem teto por IP. Um laço de `curl` enchia o volume do Railway de
// `ClientRequestDb` e afogava a fila de trabalho da agência (a mesma tabela que
// alimenta a triagem). Sem sessão, a única identidade que existe é o IP, e por
// isso a defesa é composta — nenhuma das camadas sozinha basta:
//
//   1. TETO POR IP, NO BANCO. `limite-no-banco` sobrevive a deploy e a réplica.
//      Um contador em memória aqui seria pior que nada: o atacante recupera a
//      cota inteira a cada publicação, e esta casa publica várias vezes por dia.
//   2. TETO GLOBAL DA ROTA. IP é barato de trocar; o teto global é o que segura
//      o ataque distribuído, ao custo de recusar pedido legítimo num pico
//      absurdo. Recusar 20 pedidos numa hora é problema menor que 50 mil linhas.
//   3. FORMA DO PEDIDO CONFERIDA. Nome, e-mail e telefone com tamanho máximo e
//      formato mínimo — campo livre sem teto é o outro jeito de encher o volume.
//   4. DEDUP POR JANELA. O mesmo e-mail pedindo o mesmo item em 10 minutos NÃO
//      cria linha nova: devolve o pedido que já existe. Isso conserta o duplo
//      clique do comprador e tira o valor de repetir a requisição.
//   5. DONO DERIVADO NO SERVIDOR. O `workspaceId` sai de
//      `resolverWorkspacePublico()`, nunca do corpo — o comprador não escolhe em
//      qual agência o pedido dele cai.
//
// PII: nome, e-mail e telefone do comprador ficam na linha do pedido e NUNCA
// entram em log. O que se loga é o motivo da recusa, sem os campos.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { baseDeLink } from "@/lib/http/endereco-publico";
import { SELF_SERVE_CATALOG } from "@/lib/agency/self-serve-catalog";
import { consumirVaga, respostaDeRecusa } from "@/lib/security/limite-no-banco";
import { clientIp } from "@/lib/security/rate-limit";
import { resolverWorkspacePublico } from "@/lib/agency/persistence/client-request-service";

// Um comprador de verdade faz 1 ou 2 pedidos. Cinco em dez minutos já é loop.
const PEDIDOS_POR_IP = 5;
const JANELA_DO_IP_MS = 10 * 60_000;
// O teto da ROTA INTEIRA, contra ataque distribuído. Calibrado com folga sobre o
// volume real do balcão — se um dia ele barrar venda de verdade, o número sobe
// por decisão registrada, não por remoção da trava.
const PEDIDOS_POR_HORA_NA_ROTA = 60;
const JANELA_GLOBAL_MS = 60 * 60_000;
// Janela em que o MESMO comprador pedindo o MESMO item devolve o pedido antigo.
const JANELA_DE_DEDUP_MS = 10 * 60_000;

const MAX_NOME = 120;
const MAX_EMAIL = 160;
const MAX_TELEFONE = 32;
const MAX_OBSERVACAO = 2000;
const EMAIL_PLAUSIVEL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Pelo menos 8 dígitos em algum lugar — aceita "+55 (11) 99999-9999" e recusa lixo.
const TELEFONE_PLAUSIVEL = /(?:\D*\d){8,}/;

/** Texto de campo público: apara, corta o tamanho e some com caractere de
 *  controle (que não aparece na tela e polui log e CSV). */
function limpar(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

const AGENCY_WHATSAPP = "5511989400692";
const MP_PREFERENCES_URL = "https://api.mercadopago.com/checkout/preferences";
// Base única (`lib/http/endereco-publico.ts`). Era string VAZIA sem a
// variável: o Mercado Pago recebia `/vitrine/sucesso` como URL de retorno
// e o comprador voltava para lugar nenhum depois de pagar.
const APP_URL = baseDeLink();

export interface OrderBody {
  serviceId: string;
  name: string;
  email: string;
  phone: string;          // e.g. "+55 11 99999-9999"
  note?: string;          // optional brief from buyer
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── GUARDA 1: teto por IP, contado no banco (sobrevive ao deploy) ─────────
  const porIp = await consumirVaga(
    `self-serve-order:${clientIp(req)}`,
    PEDIDOS_POR_IP,
    JANELA_DO_IP_MS,
  );
  if (!porIp.liberado) return respostaDeRecusa(porIp) as NextResponse;

  // ── GUARDA 2: teto da rota inteira, contra muitos IPs ────────────────────
  const global = await consumirVaga(
    "self-serve-order:global",
    PEDIDOS_POR_HORA_NA_ROTA,
    JANELA_GLOBAL_MS,
  );
  if (!global.liberado) return respostaDeRecusa(global) as NextResponse;

  let body: OrderBody;
  try {
    body = (await req.json()) as OrderBody;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  // ── GUARDA 3: a forma do pedido ──────────────────────────────────────────
  // `serviceId` NUNCA é usado como texto livre: ele só serve para achar um item
  // do catálogo fechado. Item desconhecido é recusa, nunca "cria assim mesmo".
  const serviceId = limpar(body.serviceId, 80);
  const name = limpar(body.name, MAX_NOME);
  const email = limpar(body.email, MAX_EMAIL).toLowerCase();
  const phone = limpar(body.phone, MAX_TELEFONE);
  const note = limpar(body.note, MAX_OBSERVACAO) || undefined;

  if (!serviceId || !name || !email || !phone) {
    return NextResponse.json({ ok: false, error: "Campos obrigatórios: serviceId, name, email, phone." }, { status: 400 });
  }
  if (!EMAIL_PLAUSIVEL.test(email)) {
    return NextResponse.json({ ok: false, error: "E-mail inválido." }, { status: 400 });
  }
  if (!TELEFONE_PLAUSIVEL.test(phone)) {
    return NextResponse.json({ ok: false, error: "WhatsApp inválido." }, { status: 400 });
  }

  const service = SELF_SERVE_CATALOG.find((s) => s.id === serviceId);
  if (!service) {
    return NextResponse.json({ ok: false, error: "Serviço não encontrado." }, { status: 404 });
  }

  // ── GUARDA 4: dedup por janela ───────────────────────────────────────────
  // Duplo clique e retry de rede não podem virar duas linhas. A busca é pelo
  // par (item, e-mail) dentro da janela; achando, devolve o pedido existente.
  const jaExiste = await prisma.clientRequestDb.findFirst({
    where: {
      source: "self_serve",
      createdAt: { gte: new Date(Date.now() - JANELA_DE_DEDUP_MS) },
      briefingJson: { contains: `"prospectEmail":"${email}"` },
      services: { contains: service.label },
    },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });
  if (jaExiste) {
    return NextResponse.json({
      ok: true,
      orderId: jaExiste.id,
      duplicado: true,
      whatsappUrl: `https://wa.me/${AGENCY_WHATSAPP}`,
      method: "duplicado",
    });
  }

  // ── 1. Save order as a ClientRequestDb ─────────────────────────────────
  const rawContext = [
    `Serviço: ${service.label}`,
    `Valor: R$ ${service.price}`,
    `Nome: ${name}`,
    `Email: ${email}`,
    `WhatsApp: ${phone}`,
    note ? `Observação: ${note}` : "",
  ].filter(Boolean).join("\n");

  let dbId: string;
  try {
    const row = await prisma.clientRequestDb.create({
      data: {
        // ── GUARDA 5: o dono é resolvido pelo SERVIDOR ────────────────────
        // O comprador não diz em qual agência o pedido cai. `undefined` deixa a
        // linha órfã de propósito quando há mais de um workspace — e órfã é
        // julgada pela política fail-closed de `lib/auth/posse-de-workspace.ts`.
        workspaceId:  await resolverWorkspacePublico(),
        businessName: name,
        segment:      service.category,
        services:     JSON.stringify([service.label]),
        objectives:   JSON.stringify([service.description]),
        rawContext,
        source:       "self_serve",
        status:       "new",
        attachmentsJson: "[]",
        briefingJson: JSON.stringify({
          // O ID DO ITEM. É por ele que a produção automática do balcão sabe o
          // que foi comprado — sem isso, pagamento aprovado vira pedido mudo.
          serviceId: service.id,
          precoPago: service.price,
          businessName: name,
          segment: service.category,
          objectives: [service.description],
          wantsSocialMedia: service.category === "social" || service.category === "video",
          wantsPaidTraffic: service.category === "traffic",
          branding: { requested: service.category === "design", wantsRebrand: false },
          budgetRange: `R$ ${service.price}`,
          prospectName:  name,
          prospectEmail: email,
          prospectPhone: phone,
        }),
      },
    });
    dbId = row.id;
  } catch (err) {
    console.error("[self-serve/order] DB error:", err);
    return NextResponse.json({ ok: false, error: "Erro ao salvar pedido." }, { status: 500 });
  }

  // ── 2. Mercado Pago Checkout Pro (if configured) ────────────────────────
  const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (mpToken) {
    try {
      const preference = {
        items: [
          {
            id:          service.id,
            title:       service.label,
            description: service.description,
            quantity:    1,
            unit_price:  service.price,
            currency_id: "BRL",
          },
        ],
        payer: { name, email },
        back_urls: {
          success: `${APP_URL}/vitrine/sucesso?order=${dbId}`,
          failure: `${APP_URL}/vitrine?erro=pagamento`,
          pending: `${APP_URL}/vitrine/sucesso?order=${dbId}&pending=1`,
        },
        auto_return: "approved",
        notification_url: `${APP_URL}/api/self-serve/webhook`,
        external_reference: dbId,
        statement_descriptor: "Dioli Digital",
      };

      const mpRes = await fetch(MP_PREFERENCES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${mpToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(preference),
      });

      if (mpRes.ok) {
        const mpData = (await mpRes.json()) as { init_point?: string; sandbox_init_point?: string };
        const checkoutUrl = mpData.init_point ?? mpData.sandbox_init_point;
        if (checkoutUrl) {
          return NextResponse.json({ ok: true, orderId: dbId, checkoutUrl, method: "mercadopago" });
        }
      }
      // MP failed — fall through to WhatsApp flow
      console.warn("[self-serve/order] MP checkout failed, falling back to WhatsApp.");
    } catch (err) {
      console.warn("[self-serve/order] MP error:", err);
    }
  }

  // ── ITEM DE BALCÃO SEM GATEWAY NÃO VIRA PEDIDO ─────────────────────────
  // O balcão só é lucrativo com pagamento ANTES da produção: num item de R$ 39,
  // cobrar depois é prejuízo garantido — e o caminho do WhatsApp grava o pedido
  // sem ter recebido nada. Configuração faltando vira porta FECHADA, e a pessoa
  // recebe uma frase honesta em vez de um pedido que ninguém vai produzir.
  if (service.id.startsWith("balcao-")) {
    await prisma.clientRequestDb.delete({ where: { id: dbId } }).catch(() => {});
    return NextResponse.json(
      {
        ok: false,
        error:
          "O pagamento online está indisponível neste momento. Chame a Dioli no WhatsApp que a gente fecha por lá.",
      },
      { status: 503 },
    );
  }

  // ── 3. Fallback: WhatsApp manual flow ──────────────────────────────────
  const waText = encodeURIComponent(
    `Olá! Acabei de solicitar o serviço *${service.label}* (R$ ${service.price}) pela vitrine da Dioli Digital.\n\nNome: ${name}\nE-mail: ${email}${note ? `\n\nObservação: ${note}` : ""}`
  );
  const whatsappUrl = `https://wa.me/${AGENCY_WHATSAPP}?text=${waText}`;

  return NextResponse.json({ ok: true, orderId: dbId, whatsappUrl, method: "whatsapp" });
}
