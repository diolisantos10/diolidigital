-- Dinheiro precisa de rastro. Sem esta tabela, "quem mandou gastar R$ 40 por
-- dia na conta da padaria?" não tem resposta — só um id solto dentro da Meta.
CREATE TABLE "AdCampaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT,
    "projectId" TEXT,
    "connectionId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "dailyBudgetBRL" REAL NOT NULL,
    "approvedCapBRL" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'paused',
    "activatedBy" TEXT,
    "activatedAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "AdCampaign_workspaceId_status_idx" ON "AdCampaign"("workspaceId", "status");
CREATE INDEX "AdCampaign_projectId_idx" ON "AdCampaign"("projectId");
