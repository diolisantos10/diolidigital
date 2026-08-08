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
import { escolhaDoCliente } from "@/lib/ai/escolha-por-cliente";
import { registrarChamadaDeIa, type UsoDeTokens } from "@/lib/ai/registro-de-custo";
import { departamentoQuePaga } from "@/lib/ai/donos";

export type GenerateResult =
  | { ok: true; data: unknown; model: string; provider: AiProvider; uso?: UsoDeTokens | null }
  | { ok: false; error: string; uso?: UsoDeTokens | null };

/**
 * Tokens consumidos, como cada provedor os devolve. Ausência é `null`, nunca 0:
 * um provedor que parou de mandar `usage` apareceria como consumo zero — a casa
 * comemoraria uma economia que não existe.
 */
function usoDoClaude(json: unknown): UsoDeTokens | null {
  const u = (json as { usage?: { input_tokens?: number; output_tokens?: number } })?.usage;
  if (!u) return null;
  return { entrada: u.input_tokens ?? null, saida: u.output_tokens ?? null };
}
function usoOpenAICompativel(json: unknown): UsoDeTokens | null {
  const u = (json as { usage?: { prompt_tokens?: number; completion_tokens?: number } })?.usage;
  if (!u) return null;
  return { entrada: u.prompt_tokens ?? null, saida: u.completion_tokens ?? null };
}
function usoDoGemini(json: unknown): UsoDeTokens | null {
  const u = (json as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } })?.usageMetadata;
  if (!u) return null;
  return { entrada: u.promptTokenCount ?? null, saida: u.candidatesTokenCount ?? null };
}

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
    // O uso é lido ANTES de julgar o conteúdo: resposta 200 com JSON inválido
    // consumiu token igual e a conta tem que registrar isso. Só contar sucesso
    // faria a casa achar que erro é de graça.
    const uso = usoDoClaude(json);
    const text = json.content?.[0]?.text;
    if (!text) return { ok: false, error: "Resposta Claude vazia", uso };
    const data = extractJson(text);
    return data ? { ok: true, data, model, provider: "claude", uso } : { ok: false, error: "JSON inválido (Claude)", uso };
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
    const uso = usoOpenAICompativel(json);
    const content = json.choices?.[0]?.message?.content;
    if (!content) return { ok: false, error: `Resposta ${label} vazia`, uso };
    const data = extractJson(content);
    return data ? { ok: true, data, model, provider, uso } : { ok: false, error: `JSON inválido (${label})`, uso };
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
    const uso = usoDoGemini(json);
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { ok: false, error: "Resposta Gemini vazia", uso };
    const data = extractJson(text);
    return data ? { ok: true, data, model, provider: "gemini", uso } : { ok: false, error: "JSON inválido (Gemini)", uso };
  } catch (err) {
    return { ok: false, error: err instanceof Error && err.name === "AbortError" ? "timeout" : "erro de rede" };
  } finally {
    clear();
  }
}

