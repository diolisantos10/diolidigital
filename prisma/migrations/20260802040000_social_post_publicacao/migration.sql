-- Da entrega até o ar: o post precisa saber de qual entrega nasceu (idempotência
-- do agendamento) e o que aconteceu quando foi publicado (id externo para o
-- relatório mensal, e o motivo da falha em vez de silêncio).
ALTER TABLE "SocialPost" ADD COLUMN "deliverableId" TEXT;
ALTER TABLE "SocialPost" ADD COLUMN "externalPostId" TEXT;
ALTER TABLE "SocialPost" ADD COLUMN "permalink" TEXT;
ALTER TABLE "SocialPost" ADD COLUMN "publishedAt" DATETIME;
ALTER TABLE "SocialPost" ADD COLUMN "lastError" TEXT;

CREATE INDEX "SocialPost_deliverableId_idx" ON "SocialPost"("deliverableId");
CREATE INDEX "SocialPost_status_scheduledFor_idx" ON "SocialPost"("status", "scheduledFor");
