// Shared AI execution layer for department intelligence.
// V1: External providers always fall back to rule_based — no real API calls.
// The infrastructure is ready to wire real providers in V2.

export type AIProvider = "rule_based" | "openai" | "gemini" | "claude" | "perplexity";

export interface AIRunMeta {
  provider: AIProvider;
  model: string;
  fallbackUsed: boolean;
  fallbackReason?: string;
  warnings: string[];
  promptSummary: string;
}

// Resolves which provider will execute. In V1, external providers always fall back
// because no API keys are wired. The system never crashes — it degrades gracefully.
export function resolveProvider(
  requestedProvider: AIProvider,
  _requestedModel: string,
  prompt: string,
): AIRunMeta {
  const isExternal = requestedProvider !== "rule_based";
  const fallbackUsed = isExternal;
  const fallbackReason = isExternal
    ? `Provedor "${requestedProvider}" não configurado — usando regras locais (V1)`
    : undefined;

  return {
    provider: "rule_based",
    model: "rule_based",
    fallbackUsed,
    fallbackReason,
    warnings: fallbackUsed ? [`Fallback ativo: ${fallbackReason}`] : [],
    promptSummary: prompt.slice(0, 120).replace(/\n/g, " "),
  };
}
