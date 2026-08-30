// POST /api/self-serve/assinatura — a porta da COBRANÇA MENSAL.
//
// ─── POR QUE ELA EXISTE (achado do CEO, 27/08/2026) ─────────────────────────
//
// `order/route.ts` cria uma `preference` de Checkout Pro: cobrança AVULSA, uma
// vez e acabou. A vitrine, porém, vende PLANO MENSAL. Do segundo mês em diante a
// casa entregava e não recebia. Esta rota cria um `preapproval` — a assinatura
// de verdade do Mercado Pago, que cobra sozinha todo mês.
//
// ─── AS GUARDAS, E ELAS SÃO AS MESMAS DA ROTA IRMÃ ──────────────────────────
//
// Rota PÚBLICA que ESCREVE no banco e fala com o gateway. Herda a defesa
// composta de `order/route.ts` — teto por IP no banco, teto global da rota,
// forma do pedido conferida —, porque o ataque que enche `ClientRequestDb` por
// uma porta enche pela outra. Copiar a trava é feio; não ter a trava é defeito.
//
// ⛔ E DUAS QUE SÓ EXISTEM AQUI:
//
//   1. **O PISO.** Assinatura é um preço repetido doze vezes. Um centavo abaixo
//      do piso aqui é o ano inteiro no prejuízo, não um mês. O preço NÃO vem do
//      corpo da requisição em hipótese nenhuma: vem da tabela da casa, pelo id
//      do plano. Quem manda `valor` no JSON é ignorado — e é assim que se recusa
//      a existir uma porta pela qual o cliente escolhe quanto paga.
//   2. **DONO OBRIGATÓRIO.** Toda assinatura nasce com quem cuida dela quando a
//      cobrança falhar. Inadimplência sem dono é cliente parado que ninguém liga.
//
// ⚠️ Esta rota NÃO cobra ninguém. Ela cria a autorização e devolve o link em que
// o cliente aceita — quem cobra é o provedor, no dia do vencimento.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { PLANOS } from "@/lib/agency/planos";
import { pisoDoServico, servicoPorChave } from "@/lib/agency/financeiro/tabela-de-precos";
import { registrarAssinatura } from "@/lib/agency/financeiro/assinatura";
import { consumirVaga, respostaDeRecusa } from "@/lib/security/limite-no-banco";
import { clientIp } from "@/lib/security/rate-limit";

const ASSINATURAS_POR_IP = 3;
const JANELA_DO_IP_MS = 10 * 60_000;
const ASSINATURAS_POR_HORA_NA_ROTA = 30;
const JANELA_GLOBAL_MS = 60 * 60_000;

const MP_PREAPPROVAL_URL = "https://api.mercadopago.com/preapproval";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";
const AGENCY_WHATSAPP = "5511989400692";

/** Quem cuida da inadimplência enquanto a casa não tem um financeiro de gente.
 *  Escrito, e não vazio: um dono genérico ainda é um dono; nenhum não é. */
const DONO_PADRAO = "Dioli Digital — financeiro";

/** Os planos MENSAIS que podem virar assinatura. O Pulso não entrega peça. */
const PLANOS_MENSAIS = ["ritmo", "presenca", "conteudo"] as const;
type PlanoMensal = (typeof PLANOS_MENSAIS)[number];

