-- CreateTable
CREATE TABLE "WhatsAppOutbox" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "activityEventId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'proposal_sent',
    "toPhone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "externalMessageId" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppOutbox_activityEventId_key" ON "WhatsAppOutbox"("activityEventId");

-- CreateIndex
CREATE INDEX "WhatsAppOutbox_workspaceId_status_idx" ON "WhatsAppOutbox"("workspaceId", "status");
