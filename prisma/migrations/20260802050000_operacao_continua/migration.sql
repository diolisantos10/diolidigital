-- Operação contínua: fazer o mês 2 existir.
--
-- A idempotência do motor era por especialista POR PROJETO — para sempre. Um
-- cliente vitalício recebia uma entrega na vida. `cycleId` amarra a entrega ao
-- ciclo em que ela foi feita: o mês novo tem a folha em branco de novo.
--
-- `Cycle.presentedAt` existe pelo mesmo motivo do lado da apresentação: o
-- carimbo do projeto só serve ao pacote inicial.
ALTER TABLE "Deliverable" ADD COLUMN "cycleId" TEXT;
CREATE INDEX "Deliverable_projectId_cycleId_idx" ON "Deliverable"("projectId", "cycleId");

ALTER TABLE "Cycle" ADD COLUMN "presentedAt" DATETIME;
