// SDR re-negotiation. When the client rejects or asks to revise the proposal,
// the SDR steps back in: reads the objection, answers with empathy and value,
// and — if the objection is price — offers a better condition WITHOUT going
// below the budget agent's floor (computeEstimate → totalMin). It then re-opens
// a proposal so the client can decide again. Prices come from the budget agent;
// the SDR only negotiates within them.

import { prisma } from "@/lib/db/client";
import { computeEstimate } from "@/lib/agency/live-calculator";
import { createApprovalRequest } from "@/lib/agency/persistence/approval-service";
import { generate } from "@/lib/ai/generate";

const money = (n: number) => `R$ ${Math.round(n).toLocaleString("pt-BR")}`;

export async function negotiateProposal(clientRequestId: string, objection: string | undefined): Promise<void> {
  const req = await prisma.clientRequestDb.findUnique({ where: { id: clientRequestId } });
  if (!req) return;

  const scope = (() => { try { return JSON.parse(req.briefingJson ?? "{}")?.scope ?? {}; } catch { return {}; } })();
  const est = computeEstimate(scope as Parameters<typeof computeEstimate>[0]);

  // ── A GUARDA DE ZERO — sem escopo não se cota, e não se cota ZERO ──────────
  //
  // Achado em 15/08/2026, em auditoria adversarial. `computeEstimate({})`
  // devolve `totalMin: 0, totalMax: 0, items: []` — e o caminho é REAL, não
  // hipotético: o pedido de balcão grava `briefingJson` SEM a chave `scope`
  // (`app/api/self-serve/order/route.ts`), e a linha acima lê `?.scope ?? {}`.
  //
  // O que o cliente lia no card, sem ninguém revisar:
  //     "💰 INVESTIMENTO / Total: R$ 0 a R$ 0 / mês"  +  "é só aprovar aqui embaixo"
  //
  // E o dano maior era invisível: com `floor = 0`, a guarda `newTotal >= floor`
  // ficava VAZIA — qualquer valor acima de zero proposto pelo modelo passava.
  // O piso, que é a única trava de margem deste caminho, não existia.
  //
  // FAIL-CLOSED, nos dois eixos:
  //   • piso `Infinity` quando não há orçamento calculado — nenhum valor finito
  //     passa, exatamente como `negociacao.ts` faz para item fora da tabela.
  //     Ausência de piso não é piso zero: é ausência de autorização.
  //   • nenhuma linha de preço vai ao cliente. O card não cota zero, não cota
  //     "a combinar" com número, não cota nada — ele pede o que falta.
  //
  // `app/api/admin/reset-request/route.ts` já protegia a PRIMEIRA proposta com
  // `est.totalMax > 0 ? … : ""`. Aqui a proteção faltava, e é aqui que a
  // ressalva "esse valor fica por nossa conta" desaparece e o texto vira
  // "Total: R$ X a R$ Y / mês" + "é só aprovar aqui embaixo".
  const podeCotar = est.totalMax > 0 && est.items.length > 0;
  const floor = podeCotar ? est.totalMin : Number.POSITIVE_INFINITY;

  const sys = "Você é um SDR negociador de uma agência de marketing brasileira. Missão: manter o negócio vivo com empatia e reforço de valor. Se a objeção for preço, ofereça uma condição melhor SEM furar o piso informado. Fale simples e caloroso — o cliente não é da área de marketing. Responda SOMENTE JSON válido.";
  const user = podeCotar
    ? `A cliente ${req.businessName} pediu revisão ou recusou a proposta.
Objeção dela: "${objection || "não especificou"}"
Proposta atual: ${money(est.totalMin)} a ${money(est.totalMax)} por mês.
PISO — nunca vá abaixo disso: ${money(floor)} por mês.
Se a objeção for preço e fizer sentido, sugira um novo total (>= piso). Senão, mantenha o valor e reforce o retorno.
Responda em JSON: {"message":"resposta calorosa e negociadora, 2 a 4 frases, em pt-BR","newTotal": <número >= piso, ou null>}`
    : `A cliente ${req.businessName} pediu revisão ou recusou a proposta.
Objeção dela: "${objection || "não especificou"}"

ATENÇÃO: NÃO existe escopo fechado nem orçamento calculado para esta cliente. Você NÃO tem preço para falar.
- NÃO cite valor, faixa, "a partir de", desconto nem qualquer número em reais.
- NÃO diga que o valor é zero, gratuito, cortesia ou "por nossa conta".
- Sua tarefa é acolher a objeção e PERGUNTAR o que falta para fechar o escopo (o que ela precisa, com que frequência, em quais canais).
Responda em JSON: {"message":"resposta calorosa, 2 a 4 frases, em pt-BR, SEM nenhum número em reais","newTotal": null}`;

  const r = await generate({ system: sys, user, maxTokens: 500, workspaceId: req.workspaceId ?? undefined, preferredProvider: "claude", agentId: "comercial-negociacao", clientId: req.clientId ?? null });
  const data = (r.ok ? r.data : {}) as { message?: string; newTotal?: number | null };
  const message = data.message?.trim()
    || "Oi! Entendi você. Vamos achar um caminho que caiba no seu momento — me conta o que seria ideal pra você e eu vejo uma condição especial. 💛";

  // Guardrail: only accept a negotiated total that respects the floor and is a
  // real reduction. The budget agent owns the numbers; the SDR only moves inside
  // them. Sem orçamento calculado (`podeCotar === false`) o piso é `Infinity` e
  // nenhum valor passa — a comparação abaixo é a MESMA, e é ela que fecha.
  const newTotal =
    podeCotar && typeof data.newTotal === "number" && Number.isFinite(data.newTotal)
      && data.newTotal >= floor && data.newTotal < est.totalMax
      ? Math.round(data.newTotal)
      : null;

  await prisma.portalMessage.create({
    data: { clientRequestId, authorRole: "team", authorName: "SDR Dioli", body: message, readByTeam: false },
  });

  // Re-open a proposal so the client can approve again — with the negotiated
  // price if one was agreed, otherwise the same offer plus the SDR's message.
  // "Escopo combinado no briefing" era afirmação falsa quando não havia escopo
  // nenhum: nada foi combinado. Ausência de informação não é informação.
  const deliverables = est.items.length
    ? est.items.map((it) => `• ${it.label}${it.detail ? ` — ${it.detail}` : ""}`).join("\n")
    : "• Ainda preciso confirmar com você o que entra — o escopo não está fechado aqui.";

  const proposalText = podeCotar
    ? `Proposta ajustada — ${req.businessName}

✨ O QUE VOCÊ RECEBE
${deliverables}

💰 INVESTIMENTO
${newTotal
    ? `Total (condição especial): ${money(newTotal)} / mês`
    : `Total: ${money(est.totalMin)} a ${money(est.totalMax)} / mês`}

✅ Se ficar bom pra você, é só aprovar aqui embaixo que a gente começa.`
    // SEM ORÇAMENTO: nenhuma linha de preço, e nenhum pedido de aprovação de um
    // valor que não existe. Card que pede "aprove" sem número é pior que card
    // sem preço — parece que houve uma cotação.
    : `Proposta ajustada — ${req.businessName}

✨ O QUE VOCÊ RECEBE
${deliverables}

💰 INVESTIMENTO
Ainda não tenho como fechar o valor: o escopo não está definido aqui, e eu não
mando número no escuro.

✅ Me conta o que você precisa — quantas peças, com que frequência e em quais
canais — que eu fecho o escopo e te trago o valor certo.`;

  const approval = await createApprovalRequest({ clientRequestId, department: "proposal", requestedBy: "SDR", clientVisible: true });
  await prisma.approvalRequest.update({ where: { id: approval.id }, data: { reviewNote: proposalText } });
  await prisma.clientRequestDb.update({ where: { id: clientRequestId }, data: { status: "scope_ready" } });
}
