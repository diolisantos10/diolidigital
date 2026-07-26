-- CreateTable
CREATE TABLE "WhatsAppMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL DEFAULT '',
    "contactWaId" TEXT NOT NULL,
    "contactName" TEXT,
    "direction" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "body" TEXT NOT NULL DEFAULT '',
    "externalId" TEXT,
    "status" TEXT,
    "clientRequestId" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "WhatsAppMessage_workspaceId_contactWaId_timestamp_idx" ON "WhatsAppMessage"("workspaceId", "contactWaId", "timestamp");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_externalId_idx" ON "WhatsAppMessage"("externalId");
