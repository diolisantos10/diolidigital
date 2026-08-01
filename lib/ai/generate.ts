// Unified, key-aware AI caller. THE single place the whole agency reasons
// through. SERVER-ONLY.
//
// Resolves the API key from the Integrations UI (DB, encrypted) first and the
// environment second — see lib/ai/resolve-key.ts — then calls whichever
// provider has a key, returning a uniform { ok, data, model } result. Both the
// central brain (/api/brain/reason) and the department agents use this, so a
// key pasted in the UI immediately powers every department's reasoning.

import type { OpenAIMessages } from "@/lib/agency/intelligence/openai-schemas";
import { resolveProviderKey, isAiProvider, type AiProvider } from "@/lib/ai/resolve-key";

export type GenerateResult =
  | { ok: true; data: unknown; model: string; provider: AiProvider }
  | { ok: false; error: string };

const TIMEOUT_MS = 60_000;

// Provider preference: an explicit BRAIN_AI_PROVIDER wins, then Claude → OpenAI
// → Gemini → DeepSeek. The first one with a resolvable key is used.
//
// Why DeepSeek sits last by default: the order is a QUALITY ranking, not a cost
// one, and the client-facing copy is the product. Whoever wants DeepSeek in
// front says so explicitly (BRAIN_AI_PROVIDER=deepseek) — a cheap provider
// should never quietly promote itself just because a key showed up.
function preferenceOrder(): AiProvider[] {
  const env = (process.env.BRAIN_AI_PROVIDER ?? "").trim().toLowerCase();
  // Ordem = ranking de QUALIDADE para o trabalho padrão da casa (texto que vai
  // ao cliente). Perplexity fica por último no automático de propósito: ela é
  // excelente em pesquisa com fonte e não é uma redatora — quem quiser a força
  // dela pede por nome (`provedor: "perplexity"` no especialista).
  const base: AiProvider[] = ["claude", "openai", "gemini", "deepseek", "perplexity"];
  if (isAiProvider(env)) {
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

// OpenAI's chat-completions shape is a de-facto standard: DeepSeek serves the
// exact same request and response body at its own host. One function covers
// both — a second hand-rolled copy would be a second place for a bug to hide,
// and the two would drift the first time either of them needed a fix.
const OPENAI_COMPATIBLE: Record<"openai" | "deepseek" | "perplexity", { url: string; label: string; jsonMode: boolean }> = {
  openai:     { url: "https://api.openai.com/v1/chat/completions", label: "OpenAI",     jsonMode: true },
  deepseek:   { url: "https://api.deepseek.com/chat/completions",  label: "DeepSeek",   jsonMode: true },
  // Perplexity fala o mesmo dialeto, com uma diferença que importa: nem todo
  // modelo dela aceita `response_format`, e mandar o campo derruba a chamada
  // com 400. Pedimos JSON no prompt e deixamos o extrator achar — o resultado
  // é o mesmo e não quebra quando o modelo muda.
  perplexity: { url: "https://api.perplexity.ai/chat/completions", label: "Perplexity", jsonMode: false },
};

async function callOpenAICompatible(
  provider: "openai" | "deepseek" | "perplexity",
  apiKey: string,
  model: string,
  m: OpenAIMessages,
  maxTokens: number,
): Promise<GenerateResult> {
  const { url, label, jsonMode } = OPENAI_COMPATIBLE[provider];
  const { signal, clear } = withTimeout();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: m.system }, { role: "user", content: m.user }],
        ...(jsonMode ? { response_format: { type: "json_object" as const } } : {}),
        temperature: 0.7,
        max_tokens: maxTokens,
      }),
      signal,
    });
    if (!res.ok) return { ok: false, error: `${label} HTTP ${res.status}` };
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return { ok: false, error: `Resposta ${label} vazia` };
    const data = extractJson(content);
    return data ? { ok: true, data, model, provider } : { ok: false, error: `JSON inválido (${label})` };
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
  // Flash is the cheap tier and the sane default; deepseek-v4-pro is the same
  // API with a bigger bill, so it is opt-in through the model field in the UI.
  deepseek: process.env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash",
  // Sonar é o modelo com busca na web — a razão de existir da Perplexity aqui.
  perplexity: process.env.PERPLEXITY_MODEL?.trim() || "sonar",
};

