-- CreateTable
CREATE TABLE "BrainUpdate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientRequestId" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "fieldChanged" TEXT NOT NULL,
    "previousValue" TEXT,
    "proposedValue" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" DATETIME
);
