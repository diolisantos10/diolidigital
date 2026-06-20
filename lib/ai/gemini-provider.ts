// Gemini provider adapter (stub for Phase 4 — returns not-configured until wired).
// A later phase will implement real Google Gemini API calls behind GEMINI_API_KEY.

import type { ProviderAdapter } from "@/lib/ai/provider-registry";

export const geminiAdapter: ProviderAdapter = {
  isConfigured: () => false, // Phase 5 will implement real Gemini calls
  call: async () => ({ ok: false, error: "Gemini provider not yet implemented" }),
  modelId: () => "gemini-placeholder",
};
