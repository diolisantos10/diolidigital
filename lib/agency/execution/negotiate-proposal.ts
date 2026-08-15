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
import { gravarMensagemDoPortal } from "@/lib/agency/portal/mensagem-do-portal";

const money = (n: number) => `R$ ${Math.round(n).toLocaleString("pt-BR")}`;

export async function negotiateProposal(clientRequestId: string, objection: string | undefined): Promise<void> {
  const req = await prisma.clientRequestDb.findUnique({ where: { id: clientRequestId } });
  if (!req) return;

  const scope = (() => { try { return JSON.parse(req.briefingJson ?? "{}")?.scope ?? {}; } catch { return {}; } })();
  const est = computeEstimate(scope as Parameters<typeof computeEstimate>[0]);
  const floor = est.totalMin; // budget agent's floor — the SDR never goes below.

  const sys = "Você é um SDR negociador de uma agência de marketing brasileira. Missão: manter o negócio vivo com empatia e reforço de valor. Se a objeção for preço, ofereça uma condição melhor SEM furar o piso informado. Fale simples e caloroso — o cliente não é da área de marketing. Responda SOMENTE JSON válido.";
  const user = `A cliente ${req.businessName} pediu revisão ou recusou a proposta.
Objeção dela: "${objection || "não especificou"}"
Proposta atual: ${money(est.totalMin)} a ${money(est.totalMax)} por mês.
PISO — nunca vá abaixo disso: ${money(floor)} por mês.
Se a objeção for preço e fizer sentido, sugira um novo total (>= piso). Senão, mantenha o valor e reforce o retorno.
Responda em JSON: {"message":"resposta calorosa e negociadora, 2 a 4 frases, em pt-BR","newTotal": <número >= piso, ou null>}`;

  const r = await generate({ system: sys, user, maxTokens: 500, workspaceId: req.workspaceId ?? undefined, preferredProvider: "claude", agentId: "comercial-negociacao", clientId: req.clientId ?? null });
  const data = (r.ok ? r.data : {}) as { message?: string; newTotal?: number | null };
  const message = data.message?.trim()
    || "Oi! Entendi você. Vamos achar um caminho que caiba no seu momento — me conta o que seria ideal pra você e eu vejo uma condição especial. 💛";

  // Guardrail: only accept a negotiated total that respects the floor and is a
  // real reduction. The budget agent owns the numbers; the SDR only moves inside them.
  const newTotal =
    typeof data.newTotal === "number" && data.newTotal >= floor && data.newTotal < est.totalMax
      ? Math.round(data.newTotal)
      : null;

  await gravarMensagemDoPortal({
    clientRequestId, authorRole: "team", authorName: "SDR Dioli", body: message, readByTeam: false,
  });

  // Re-open a proposal so the client can approve again — with the negotiated
  // price if one was agreed, otherwise the same offer plus the SDR's message.
  const deliverables = est.items.length
    ? est.items.map((it) => `• ${it.label}${it.detail ? ` — ${it.detail}` : ""}`).join("\n")
    : "• Escopo combinado no briefing";
  const priceLine = newTotal
    ? `Total (condição especial): ${money(newTotal)} / mês`
    : `Total: ${money(est.totalMin)} a ${money(est.totalMax)} / mês`;
  const proposalText =
`Proposta ajustada — ${req.businessName}

✨ O QUE VOCÊ RECEBE
${deliverables}

💰 INVESTIMENTO
${priceLine}

✅ Se ficar bom pra você, é só aprovar aqui embaixo que a gente começa.`;

  const approval = await createApprovalRequest({ clientRequestId, department: "proposal", requestedBy: "SDR", clientVisible: true });
  await prisma.approvalRequest.update({ where: { id: approval.id }, data: { reviewNote: proposalText } });
  await prisma.clientRequestDb.update({ where: { id: clientRequestId }, data: { status: "scope_ready" } });
}
