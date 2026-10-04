-- A FICHA ÚNICA DE MARCA (04/10/2026)
--
-- ADITIVA: três colunas novas, todas opcionais ou com padrão. Nenhuma linha
-- viva perde dado. Os campos que o Brand Hub já gravava (tom, posicionamento,
-- público, cores, tipografia, regras) continuam nas MESMAS colunas — a ficha
-- única passa a lê-las e escrevê-las; não há cópia a migrar.
ALTER TABLE "Client" ADD COLUMN "descricao" TEXT;
ALTER TABLE "Client" ADD COLUMN "status" TEXT;
ALTER TABLE "BrandBrain" ADD COLUMN "fichaExtraJson" TEXT NOT NULL DEFAULT '{}';
