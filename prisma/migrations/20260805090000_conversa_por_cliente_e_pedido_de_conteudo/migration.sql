-- ── 1. A conversa deixa de depender de uma solicitação de briefing ───────────
-- PortalMessage.clientRequestId era OBRIGATÓRIO. Cliente criado direto pela
-- agência (o caso da Foocci) nunca tem ClientRequestDb, então a rota devolvia
-- 404 e o cliente NÃO CONSEGUIA MANDAR MENSAGEM NENHUMA. Mesmo par de chaves
-- que ApprovalRequest e BrainArtifact já adotaram: clientRequestId OU clientId.
--
-- Backfill: toda mensagem antiga ganha o clientId da solicitação dela, quando
-- ela tem um. Sem isso a caixa de entrada por cliente começaria cega para o
-- histórico — e o índice novo (clientId, createdAt) não serviria para nada.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_PortalMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientRequestId" TEXT,
    "clientId" TEXT,
    "authorRole" TEXT NOT NULL,
    "authorName" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "readByTeam" BOOLEAN NOT NULL DEFAULT false,
    "readByClient" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PortalMessage_clientRequestId_fkey" FOREIGN KEY ("clientRequestId") REFERENCES "ClientRequestDb" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PortalMessage" ("id", "clientRequestId", "clientId", "authorRole", "authorName", "body", "readByTeam", "readByClient", "createdAt")
SELECT
    m."id",
    m."clientRequestId",
    (SELECT r."clientId" FROM "ClientRequestDb" r WHERE r."id" = m."clientRequestId"),
    m."authorRole", m."authorName", m."body", m."readByTeam", m."readByClient", m."createdAt"
FROM "PortalMessage" m;
DROP TABLE "PortalMessage";
ALTER TABLE "new_PortalMessage" RENAME TO "PortalMessage";
CREATE INDEX "PortalMessage_clientRequestId_createdAt_idx" ON "PortalMessage"("clientRequestId", "createdAt");
CREATE INDEX "PortalMessage_clientId_createdAt_idx" ON "PortalMessage"("clientId", "createdAt");
CREATE INDEX "PortalMessage_readByTeam_authorRole_idx" ON "PortalMessage"("readByTeam", "authorRole");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- ── 2. O primeiro elo cliente → agência ──────────────────────────────────────
-- Até aqui NENHUM modelo tinha o cliente como origem: toda a esteira era
-- agência → cliente. Pedir uma peça nova morria no chat que ninguém lia.
CREATE TABLE "ContentRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "clientRequestId" TEXT,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "desiredFor" DATETIME,
    "attachmentsJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'novo',
    "scopeDecision" TEXT,
    "taskId" TEXT,
    "triagedBy" TEXT,
    "triagedAt" DATETIME,
    "declineReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContentRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ContentRequest_clientId_status_idx" ON "ContentRequest"("clientId", "status");
CREATE INDEX "ContentRequest_status_createdAt_idx" ON "ContentRequest"("status", "createdAt");
