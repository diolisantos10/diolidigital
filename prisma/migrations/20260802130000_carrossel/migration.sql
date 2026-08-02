-- Carrossel: uma peça com VÁRIAS imagens não cabe em `mediaUrl`.
-- `scenesJson` guarda as telas que o especialista descreveu — sem elas, um
-- carrossel de 5 imagens sairia com 5 variações da mesma cena.
ALTER TABLE "SocialPost" ADD COLUMN "mediaUrlsJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "SocialPost" ADD COLUMN "scenesJson" TEXT NOT NULL DEFAULT '[]';
