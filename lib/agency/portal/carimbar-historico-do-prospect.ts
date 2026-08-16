// ── QUANDO O PROSPECT VIRA CLIENTE, O HISTÓRICO DELE VAI JUNTO ─────────────
//
// ── A quebra que isto evita (15/08/2026, rodada 5) ─────────────────────────
// O ramo do prospect grava `PortalMessage.clientId = null` **por construção**:
// enquanto a solicitação não tem cliente, não há dono para carimbar.
//
// A inversão desta frente (serve-se apenas o que se prova próprio) transformou
// isso numa **quebra permanente**, e não num custo de legado: todo prospect
// que virasse cliente **depois do deploy** perderia a conversa inteira do
// briefing — para sempre. E o briefing é a porta comercial desta casa.
//
// O `seguranca` mediu: base **lê**, PR **NÃO LÊ**. Eu não tinha declarado.
//
// ── A saída, e por que ela NÃO é adivinhação ───────────────────────────────
// No instante da conversão, o dono da solicitação deixa de ser desconhecido —
// **a casa acabou de decidi-lo**. Carimbar aqui não é inferir de quem era a
// linha: é registrar o fato no momento em que ele passa a existir, que é
// exatamente o que `gravarMensagemDoPortal` faz para toda escrita nova.
//
// ⚠️ Só carimba o que está SEM DONO. Linha já carimbada nunca é sobrescrita —
// senão isto viraria o re-apontador que esta frente inteira existiu para
// fechar.

import { prisma } from "@/lib/db/client";

/**
 * Carimba o cliente nas linhas órfãs de uma solicitação que ACABOU de ganhar
 * dono. Idempotente e best-effort: o projeto não deixa de nascer porque o
 * carimbo falhou — mas a falha é gritada, porque o efeito dela é conversa
 * sumida na tela do cliente.
 */
export async function carimbarHistoricoDoProspect(
  clientRequestId: string,
  clientId: string,
): Promise<{ mensagens: number; aprovacoes: number }> {
  try {
    const [mensagens, aprovacoes] = await Promise.all([
      prisma.portalMessage.updateMany({
        where: { clientRequestId, clientId: null },
        data: { clientId },
      }),
      prisma.approvalRequest.updateMany({
        where: { clientRequestId, clientId: null },
        data: { clientId },
      }),
    ]);
    return { mensagens: mensagens?.count ?? 0, aprovacoes: aprovacoes?.count ?? 0 };
  } catch (e) {
    console.error(
      `[portal] NÃO consegui carimbar o histórico do prospect ${clientRequestId} `
      + `para o cliente ${clientId} — a conversa do briefing vai sumir da tela dele.`, e,
    );
    return { mensagens: 0, aprovacoes: 0 };
  }
}
