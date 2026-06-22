-- Add encrypted API key storage to integration configs.
ALTER TABLE "DbIntegrationConfig" ADD COLUMN "apiKeyEncrypted" TEXT;
ALTER TABLE "DbIntegrationConfig" ADD COLUMN "apiKeyHint" TEXT;
