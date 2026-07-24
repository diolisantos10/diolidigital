-- CreateTable
CREATE TABLE "MetaConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT,
    "platform" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "externalId" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT NOT NULL,
    "tokenHint" TEXT,
    "tokenExpiresAt" DATETIME,
    "scopes" TEXT NOT NULL DEFAULT '[]',
    "metaJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'connected',
    "connectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MetaConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "AgencyWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MetaConnection_workspaceId_platform_idx" ON "MetaConnection"("workspaceId", "platform");

-- CreateIndex
CREATE INDEX "MetaConnection_clientId_idx" ON "MetaConnection"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaConnection_workspaceId_platform_externalId_key" ON "MetaConnection"("workspaceId", "platform", "externalId");
