-- TRÊS FUROS DO RAIO-X DE 05/08/2026, na parte que é schema.
--
-- 1. `RateLimitBucket` — o teto de ritmo sai da memória do processo e passa a
--    morar no volume. O contador antigo (`lib/security/rate-limit.ts`) zerava em
--    todo deploy e não atravessava réplica: quem estava atacando só precisava
--    esperar o próximo deploy para começar de novo, de graça. É a mesma família
--    da rota de imagem que ficou aberta e custou dinheiro.
--
-- 2/3. `DbAgentSuggestion.workspaceId` e `BrainChangeRequest.workspaceId` — as
--    duas tabelas de governança não tinham dono nenhum, e as rotas
--    `/api/admin/training/sdr/suggestions/[id]` e `/api/brain/changes/[id]`
--    aceitavam qualquer id de qualquer sessão master. Sem coluna de dono não
--    existe posse para derivar.
--
-- Aditivo e nulo em tudo: nenhuma linha existente é reescrita nem perdida. As
-- linhas antigas ficam ÓRFÃS de propósito — órfã não é "de todo mundo", é a
-- política fail-closed de `lib/auth/posse-de-workspace.ts` (passa só quando
-- existe UM workspace na base; com dois, ninguém adivinha por ninguém).
--
-- Sem `IF NOT EXISTS` porque o SQLite não aceita isso em `ADD COLUMN`.

CREATE TABLE "RateLimitBucket" (
    "chave"     TEXT     NOT NULL PRIMARY KEY,
    "contagem"  INTEGER  NOT NULL DEFAULT 1,
    "resetAt"   DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");

ALTER TABLE "DbAgentSuggestion"  ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "BrainChangeRequest" ADD COLUMN "workspaceId" TEXT;

CREATE INDEX "DbAgentSuggestion_workspaceId_status_idx"  ON "DbAgentSuggestion"("workspaceId", "status");
CREATE INDEX "BrainChangeRequest_workspaceId_status_idx" ON "BrainChangeRequest"("workspaceId", "status");
