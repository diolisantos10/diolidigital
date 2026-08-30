// POST /api/self-serve/webhook
// Receives Mercado Pago IPN / Webhook notifications for self-serve orders.
// On payment approved: marks the ClientRequestDb as "in_progress".

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db/client";
import { produzirPedidoDeBalcao } from "@/lib/agency/balcao/producao";
import { registrarPagamento } from "@/lib/agency/financeiro/portao-de-pagamento";
import { cancelarAssinatura, registrarCobranca } from "@/lib/agency/financeiro/assinatura";
import { liquidoDoPagamento, taxaDoPagamento } from "@/lib/agency/financeiro/taxa-do-gateway";

// Valida o HMAC `x-signature` do Mercado Pago. Manifesto, conforme a doc:
//   id:<data.id>;request-id:<x-request-id>;ts:<ts>;
//
// ⚠️ FAIL-CLOSED. Isto retornava `true` quando MERCADOPAGO_WEBHOOK_SECRET não
// estava definido — "para não travar uma instância sem configuração". O efeito
// real: qualquer um com a URL fazia um POST e marcava um pedido como PAGO. Um
// webhook de pagamento sem verificação de assinatura não é um webhook com um
// aviso; é uma rota que dá serviço de graça a quem descobrir o endereço.
//
// Sem o segredo, ninguém passa. A instância "sem configuração" já exige
// MERCADOPAGO_ACCESS_TOKEN para chegar até aqui — quem tem um tem o outro.
function verifyMpSignature(req: NextRequest, dataId: string): boolean {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error("[self-serve/webhook] MERCADOPAGO_WEBHOOK_SECRET ausente — webhook RECUSADO. Defina a variável nas Variables do Railway com o mesmo valor do painel do Mercado Pago.");
    return false;
  }
  const sig = req.headers.get("x-signature");
  const requestId = req.headers.get("x-request-id") ?? "";
  if (!sig) return false;
  const parts = Object.fromEntries(sig.split(",").map((p) => p.split("=").map((x) => x.trim())));
  const ts = parts.ts, v1 = parts.v1;
  if (!ts || !v1) return false;
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  try { return timingSafeEqual(Buffer.from(expected), Buffer.from(v1)); } catch { return false; }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!mpToken) return NextResponse.json({ ok: false }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // MP manda { type, data: { id } }. Três tipos interessam a esta casa:
  //
  //   • `payment`                        — a compra avulsa do balcão;
  //   • `subscription_authorized_payment`— a MENSALIDADE de uma assinatura;
  //   • `subscription_preapproval`       — a assinatura em si mudou de estado
  //                                        (autorizada, pausada, CANCELADA).
  //
  // Qualquer outro tipo é ignorado com 200: devolver erro faria o Mercado Pago
  // reenviar para sempre um aviso que a casa nunca vai querer.
  const type = (body.type ?? body.action) as string | undefined;
  const dataId = (body.data as Record<string, string> | undefined)?.id;
  const TIPOS = ["payment", "subscription_authorized_payment", "subscription_preapproval"];
  if (!type || !dataId || !TIPOS.some((t) => type.startsWith(t))) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  // ⚠️ A ASSINATURA DO AVISO É CONFERIDA PARA **TODOS** OS TIPOS, e antes de
  // qualquer leitura. *Webhook de pagamento sem verificação de assinatura não é
  // webhook* — e um aviso de assinatura forjado é pior que um de pagamento: ele
  // libera doze meses de produção, não um.
  if (!verifyMpSignature(req, dataId)) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }

  if (type.startsWith("subscription_preapproval")) {
    return tratarMudancaDeAssinatura(dataId, mpToken);
  }
  if (type.startsWith("subscription_authorized_payment")) {
    return tratarMensalidade(dataId, mpToken);
  }

  const paymentId = dataId;

  try {
    // Fetch payment from MP to get status + external_reference
    const pmRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${mpToken}` },
    });
    if (!pmRes.ok) return NextResponse.json({ ok: false }, { status: 502 });

    const pm = (await pmRes.json()) as {
      status?: string;
      external_reference?: string;
      transaction_amount?: number;
      currency_id?: string;
      date_approved?: string;
      fee_details?: Array<{ type?: string; amount?: number }>;
      transaction_details?: { net_received_amount?: number };
    };

    // ⚠️ `=== "approved"` e nada mais. "não recusado" NÃO é "pago": `pending`,
    // `in_process` e `authorized` são todos estados em que o dinheiro ainda não
    // entrou, e um `!== "rejected"` aqui produziria de graça para cada boleto
    // emitido e nunca compensado.
    if (pm.status === "approved" && pm.external_reference) {
      // ── PRIMEIRO A TESTEMUNHA, DEPOIS A PRODUÇÃO ──────────────────────────
      // Esta é a ÚNICA escrita automática de `PagamentoConfirmado` na casa, e é
      // ela que o portão de `lib/agency/financeiro/portao-de-pagamento.ts` lê.
      // Tem de vir ANTES de `produzirPedidoDeBalcao`, porque a produção do
      // balcão passa pelo mesmo portão: gravar depois faria o pedido recém-pago
      // bater na própria trava.
      //
      // O VALOR vem do provedor (`transaction_amount`, em reais), nunca do
      // catálogo da casa: o catálogo diz o que a gente PEDIU, e o portão precisa
      // saber o que ENTROU. Sem valor, ou com valor zerado, `registrarPagamento`
      // recusa a linha — e sem linha não há produção. Falha fechada.
      const centavos = Math.round((pm.transaction_amount ?? 0) * 100);
      // ── A TAXA DO GATEWAY, MEDIDA E GUARDADA (27/08/2026) ────────────────
      // Ela vinha neste mesmo JSON e era jogada fora. É a ÚNICA fonte honesta
      // do que o Mercado Pago realmente retém — a tabela de taxas dele diz o que
      // ele promete reter, e as duas coisas não são iguais. Ausente, grava NULO:
      // *nulo é não medido, nunca taxa zero.*
      const registro = await registrarPagamento({
        clientRequestId: pm.external_reference,
        origem: "mercadopago",
        valorCentavos: centavos,
        provedorId: String(paymentId),
        moeda: pm.currency_id ?? "BRL",
        confirmadoEm: pm.date_approved ? new Date(pm.date_approved) : new Date(),
        taxaCentavos: taxaDoPagamento(pm),
        liquidoCentavos: liquidoDoPagamento(pm),
      });
      if (!registro.ok) {
        // Sem testemunha não há produção — e é isso que tem de acontecer. O que
        // NÃO pode acontecer é o silêncio: o pagamento entrou de verdade no
        // provedor e a casa não conseguiu registrar. Isso é caso de gente olhar.
        console.error(
          `[self-serve/webhook] PAGAMENTO APROVADO NO PROVEDOR E NÃO REGISTRADO (pedido ${pm.external_reference}, pagamento ${paymentId}): ${registro.motivo}. ` +
          "A produção NÃO vai começar até alguém registrar este pagamento à mão.",
        );
      }

      await prisma.clientRequestDb.update({
        where: { id: pm.external_reference },
        data:  { status: "in_progress" },
      });

      // ── PAGOU, PRODUZ. ───────────────────────────────────────────────────
      // Até 05/08/2026 o webhook parava na linha acima: o pedido virava
      // "in_progress" e ficava esperando alguém empurrar à mão. Num item de
      // R$ 79 uma única intervenção humana come a margem do mês — o balcão só
      // fecha a conta se a produção começar sozinha. Abre cliente, projeto e
      // acesso ao portal, e entrega o resto à esteira que já existe.
      //
      // Falhar aqui NÃO desfaz o pagamento: o pedido continua pago e visível
      // para o time. Por isso o erro é registrado e a resposta ao gateway
      // continua 200 — devolver erro faria o Mercado Pago reenviar para sempre.
      const produzido = await produzirPedidoDeBalcao(pm.external_reference).catch(
        (e: unknown) => ({ ok: false as const, motivo: e instanceof Error ? e.message : "falha" }),
      );
      if (!produzido.ok) {
        console.error("[self-serve/webhook] producao do balcao nao iniciou:", produzido.motivo);
      }
    }
  } catch (err) {
    console.error("[self-serve/webhook] error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}


// ═══════════════════════════════════════════════════════════════════════════
// A RECORRÊNCIA — os dois avisos que a casa não sabia receber
// ═══════════════════════════════════════════════════════════════════════════
//
// Ambos já chegam com a assinatura do aviso CONFERIDA lá em cima. Ambos
// respondem 200 mesmo quando a casa falha em processar — porque 200 é o que faz
// o Mercado Pago parar de reenviar, e o erro que precisa de gente vai para o log
// com as palavras que fazem alguém agir, não para a resposta HTTP.

/** A MENSALIDADE. É esta linha que libera o mês no portão de pagamento. */
async function tratarMensalidade(id: string, mpToken: string): Promise<NextResponse> {
  const res = await fetch(`https://api.mercadopago.com/authorized_payments/${id}`, {
    headers: { Authorization: `Bearer ${mpToken}` },
  }).catch(() => null);
  if (!res || !res.ok) {
    console.error(`[self-serve/webhook] não consegui ler a mensalidade ${id} no provedor — a produção do mês NÃO será liberada.`);
    return NextResponse.json({ ok: false }, { status: 502 });
  }
  const ap = (await res.json()) as {
    preapproval_id?: string;
    status?: string;
    transaction_amount?: number;
    currency_id?: string;
    date_created?: string;
    payment?: { id?: number | string; status?: string; status_detail?: string };
  };
  if (!ap.preapproval_id) {
    console.warn(`[self-serve/webhook] mensalidade ${id} sem preapproval_id — ignorada.`);
    return NextResponse.json({ ok: true, ignored: true });
  }

  // ⚠️ `=== "approved"` e nada mais, a mesma régua do avulso. `pending`,
  // `in_process` e `authorized` são estados em que o dinheiro NÃO entrou, e
  // liberar um mês de produção por qualquer um deles é entregar de graça.
  const aprovada = ap.status === "approved" || ap.payment?.status === "approved";
  const r = await registrarCobranca({
    provedorAssinaturaId: ap.preapproval_id,
    // O id do PAGAMENTO, não o do aviso: é ele que o provedor repete no reenvio,
    // e é sobre ele que a idempotência do banco fecha.
    provedorPagamentoId: String(ap.payment?.id ?? id),
    valorCentavos: Math.round((ap.transaction_amount ?? 0) * 100),
    moeda: ap.currency_id ?? "BRL",
    estado: aprovada ? "aprovada" : "recusada",
    motivo: aprovada ? null : (ap.payment?.status_detail ?? ap.status ?? "recusada pelo provedor"),
    confirmadoEm: ap.date_created ? new Date(ap.date_created) : new Date(),
  });

  if (!r.ok) {
    console.error(
      `[self-serve/webhook] MENSALIDADE NÃO REGISTRADA (assinatura ${ap.preapproval_id}, pagamento ${id}): ${r.motivo}. ` +
      "Se o dinheiro entrou no provedor, a produção deste mês seguirá PARADA até alguém registrar à mão.",
    );
    return NextResponse.json({ ok: true, registrado: false });
  }
  if (!aprovada) {
    // Falha de cobrança NÃO é silêncio. Tem dono na linha da assinatura, e a
    // instrução ao cliente está em `assinatura.O_QUE_DIZER` — o portão a devolve
    // sozinho na próxima tentativa de produzir.
    console.warn(
      `[self-serve/webhook] cobrança RECUSADA na assinatura ${ap.preapproval_id} (competência ${r.competencia}): ` +
      `${ap.payment?.status_detail ?? ap.status}. A produção deste cliente está parada até o mês ser pago.`,
    );
  }
  return NextResponse.json({ ok: true, duplicada: r.duplicada });
}

/** A ASSINATURA mudou de estado no provedor. Só o CANCELAMENTO age aqui. */
async function tratarMudancaDeAssinatura(id: string, mpToken: string): Promise<NextResponse> {
  const res = await fetch(`https://api.mercadopago.com/preapproval/${id}`, {
    headers: { Authorization: `Bearer ${mpToken}` },
  }).catch(() => null);
  if (!res || !res.ok) return NextResponse.json({ ok: false }, { status: 502 });
  const pa = (await res.json()) as { id?: string; status?: string };

  // `cancelled` e `paused` param a renovação. Nenhum dos dois tira o mês já
  // pago: `mensalidadeEmDia` entrega até o fim do mês pago, de propósito — quem
  // cancelou dia 20 pagou o mês inteiro, e ficar com o dinheiro sem entregar
  // seria a casa no lugar errado da conta.
  if (pa.status === "cancelled" || pa.status === "paused") {
    const r = await cancelarAssinatura({
      provedorAssinaturaId: pa.id ?? id,
      motivo: `o provedor informou status "${pa.status}"`,
    });
    if (!r.ok) console.error(`[self-serve/webhook] cancelamento não registrado (${id}): ${r.motivo}`);
  }
  return NextResponse.json({ ok: true });
}
