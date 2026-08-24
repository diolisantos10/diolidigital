// ─── Dioli Design Engine ──────────────────────────────────────────────────────
// SERVER-ONLY. The single, official image/design generator for the whole
// platform — internal assets AND client deliverables. Powered by OpenAI's
// image models (GPT image), because Claude does not generate images.
//
// Resolution order for the key: Integrations UI (encrypted DB) → OPENAI_API_KEY.
// Model preference: gpt-image-1 (current, best quality) with an automatic
// fallback to dall-e-3 when the account has no access to gpt-image-1.
//
// ─── O LIVRO-CAIXA (24/08/2026) ──────────────────────────────────────────────
//
// Medido em produção no case Farol 27: as 47 chamadas de TEXTO daquela rodada
// foram contabilizadas (US$ 0,53) e as de IMAGEM, nenhuma — este arquivo era o
// único motor pago da casa que não escrevia uma linha no `AIRunLog`. O efeito é
// duplo e nos dois sentidos ruim: o relatório de custo contava uma história mais
// barata que a fatura, e o TETO por workspace (`lib/ai/teto-de-custo.ts`), que
// soma exatamente aquela tabela, não enxergava o item MAIS CARO da casa
// (~US$ 0,17–0,25 por imagem, contra frações de centavo por texto).
//
// A gravação mora AQUI, dentro do motor, e não em cada chamador: são quatro
// (`artes.ts` em dois pontos, `logo.ts` e a tela manual `/api/generate-image`),
// e um quinto vai nascer. Contabilidade repetida por chamador é a doença que
// esta casa já pagou — quem lembrasse do `workspaceId` esqueceria do resto.
//
// Regra herdada de `registro-de-custo.ts` e não afrouxada: **fail-open, nunca
// fail-silencioso.** Falhar ao gravar a linha não pode derrubar a entrega da
// peça; falhar em silêncio faria o relatório mentir sem testemunha.
//
// Always returns a renderable `url`: a hosted URL (dall-e-3) or a base64 data
// URL (gpt-image-1), so every consumer can render it the same way.
// ─────────────────────────────────────────────────────────────────────────────

import { resolveProviderKey } from "./resolve-key";
import { registrarChamadaDeIa } from "@/lib/ai/registro-de-custo";
import type { TamanhoDeImagem } from "@/lib/ai/precos";

const IMAGES_URL = "https://api.openai.com/v1/images/generations";

export type DesignSize = "square" | "portrait" | "landscape";
export type DesignQuality = "standard" | "high";

/**
 * A QUEM ESTA IMAGEM É COBRADA. Tudo opcional — a linha do livro-caixa sai com
 * o que houver, e `departmentId` cai em `"design"` porque é o departamento que
 * este motor É. Um campo ausente vira `null` na linha, nunca um palpite: gasto
 * atribuído ao cliente errado é pior que gasto sem cliente.
 */
export interface ContaDaImagem {
  departmentId?: string;
  agentId?: string | null;
  clientId?: string | null;
  projectId?: string | null;
}

export interface DesignRequest {
  prompt: string;
  size?: DesignSize;
  quality?: DesignQuality;
  /** Sem ele NÃO há a quem cobrar: a linha não é gravada e o aviso sobe no log.
   *  Mesma regra de `lib/ai/generate.ts` — ver `registrarNoLivroCaixa`. */
  workspaceId?: string;
  /** Ver `ContaDaImagem`. */
  conta?: ContaDaImagem;
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
  const qualidadeGpt = quality === "high" ? "high" : "medium";
  const comecoGpt = Date.now();
  const first = await callOpenAiImage(resolved.apiKey, {
    model: "gpt-image-1",
    prompt,
    size: SIZE_GPT[size],
    quality: qualidadeGpt,
  });
  // A LINHA SAI AQUI, e não só no sucesso: uma chamada que a OpenAI recusou é
  // notícia para o relatório (ela custa zero, ver `registro-de-custo.ts`), e
  // uma que deu certo é o dinheiro de verdade saindo.
  registrarNoLivroCaixa(req, "gpt-image-1", TAMANHO_DA_CONTA[size], qualidadeGpt, first, Date.now() - comecoGpt, false);
  if (first.ok || !first.modelAccessIssue) return toResult(first, "gpt-image-1");

  // Fallback: dall-e-3 (returns hosted URL).
  const qualidadeDalle = quality === "high" ? "hd" : "standard";
  const comecoDalle = Date.now();
  const second = await callOpenAiImage(resolved.apiKey, {
    model: "dall-e-3",
    prompt: prompt.slice(0, 4000), // dall-e-3 hard limit
    size: SIZE_DALLE[size],
    quality: qualidadeDalle,
  });
  // `fallbackUsed`: sem isto o relatório mostraria duas chamadas irmãs sem dizer
  // que a segunda só existiu porque a primeira não tinha acesso ao modelo.
  registrarNoLivroCaixa(
    req, "dall-e-3", TAMANHO_DA_CONTA[size], qualidadeDalle, second, Date.now() - comecoDalle, true,
    first.error ?? "gpt-image-1 indisponível para esta conta",
  );
  return toResult(second, "dall-e-3");
}

/** O nome que a casa usa para cada recorte, na tabela de preço de imagem. */
const TAMANHO_DA_CONTA: Record<DesignSize, TamanhoDeImagem> = {
  square: "quadrada",
  portrait: "retrato",
  landscape: "paisagem",
};

/**
 * Escreve UMA linha no livro-caixa. Nunca lança, nunca segura a entrega — e
 * nunca fica calada quando não consegue gravar.
 */
function registrarNoLivroCaixa(
  req: DesignRequest,
  model: string,
  tamanho: TamanhoDeImagem,
  qualidade: string,
  raw: RawCall,
  duracaoMs: number,
  fallbackUsed: boolean,
  fallbackReason?: string,
): void {
  if (!req.workspaceId) {
    // Sem dono não há conta, e ficar calado faria o relatório de gasto parecer
    // completo quando não é. Mesma frase de `lib/ai/generate.ts`, de propósito:
    // as duas linhas são procuradas com o mesmo `grep`.
    console.warn(`[custo-de-ia] chamada SEM workspace, fora da conta — openai/${model}`);
    return;
  }
  // Sem `await`: a contabilidade não segura a entrega da peça.
  // `registrarChamadaDeIa` nunca rejeita, então não há promessa órfã.
  void registrarChamadaDeIa({
    workspaceId: req.workspaceId,
    departmentId: req.conta?.departmentId ?? "design",
    agentId: req.conta?.agentId ?? null,
    clientId: req.conta?.clientId ?? null,
    projectId: req.conta?.projectId ?? null,
    provider: "openai",
    model,
    status: raw.ok ? "success" : "error",
    // Imagem não tem token. O preço vem da tabela de IMAGEM.
    uso: null,
    imagem: { tamanho, qualidade, quantas: 1 },
    duracaoMs,
    erro: raw.ok ? null : (raw.error ?? null),
    fallbackUsed,
    fallbackReason: fallbackUsed ? (fallbackReason ?? null) : null,
  });
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
