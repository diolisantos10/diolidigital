-- CreateTable
CREATE TABLE "AgencyWorkspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'master',
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "AgencyWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "portalToken" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Client_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "AgencyWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "goal" TEXT,
    "type" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'briefing',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "deadline" TEXT,
    "proposalStatus" TEXT,
    "proposalPricing" TEXT,
    "proposalScope" TEXT,
    "proposalSentAt" TEXT,
    "agents" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "AgencyWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Deliverable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "revisionStatus" TEXT,
    "content" TEXT,
    "clientFeedback" TEXT,
    "lastFeedback" TEXT,
    "ownerAgentId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "revisionHistory" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Deliverable_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MaterialRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "MaterialRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BrandBrain" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "brandName" TEXT,
    "tagline" TEXT,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "typography" TEXT,
    "tone" TEXT,
    "values" TEXT NOT NULL DEFAULT '[]',
    "targetAudience" TEXT,
    "positioning" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BrandBrain_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StrategyRoom" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'generating',
    "analysisJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StrategyRoom_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DbIntegrationConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "configured" BOOLEAN NOT NULL DEFAULT false,
    "selectedModel" TEXT,
    "configWorkspace" TEXT,
    "accountId" TEXT,
    "folder" TEXT,
    "webhookUrl" TEXT,
    "lastTestStatus" TEXT NOT NULL DEFAULT 'not_run',
    "lastTestAt" DATETIME,
    "lastTestMessage" TEXT,
    "lastConfiguredAt" DATETIME,
    CONSTRAINT "DbIntegrationConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "AgencyWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DbAgentProviderConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "selectedProvider" TEXT NOT NULL DEFAULT 'rule_based',
    "selectedModel" TEXT,
    CONSTRAINT "DbAgentProviderConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "AgencyWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "clientId" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "AgencyWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ActivityEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AgencyWorkspace_slug_key" ON "AgencyWorkspace"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Client_portalToken_key" ON "Client"("portalToken");

-- CreateIndex
CREATE UNIQUE INDEX "BrandBrain_clientId_key" ON "BrandBrain"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyRoom_projectId_key" ON "StrategyRoom"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "DbIntegrationConfig_workspaceId_integrationId_key" ON "DbIntegrationConfig"("workspaceId", "integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "DbAgentProviderConfig_workspaceId_agentId_key" ON "DbAgentProviderConfig"("workspaceId", "agentId");
