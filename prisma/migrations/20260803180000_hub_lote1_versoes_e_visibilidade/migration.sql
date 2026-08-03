-- Hub do Cliente — Lote 1 (03/08/2026).
--
-- 1. `DeliverableVersion`: a exigência "nova versão sem apagar a anterior" era
--    incumprível — a refação sobrescrevia `Deliverable.content` e o corpo da v1
--    sumia do mundo (Fase 1, 1.9). A versão vira registro imutável; `content`
--    passa a ser cache da versão corrente.
-- 2. `visibility` em Deliverable e SocialPost: o portal decidia o que mostrar
--    rota a rota (fail-open). O campo no modelo é a trava; default "interno"
--    porque objeto sem decisão explícita de publicação NÃO pode vazar.
-- 3. `ApprovalRequest.questionOpenedAt` + `deliverableVersionId` e
--    `ApprovalComment.kind`: o caminho "Tenho uma dúvida" (não decide, pausa o
--    prazo) e o vínculo aprovação↔versão que mata o achado A2.
--
-- REGRA DE COMPATIBILIDADE do backfill (fim do arquivo): o que HOJE já aparece
-- no portal vira "compartilhado" — nada some da tela do cliente da noite para
-- o dia. Só o que nunca foi apresentado permanece "interno".

-- CreateTable
CREATE TABLE "DeliverableVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deliverableId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "content" TEXT,
    "mediaAssetIds" TEXT NOT NULL DEFAULT '[]',
    "createdBy" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliverableVersion_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ApprovalComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "approvalRequestId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorRole" TEXT NOT NULL DEFAULT 'internal',
    "kind" TEXT NOT NULL DEFAULT 'comment',
    "body" TEXT NOT NULL,
    "isClientVisible" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApprovalComment_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ApprovalComment" ("approvalRequestId", "authorName", "authorRole", "body", "createdAt", "id", "isClientVisible") SELECT "approvalRequestId", "authorName", "authorRole", "body", "createdAt", "id", "isClientVisible" FROM "ApprovalComment";
DROP TABLE "ApprovalComment";
ALTER TABLE "new_ApprovalComment" RENAME TO "ApprovalComment";
CREATE TABLE "new_ApprovalRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientRequestId" TEXT NOT NULL,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ApprovalRequest_clientRequestId_fkey" FOREIGN KEY ("clientRequestId") REFERENCES "ClientRequestDb" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ApprovalRequest_deliverableVersionId_fkey" FOREIGN KEY ("deliverableVersionId") REFERENCES "DeliverableVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ApprovalRequest" ("artifactId", "clientRequestId", "clientVisible", "createdAt", "department", "expiresAt", "id", "requestedBy", "reviewNote", "reviewedAt", "reviewedBy", "status", "updatedAt") SELECT "artifactId", "clientRequestId", "clientVisible", "createdAt", "department", "expiresAt", "id", "requestedBy", "reviewNote", "reviewedAt", "reviewedBy", "status", "updatedAt" FROM "ApprovalRequest";
DROP TABLE "ApprovalRequest";
ALTER TABLE "new_ApprovalRequest" RENAME TO "ApprovalRequest";
CREATE TABLE "new_Deliverable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "revisionStatus" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'interno',
    "content" TEXT,
    "clientFeedback" TEXT,
    "lastFeedback" TEXT,
    "ownerAgentId" TEXT,
    "cycleId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "revisionHistory" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Deliverable_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Deliverable" ("clientFeedback", "content", "createdAt", "cycleId", "id", "lastFeedback", "name", "ownerAgentId", "projectId", "revisionHistory", "revisionStatus", "status", "type", "updatedAt", "version") SELECT "clientFeedback", "content", "createdAt", "cycleId", "id", "lastFeedback", "name", "ownerAgentId", "projectId", "revisionHistory", "revisionStatus", "status", "type", "updatedAt", "version" FROM "Deliverable";
DROP TABLE "Deliverable";
ALTER TABLE "new_Deliverable" RENAME TO "Deliverable";
CREATE INDEX "Deliverable_projectId_cycleId_idx" ON "Deliverable"("projectId", "cycleId");
CREATE TABLE "new_SocialPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT,
    "clientRequestId" TEXT,
    "caption" TEXT NOT NULL DEFAULT '',
    "networks" TEXT NOT NULL DEFAULT '[]',
    "format" TEXT NOT NULL DEFAULT 'feed',
    "pillar" TEXT,
    "mediaUrl" TEXT,
    "mediaUrlsJson" TEXT NOT NULL DEFAULT '[]',
    "scenesJson" TEXT NOT NULL DEFAULT '[]',
    "scriptJson" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'interno',
    "scheduledFor" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "deliverableId" TEXT,
    "externalPostId" TEXT,
    "permalink" TEXT,
    "publishedAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_SocialPost" ("caption", "clientId", "clientRequestId", "createdAt", "deliverableId", "externalPostId", "format", "id", "lastError", "mediaUrl", "mediaUrlsJson", "networks", "permalink", "pillar", "publishedAt", "scenesJson", "scheduledFor", "scriptJson", "status", "updatedAt", "workspaceId") SELECT "caption", "clientId", "clientRequestId", "createdAt", "deliverableId", "externalPostId", "format", "id", "lastError", "mediaUrl", "mediaUrlsJson", "networks", "permalink", "pillar", "publishedAt", "scenesJson", "scheduledFor", "scriptJson", "status", "updatedAt", "workspaceId" FROM "SocialPost";
DROP TABLE "SocialPost";
ALTER TABLE "new_SocialPost" RENAME TO "SocialPost";
CREATE INDEX "SocialPost_workspaceId_scheduledFor_idx" ON "SocialPost"("workspaceId", "scheduledFor");
CREATE INDEX "SocialPost_deliverableId_idx" ON "SocialPost"("deliverableId");
CREATE INDEX "SocialPost_status_scheduledFor_idx" ON "SocialPost"("status", "scheduledFor");
CREATE INDEX "SocialPost_clientRequestId_idx" ON "SocialPost"("clientRequestId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "DeliverableVersion_deliverableId_number_key" ON "DeliverableVersion"("deliverableId", "number");

-- ── Backfill de compatibilidade ──────────────────────────────────────────────
-- O portal de hoje mostra conteúdo de entregável quando a solicitação do
-- cliente tem aprovação `clientVisible` (app/api/brain/portal-data). Esses
-- entregáveis viram "compartilhado" para que a rota, ao passar a filtrar por
-- `visibility`, não esconda nada que o cliente já via.
UPDATE "Deliverable"
SET "visibility" = 'compartilhado'
WHERE "projectId" IN (
  SELECT p."id" FROM "Project" p
  JOIN "ApprovalRequest" ar ON ar."clientRequestId" = p."clientRequestId"
  WHERE ar."clientVisible" = true
);

-- O calendário do portal lista todo post do `clientRequestId` do token — logo,
-- todo post já ligado a uma solicitação de cliente é, hoje, visível a ele.
UPDATE "SocialPost"
SET "visibility" = 'compartilhado'
WHERE "clientRequestId" IS NOT NULL;
