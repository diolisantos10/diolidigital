// Central resolver: "what API key should this provider use?"
// SERVER-ONLY. Order of resolution:
//   1. A key saved through the Integrations UI (encrypted in the DB).
//   2. The matching environment variable (legacy / fallback).
//
// This lets non-technical operators paste a key in the UI without touching
// env vars, while keeping existing env-based deploys working unchanged.

import { prisma } from "@/lib/db/client";
import { decryptSecret } from "@/lib/security/crypto";

export type AiProvider = "openai" | "claude" | "gemini" | "deepseek" | "perplexity" | "xai";

// Provider → integrationId used as the row key in DbIntegrationConfig.
export const PROVIDER_INTEGRATION_ID: Record<AiProvider, string> = {
  openai: "int-openai",
  claude: "int-claude",
  gemini: "int-gemini",
  deepseek: "int-deepseek",
  perplexity: "int-perplexity",
  xai: "int-xai",
};

// Provider → environment variable fallback.
const PROVIDER_ENV: Record<AiProvider, string> = {
  openai: "OPENAI_API_KEY",
  claude: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
  xai: "XAI_API_KEY",
};

// Every provider the agency can reason through — the ONE list. The key routes
// and the UI iterate this instead of each keeping its own copy: a provider
// missing from one copy is a key that saves but is never used (or is used and
// can't be tested), and nothing on screen says so.
export const ALL_PROVIDERS: AiProvider[] = ["claude", "openai", "gemini", "deepseek", "xai", "perplexity"];

export function isAiProvider(value: string): value is AiProvider {
  return (ALL_PROVIDERS as string[]).includes(value);
}

export interface ResolvedKey {
  apiKey: string;
  source: "ui" | "env";
  model: string | null;
}

// Resolves the API key for a provider. If workspaceId is given, the UI key is
// scoped to that workspace; otherwise the first configured key is used.
/** Só a variável de ambiente — a chave do DEPLOY, que não é de inquilino
 *  nenhum. Existe para quem não pode tocar no cofre por não ter um workspace
 *  para chamar de seu (rotas públicas: ver `lib/ai/chave-publica.ts`). */
/**
 * NENHUMA CHAMADA DIRETA À ANTHROPIC (CEO, 04/10/2026).
 *
 * A conta direta está sem saldo e a IA da casa vem do cofre da Control Room.
 * Medido em produção: o calendário do Sushi Cazza tentou o Claude direto e
 * voltou "credit balance is too low". Em produção, NENHUMA chave da Anthropic
 * é resolvida — nem do banco, nem do ambiente — e todo caminho que dependia
 * dela cai no cofre ou na próxima reserva. Reabrir é decisão explícita:
 * `PERMITIR_ANTHROPIC_DIRETO=1`.
 */
export function anthropicDiretoBloqueado(): boolean {
  if (process.env.PERMITIR_ANTHROPIC_DIRETO === "1") return false;
  return process.env.NODE_ENV === "production" || process.env.BLOQUEAR_ANTHROPIC_DIRETO === "1";
}

export function chaveDoAmbiente(provider: AiProvider): ResolvedKey | null {
  if (provider === "claude" && anthropicDiretoBloqueado()) return null;
  const envKey = process.env[PROVIDER_ENV[provider]]?.trim();
  return envKey ? { apiKey: envKey, source: "env", model: null } : null;
}

export async function resolveProviderKey(
  provider: AiProvider,
  workspaceId?: string,
): Promise<ResolvedKey | null> {
  if (provider === "claude" && anthropicDiretoBloqueado()) return null;
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

  return chaveDoAmbiente(provider);
}

export async function isProviderConfigured(provider: AiProvider, workspaceId?: string): Promise<boolean> {
  return (await resolveProviderKey(provider, workspaceId)) !== null;
}
