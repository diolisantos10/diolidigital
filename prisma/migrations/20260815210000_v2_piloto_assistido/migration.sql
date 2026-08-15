-- PILOTO ASSISTIDO (aditiva, escrita à mão — nada de recriar tabela):
-- ExecucaoV2 ganha o rastro completo da regra 6 (cliente + entradas) e nasce
-- a auditoria de recusas. Rollback: ignorar colunas/tabela; nada legado muda.

ALTER TABLE "ExecucaoV2" ADD COLUMN "clienteId" TEXT;
ALTER TABLE "ExecucaoV2" ADD COLUMN "entradas" TEXT;

CREATE INDEX "ExecucaoV2_clienteId_inicio_idx" ON "ExecucaoV2"("clienteId", "inicio");

CREATE TABLE "RecusaV2" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "funcaoId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "clienteId" TEXT,
    "em" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "RecusaV2_funcaoId_em_idx" ON "RecusaV2"("funcaoId", "em");
CREATE INDEX "RecusaV2_correlationId_idx" ON "RecusaV2"("correlationId");
