-- ── OS ÍNDICES QUE FALTAVAM ─────────────────────────────────────────────────
--
-- Migration ADITIVA: só cria índice. Nenhuma tabela é reconstruída, nenhuma
-- coluna muda, nenhum dado se move. É o tipo de migration que pode rodar num
-- volume de produção sem susto — o oposto das cinco que reconstroem tabela.
--
-- POR QUE ISTO IMPORTA MAIS AQUI DO QUE NUM Postgres: o banco é um arquivo
-- SQLite num volume do Railway, e o SQLite tem UM lock de escrita para o banco
-- inteiro. Uma consulta que varre tabela não é só "lenta": ela SEGURA o lock e
-- faz o resto da casa esperar. É assim que "database is locked" vira erro de
-- deploy — o retry anti-lock do `scripts/start.sh` existe porque o sintoma já
-- apareceu.
--
-- O despertador (`lib/agency/despertador.ts`) bate a cada 5 MINUTOS e, numa só
-- batida, tocava sem índice: Project (OR de 3 estados), ActivityEvent
-- (type = whatsapp_notify, sem workspace) e AdCampaign (status = active, sem
-- workspace). Três varreduras completas, para sempre, a cada 5 min.
--
-- `IF NOT EXISTS` em todos: uma base que já tenha o índice não quebra o deploy.

-- Client: toda listagem é por inquilino.
CREATE INDEX IF NOT EXISTS "Client_workspaceId_idx" ON "Client"("workspaceId");

-- Project: o índice do despertador vem primeiro porque é o mais quente.
-- `[executionStatus, executionRequestedAt]` cobre o filtro E a ordenação.
CREATE INDEX IF NOT EXISTS "Project_executionStatus_executionRequestedAt_idx" ON "Project"("executionStatus", "executionRequestedAt");
CREATE INDEX IF NOT EXISTS "Project_workspaceId_idx"     ON "Project"("workspaceId");
CREATE INDEX IF NOT EXISTS "Project_clientId_idx"        ON "Project"("clientId");
CREATE INDEX IF NOT EXISTS "Project_clientRequestId_idx" ON "Project"("clientRequestId");

-- Task: leitura por projeto e cascade de exclusão do projeto.
CREATE INDEX IF NOT EXISTS "Task_projectId_idx" ON "Task"("projectId");

-- ActivityEvent: a linha do tempo do inquilino e a varredura do disparo.
CREATE INDEX IF NOT EXISTS "ActivityEvent_workspaceId_timestamp_idx" ON "ActivityEvent"("workspaceId", "timestamp");
CREATE INDEX IF NOT EXISTS "ActivityEvent_type_timestamp_idx"        ON "ActivityEvent"("type", "timestamp");
CREATE INDEX IF NOT EXISTS "ActivityEvent_projectId_idx"             ON "ActivityEvent"("projectId");

-- AIRunLog: tabela que só cresce, sempre lida como "os últimos deste workspace".
CREATE INDEX IF NOT EXISTS "AIRunLog_workspaceId_createdAt_idx" ON "AIRunLog"("workspaceId", "createdAt");
CREATE INDEX IF NOT EXISTS "AIRunLog_projectId_idx"             ON "AIRunLog"("projectId");

-- PortalAccess: a busca do link vivo do portal.
CREATE INDEX IF NOT EXISTS "PortalAccess_clientRequestId_revokedAt_idx" ON "PortalAccess"("clientRequestId", "revokedAt");
CREATE INDEX IF NOT EXISTS "PortalAccess_clientId_idx"                  ON "PortalAccess"("clientId");

-- AdCampaign: o guardião de verba busca por status SEM workspace. O índice que
-- já existia é `[workspaceId, status]` — coluna líder errada para esta busca,
-- e índice só serve a partir do prefixo da esquerda.
CREATE INDEX IF NOT EXISTS "AdCampaign_status_idx" ON "AdCampaign"("status");

-- MetaConnection: TODO webhook de WhatsApp resolve o workspace por
-- `{platform, externalId}` — sem workspace, porque é o workspace que ele está
-- descobrindo. O `@@unique([workspaceId, platform, externalId])` começa pela
-- coluna errada e não cobre esta busca.
CREATE INDEX IF NOT EXISTS "MetaConnection_platform_externalId_idx" ON "MetaConnection"("platform", "externalId");
