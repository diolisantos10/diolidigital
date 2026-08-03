-- A política da API do Google Business Profile proíbe automatizar resposta a
-- avaliação sem consentimento prévio e específico do usuário. A coluna é a
-- trava: nula, nenhuma resposta automática sai.
ALTER TABLE "GoogleConnection" ADD COLUMN "autoReplyConsentAt" DATETIME;
