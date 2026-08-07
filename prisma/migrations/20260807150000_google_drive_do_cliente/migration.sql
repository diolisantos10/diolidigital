-- AS DUAS TABELAS DO GOOGLE DRIVE DO CLIENTE, QUE NUNCA EXISTIRAM EM PRODUÇÃO.
--
-- ── O INCIDENTE (07/08/2026, com o CEO na tela) ─────────────────────────────
--
-- A feature do Drive subiu em 07/08 (commit d0985b6). `GoogleDriveConnection` e
-- `DriveMaterial` entraram em `prisma/schema.prisma` — e NENHUMA migration foi
-- criada para elas. Produção aplica esquema SÓ por `prisma migrate deploy`
-- (`scripts/start.sh` recusa `db push` de propósito), então as duas tabelas
-- simplesmente não existiam no volume.
--
-- O que o CEO viu: conectou o Drive da Foocci, o popup disse "Drive conectado",
-- e o cartão do portal, no mesmo instante, dizia "Drive não conectado." Depois
-- do F5 sumia tudo, e o botão "Escolher arquivos" nunca aparecia.
--
-- A cadeia inteira, e cada elo é um `.catch` que engolia a verdade:
--   • o callback fazia `googleDriveConnection.upsert(...).catch(() => null)` —
--     a tabela não existe, o Prisma lança, o catch engole, e o popup declarava
--     sucesso mesmo assim;
--   • `GET /api/portal/drive` fazia `findUnique(...).catch(() => null)` — devolve
--     `conectado: false`, que é indistinguível de "nunca conectou".
--
-- Não tinha nada a ver com o host do Railway: falhava nos dois hosts, para
-- todo cliente, desde o primeiro minuto.
--
-- ── POR QUE ESTA MIGRATION É SÓ ADITIVA ────────────────────────────────────
--
-- `migrate diff` também propõe RECONSTRUIR `ClientAiProvider` (PRAGMA
-- foreign_keys=OFF → CREATE new → INSERT SELECT → DROP → RENAME), por uma
-- divergência de chave estrangeira que já existia antes desta frente. Isso NÃO
-- entra aqui: é conserto urgente, com o CEO parado, num banco SQLite em volume,
-- e reconstruir tabela no meio disso é exatamente o risco que o passo 3.5 de
-- `scripts/start.sh` existe para cobrir. A divergência fica declarada em
-- `docs/pendencias.md` como frente própria.
--
-- CREATE TABLE puro, sem tocar em nenhuma tabela existente: nenhum dado
-- entregue ao cliente é movido por este arquivo.

-- CreateTable
CREATE TABLE "GoogleDriveConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "contaHint" TEXT NOT NULL DEFAULT '',
    "accessTokenEncrypted" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT,
    "tokenExpiresAt" DATETIME,
    "escopos" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'connected',
    "connectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DriveMaterial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "nome" TEXT NOT NULL DEFAULT '',
    "mimeType" TEXT NOT NULL DEFAULT '',
    "tamanhoBytes" INTEGER NOT NULL DEFAULT 0,
    "ehPasta" BOOLEAN NOT NULL DEFAULT false,
    "papel" TEXT,
    "papelSugerido" TEXT,
    "papelConfirmadoEm" DATETIME,
    "mediaAssetId" TEXT,
    "importadoEm" DATETIME,
    "erro" TEXT,
    "escolhidoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "GoogleDriveConnection_clientId_status_idx" ON "GoogleDriveConnection"("clientId", "status");

-- CreateIndex
-- A chave que o callback usa no upsert E que o portal usa na leitura. Uma só,
-- nos dois lados: divergência de chave entre gravar e ler é o clássico deste
-- tipo de bug, e aqui ela é a mesma linha de schema.
CREATE UNIQUE INDEX "GoogleDriveConnection_workspaceId_clientId_key" ON "GoogleDriveConnection"("workspaceId", "clientId");

-- CreateIndex
CREATE INDEX "DriveMaterial_clientId_papel_idx" ON "DriveMaterial"("clientId", "papel");

-- CreateIndex
CREATE INDEX "DriveMaterial_workspaceId_papelConfirmadoEm_idx" ON "DriveMaterial"("workspaceId", "papelConfirmadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "DriveMaterial_connectionId_fileId_key" ON "DriveMaterial"("connectionId", "fileId");
