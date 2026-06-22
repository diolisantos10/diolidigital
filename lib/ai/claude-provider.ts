// ─── Server-side Claude Provider Wrapper ─────────────────────────────────────
//
// SERVER-ONLY. Only ever imported by server-side route handlers or the
// provider-registry. The API key lives in process.env.ANTHROPIC_API_KEY and
// never leaves the server. Never throws for "not configured" — returns a typed
// result the caller can branch on. Rule-based is the universal fallback.
// ─────────────────────────────────────────────────────────────────────────────

import type { OpenAIMessages } from "@/lib/agency/intelligence/openai-schemas";
import type { ProviderAdapter } from "@/lib/ai/provider-registry";

const CLAUDE_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const REQUEST_TIMEOUT_MS = 30_000;

export type ClaudeResult =
  | { ok: true; data: unknown; model: string }
  | { ok: false; error: string };

export function isClaudeConfigured(): boolean {
  return typeof process.env.ANTHROPIC_API_KEY === "string" && process.env.ANTHROPIC_API_KEY.trim().length > 0;
}

export function claudeModel(): string {
  return process.env.CLAUDE_MODEL?.trim() || DEFAULT_MODEL;
}

// Calls Claude Messages API. Expects the model to return a JSON object in its
// text response (Claude has no response_format param — prompt must ask for JSON).
// Never throws — returns { ok: false, error } on any failure.
export async function callClaude(messages: OpenAIMessages): Promise<ClaudeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "ANTHROPIC_API_KEY ausente" };

  const model = claudeModel();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(CLAUDE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        system: messages.system,
        messages: [{ role: "user", content: messages.user }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error(`[claude] request failed with status ${res.status}`);
      return { ok: false, error: `Claude respondeu HTTP ${res.status}` };
    }

    const json = (await res.json()) as {
      content?: { type: string; text: string }[];
    };
    const text = json.content?.[0]?.text;
    if (!text) return { ok: false, error: "Resposta Claude vazia" };

    // Strip markdown fences if present (```json ... ```)
    const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
    const jsonStart = stripped.indexOf("{");
    const jsonEnd   = stripped.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) {
      return { ok: false, error: "JSON não encontrado na resposta Claude" };
    }

    try {
      const data = JSON.parse(stripped.slice(jsonStart, jsonEnd + 1));
      return { ok: true, data, model };
    } catch {
      return { ok: false, error: "JSON inválido na resposta Claude" };
    }
  } catch (err) {
    const reason = err instanceof Error && err.name === "AbortError" ? "timeout" : "erro de rede";
    console.error(`[claude] call error: ${reason}`);
    return { ok: false, error: `Falha ao chamar Claude (${reason})` };
  } finally {
    clearTimeout(timeout);
  }
}

// ── ProviderAdapter ───────────────────────────────────────────────────────────
export const claudeAdapter: ProviderAdapter = {
  isConfigured: () => isClaudeConfigured(),
  call: (messages) => callClaude(messages),
  modelId: () => claudeModel(),
};
