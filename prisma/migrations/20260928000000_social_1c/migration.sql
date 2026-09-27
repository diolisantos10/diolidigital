-- 1C-C2: TRAVA DA SEMANA + LIMITE MENSAL DE REFAÇÕES + SCHEMA DA LEVA (1C)
-- (28/09/2026)
--
-- ADITIVA, do começo ao fim: uma tabela NOVA e colunas NOVAS/NULLABLE em
-- tabelas existentes. Nenhuma linha viva perde dado, nenhum tipo troca. O
-- banco é SQLite num volume do Railway com dados de piloto VIVOS.
--
-- Rollback: DROP TABLE "RefacaoDaPeca"; as colunas novas em "Client" e
-- "SocialPost" podem ficar (nunca lidas por código que não sabe delas) ou sair
-- por uma migração de reversão manual — SQLite não tem DROP COLUMN nesta
-- versão sem recriar a tabela, e não vale o risco no piloto.

-- ─── Client: o limite mensal de refações, POR CLIENTE ───────────────────────
-- Nulo = sem limite definido para este cliente → o código usa o padrão da casa
-- (`LIMITE_PADRAO_MENSAL_DA_CASA`, em `lib/agency/esteira/limite-de-refacoes.ts`).
ALTER TABLE "Client" ADD COLUMN "limiteRefacoesMes" INTEGER;

-- ─── SocialPost: a colaboração em tempo real (1C-C1) ────────────────────────
-- Dona é a frente C1 desta mesma leva — aqui só abre a coluna.
ALTER TABLE "SocialPost" ADD COLUMN "collabJson" TEXT;

-- ─── RefacaoDaPeca: uma linha por REGENERAÇÃO de peça travada ───────────────
CREATE TABLE "RefacaoDaPeca" (
    "id"            TEXT NOT NULL PRIMARY KEY,
    "workspaceId"   TEXT NOT NULL,
    "clientId"      TEXT NOT NULL,
    "socialPostId"  TEXT NOT NULL,
    "motivo"        TEXT NOT NULL,
    "origem"        TEXT NOT NULL,
    "contaNoLimite" BOOLEAN NOT NULL,
    "mesReferencia" TEXT NOT NULL,
    "criadoEm"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefacaoDaPeca_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RefacaoDaPeca_clientId_mesReferencia_idx" ON "RefacaoDaPeca"("clientId", "mesReferencia");
