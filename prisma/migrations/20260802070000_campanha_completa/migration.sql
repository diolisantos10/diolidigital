-- Conjunto e anúncio: sem eles a campanha é um envelope com verba e não
-- entrega nada. E o registro de quando o guardião de verba freou sozinho —
-- campanha que gasta sem entregar é o erro que ninguém percebe até a fatura.
ALTER TABLE "AdCampaign" ADD COLUMN "adSetId" TEXT;
ALTER TABLE "AdCampaign" ADD COLUMN "adId" TEXT;
ALTER TABLE "AdCampaign" ADD COLUMN "audience" TEXT;
ALTER TABLE "AdCampaign" ADD COLUMN "pausedByGuardAt" DATETIME;
ALTER TABLE "AdCampaign" ADD COLUMN "pausedReason" TEXT;
