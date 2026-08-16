// mensagem-do-portal.ts — TODA mensagem de portal nasce carimbada com o DONO.
//
// ── O furo que isto fecha (15/08/2026, rodada 2 do P0) ──────────────────────
// A leitura da conversa é cercada pelo `clientId` da linha. A cerca só vale se
// TODA escrita carimbar: linha com `clientId` nulo não tem dono escrito, e a
// cerca é obrigada a deixá-la passar (senão apagaria o histórico legítimo das
// escritas antigas).
//
// Sete lugares gravavam exatamente essa forma — só `clientRequestId` — e são
// justamente os que carregam PREÇO e ESCOPO:
//
//   lib/agency/esteira/trafego.ts                (orçamento diário e mensal)
//   lib/agency/esteira/marcos.ts                 (avisos de marco)
//   lib/agency/esteira/pedidos.ts                (cobrança de material)
//   lib/agency/execution/create-project-from-request.ts (cronograma)
//   lib/agency/execution/negotiate-proposal.ts   (a negociação de preço)
//   app/api/portal/approvals/route.ts            (materiais que faltam)
//   app/api/admin/reset-request/route.ts         (a proposta)
//
// Uma conversa 100% legada não tinha carimbo NENHUM, e por isso atravessava a
// cerca inteira. O `seguranca` provou isso lendo
// "SEGREDO-LEGADO proposta de R$ 12.000" pelo portal errado.
//
// ── A regra, em uma frase ───────────────────────────────────────────────────
// Não existe mais escrita de mensagem de portal sem dono derivável. O dono sai
// do BANCO (a solicitação), nunca de quem chama — e quando não dá para derivar,
// a linha nasce sem dono, como antes, mas isso passa a ser exceção medida e não
// o caminho comum.

import { prisma } from "@/lib/db/client";

export interface MensagemDoPortal {
  clientRequestId: string;
  authorRole: "team" | "client";
  authorName: string;
  body: string;
  readByTeam?: boolean;
  readByClient?: boolean;
}

/**
 * Grava uma mensagem de portal ancorada numa SOLICITAÇÃO, carimbando também o
 * `clientId` dela quando existe.
 *
 * Deriva o dono do banco na hora da escrita — o valor congelado no momento em
 * que a mensagem existiu. É isso que torna a cerca de leitura determinística:
 * se a solicitação mudar de dono depois, a linha continua sabendo de quem era.
 */
export async function gravarMensagemDoPortal(m: MensagemDoPortal) {
  let clientId: string | null = null;
  try {
    const solicitacao = await prisma.clientRequestDb.findUnique({
      where: { id: m.clientRequestId },
      select: { clientId: true },
    });
    clientId = solicitacao?.clientId ?? null;
  } catch {
    // Banco tropeçando não pode impedir o cliente de ser avisado. A linha nasce
    // sem dono, exatamente como nascia antes desta função existir.
    clientId = null;
  }

  return prisma.portalMessage.create({
    data: {
      clientRequestId: m.clientRequestId,
      clientId,
      authorRole: m.authorRole,
      authorName: m.authorName,
      body: m.body,
      readByTeam: m.readByTeam ?? false,
      readByClient: m.readByClient ?? false,
    },
  });
}
