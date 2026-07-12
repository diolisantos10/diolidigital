-- CreateTable
CREATE TABLE "SocialPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT,
    "clientRequestId" TEXT,
    "caption" TEXT NOT NULL DEFAULT '',
    "networks" TEXT NOT NULL DEFAULT '[]',
    "format" TEXT NOT NULL DEFAULT 'feed',
    "pillar" TEXT,
    "mediaUrl" TEXT,
    "scheduledFor" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "SocialPost_workspaceId_scheduledFor_idx" ON "SocialPost"("workspaceId", "scheduledFor");

-- CreateIndex
CREATE INDEX "SocialPost_clientRequestId_idx" ON "SocialPost"("clientRequestId");