// Is ANY provider connected (UI key or env)? Used to decide whether the central
// brain should attempt AI reasoning at all.
export async function anyProviderConfigured(workspaceId?: string): Promise<boolean> {
  for (const p of preferenceOrder()) {
    if (await resolveProviderKey(p, workspaceId)) return true;
  }
  return false;
}

// A transient failure is worth retrying (a momentary blip); a permanent one
// (no key, bad request, auth) is not — retrying would just waste time.
function isTransientError(error: string): boolean {
  const e = error.toLowerCase();
  if (/http (429|5\d\d)/.test(e)) return true;                 // rate-limit / server / overload (529)
  if (e.includes("timeout") || e.includes("rede")) return true; // network / timeout
  if (e.includes("vazia") || e.includes("json")) return true;   // one-off malformed/empty generation
  return false;
}

// Retry a provider call on transient errors with escalating backoff. This is
// what stops a momentary API blip from failing a deliverable — the same blip
// that made one department report "IA indisponível" mid-execution.
async function callWithRetry(fn: () => Promise<GenerateResult>, attempts = 3): Promise<GenerateResult> {
  let last: GenerateResult = { ok: false, error: "sem tentativas" };
  for (let i = 0; i < attempts; i++) {
    last = await fn();
    if (last.ok || !isTransientError(last.error)) return last;
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 600 * (i + 1)));
  }
  return last;
}

function callProvider(
  provider: AiProvider,
  apiKey: string,
  model: string,
  messages: OpenAIMessages,
  maxTokens: number,
  attempts: number,
): Promise<GenerateResult> {
  if (provider === "claude") return callWithRetry(() => callClaude(apiKey, model, messages, maxTokens), attempts);
  if (provider === "openai" || provider === "deepseek" || provider === "perplexity") {
    return callWithRetry(() => callOpenAICompatible(provider, apiKey, model, messages, maxTokens), attempts);
  }
  return callWithRetry(() => callGemini(apiKey, model, messages, maxTokens), attempts);
}

// THE unified reasoning call. Walks the preference order and uses the first
// provider that has a key; options.preferredProvider puts a specific vendor at
// the front (e.g. an agent whose prompt was written for Claude).
//
// AND IT DOES NOT STOP AT THE FIRST ONE THAT FAILS. If the chosen provider is
// down, rate-limited, out of credit or answering garbage after its retries, the
// next connected provider takes the job. That is the whole point of having more
// than one key: a vendor having a bad afternoon should cost nothing, instead of
// costing a deliverable — which is exactly what used to happen, since a failed
// first provider returned the failure and the other keys sat there unused.
//
// The budget is deliberately lopsided: the preferred provider gets the full
// retry treatment (a blip on the good model is worth waiting out), while each
// backup gets one shot. Otherwise four connected keys could turn one request
// into a minute of stubborn retrying.
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
  const messages: OpenAIMessages = { system: options.system, user: options.user };

  let firstFailure: string | null = null;
  const tried: string[] = [];

  for (const provider of order) {
    const resolved = await resolveProviderKey(provider, options.workspaceId);
    if (!resolved) continue;                       // sem chave não é falha, é ausência

    const model = resolved.model ?? DEFAULT_MODEL[provider];
    const attempts = tried.length === 0 ? 3 : 1;
    const result = await callProvider(provider, resolved.apiKey, model, messages, maxTokens, attempts);

    if (result.ok) {
      if (tried.length > 0) {
        console.warn(`[generate] ${tried.join(", ")} falhou — entregue por ${provider} (${model})`);
      }
      return result;
    }

    firstFailure ??= result.error;
    tried.push(`${provider} (${result.error})`);
  }

  if (tried.length > 0) {
    // Reporta a PRIMEIRA falha, não a última: a primeira é a do provedor que
    // devia ter atendido, e é a que a pessoa precisa investigar.
    return { ok: false, error: `IA indisponível: ${firstFailure}${tried.length > 1 ? ` (reservas também falharam: ${tried.length - 1})` : ""}` };
  }

  return { ok: false, error: "Nenhuma IA conectada. Conecte uma chave em Integrações." };
}
