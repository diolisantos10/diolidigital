-- CITY JOBS COMO FONTE EXTERNA (CJ-J1, 28/09/2026)
--
-- Contrato: docs/integracoes/cityjobs-contrato.md. Ver lib/integracoes/cityjobs/.
--
-- ADITIVA: duas tabelas NOVAS. Nenhuma linha viva perde dado, nenhum tipo
-- troca. O banco é SQLite num volume do Railway com dados de piloto VIVOS.
--
-- Rollback: DROP TABLE "EventoDeWebhook"; DROP TABLE "PostExterno".

CREATE TABLE "PostExterno" (
    "id"                TEXT NOT NULL PRIMARY KEY,
    "workspaceId"       TEXT NOT NULL,
    "clientId"          TEXT NOT NULL,
    "fonte"             TEXT NOT NULL,
    "idExterno"         TEXT NOT NULL,
    "corpoSha256"       TEXT NOT NULL,
    "formato"           TEXT NOT NULL,
    "prioridade"        TEXT NOT NULL,
    "risco"             TEXT NOT NULL,
    "horarioDesejado"   DATETIME,
    "validadePlano"     DATETIME,
    "legenda"           TEXT NOT NULL,
    "midiaAssetIdsJson" TEXT NOT NULL,
    "metadadosJson"     TEXT,
    "estado"            TEXT NOT NULL DEFAULT 'recebido',
    "motivo"            TEXT,
    "socialPostIdsJson" TEXT NOT NULL DEFAULT '[]',
    "repostsFeitos"     INTEGER NOT NULL DEFAULT 0,
    "criadoEm"          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm"      DATETIME NOT NULL,
    CONSTRAINT "PostExterno_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PostExterno_fonte_idExterno_key" ON "PostExterno"("fonte", "idExterno");
CREATE INDEX "PostExterno_clientId_estado_idx" ON "PostExterno"("clientId", "estado");
CREATE INDEX "PostExterno_clientId_formato_criadoEm_idx" ON "PostExterno"("clientId", "formato", "criadoEm");

CREATE TABLE "EventoDeWebhook" (
    "id"                 TEXT NOT NULL PRIMARY KEY,
    "postExternoId"      TEXT NOT NULL,
    "tipo"               TEXT NOT NULL,
    "corpoJson"          TEXT NOT NULL,
    "tentativas"         INTEGER NOT NULL DEFAULT 0,
    "proximaTentativaEm" DATETIME,
    "entregueEm"         DATETIME,
    "ultimoErro"         TEXT,
    "criadoEm"           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventoDeWebhook_postExternoId_fkey" FOREIGN KEY ("postExternoId") REFERENCES "PostExterno" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "EventoDeWebhook_postExternoId_idx" ON "EventoDeWebhook"("postExternoId");
CREATE INDEX "EventoDeWebhook_entregueEm_proximaTentativaEm_idx" ON "EventoDeWebhook"("entregueEm", "proximaTentativaEm");
