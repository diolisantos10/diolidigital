-- A ESTEIRA — os carimbos que fazem o projeto andar, o ciclo mensal e o dono do
-- pedido de material.
--
-- Aditiva: só adiciona colunas opcionais e uma tabela nova. Nenhum dado
-- existente é alterado ou perdido.

-- ── Projeto: os três momentos que a esteira precisa saber ────────────────────
-- São DECISÕES gravadas; o resto da fase é derivado do dado real.
ALTER TABLE "Project" ADD COLUMN "directionApprovedAt" DATETIME;
ALTER TABLE "Project" ADD COLUMN "presentedAt" DATETIME;
ALTER TABLE "Project" ADD COLUMN "clientApprovedAt" DATETIME;

-- ── Pedido de material: quem pediu, e quando o PM levou ao cliente ───────────
-- O agente abre o pedido; o PM consolida tudo numa mensagem só.
ALTER TABLE "MaterialRequest" ADD COLUMN "requestedByAgentId" TEXT;
ALTER TABLE "MaterialRequest" ADD COLUMN "requestedByLabel" TEXT;
ALTER TABLE "MaterialRequest" ADD COLUMN "askedClientAt" DATETIME;

CREATE INDEX IF NOT EXISTS "MaterialRequest_projectId_status_idx"
  ON "MaterialRequest"("projectId", "status");

-- ── Ciclo mensal: onde a relação vitalícia acontece ──────────────────────────
-- Projeto que nunca fecha não é medível. A operação contínua é uma sequência de
-- ciclos que nascem, entregam, medem e fecham.
CREATE TABLE IF NOT EXISTS "Cycle" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "projectId"   TEXT NOT NULL,
    "reference"   TEXT NOT NULL,
    "status"      TEXT NOT NULL DEFAULT 'aberto',
    "startsOn"    TEXT NOT NULL,
    "endsOn"      TEXT NOT NULL,
    "planJson"    TEXT NOT NULL DEFAULT '[]',
    "resultsJson" TEXT NOT NULL DEFAULT '{}',
    "summary"     TEXT,
    "closedAt"    DATETIME,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   DATETIME NOT NULL,
    CONSTRAINT "Cycle_projectId_fkey" FOREIGN KEY ("projectId")
      REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Cycle_projectId_reference_key" ON "Cycle"("projectId", "reference");
CREATE INDEX IF NOT EXISTS "Cycle_projectId_status_idx" ON "Cycle"("projectId", "status");
