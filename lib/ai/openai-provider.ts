// ─── Server-side OpenAI Provider Wrapper ─────────────────────────────────────
//
// SERVER-ONLY. Only ever imported by the /api/ai/run route handler. The API key
// lives in process.env.OPENAI_API_KEY and never leaves the server — it is read
// here, used in the Authorization header, and never returned to any caller.
//
// V1: OpenAI is the only external provider. If the key is missing or any error
// occurs, callers fall back to the rule-based engine. This wrapper never throws
// for "not configured" — it returns a typed result the route can branch on.
// ─────────────────────────────────────────────────────────────────────────────

import type { OpenAIMessages } from "@/lib/agency/intelligence/openai-schemas";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";
const REQUEST_TIMEOUT_MS = 30_000;

export function isOpenAIConfigured(): boolean {
  return typeof process.env.OPENAI_API_KEY === "string" && process.env.OPENAI_API_KEY.trim().length > 0;
}

export function openAIModel(): string {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
}

export type OpenAIResult =
  | { ok: true; data: unknown; model: string }
  | { ok: false; error: string };

// Calls OpenAI chat completions with JSON response format. Returns parsed JSON
// (unknown — validate before use) or a safe error string. Never throws.
export async function callOpenAI(messages: OpenAIMessages): Promise<OpenAIResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY ausente" };

  const model = openAIModel();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: messages.system },
          { role: "user", content: messages.user },
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 1500,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      // Don't leak response bodies (may contain account hints) — log status only.
      const status = res.status;
      console.error(`[openai] request failed with status ${status}`);
      return { ok: false, error: `OpenAI respondeu HTTP ${status}` };
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return { ok: false, error: "Resposta OpenAI vazia" };

    try {
      const data = JSON.parse(content);
      return { ok: true, data, model };
    } catch {
      return { ok: false, error: "JSON inválido na resposta OpenAI" };
    }
  } catch (err) {
    const reason = err instanceof Error && err.name === "AbortError" ? "timeout" : "erro de rede";
    console.error(`[openai] call error: ${reason}`);
    return { ok: false, error: `Falha ao chamar OpenAI (${reason})` };
  } finally {
    clearTimeout(timeout);
  }
}
