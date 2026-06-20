// Claude provider adapter (stub for Phase 4 — returns not-configured until wired).
// A later phase will implement real Anthropic Messages API calls behind CLAUDE_API_KEY.

import type { ProviderAdapter } from "@/lib/ai/provider-registry";

export const claudeAdapter: ProviderAdapter = {
  isConfigured: () => false, // Phase 5 will implement real Claude calls
  call: async () => ({ ok: false, error: "Claude provider not yet implemented" }),
  modelId: () => "claude-placeholder",
};
