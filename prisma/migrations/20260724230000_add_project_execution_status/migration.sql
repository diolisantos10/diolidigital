-- Execução durável da produção: o motor marca progresso no banco e um cron
-- recupera projetos travados (não depende mais do navegador). Colunas aditivas
-- com default seguro — nenhum dado existente é afetado.
-- AlterTable
ALTER TABLE "Project" ADD COLUMN "executionStatus" TEXT NOT NULL DEFAULT 'idle';
ALTER TABLE "Project" ADD COLUMN "executionRequestedAt" DATETIME;
ALTER TABLE "Project" ADD COLUMN "executionStartedAt" DATETIME;
ALTER TABLE "Project" ADD COLUMN "executionFinishedAt" DATETIME;
ALTER TABLE "Project" ADD COLUMN "executionAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Project" ADD COLUMN "executionError" TEXT;
