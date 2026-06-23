// Unified, key-aware AI caller. THE single place the whole agency reasons
// through. SERVER-ONLY.
//
// Resolves the API key from the Integrations UI (DB, encrypted) first and the
// environment second — see lib/ai/resolve-key.ts — then calls whichever
// provider has a key, returning a uniform { ok, data, model } result. Both the
// central brain (/api/brain/reason) and the department agents use this, so a
// key pasted in the UI immediately powers every department's reasoning.

import type { OpenAIMessages } from "@/lib/agency/intelligence/openai-schemas";
import { resolveProviderKey, type AiProvider } from "@/lib/ai/resolve-key";

export type GenerateResult =
  | { ok: true; data: unknown; model: string; provider: AiProvider }
  | { ok: false; error: string };

const TIMEOUT_MS = 60_000;

// Provider preference: an explicit BRAIN_AI_PROVIDER wins, then Claude → OpenAI
// → Gemini. The first one with a resolvable key is used.
function preferenceOrder(): AiProvider[] {
  const env = (process.env.BRAIN_AI_PROVIDER ?? "").trim().toLowerCase();
  const base: AiProvider[] = ["claude", "openai", "gemini"];
  if (env === "openai" || env === "gemini" || env === "claude") {
    return [env, ...base.filter((p) => p !== env)];
  }
  return base;
}

function withTimeout(): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return { signal: controller.signal, clear: () => clearTimeout(t) };
}

function extractJson(text: string): unknown | null {
  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return null;
  }
}

// ── Per-provider keyed calls (uniform result) ─────────────────────────────────

async function callClaude(apiKey: string, model: string, m: OpenAIMessages, maxTokens: number): Promise<GenerateResult> {
  const { signal, clear } = withTimeout();
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: maxTokens, system: m.system, messages: [{ role: "user", content: m.user }] }),
      signal,
    });
    if (!res.ok) return { ok: false, error: `Claude HTTP ${res.status}` };
    const json = (await res.json()) as { content?: { text: string }[] };
    const text = json.content?.[0]?.text;
    if (!text) return { ok: false, error: "Resposta Claude vazia" };
    const data = extractJson(text);
    return data ? { ok: true, data, model, provider: "claude" } : { ok: false, error: "JSON inválido (Claude)" };
  } catch (err) {
    return { ok: false, error: err instanceof Error && err.name === "AbortError" ? "timeout" : "erro de rede" };
  } finally {
    clear();
  }
}

async function callOpenAI(apiKey: string, model: string, m: OpenAIMessages, maxTokens: number): Promise<GenerateResult> {
  const { signal, clear } = withTimeout();
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: m.system }, { role: "user", content: m.user }],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: maxTokens,
      }),
      signal,
    });
    if (!res.ok) return { ok: false, error: `OpenAI HTTP ${res.status}` };
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return { ok: false, error: "Resposta OpenAI vazia" };
    const data = extractJson(content);
    return data ? { ok: true, data, model, provider: "openai" } : { ok: false, error: "JSON inválido (OpenAI)" };
  } catch (err) {
    return { ok: false, error: err instanceof Error && err.name === "AbortError" ? "timeout" : "erro de rede" };
  } finally {
    clear();
  }
}

async function callGemini(apiKey: string, model: string, m: OpenAIMessages, maxTokens: number): Promise<GenerateResult> {
  const { signal, clear } = withTimeout();
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: m.system }] },
        contents: [{ role: "user", parts: [{ text: m.user }] }],
        generationConfig: { responseMimeType: "application/json", maxOutputTokens: maxTokens, temperature: 0.7 },
      }),
      signal,
    });
    if (!res.ok) return { ok: false, error: `Gemini HTTP ${res.status}` };
    const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { ok: false, error: "Resposta Gemini vazia" };
    const data = extractJson(text);
    return data ? { ok: true, data, model, provider: "gemini" } : { ok: false, error: "JSON inválido (Gemini)" };
  } catch (err) {
    return { ok: false, error: err instanceof Error && err.name === "AbortError" ? "timeout" : "erro de rede" };
  } finally {
    clear();
  }
}

const DEFAULT_MODEL: Record<AiProvider, string> = {
  claude: process.env.CLAUDE_MODEL?.trim() || "claude-haiku-4-5-20251001",
  openai: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
  gemini: "gemini-1.5-flash",
};

// Is ANY provider connected (UI key or env)? Used to decide whether the central
// brain should attempt AI reasoning at all.
export async function anyProviderConfigured(workspaceId?: string): Promise<boolean> {
  for (const p of preferenceOrder()) {
    if (await resolveProviderKey(p, workspaceId)) return true;
  }
  return false;
}

// THE unified reasoning call. Picks the first provider with a key (respecting
// preference), resolves the key, and calls it. options.preferredProvider forces
// a specific vendor when given (e.g. an agent that only has a Claude prompt).
export async function generate(options: {
  system: string;
  user: string;
  maxTokens?: number;
  workspaceId?: string;
  preferredProvider?: AiProvider;
}): Promise<GenerateResult> {
  const maxTokens = options.maxTokens ?? 2048;
  const order = options.preferredProvider
    ? [options.preferredProvider, ...preferenceOrder().filter((p) => p !== options.preferredProvider)]
    : preferenceOrder();

  for (const provider of order) {
    const resolved = await resolveProviderKey(provider, options.workspaceId);
    if (!resolved) continue;
    const model = resolved.model ?? DEFAULT_MODEL[provider];
    const messages: OpenAIMessages = { system: options.system, user: options.user };
    if (provider === "claude") return callClaude(resolved.apiKey, model, messages, maxTokens);
    if (provider === "openai") return callOpenAI(resolved.apiKey, model, messages, maxTokens);
    return callGemini(resolved.apiKey, model, messages, maxTokens);
  }

  return { ok: false, error: "Nenhuma IA conectada. Conecte uma chave em Integrações." };
}