// FUNÇÃO, não constante de módulo: como constante, a env era lida UMA vez no
// import e trocar `GEMINI_MODEL` no Railway não surtia efeito até o processo
// reiniciar — e nada na tela dizia isso.
function modeloPadrao(p: AiProvider): string {
  if (p === "claude") return process.env.CLAUDE_MODEL?.trim() || "claude-haiku-4-5-20251001";
  if (p === "openai") return process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  // ⚠️ NOME DE MODELO DO GEMINI ENVELHECE. Verificado contra a chave DESTA casa
  // em 06/08/2026: `gemini-1.5-*`, `gemini-2.0-flash`, `gemini-2.5-flash` e
  // `gemini-2.5-pro` respondem 404; só os APELIDOS MÓVEIS resolvem
  // (`gemini-flash-latest`, `gemini-pro-latest`, `gemini-flash-lite-latest`).
  // Um nome fixo aqui faz a faixa gratuita nascer morta, e o sintoma que chega
  // é "IA indisponível" — que manda procurar o defeito em outro lugar.
  if (p === "gemini") return process.env.GEMINI_MODEL?.trim() || "gemini-flash-latest";
  // Flash is the cheap tier and the sane default; deepseek-v4-pro is the same
  // API with a bigger bill, so it is opt-in through the model field in the UI.
  if (p === "deepseek") return process.env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash";
  // Sonar é o modelo com busca na web — a razão de existir da Perplexity aqui.
  return process.env.PERPLEXITY_MODEL?.trim() || "sonar";
}

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
  /**
   * SEM RESERVA: usa exclusivamente `preferredProvider`. Se ele não tiver chave
   * ou falhar, o resultado é a falha dele — nenhum outro provedor entra.
   *
   * Existe porque a reserva, que é uma virtude em produção, é uma MENTIRA na
   * medição: comparar "o caminho gratuito" enquanto o Claude atende por baixo
   * mede o Claude. Também é o modo de provar a metade que ninguém testa — o
   * provedor indisponível PARA, não improvisa.
   */
  apenasOPreferido?: boolean;
  /**
   * DE QUEM é esta chamada. As duas coisas que ela habilita:
   *
   *   1. **A escolha de provedor por cliente** (`ClientAiProvider`). Com
   *      `workspaceId` + `clientId`, a fixação daquele cliente VENCE o
   *      `preferredProvider` do especialista e a preferência da casa. É o que
   *      permite pôr a Dioli na faixa gratuita sem encostar na Foocci.
   *   2. **A conta**: sem cliente e sem departamento, o `AIRunLog` grava um
   *      gasto que não tem dono, e "quanto custou este cliente" continua sem
   *      resposta.
   *
   * `clientId`/`projectId` seguem opcionais (há chamada que legitimamente não
   * tem cliente: triagem de lead, radar, diagnóstico) — mas chamada sem
   * `workspaceId` NÃO é registrada, e diz isso no log do processo.
   *
   * **`agentId` é OBRIGATÓRIO desde 07/08/2026** e essa é a trava: até aqui ele
   * era opcional e 22 das 32 chamadas do repositório não o passavam, o que
   * fazia o financeiro medir uma fração do gasto sem saber qual. Optional
   * dependia de lembrança; obrigatório é conferido pelo compilador no portão.
   * O id vem do registro fechado em `lib/ai/donos.ts` — string livre partiria o
   * custo do mesmo especialista em duas linhas do relatório.
   */
  clientId?: string | null;
  /** Opcional PORQUE é derivado do dono (`departamentoQuePaga`). Só passe se
   *  souber de um contexto que o registro não tem. */
  departmentId?: string | null;
  agentId: string;
  projectId?: string | null;
}): Promise<GenerateResult> {
  const maxTokens = options.maxTokens ?? 2048;

  // ── A escolha do cliente vence ────────────────────────────────────────────
  // Ordem de precedência, do mais específico para o mais geral:
  //   1. o provedor FIXADO neste cliente (esta tela manda de verdade);
  //   2. o `preferredProvider` do especialista (`especialistas.ts`);
  //   3. a preferência da casa (`BRAIN_AI_PROVIDER` / ranking de qualidade).
  //
  // E a fixação carrega o `estrito` junto: fixar o Gemini na Dioli e deixar o
  // Claude atender por baixo mediria o Claude e chamaria isso de "o gratuito
  // funciona". Por isso `estrito` nasce `true` no banco.
  const fixado = options.workspaceId
    ? await escolhaDoCliente(options.workspaceId, options.clientId)
    : null;

  const preferido = fixado?.provider ?? options.preferredProvider;
  const semReserva = fixado ? fixado.estrito : (options.apenasOPreferido ?? false);
  const modeloFixado = fixado?.model ?? null;

  const order = preferido
    ? (semReserva
        ? [preferido]
        : [preferido, ...preferenceOrder().filter((p) => p !== preferido)])
    : preferenceOrder();
  const messages: OpenAIMessages = { system: options.system, user: options.user };

  const anotar = (p: {
    provider: string; model: string; status: "success" | "error";
    uso?: UsoDeTokens | null; duracaoMs: number; erro?: string | null;
    fallbackUsed?: boolean; fallbackReason?: string | null;
  }) => {
    if (!options.workspaceId) {
      // Não dá para atribuir a workspace nenhum — e ficar calado faria o
      // relatório de gasto parecer completo quando não é.
      console.warn(`[custo-de-ia] chamada SEM workspace, fora da conta — ${p.provider}/${p.model}`);
      return;
    }
    // Sem `await`: a contabilidade não segura a entrega. `registrarChamadaDeIa`
    // nunca rejeita, então não há promessa órfã capaz de derrubar o processo.
    void registrarChamadaDeIa({
      workspaceId:  options.workspaceId,
      // O departamento sai do REGISTRO do dono, não de cada chamador repetindo
      // o mesmo par. Repetir era a segunda porta do mesmo buraco: quem lembrava
      // do `agentId` esquecia do `departmentId`, e o gasto caía em
      // "desconhecido" com dono declarado — o pior dos dois mundos.
      departmentId: departamentoQuePaga(options.agentId, options.departmentId) ?? "desconhecido",
      agentId:      options.agentId,
      clientId:     options.clientId ?? null,
      projectId:    options.projectId ?? null,
      provider:     p.provider,
      model:        p.model,
      status:       p.status,
      uso:          p.uso ?? null,
      duracaoMs:    p.duracaoMs,
      erro:         p.erro ?? null,
      fallbackUsed: p.fallbackUsed ?? false,
      fallbackReason: p.fallbackReason ?? null,
    });
  };

  let firstFailure: string | null = null;
  const tried: string[] = [];

  for (const provider of order) {
    const resolved = await resolveProviderKey(provider, options.workspaceId);
    if (!resolved) continue;                       // sem chave não é falha, é ausência

    // Modelo fixado na tela do cliente vence o modelo salvo com a chave: quem
    // fixou "gemini-flash-lite-latest" naquele cliente fixou por um motivo.
    const model = (fixado && provider === fixado.provider ? modeloFixado : null) ?? resolved.model ?? modeloPadrao(provider);
    const attempts = tried.length === 0 ? 3 : 1;
    const comecou = Date.now();
    const result = await callProvider(provider, resolved.apiKey, model, messages, maxTokens, attempts);
    const duracaoMs = Date.now() - comecou;

    if (result.ok) {
      if (tried.length > 0) {
        console.warn(`[generate] ${tried.join(", ")} falhou — entregue por ${provider} (${model})`);
      }
      anotar({
        provider, model, status: "success", uso: result.uso, duracaoMs,
        fallbackUsed: tried.length > 0,
        fallbackReason: tried.length > 0 ? tried.join(", ") : null,
      });
      return result;
    }

    anotar({ provider, model, status: "error", uso: result.uso, duracaoMs, erro: result.error });
    firstFailure ??= result.error;
    tried.push(`${provider} (${result.error})`);
  }

  if (tried.length > 0) {
    // Reporta a PRIMEIRA falha, não a última: a primeira é a do provedor que
    // devia ter atendido, e é a que a pessoa precisa investigar.
    const porFixacao = fixado ? ` [provedor fixado no cliente: ${fixado.provider}, sem reserva]` : "";
    return { ok: false, error: `IA indisponível: ${firstFailure}${tried.length > 1 ? ` (reservas também falharam: ${tried.length - 1})` : ""}${porFixacao}` };
  }

  // FAIL-CLOSED no que decide gasto: provedor fixado e sem chave = a casa DIZ
  // que não consegue. Nunca produz pior calada por outro caminho.
  if (fixado) {
    return {
      ok: false,
      error: `Provedor "${fixado.provider}" está fixado neste cliente e não tem chave conectada. Conecte a chave em Integrações ou remova a fixação — nada foi produzido por outro provedor.`,
    };
  }
  if (semReserva && preferido) {
    return { ok: false, error: `Provedor "${preferido}" não está configurado. Conecte a chave em Integrações.` };
  }
  return { ok: false, error: "Nenhuma IA conectada. Conecte uma chave em Integrações." };
}
