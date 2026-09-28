-- O ANALISTA DE SOCIAL SEMANAL (27/09/2026, F2-F1)
--
-- ORDEM DO CEO: toda SEGUNDA de manhã (08h Brasília), ANTES de gerar a semana
-- seguinte, a casa lê os insights dos posts publicados na semana anterior,
-- grava o que funcionou e o que não funcionou com o postId como EVIDÊNCIA,
-- PROPÕE nova versão do DNA (sem apagar a anterior) e ajusta a semana
-- seguinte. Ver `lib/agency/esteira/analista-semanal.ts` para o contrato.
--
-- ADITIVA: uma tabela NOVA. Nenhuma linha viva perde dado, nenhum tipo troca.
-- O banco é SQLite num volume do Railway com dados de piloto VIVOS.
--
-- Rollback: DROP TABLE "AnaliseSemanal".

CREATE TABLE "AnaliseSemanal" (
    "id"               TEXT NOT NULL PRIMARY KEY,
    "workspaceId"      TEXT NOT NULL,
    "clientId"         TEXT NOT NULL,
    "semanaDe"         DATETIME NOT NULL,
    "semanaAte"        DATETIME NOT NULL,
    "metricasJson"     TEXT NOT NULL,
    "funcionouJson"    TEXT NOT NULL,
    "naoFuncionouJson" TEXT NOT NULL,
    "ajustesJson"      TEXT NOT NULL,
    "dnaPropostoVersao" INTEGER,
    "relatorio"        TEXT NOT NULL,
    "status"           TEXT NOT NULL DEFAULT 'proposta',
    "criadaEm"         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnaliseSemanal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AnaliseSemanal_clientId_semanaDe_key" ON "AnaliseSemanal"("clientId", "semanaDe");
CREATE INDEX "AnaliseSemanal_clientId_status_idx" ON "AnaliseSemanal"("clientId", "status");
