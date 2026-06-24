// ─── Dioli Design Engine ──────────────────────────────────────────────────────
// SERVER-ONLY. The single, official image/design generator for the whole
// platform — internal assets AND client deliverables. Powered by OpenAI's
// image models (GPT image), because Claude does not generate images.
//
// Resolution order for the key: Integrations UI (encrypted DB) → OPENAI_API_KEY.
// Model preference: gpt-image-1 (current, best quality) with an automatic
// fallback to dall-e-3 when the account has no access to gpt-image-1.
//
// Always returns a renderable `url`: a hosted URL (dall-e-3) or a base64 data
// URL (gpt-image-1), so every consumer can render it the same way.
// ─────────────────────────────────────────────────────────────────────────────

import { resolveProviderKey } from "./resolve-key";

const IMAGES_URL = "https://api.openai.com/v1/images/generations";

export type DesignSize = "square" | "portrait" | "landscape";
export type DesignQuality = "standard" | "high";

export interface DesignRequest {
  prompt: string;
  size?: DesignSize;
  quality?: DesignQuality;
  workspaceId?: string;
}

export interface DesignResult {
  ok: boolean;
  url?: string;          // hosted URL or base64 data URL — always renderable
  model?: string;        // which model actually produced it
  revisedPrompt?: string; // model's rewritten prompt (dall-e-3 returns this)
  error?: string;
  reason?: "not_configured" | "provider_error" | "timeout" | "network_error" | "bad_request";
}

// Map our friendly sizes to each model's accepted dimensions.
const SIZE_GPT: Record<DesignSize, string> = {
  square:    "1024x1024",
  portrait:  "1024x1536",
  landscape: "1536x1024",
};
const SIZE_DALLE: Record<DesignSize, string> = {
  square:    "1024x1024",
  portrait:  "1024x1792",
  landscape: "1792x1024",
};

const TIMEOUT_MS = 90_000;

// Generates one design asset. Tries gpt-image-1 first; on a model-access error
// it transparently retries with dall-e-3.
export async function generateDesign(req: DesignRequest): Promise<DesignResult> {
  const resolved = await resolveProviderKey("openai", req.workspaceId);
  if (!resolved) {
    return {
      ok: false,
      reason: "not_configured",
      error: "Nenhuma chave OpenAI configurada. Adicione em Integrações → IAs.",
    };
  }

  const prompt = (req.prompt ?? "").trim();
  if (!prompt) {
    return { ok: false, reason: "bad_request", error: "Prompt vazio." };
  }

  const size = req.size ?? "square";
  const quality = req.quality ?? "high";

  // First attempt: gpt-image-1 (returns base64).
  const first = await callOpenAiImage(resolved.apiKey, {
    model: "gpt-image-1",
    prompt,
    size: SIZE_GPT[size],
    quality: quality === "high" ? "high" : "medium",
  });
  if (first.ok || !first.modelAccessIssue) return toResult(first, "gpt-image-1");

  // Fallback: dall-e-3 (returns hosted URL).
  const second = await callOpenAiImage(resolved.apiKey, {
    model: "dall-e-3",
    prompt: prompt.slice(0, 4000), // dall-e-3 hard limit
    size: SIZE_DALLE[size],
    quality: quality === "high" ? "hd" : "standard",
  });
  return toResult(second, "dall-e-3");
}

// ── internals ──────────────────────────────────────────────────────────────

interface RawCall {
  ok: boolean;
  url?: string;
  revisedPrompt?: string;
  status?: number;
  error?: string;
  modelAccessIssue?: boolean;
  reason?: DesignResult["reason"];
}

async function callOpenAiImage(
  apiKey: string,
  body: { model: string; prompt: string; size: string; quality: string },
): Promise<RawCall> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(IMAGES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...body, n: 1 }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errJson = (await res.json().catch(() => ({}))) as {
        error?: { message?: string; code?: string };
      };
      const msg = errJson.error?.message ?? `OpenAI HTTP ${res.status}`;
      // 400/403 on gpt-image-1 usually means the org isn't verified for it →
      // signal that the caller should fall back to dall-e-3.
      const modelAccessIssue =
        (res.status === 400 || res.status === 403) &&
        /gpt-image|model|verif|access|not.*allowed|must be verified/i.test(msg);
      return {
        ok: false,
        status: res.status,
        error: msg,
        modelAccessIssue,
        reason: "provider_error",
      };
    }

    const data = (await res.json()) as {
      data?: { url?: string; b64_json?: string; revised_prompt?: string }[];
    };
    const item = data.data?.[0];
    if (!item) return { ok: false, error: "Resposta sem imagem.", reason: "provider_error" };

    const url = item.url
      ? item.url
      : item.b64_json
      ? `data:image/png;base64,${item.b64_json}`
      : undefined;
    if (!url) return { ok: false, error: "Resposta sem imagem.", reason: "provider_error" };

    return { ok: true, url, revisedPrompt: item.revised_prompt };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      error: isAbort ? "Tempo esgotado ao gerar imagem." : "Erro de rede ao contatar a OpenAI.",
      reason: isAbort ? "timeout" : "network_error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function toResult(raw: RawCall, model: string): DesignResult {
  if (raw.ok) return { ok: true, url: raw.url, model, revisedPrompt: raw.revisedPrompt };
  return { ok: false, error: raw.error, reason: raw.reason ?? "provider_error" };
}
