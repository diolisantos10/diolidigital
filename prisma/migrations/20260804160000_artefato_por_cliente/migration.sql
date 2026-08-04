-- BrainArtifact passa a ter o MESMO par de chaves do SocialPost: clientRequestId
-- (nulo para cliente direto) OU clientId. Sem isto, a memória de leitura do feed
-- não tinha onde nascer no cliente-piloto — que é criado direto, sem briefing.
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BrainArtifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientRequestId" TEXT,
    "clientId" TEXT,
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
INSERT INTO "new_BrainArtifact" ("approvedAt", "approvedBy", "canvasId", "canvasJson", "clientRequestId", "cognitiveFlowJson", "createdAt", "department", "id", "qualityGateJson", "status", "version") SELECT "approvedAt", "approvedBy", "canvasId", "canvasJson", "clientRequestId", "cognitiveFlowJson", "createdAt", "department", "id", "qualityGateJson", "status", "version" FROM "BrainArtifact";
DROP TABLE "BrainArtifact";
ALTER TABLE "new_BrainArtifact" RENAME TO "BrainArtifact";
CREATE INDEX "BrainArtifact_clientId_department_idx" ON "BrainArtifact"("clientId", "department");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
