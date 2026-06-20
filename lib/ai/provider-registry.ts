// Registry for AI providers. Add a new provider here — nothing else to change.
// Selected via BRAIN_AI_PROVIDER env var (default: "openai").
//
// SERVER-ONLY (adapters read API keys from process.env). The reasoning route and
// the PM orchestrator call getActiveProvider() instead of any single vendor's API.

import type { OpenAIResult } from "@/lib/ai/openai-provider";
import type { OpenAIMessages } from "@/lib/agency/intelligence/openai-schemas";
import { openAIAdapter } from "@/lib/ai/openai-provider";
import { claudeAdapter } from "@/lib/ai/claude-provider";
import { geminiAdapter } from "@/lib/ai/gemini-provider";

export type SupportedProvider = "openai" | "claude" | "gemini";

export interface ProviderAdapter {
  isConfigured(): boolean;
  call(messages: OpenAIMessages): Promise<OpenAIResult>;
  modelId(): string;
}

const REGISTRY: Record<SupportedProvider, ProviderAdapter> = {
  openai: openAIAdapter,
  claude: claudeAdapter,
  gemini: geminiAdapter,
};

export function activeProviderId(): SupportedProvider {
  const raw = (process.env.BRAIN_AI_PROVIDER ?? "openai").trim().toLowerCase();
  return raw === "claude" || raw === "gemini" ? raw : "openai";
}

export function getActiveProvider(): ProviderAdapter {
  return REGISTRY[activeProviderId()];
}
