// POST /api/self-serve/webhook
// Receives Mercado Pago IPN / Webhook notifications for self-serve orders.
// On payment approved: marks the ClientRequestDb as "in_progress".

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db/client";
import { produzirPedidoDeBalcao } from "@/lib/agency/balcao/producao";
import { registrarPagamento } from "@/lib/agency/financeiro/portao-de-pagamento";

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

  // MP sends { type: "payment", data: { id: "..." } }
  const type = body.type as string | undefined;
  const paymentId = (body.data as Record<string, string> | undefined)?.id;
  if (type !== "payment" || !paymentId) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (!verifyMpSignature(req, paymentId)) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }

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
      const registro = await registrarPagamento({
        clientRequestId: pm.external_reference,
        origem: "mercadopago",
        valorCentavos: centavos,
        provedorId: String(paymentId),
        moeda: pm.currency_id ?? "BRL",
        confirmadoEm: pm.date_approved ? new Date(pm.date_approved) : new Date(),
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