const EMAIL_PLAUSIVEL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function limpar(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

export interface AssinaturaBody {
  clientRequestId: string;
  planoId: string;
  email: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const porIp = await consumirVaga(`self-serve-assinatura:${clientIp(req)}`, ASSINATURAS_POR_IP, JANELA_DO_IP_MS);
  if (!porIp.liberado) return respostaDeRecusa(porIp) as NextResponse;
  const global = await consumirVaga("self-serve-assinatura:global", ASSINATURAS_POR_HORA_NA_ROTA, JANELA_GLOBAL_MS);
  if (!global.liberado) return respostaDeRecusa(global) as NextResponse;

  let body: AssinaturaBody;
  try {
    body = (await req.json()) as AssinaturaBody;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const clientRequestId = limpar(body.clientRequestId, 60);
  const planoId = limpar(body.planoId, 40) as PlanoMensal;
  const email = limpar(body.email, 160).toLowerCase();

  if (!clientRequestId || !planoId || !email) {
    return NextResponse.json({ ok: false, error: "Campos obrigatórios: clientRequestId, planoId, email." }, { status: 400 });
  }
  if (!EMAIL_PLAUSIVEL.test(email)) {
    return NextResponse.json({ ok: false, error: "E-mail inválido." }, { status: 400 });
  }
  if (!PLANOS_MENSAIS.includes(planoId)) {
    return NextResponse.json({ ok: false, error: "Plano mensal não encontrado." }, { status: 404 });
  }

  const plano = PLANOS.find((p) => p.id === planoId);
  const servico = servicoPorChave(`plano_${planoId}`);
  if (!plano || !servico) {
    return NextResponse.json({ ok: false, error: "Plano fora da tabela da casa." }, { status: 404 });
  }

  // O pedido tem de existir. Assinatura pendurada em pedido inventado é uma
  // cobrança mensal que ninguém consegue ligar a uma entrega.
  const pedido = await prisma.clientRequestDb
    .findUnique({ where: { id: clientRequestId }, select: { id: true, clientId: true } })
    .catch(() => null);
  if (!pedido) {
    return NextResponse.json({ ok: false, error: "Pedido não encontrado." }, { status: 404 });
  }

  // ⛔ O PREÇO SAI DA TABELA, NUNCA DO CORPO. E passa pelo piso.
  const valorCentavos = servico.precoFinalCentavos;
  const piso = pisoDoServico(servico);
  if (valorCentavos < piso) {
    console.error(`[self-serve/assinatura] preço de tabela do ${servico.nome} abaixo do próprio piso — assinatura recusada.`);
    return NextResponse.json({ ok: false, error: "Preço indisponível no momento." }, { status: 409 });
  }

  const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!mpToken) {
    // Plano mensal sem gateway não vira pedido: sem cobrança automática, a casa
    // entrega o mês 2 de graça. Porta FECHADA e frase honesta — a mesma decisão
    // já tomada para o balcão em `order/route.ts`.
    return NextResponse.json(
      {
        ok: false,
        error:
          "A assinatura online está indisponível neste momento. Chame a Dioli no WhatsApp que a gente fecha o plano por lá.",
        whatsappUrl: `https://wa.me/${AGENCY_WHATSAPP}`,
      },
      { status: 503 },
    );
  }

  let preapprovalId: string;
  let initPoint: string | undefined;
  try {
    const mpRes = await fetch(MP_PREAPPROVAL_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${mpToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: `Dioli Digital — plano ${plano.nome}`,
        external_reference: clientRequestId,
        payer_email: email,
        back_url: `${APP_URL}/vitrine/sucesso?order=${clientRequestId}&assinatura=1`,
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: valorCentavos / 100,
          currency_id: "BRL",
        },
        status: "pending",
      }),
    });
    if (!mpRes.ok) {
      console.warn(`[self-serve/assinatura] provedor recusou a criação (${mpRes.status}).`);
      return NextResponse.json(
        { ok: false, error: "Não conseguimos abrir a assinatura agora. Chame a Dioli no WhatsApp.", whatsappUrl: `https://wa.me/${AGENCY_WHATSAPP}` },
        { status: 502 },
      );
    }
    const mpData = (await mpRes.json()) as { id?: string; init_point?: string; sandbox_init_point?: string };
    if (!mpData.id) {
      return NextResponse.json({ ok: false, error: "Resposta do provedor sem id de assinatura." }, { status: 502 });
    }
    preapprovalId = mpData.id;
    initPoint = mpData.init_point ?? mpData.sandbox_init_point;
  } catch (err) {
    console.warn("[self-serve/assinatura] erro ao falar com o provedor:", err);
    return NextResponse.json({ ok: false, error: "Não conseguimos abrir a assinatura agora." }, { status: 502 });
  }

  const r = await registrarAssinatura({
    clientRequestId,
    clientId: pedido.clientId,
    planoId,
    valorCentavos,
    provedorAssinaturaId: preapprovalId,
    dono: DONO_PADRAO,
    estado: "pendente",
  });
  if (!r.ok) {
    // A assinatura existe no provedor e não na casa. Isso é caso de gente olhar
    // AGORA: o cliente pode autorizar e começar a pagar sem que a casa saiba —
    // e o portão, sem a linha, mantém a produção parada (falha fechada, que é o
    // lado certo de errar, mas com um cliente pagando e sem receber).
    console.error(
      `[self-serve/assinatura] ASSINATURA CRIADA NO PROVEDOR (${preapprovalId}) E NÃO REGISTRADA NA CASA: ${r.motivo}. ` +
      `Registre à mão ou cancele o preapproval no painel do Mercado Pago.`,
    );
    return NextResponse.json({ ok: false, error: "Não conseguimos concluir a assinatura. Chame a Dioli no WhatsApp." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    assinaturaId: r.assinaturaId,
    jaExistia: r.jaExistia,
    checkoutUrl: initPoint,
    valor: valorCentavos / 100,
    plano: plano.nome,
  });
}
