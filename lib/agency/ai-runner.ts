// Shared AI execution layer for department intelligence.
// Real AI calls happen server-side via POST /api/brain/reason (reasonAsDepartment)
// and POST /api/ai/run (legacy store path). This module provides the metadata
// type and the provider-resolution helper used by the UI store.

export type AIProvider = "rule_based" | "openai" | "gemini" | "claude" | "perplexity" | "deepseek";

export interface AIRunMeta {
  provider: AIProvider;
  model: string;
  fallbackUsed: boolean;
  fallbackReason?: string;
  warnings: string[];
  promptSummary: string;
}

// Resolves which provider will execute for a given request.
// isConfigured comes from the caller (e.g. fetched via GET /api/ai/run).
// When true and the requested provider is external, the provider is used;
// otherwise falls back to rule_based gracefully.
export function resolveProvider(
  requestedProvider: AIProvider,
  _requestedModel: string,
  prompt: string,
  isConfigured = false,
): AIRunMeta {
  const isExternal = requestedProvider !== "rule_based";
  const fallbackUsed = isExternal && !isConfigured;
  const activeProvider: AIProvider = fallbackUsed ? "rule_based" : requestedProvider;
  const fallbackReason = fallbackUsed
    ? `Provedor "${requestedProvider}" não configurado — usando regras locais`
    : undefined;

  return {
    provider: activeProvider,
    model: fallbackUsed ? "rule_based" : _requestedModel || requestedProvider,
    fallbackUsed,
    fallbackReason,
    warnings: fallbackUsed ? [`Fallback ativo: ${fallbackReason}`] : [],
    promptSummary: prompt.slice(0, 120).replace(/\n/g, " "),
  };
}
