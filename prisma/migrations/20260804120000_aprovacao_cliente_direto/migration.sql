-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ApprovalRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientRequestId" TEXT,
    "clientId" TEXT,
    "artifactId" TEXT,
    "department" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL DEFAULT 'internal',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedBy" TEXT,
    "reviewedAt" DATETIME,
    "expiresAt" DATETIME,
    "questionOpenedAt" DATETIME,
    "reviewNote" TEXT,
    "clientVisible" BOOLEAN NOT NULL DEFAULT false,
    "deliverableVersionId" TEXT,
    "sourcePostIdsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ApprovalRequest_clientRequestId_fkey" FOREIGN KEY ("clientRequestId") REFERENCES "ClientRequestDb" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ApprovalRequest_deliverableVersionId_fkey" FOREIGN KEY ("deliverableVersionId") REFERENCES "DeliverableVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ApprovalRequest" ("artifactId", "clientRequestId", "clientVisible", "createdAt", "deliverableVersionId", "department", "expiresAt", "id", "questionOpenedAt", "requestedBy", "reviewNote", "reviewedAt", "reviewedBy", "status", "updatedAt") SELECT "artifactId", "clientRequestId", "clientVisible", "createdAt", "deliverableVersionId", "department", "expiresAt", "id", "questionOpenedAt", "requestedBy", "reviewNote", "reviewedAt", "reviewedBy", "status", "updatedAt" FROM "ApprovalRequest";
DROP TABLE "ApprovalRequest";
ALTER TABLE "new_ApprovalRequest" RENAME TO "ApprovalRequest";
CREATE INDEX "ApprovalRequest_clientId_idx" ON "ApprovalRequest"("clientId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
