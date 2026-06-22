// Central resolver: "what API key should this provider use?"
// SERVER-ONLY. Order of resolution:
//   1. A key saved through the Integrations UI (encrypted in the DB).
//   2. The matching environment variable (legacy / fallback).
//
// This lets non-technical operators paste a key in the UI without touching
// env vars, while keeping existing env-based deploys working unchanged.

import { prisma } from "@/lib/db/client";
import { decryptSecret } from "@/lib/security/crypto";

export type AiProvider = "openai" | "claude" | "gemini";

// Provider → integrationId used as the row key in DbIntegrationConfig.
export const PROVIDER_INTEGRATION_ID: Record<AiProvider, string> = {
  openai: "int-openai",
  claude: "int-claude",
  gemini: "int-gemini",
};

// Provider → environment variable fallback.
const PROVIDER_ENV: Record<AiProvider, string> = {
  openai: "OPENAI_API_KEY",
  claude: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
};

export interface ResolvedKey {
  apiKey: string;
  source: "ui" | "env";
  model: string | null;
}

// Resolves the API key for a provider. If workspaceId is given, the UI key is
// scoped to that workspace; otherwise the first configured key is used.
export async function resolveProviderKey(
  provider: AiProvider,
  workspaceId?: string,
): Promise<ResolvedKey | null> {
  const integrationId = PROVIDER_INTEGRATION_ID[provider];

  try {
    const row = workspaceId
      ? await prisma.dbIntegrationConfig.findUnique({
          where: { workspaceId_integrationId: { workspaceId, integrationId } },
        })
      : await prisma.dbIntegrationConfig.findFirst({
          where: { integrationId, apiKeyEncrypted: { not: null } },
        });

    if (row?.apiKeyEncrypted) {
      const apiKey = decryptSecret(row.apiKeyEncrypted);
      if (apiKey) return { apiKey, source: "ui", model: row.selectedModel ?? null };
    }
  } catch {
    // DB unavailable — fall through to env.
  }

  const envKey = process.env[PROVIDER_ENV[provider]]?.trim();
  if (envKey) return { apiKey: envKey, source: "env", model: null };

  return null;
}

export async function isProviderConfigured(provider: AiProvider, workspaceId?: string): Promise<boolean> {
  return (await resolveProviderKey(provider, workspaceId)) !== null;
}
