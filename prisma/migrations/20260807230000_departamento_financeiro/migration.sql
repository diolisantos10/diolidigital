-- DEPARTAMENTO FINANCEIRO — o livro de receita e custo da agência.
--
-- Só CREATE TABLE + CREATE INDEX. Nenhum ALTER, nenhum DROP, nenhuma
-- reconstrução: a lição de 07/08 é que migration de urgência que reconstrói
-- tabela em SQLite dentro de volume é o risco, não a proteção.
CREATE TABLE "LancamentoFinanceiro" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "moeda" TEXT NOT NULL DEFAULT 'BRL',
    "origem" TEXT NOT NULL,
    "natureza" TEXT NOT NULL DEFAULT 'realizado',
    "competencia" DATETIME NOT NULL,
    "clientId" TEXT,
    "projectId" TEXT,
    "centroDeCusto" TEXT,
    "criadoPor" TEXT,
    "observacao" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LancamentoFinanceiro_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "AgencyWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "LancamentoFinanceiro_workspaceId_competencia_idx" ON "LancamentoFinanceiro"("workspaceId", "competencia");
CREATE INDEX "LancamentoFinanceiro_workspaceId_clientId_competencia_idx" ON "LancamentoFinanceiro"("workspaceId", "clientId", "competencia");
CREATE INDEX "LancamentoFinanceiro_workspaceId_centroDeCusto_competencia_idx" ON "LancamentoFinanceiro"("workspaceId", "centroDeCusto", "competencia");
