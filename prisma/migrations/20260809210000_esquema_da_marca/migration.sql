-- OS CAMPOS QUE PERMITEM JULGAR UMA PEÇA PELA MARCA.
--
-- Medido em 09/08/2026 contra o código em produção: o cérebro de marca tinha
-- nove colunas de texto — nome, tagline, cores, tipografia, tom, valores,
-- público, posicionamento — e nenhuma delas permitia REPROVAR coisa alguma.
-- Todas dizem quem a marca é; nenhuma diz o que ela não pode fazer.
--
-- O esquema abaixo vem da constituição do `branding` (dioli-brain-kit, doutrina
-- 23). Nove campos, e cada um entra porque muda uma decisão de quem produz.
--
-- As PROIBIÇÕES não entram aqui de propósito: já existem e funcionam em
-- `BrainArtifact`. Uma coluna nova para elas criaria duas verdades sobre a
-- mesma regra.
--
-- Aditiva e reversível por omissão: toda coluna é opcional ou tem padrão, então
-- nenhuma linha existente precisa ser tocada e nada é perdido se a aplicação
-- antiga voltar a rodar por engano.
ALTER TABLE "BrandBrain" ADD COLUMN "purposeAndPromise" TEXT;
ALTER TABLE "BrandBrain" ADD COLUMN "audienceRelation" TEXT;
ALTER TABLE "BrandBrain" ADD COLUMN "voicePairsJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "BrandBrain" ADD COLUMN "lexiconJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "BrandBrain" ADD COLUMN "referencesJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "BrandBrain" ADD COLUMN "formalTokensJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "BrandBrain" ADD COLUMN "promiseLimits" TEXT;
ALTER TABLE "BrandBrain" ADD COLUMN "ownerAndHierarchyJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "BrandBrain" ADD COLUMN "fieldStatesJson" TEXT NOT NULL DEFAULT '{}';
