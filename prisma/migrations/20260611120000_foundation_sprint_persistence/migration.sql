-- CreateTable
CREATE TABLE "BrainVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "changeRequestId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ClientRequestDb" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT,
    "clientId" TEXT,
    "businessName" TEXT NOT NULL,
    "segment" TEXT NOT NULL DEFAULT '',
    "services" TEXT NOT NULL DEFAULT '[]',
    "objectives" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'new',
    "source" TEXT NOT NULL DEFAULT 'briefing',
    "rawContext" TEXT NOT NULL DEFAULT '',
    "briefingJson" TEXT,
    "sdrHandoffJson" TEXT,
    "attachmentsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BrainArtifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientRequestId" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "canvasId" TEXT NOT NULL,
    "canvasJson" TEXT NOT NULL,
    "qualityGateJson" TEXT,
    "cognitiveFlowJson" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'approved',
    "approvedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedBy" TEXT NOT NULL DEFAULT 'internal',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BrainArtifact_clientRequestId_fkey" FOREIGN KEY ("clientRequestId") REFERENCES "ClientRequestDb" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientRequestId" TEXT NOT NULL,
    "artifactId" TEXT,
    "department" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL DEFAULT 'internal',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedBy" TEXT,
    "reviewedAt" DATETIME,
    "expiresAt" DATETIME,
    "reviewNote" TEXT,
    "clientVisible" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ApprovalRequest_clientRequestId_fkey" FOREIGN KEY ("clientRequestId") REFERENCES "ClientRequestDb" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApprovalComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "approvalRequestId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorRole" TEXT NOT NULL DEFAULT 'internal',
    "body" TEXT NOT NULL,
    "isClientVisible" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApprovalComment_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EvidenceItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientRequestId" TEXT,
    "artifactId" TEXT,
    "department" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "valueJson" TEXT NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvidenceItem_clientRequestId_fkey" FOREIGN KEY ("clientRequestId") REFERENCES "ClientRequestDb" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PortalAccess" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "clientRequestId" TEXT,
    "clientId" TEXT,
    "grantedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    "revokedAt" DATETIME,
    "lastAccessedAt" DATETIME,
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PortalAccess_clientRequestId_fkey" FOREIGN KEY ("clientRequestId") REFERENCES "ClientRequestDb" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BrainChangeRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceSuggestionIds" TEXT NOT NULL DEFAULT '[]',
    "proposedChange" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_review',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" DATETIME,
    "appliedAt" DATETIME,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "department" TEXT NOT NULL DEFAULT 'client-service-sdr',
    "category" TEXT NOT NULL DEFAULT 'department_logic',
    "description" TEXT NOT NULL DEFAULT '',
    "rationale" TEXT NOT NULL DEFAULT '',
    "expectedImpact" TEXT NOT NULL DEFAULT '',
    "riskLevel" TEXT NOT NULL DEFAULT 'medium',
    "requestedBy" TEXT NOT NULL DEFAULT 'system',
    "approvalRequiredBy" TEXT NOT NULL DEFAULT 'brain_director',
    "reviewedAt" DATETIME,
    "reviewNote" TEXT
);
INSERT INTO "new_BrainChangeRequest" ("agentId", "appliedAt", "approvedAt", "createdAt", "id", "proposedChange", "sourceSuggestionIds", "status", "title") SELECT "agentId", "appliedAt", "approvedAt", "createdAt", "id", "proposedChange", "sourceSuggestionIds", "status", "title" FROM "BrainChangeRequest";
DROP TABLE "BrainChangeRequest";
ALTER TABLE "new_BrainChangeRequest" RENAME TO "BrainChangeRequest";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "BrainVersion_version_key" ON "BrainVersion"("version");

-- CreateIndex
CREATE UNIQUE INDEX "PortalAccess_token_key" ON "PortalAccess"("token");

