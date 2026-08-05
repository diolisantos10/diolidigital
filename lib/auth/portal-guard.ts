// Utilitário de saúde do banco.
//
// ── O QUE FOI REMOVIDO DAQUI, E POR QUÊ ────────────────────────────────────
// Este arquivo continha `resolvePortalAccess(tokenOrId)`, com ZERO chamadores.
// O comportamento dela: procurava o cliente pelo `portalToken`; NÃO ACHANDO,
// devolvia `{ mode: "id_legacy", clientId: tokenOrId }` — ou seja, tratava o
// texto recebido do visitante como um `clientId` AUTORIZADO. Um id de cliente
// é adivinhável e circula em URL. Qualquer rota que "reaproveitasse o helper"
// passaria a aceitar `?cliente=<id>` como credencial e entregaria o portal de
// um cliente a qualquer um.
//
// Ela não estava ligada em lugar nenhum — e é exatamente por isso que era
// perigosa: código morto com nome bom é uma armadilha esperando alguém com
// pressa. O caminho VIVO e correto é
// `lib/agency/persistence/portal-access-service.ts` (`validatePortalAccess`),
// que valida token, expiração e revogação.
//
// Removida em 05/08/2026. Se alguém precisar resolver acesso de portal, use o
// serviço acima. Não ressuscite isto.

import { prisma } from "@/lib/db/client";

/** O banco responde? Usado por diagnóstico — nunca como decisão de acesso. */
export async function isDbAvailable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
