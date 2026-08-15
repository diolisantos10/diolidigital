-- V2 MARCO 3 — A COLUNA DO ESTADO CANÔNICO, ADITIVA E NULA DE NASCENÇA.
--
-- 15/08/2026. Dez entidades ganham `estadoCanonico` (TEXT, nulo): cache
-- AUDITADO da derivação legado→canônico (lib/agency/estados-v2/derivar.ts).
-- Ninguém digita este campo: o backfill deriva, a leitura dupla confere, e
-- divergência vira linha em ReconciliacaoV2 — nunca exceção pro usuário.
--
-- POR QUE À MÃO: o `migrate diff` gerado propunha reconstrução de tabela
-- (CREATE→INSERT→DROP→RENAME) — o padrão que o start.sh chama de cirurgia.
-- Coluna nova nula não precisa de cirurgia. ALTER ADD COLUMN é o suficiente,
-- não trava dado e não tem meio-termo perigoso.
--
-- ROLLBACK: coluna nula sem uso quando as flags estão desligadas; reverter
-- comportamento = desligar flag. A coluna só seria removida em limpeza tardia,
-- com aprovação do CEO, fora deste marco.

ALTER TABLE "Oportunidade"    ADD COLUMN "estadoCanonico" TEXT;
ALTER TABLE "ClientRequestDb" ADD COLUMN "estadoCanonico" TEXT;
ALTER TABLE "ContentRequest"  ADD COLUMN "estadoCanonico" TEXT;
ALTER TABLE "Briefing"        ADD COLUMN "estadoCanonico" TEXT;
ALTER TABLE "SocialPost"      ADD COLUMN "estadoCanonico" TEXT;
ALTER TABLE "Task"            ADD COLUMN "estadoCanonico" TEXT;
ALTER TABLE "ApprovalRequest" ADD COLUMN "estadoCanonico" TEXT;
ALTER TABLE "Cycle"           ADD COLUMN "estadoCanonico" TEXT;
ALTER TABLE "Deliverable"     ADD COLUMN "estadoCanonico" TEXT;
ALTER TABLE "Project"         ADD COLUMN "estadoCanonico" TEXT;
