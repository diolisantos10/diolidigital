-- V2 INTEGRAÇÃO — a tabela do contrato de handoff (03-ESTEIRA-E-HANDOFHS).
-- ADITIVA: uma tabela nova, nada legado tocado. Sem aceite do recebedor, a
-- tarefa não some da fila anterior — "aguardando_recebimento" é estado, não
-- detalhe. Rollback: tabela sem uso enquanto as flags estão desligadas.
CREATE TABLE "HandoffV2" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deDepartamento" TEXT NOT NULL,
    "paraDepartamento" TEXT NOT NULL,
    "responsavelEntrega" TEXT NOT NULL,
    "responsavelRecebe" TEXT,
    "entrada" TEXT NOT NULL,
    "saida" TEXT NOT NULL,
    "versaoArtefato" TEXT NOT NULL,
    "criterios" TEXT NOT NULL,
    "prazoProximo" DATETIME,
    "bloqueios" TEXT NOT NULL DEFAULT '[]',
    "correlationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'aguardando_recebimento',
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aceitoEm" DATETIME
);
CREATE INDEX "HandoffV2_paraDepartamento_status_idx" ON "HandoffV2"("paraDepartamento", "status");
CREATE INDEX "HandoffV2_correlationId_idx" ON "HandoffV2"("correlationId");
