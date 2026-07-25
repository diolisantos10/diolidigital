-- Radar de Ollie — biblioteca viva de tendências/atualizações de mercado.
-- CreateTable
CREATE TABLE "MarketInsight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "guidance" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'trend',
    "sourceName" TEXT,
    "sourceUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MarketInsight_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "AgencyWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MarketInsight_workspaceId_domain_status_idx" ON "MarketInsight"("workspaceId", "domain", "status");

-- CreateIndex
CREATE INDEX "MarketInsight_workspaceId_topic_idx" ON "MarketInsight"("workspaceId", "topic");
