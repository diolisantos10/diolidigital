-- Google Meu Negócio. Separado da Meta porque o ciclo de vida do token é outro:
-- o do Google expira em 1h e se renova por refresh token; o da Meta dura 60
-- dias e não se renova sozinho. Misturar obrigaria todo leitor a saber de qual
-- provedor a linha é antes de usá-la — e é aí que se publica na conta errada.
CREATE TABLE "GoogleConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT,
    "locationName" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "accessTokenEncrypted" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT,
    "tokenExpiresAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "reviewsSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "GoogleConnection_workspaceId_locationName_key" ON "GoogleConnection"("workspaceId", "locationName");
CREATE INDEX "GoogleConnection_clientId_idx" ON "GoogleConnection"("clientId");

-- Responder avaliação é PÚBLICO e PERMANENTE: precisa de rastro e de trava
-- para não responder duas vezes a mesma.
CREATE TABLE "GoogleReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT,
    "connectionId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "reviewerName" TEXT NOT NULL DEFAULT '',
    "starRating" INTEGER NOT NULL DEFAULT 0,
    "comment" TEXT NOT NULL DEFAULT '',
    "createdAtGoogle" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "reply" TEXT,
    "repliedAt" DATETIME,
    "escalatedReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "GoogleReview_connectionId_externalId_key" ON "GoogleReview"("connectionId", "externalId");
CREATE INDEX "GoogleReview_workspaceId_status_idx" ON "GoogleReview"("workspaceId", "status");
