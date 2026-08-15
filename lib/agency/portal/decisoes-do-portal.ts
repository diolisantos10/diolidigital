// AS QUATRO DECISÕES DO CLIENTE — o contrato da V2, num lugar só.
//
// Marco 5. `03-ESTEIRA-E-HANDOFFS`: "Toda entrega admite quatro decisões:
// aprovar · pedir ajustes · recusar/refazer · cancelar. Recusar e cancelar
// nunca apagam versões anteriores." A rota e a tela importam DAQUI — duas
// cópias da mesma tabela é como uma decisão passa a existir só de um lado.

import type { ApprovalStatus } from "@/lib/agency/persistence/approval-service";

/** Ação do portal → status gravado. */
export const DECISAO_PARA_STATUS: Record<string, ApprovalStatus> = {
  approve:          "approved",
  request_revision: "revision_requested",
  reject:           "rejected",
  cancel:           "cancelled",
};

/** "Tenho uma dúvida" NÃO é decisão: status permanece pending, prazo pausa. */
export const ACAO_DUVIDA = "question";

/**
 * Sem as palavras do cliente, a refação refaz no escuro e o cancelamento fica
 * sem ressalva — e ressalva com auditoria é a letra da V2 para o cancelar.
 */
export const DECISOES_QUE_EXIGEM_COMENTARIO: ReadonlySet<string> = new Set([
  "request_revision",
  "reject",
  "cancel",
  ACAO_DUVIDA,
]);

/** O estado canônico em que cada decisão põe a entrega (mapa do Marco 1). */
export const DECISAO_PARA_ESTADO_CANONICO: Record<string, string> = {
  approve:          "implementation",
  request_revision: "revision",
  reject:           "revision",
  cancel:           "cancelled",
};
