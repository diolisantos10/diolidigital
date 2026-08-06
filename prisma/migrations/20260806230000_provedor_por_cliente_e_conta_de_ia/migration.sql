-- Provedor de IA por CLIENTE + a conta de gasto de IA.
--
-- Três coisas, na ordem em que o risco cresce:
--   1. ADD COLUMN em AIRunLog e DepartmentLadderRecord — aditivo, nulável, zero
--      risco: nenhuma tabela é reconstruída e nenhuma linha existente muda.
--   2. CREATE TABLE ClientAiProvider — novo, ninguém depende dele ainda.
--   3. DROP TABLE DbAgentProviderConfig — a única linha destrutiva. Ver abaixo.
--
-- POR QUE O DROP É SEGURO: `DbAgentProviderConfig` só tinha um escritor,
-- `app/api/agent-configs/route.ts`, e ESSA ROTA NUNCA FOI CHAMADA por arquivo
-- nenhum (a tela gravava em localStorage, via Zustand). A tabela nasceu vazia e
-- morreu vazia. Ainda assim o DROP vem por último e depois de tudo que importa,
-- para que uma falha aqui não impeça o resto de aplicar.
--
-- O volume é persistente: quem reverter isto precisa saber que o dado não
-- volta. Não há dado.

-- ── 1. A conta: quem pediu, quanto consumiu, quanto custou ──────────────────
ALTER TABLE "AIRunLog" ADD COLUMN "clientId" TEXT;
ALTER TABLE "AIRunLog" ADD COLUMN "agentId" TEXT;
ALTER TABLE "AIRunLog" ADD COLUMN "tokensEntrada" INTEGER;
ALTER TABLE "AIRunLog" ADD COLUMN "tokensSaida" INTEGER;
ALTER TABLE "AIRunLog" ADD COLUMN "custoEstimadoUsd" REAL;
ALTER TABLE "AIRunLog" ADD COLUMN "custoTabela" TEXT;
ALTER TABLE "AIRunLog" ADD COLUMN "duracaoMs" INTEGER;
ALTER TABLE "AIRunLog" ADD COLUMN "erro" TEXT;

CREATE INDEX IF NOT EXISTS "AIRunLog_workspaceId_clientId_createdAt_idx"
  ON "AIRunLog"("workspaceId", "clientId", "createdAt");

-- ── 2. Qual IA produziu a peça — a evidência da escada ganha o provedor ─────
ALTER TABLE "DepartmentLadderRecord" ADD COLUMN "provedor" TEXT;

-- ── 3. A escolha de provedor por cliente ────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ClientAiProvider" (
  "id"          TEXT PRIMARY KEY NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "clientId"    TEXT NOT NULL,
  "provider"    TEXT NOT NULL,
  "model"       TEXT,
  "estrito"     BOOLEAN NOT NULL DEFAULT true,
  "motivo"      TEXT,
  "decididoPor" TEXT,
  "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClientAiProvider_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "AgencyWorkspace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClientAiProvider_workspaceId_clientId_key"
  ON "ClientAiProvider"("workspaceId", "clientId");
CREATE INDEX IF NOT EXISTS "ClientAiProvider_workspaceId_idx"
  ON "ClientAiProvider"("workspaceId");

-- ── 4. A tela decorativa sai — e a tabela dela também ───────────────────────
DROP TABLE IF EXISTS "DbAgentProviderConfig";
