-- O ACERVO DO INSTAGRAM + O DNA DA MARCA (27/09/2026, 1B-B1)
--
-- PARECER `meta` (M1, PODE COM AJUSTE): até 100 posts do PRÓPRIO perfil
-- (`GET /{ig-user-id}/media`, field expansion, sem `/children` à parte),
-- insights 1 chamada por mídia, `impressions` nunca pedido, conjunto vazio
-- de insight = "não medido" (nunca zero). Idempotência por
-- `Client.acervoImportadoEm` — ver `lib/integrations/meta/acervo.ts`.
--
-- ADITIVA, do começo ao fim: duas tabelas NOVAS e colunas NOVAS/NULLABLE em
-- tabelas existentes. Nenhuma linha viva perde dado, nenhum tipo troca. O
-- banco é SQLite num volume do Railway com dados de piloto VIVOS.
--
-- Rollback: DROP TABLE "AcervoPost", "DnaDaMarca"; as colunas novas em
-- "Client" e "MediaAsset" podem ficar (nunca lidas por código que não sabe
-- delas) ou sair por uma migração de reversão manual — SQLite não tem
-- DROP COLUMN nesta versão sem recriar a tabela, e não vale o risco no piloto.

-- ─── Client: o carimbo de idempotência do acervo + a autorização de Drive ───
ALTER TABLE "Client" ADD COLUMN "acervoImportadoEm" DATETIME;
ALTER TABLE "Client" ADD COLUMN "pastaDriveUrl" TEXT;
ALTER TABLE "Client" ADD COLUMN "autorizacaoDriveTexto" TEXT;
ALTER TABLE "Client" ADD COLUMN "autorizacaoDriveEm" DATETIME;
ALTER TABLE "Client" ADD COLUMN "driveSincronizadoEm" DATETIME;

-- ─── MediaAsset: fecha a lacuna do vídeo de story (duração/codec) ───────────
-- `null` em toda linha existente = "não medido", nunca "não tinha".
ALTER TABLE "MediaAsset" ADD COLUMN "duracaoS" REAL;
ALTER TABLE "MediaAsset" ADD COLUMN "codec" TEXT;

-- ─── AcervoPost: um post do Instagram, trazido para dentro de casa ──────────
CREATE TABLE "AcervoPost" (
    "id"               TEXT NOT NULL PRIMARY KEY,
    "workspaceId"      TEXT NOT NULL,
    "clientId"         TEXT NOT NULL,
    "conexaoId"        TEXT,
    "igMediaId"        TEXT NOT NULL,
    "mediaType"        TEXT NOT NULL,
    "mediaProductType" TEXT,
    "caption"          TEXT NOT NULL DEFAULT '',
    "permalink"        TEXT,
    "publicadoEm"      DATETIME NOT NULL,
    "likeCount"        INTEGER,
    "commentsCount"    INTEGER,
    "insightsJson"     TEXT,
    "mediaAssetId"     TEXT,
    "telasJson"        TEXT NOT NULL DEFAULT '[]',
    "thumbnailAssetId" TEXT,
    "duracaoS"         REAL,
    "codec"            TEXT,
    "referencia"       BOOLEAN NOT NULL DEFAULT false,
    "familiaLayout"    TEXT,
    "importadoEm"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AcervoPost_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AcervoPost_clientId_igMediaId_key" ON "AcervoPost"("clientId", "igMediaId");
CREATE INDEX "AcervoPost_clientId_publicadoEm_idx" ON "AcervoPost"("clientId", "publicadoEm");

-- ─── DnaDaMarca: a leitura do que a marca já faz, versionada e rastreável ───
-- Versões nunca são apagadas — o Analista (F2) propõe por cima, `status`
-- diz qual é a verdade vigente.
CREATE TABLE "DnaDaMarca" (
    "id"           TEXT NOT NULL PRIMARY KEY,
    "workspaceId"  TEXT NOT NULL,
    "clientId"     TEXT NOT NULL,
    "versao"       INTEGER NOT NULL,
    "conteudoJson" TEXT NOT NULL,
    "origemJson"   TEXT NOT NULL,
    "geradoPor"    TEXT NOT NULL,
    "status"       TEXT NOT NULL DEFAULT 'proposto',
    "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DnaDaMarca_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DnaDaMarca_clientId_versao_key" ON "DnaDaMarca"("clientId", "versao");
CREATE INDEX "DnaDaMarca_clientId_status_idx" ON "DnaDaMarca"("clientId", "status");
