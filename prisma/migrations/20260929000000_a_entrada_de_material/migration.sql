-- 1D-D1: A ENTRADA DE MATERIAL — núcleo (27/09/2026)
--
-- ADITIVA, do começo ao fim: uma tabela NOVA e uma coluna NOVA/NULLABLE em
-- "Client". Nenhuma linha viva perde dado, nenhum tipo troca. O banco é
-- SQLite num volume do Railway com dados de piloto VIVOS.
--
-- Rollback: DROP TABLE "EntradaDeMaterial"; a coluna nova em "Client" pode
-- ficar (nunca lida por código que não sabe dela) ou sair por uma migração
-- de reversão manual — SQLite não tem DROP COLUMN nesta versão sem recriar a
-- tabela, e não vale o risco no piloto.

-- ─── Client: o cursor da vigia do Drive ──────────────────────────────────────
-- Nulo = nunca varreu. Quem grava/lê é a vigia do Drive (fora do escopo desta
-- ficha) — aqui só abre a coluna.
ALTER TABLE "Client" ADD COLUMN "entradaDriveVistaEm" DATETIME;

-- ─── EntradaDeMaterial: um pedido (upload/drive + frase) → peça(s) no calendário
CREATE TABLE "EntradaDeMaterial" (
    "id"                TEXT NOT NULL PRIMARY KEY,
    "workspaceId"       TEXT NOT NULL,
    "clientId"          TEXT NOT NULL,
    "origem"            TEXT NOT NULL,
    "frase"             TEXT NOT NULL,
    "mediaAssetIdsJson" TEXT NOT NULL,
    "interpretacaoJson" TEXT,
    "status"            TEXT NOT NULL DEFAULT 'recebida',
    "motivo"            TEXT,
    "socialPostIdsJson" TEXT NOT NULL DEFAULT '[]',
    "driveFileId"       TEXT,
    "criadaEm"          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadaEm"      DATETIME NOT NULL,
    CONSTRAINT "EntradaDeMaterial_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "EntradaDeMaterial_clientId_criadaEm_idx" ON "EntradaDeMaterial"("clientId", "criadaEm");
-- NULL é distinto de NULL em UNIQUE do SQLite — toda entrada por upload
-- (driveFileId nulo) convive livremente; só o MESMO arquivo do MESMO cliente
-- (driveFileId preenchido, repetido) colide, que é a idempotência que a vigia
-- do Drive precisa.
CREATE UNIQUE INDEX "EntradaDeMaterial_clientId_driveFileId_key" ON "EntradaDeMaterial"("clientId", "driveFileId");
