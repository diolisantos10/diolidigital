// Unified, key-aware AI caller. THE single place the whole agency reasons
// through. SERVER-ONLY.
//
// Resolves the API key from the Integrations UI (DB, encrypted) first and the
// environment second — see lib/ai/resolve-key.ts — then calls whichever
// provider has a key, returning a uniform { ok, data, model } result. Both the
// central brain (/api/brain/reason) and the department agents use this, so a
// key pasted in the UI immediately powers every department's reasoning.

import type { OpenAIMessages, TurnoDeHistorico } from "@/lib/agency/intelligence/openai-schemas";
import { resolveProviderKey, isAiProvider, type AiProvider } from "@/lib/ai/resolve-key";
import { escolhaDoCliente } from "@/lib/ai/escolha-por-cliente";
import { registrarChamadaDeIa, type UsoDeTokens } from "@/lib/ai/registro-de-custo";
import { departamentoQuePaga } from "@/lib/ai/donos";

/**
 * O DESFECHO CRU DA GERAÇÃO — os dois campos que o SDR não pode perder.
 *
 * Ambos OPCIONAIS e ausentes para quem não pede: os 29 chamadores de turno
 * único leem `data` e nada muda para eles. Quem precisa disto é o SDR, e
 * precisa porque as duas coisas foram conquistadas caro em 16/08/2026:
 *
 *  • `motivoDeParada` separa `truncado` (a própria API confirma que cortou) de
 *    `malformado` (ela diz que terminou e o que veio não é o formato). São duas
 *    causas com dois consertos, e viravam a mesma linha no diário do piloto.
 *  • `textoCru` é o que sobra quando o pacote não abre. É dele que sai o
 *    `repararJsonTruncado` e, com ele, a regra mais cara desta casa: **o escopo
 *    sobrevive mesmo quando a fala é barrada**. Sem o texto cru, os R$ 500/mês
 *    e os 2 posts/dia que o cliente acabou de dizer viram pó de novo.
 */
export interface DesfechoDaGeracao {
  /** `stop_reason` do provedor, cru. `null` quando ele não informa. */
  motivoDeParada?: string | null;
  /** O texto tal como veio. `null` no caminho de ferramenta, onde não há texto:
   *  o pacote chega já como objeto, que é justamente a trava funcionando. */
  textoCru?: string | null;
}

export type GenerateResult =
  | ({ ok: true; data: unknown; model: string; provider: AiProvider; uso?: UsoDeTokens | null } & DesfechoDaGeracao)
  | ({ ok: false; error: string; uso?: UsoDeTokens | null } & DesfechoDaGeracao);

/**
 * Tokens consumidos, como cada provedor os devolve. Ausência é `null`, nunca 0:
 * um provedor que parou de mandar `usage` apareceria como consumo zero — a casa
 * comemoraria uma economia que não existe.
 */
function usoDoClaude(json: unknown): UsoDeTokens | null {
  const u = (json as {
    usage?: {
      input_tokens?: number; output_tokens?: number;
      cache_creation_input_tokens?: number; cache_read_input_tokens?: number;
    };
  })?.usage;
  if (!u) return null;
  return {
    entrada: u.input_tokens ?? null,
    saida: u.output_tokens ?? null,
    // `?? null` e não `?? 0`: provedor que parou de informar apareceria como
    // "cache não usado", e a casa comemoraria uma economia que não existe.
    cacheEscrito: u.cache_creation_input_tokens ?? null,
    cacheLido: u.cache_read_input_tokens ?? null,
  };
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
/** A ordem de preferência da casa, para quem precisa andar nela por fora —
 *  hoje a rota pública do SDR, que resolve chave pela regra dela e não pode
 *  usar `resolveProviderKey` sem workspace. Ver `lib/ai/chave-publica.ts`. */
export function ordemDePreferenciaDaCasa(): AiProvider[] {
  return preferenceOrder();
}

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

function withTimeout(ms: number = TIMEOUT_MS): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
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

/**
 * A FERRAMENTA QUE EXISTE PARA O MODELO NÃO PODER FALAR EM PROSA.
 *
 * `input_schema` é um objeto ABERTO de propósito. A camada é genérica: cada um
 * dos 29 chamadores pede um formato diferente, descrito no PRÓPRIO system
 * prompt dele. O que se garante aqui não é a FORMA do pacote — é que exista um
 * pacote: com `tool_choice` fixo, a resposta chega pelo canal de entrada da
 * ferramenta, já como objeto, e o caminho "responder em texto" deixa de estar
 * disponível para o modelo. A forma continua sendo governada pelo prompt, como
 * sempre foi; o que muda é que ela não pode mais chegar embrulhada em conversa.
 */
const FERRAMENTA_DO_PACOTE = {
  name: "responder",
  description:
    "Devolve a resposta desta requisição como o objeto JSON descrito nas instruções do sistema. " +
    "Use SEMPRE esta ferramenta: ela é o único canal de resposta.",
  input_schema: { type: "object" as const, additionalProperties: true },
};


/**
 * O CORPO DA REQUISIÇÃO DO CLAUDE — montado num lugar só.
 *
 * ── Por que virou função exportada (24/08/2026) ─────────────────────────────
 * Um `Claude HTTP 400` apareceu em produção no departamento do SDR e não havia
 * como investigá-lo: o corpo era montado inline, dentro do `fetch`, e nenhum
 * teste conseguia olhar para ele sem chamar a rede. Investigar virou adivinhar.
 *
 * Extraído, o mesmo corpo que a produção envia pode ser conferido em teste e
 * medido contra a API de verdade pela sonda (`scripts/sonda-do-corpo-do-claude.mts`)
 * — sem cópia, que seria a segunda régua de sempre.
 */
export function corpoDoClaude(
  model: string, m: OpenAIMessages, maxTokens: number,
  cachearSistema?: boolean, esquema?: Record<string, unknown>,
): Record<string, unknown> {
  return {
        model,
        max_tokens: maxTokens,
        // ── O CACHE DE PROMPT, E POR QUE ELE É OPT-IN ────────────────────────
        // Medido em 24/08/2026: o prompt do SDR tem ~10.700 tokens e era
        // reenviado nos 16 turnos de uma conversa — 171k dos 192k tokens de
        // entrada de um briefing eram o MESMO texto, de novo e de novo. Isso
        // valia em produção, não só no teste: cada prospect real custava por
        // esse desperdício.
        //
        // O ponto de corte vai no `system`, e a ordem de renderização
        // (`tools` → `system` → `messages`) faz ele cobrir a ferramenta também.
        // O que varia — o histórico e a fala da vez — fica DEPOIS do corte, que
        // é o que mantém o prefixo estável entre turnos.
        //
        // ⚠️ NÃO É PADRÃO, e a razão é dinheiro: gravar no cache custa ~1,25x.
        // Para quem chama UMA vez com um prompt próprio (a maioria dos 29
        // caminhos desta casa), o cache nunca seria lido e a gravação só
        // encareceria. Ligar por igual "para economizar" faria o contrário.
        // Quem reusa o mesmo prompt pede; quem não reusa não paga.
        system: cachearSistema
          ? [{ type: "text", text: m.system, cache_control: { type: "ephemeral" } }]
          : m.system,
        // O histórico entra ANTES da fala da vez. Ausente, o corpo fica
        // idêntico ao de sempre — um único turno de usuário.
        messages: [...(m.historico ?? []), { role: "user", content: m.user }],
        // ── A TRAVA DE FORMATO DO CLAUDE (24/08/2026) ────────────────────────
        // Ver `lib/ai/formato-garantido.ts` para o achado inteiro. Em resumo: a
        // saída estruturada nativa não existe no claude-sonnet-4-6 e o prefill
        // foi removido na família 4.6+. Uso de ferramenta forçado é o mecanismo
        // que existe neste modelo, e resolve pela raiz — o modelo não pode
        // responder em prosa porque não há canal de prosa disponível.
        tools: [esquema ? { ...FERRAMENTA_DO_PACOTE, input_schema: esquema } : FERRAMENTA_DO_PACOTE],
        tool_choice: { type: "tool", name: FERRAMENTA_DO_PACOTE.name },
      };
}

async function callClaude(
  apiKey: string, model: string, m: OpenAIMessages, maxTokens: number,
  timeoutMs?: number, cachearSistema?: boolean, esquema?: Record<string, unknown>,
): Promise<GenerateResult> {
  const { signal, clear } = withTimeout(timeoutMs);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(corpoDoClaude(model, m, maxTokens, cachearSistema, esquema)),
      signal,
    });
    if (!res.ok) {
      // ── O MOTIVO VEM DA API, NÃO DE DEDUÇÃO (24/08/2026) ─────────────────
      // Esta linha devolvia só `Claude HTTP 400` e JOGAVA FORA o corpo da
      // resposta — que é exatamente onde a Anthropic escreve o que recusou.
      // Um 400 apareceu em produção e a investigação começou sem o único dado
      // que importava: o erro estava dentro de um cano que ninguém abriu.
      //
      // É a mesma doença que o servidor de teste teve HOJE ("morreu com código
      // 1" sem dizer por quê). Diagnóstico que não chega a quem lê não existe.
      //
      // ⚠️ O corpo do erro NUNCA contém a chave (ela viaja em cabeçalho), mas é
      // texto de terceiro: entra cortado e sem interpolação de mais nada.
      // Ler o corpo NÃO PODE derrubar a chamada: se a leitura falhar, o que
      // se perde é o detalhe — o status continua sendo reportado. Sem esta
      // guarda, um corpo ilegível virava "erro de rede" e apagava o 400.
      let detalhe = "";
      try {
        if (typeof res.text === "function") {
          detalhe = (await res.text()).slice(0, 300).replace(/\s+/g, " ").trim();
        }
      } catch {
        detalhe = "";
      }
      return { ok: false, error: `Claude HTTP ${res.status}${detalhe ? `: ${detalhe}` : ""}` };
    }
    const json = (await res.json()) as {
      content?: { type?: string; text?: string; name?: string; input?: unknown }[];
      stop_reason?: string;
    };
    // O uso é lido ANTES de julgar o conteúdo: resposta 200 com JSON inválido
    // consumiu token igual e a conta tem que registrar isso. Só contar sucesso
    // faria a casa achar que erro é de graça.
    const uso = usoDoClaude(json);
    const motivoDeParada = json.stop_reason ?? null;

    // O caminho normal agora: o pacote chega como ENTRADA da ferramenta, já
    // objeto. Não há texto para pescar, e é isso que fecha o buraco.
    const blocoDaFerramenta = json.content?.find((b) => b.type === "tool_use" && b.name === FERRAMENTA_DO_PACOTE.name);
    if (blocoDaFerramenta?.input && typeof blocoDaFerramenta.input === "object") {
      return { ok: true, data: blocoDaFerramenta.input, model, provider: "claude", uso, motivoDeParada, textoCru: null };
    }

    // Sobrou texto em vez de ferramenta? Então a trava não pegou nesta chamada
    // (modelo antigo, corte pelo teto antes do bloco fechar). O texto cru VOLTA
    // para quem chamou — é dele que sai o resgate do escopo.
    const text = json.content?.find((b) => b.type === "text")?.text ?? json.content?.[0]?.text ?? null;
    if (!text) return { ok: false, error: "Resposta Claude vazia", uso, motivoDeParada, textoCru: null };
    const data = extractJson(text);
    return data
      ? { ok: true, data, model, provider: "claude", uso, motivoDeParada, textoCru: text }
      : { ok: false, error: "JSON inválido (Claude)", uso, motivoDeParada, textoCru: text };
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
  timeoutMs?: number,
): Promise<GenerateResult> {
  const { url, label, jsonMode } = OPENAI_COMPATIBLE[provider];
  const { signal, clear } = withTimeout(timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: m.system },
          ...(m.historico ?? []),
          { role: "user", content: m.user },
        ],
        ...(jsonMode ? { response_format: { type: "json_object" as const } } : {}),
        temperature: 0.7,
        max_tokens: maxTokens,
      }),
      signal,
    });
    if (!res.ok) return { ok: false, error: `${label} HTTP ${res.status}` };
    const json = (await res.json()) as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
    const uso = usoOpenAICompativel(json);
    const motivoDeParada = json.choices?.[0]?.finish_reason ?? null;
    const content = json.choices?.[0]?.message?.content;
    if (!content) return { ok: false, error: `Resposta ${label} vazia`, uso, motivoDeParada, textoCru: null };
    const data = extractJson(content);
    return data
      ? { ok: true, data, model, provider, uso, motivoDeParada, textoCru: content }
      : { ok: false, error: `JSON inválido (${label})`, uso, motivoDeParada, textoCru: content };
  } catch (err) {
    return { ok: false, error: err instanceof Error && err.name === "AbortError" ? "timeout" : "erro de rede" };
  } finally {
    clear();
  }
}

async function callGemini(apiKey: string, model: string, m: OpenAIMessages, maxTokens: number, timeoutMs?: number): Promise<GenerateResult> {
  const { signal, clear } = withTimeout(timeoutMs);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: m.system }] },
        // ⚠️ O Gemini chama o assistente de "model", não de "assistant" —
        // mandar "assistant" aqui devolve 400.
        contents: [
          ...(m.historico ?? []).map((t) => ({
            role: t.role === "assistant" ? "model" : "user",
            parts: [{ text: t.content }],
          })),
          { role: "user", parts: [{ text: m.user }] },
        ],
        generationConfig: { responseMimeType: "application/json", maxOutputTokens: maxTokens, temperature: 0.7 },
      }),
      signal,
    });
    if (!res.ok) return { ok: false, error: `Gemini HTTP ${res.status}` };
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    };
    const uso = usoDoGemini(json);
    const motivoDeParada = json.candidates?.[0]?.finishReason ?? null;
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { ok: false, error: "Resposta Gemini vazia", uso, motivoDeParada, textoCru: null };
    const data = extractJson(text);
    return data
      ? { ok: true, data, model, provider: "gemini", uso, motivoDeParada, textoCru: text }
      : { ok: false, error: "JSON inválido (Gemini)", uso, motivoDeParada, textoCru: text };
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
  timeoutMs?: number,
  cachearSistema?: boolean,
  esquema?: Record<string, unknown>,
): Promise<GenerateResult> {
  if (provider === "claude") return callWithRetry(() => callClaude(apiKey, model, messages, maxTokens, timeoutMs, cachearSistema, esquema), attempts);
  if (provider === "openai" || provider === "deepseek" || provider === "perplexity") {
    return callWithRetry(() => callOpenAICompatible(provider, apiKey, model, messages, maxTokens, timeoutMs), attempts);
  }
  return callWithRetry(() => callGemini(apiKey, model, messages, maxTokens, timeoutMs), attempts);
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
   * DE QUEM É A CONTA — **só a conta**, e é essa a diferença que justifica um
   * segundo campo em vez de reusar `workspaceId`.
   *
   * ─── POR QUE ISTO NASCEU (24/08/2026) ────────────────────────────────────
   *
   * `/api/sdr/chat` é a PORTA PÚBLICA e resolve a própria chave
   * (`chaveJaResolvida`) justamente para NÃO passar por `workspaceId` — porque
   * `workspaceId` aqui faz três coisas de uma vez: resolve a chave no cofre,
   * aplica a fixação de provedor/modelo por cliente (`escolhaDoCliente`) e
   * atribui o gasto. A rota precisa da TERCEIRA e não pode ter as duas
   * primeiras: elas reabririam a porta que `lib/ai/chave-publica.ts` fecha e
   * trocariam por baixo o modelo que a rota já escolheu.
   *
   * Resultado, medido em produção: toda chamada da rota pública logava
   * `[custo-de-ia] chamada SEM workspace, fora da conta` — o gasto da porta da
   * rua não entrava na conta de ninguém, e sem conta não há teto de gasto
   * possível (ver `lib/ai/teto-de-custo.ts`).
   *
   * Este campo faz UMA coisa: dizer a `anotar()` de quem é a linha do
   * `AIRunLog`. Não resolve chave, não escolhe provedor, não escolhe modelo.
   * `workspaceId`, quando presente, continua mandando — ninguém precisa passar
   * os dois.
   */
  contaDoWorkspace?: string | null;
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
  /**
   * OS TURNOS ANTERIORES. Opcional — ausente, o comportamento é o de sempre.
   * Ver `OpenAIMessages.historico`.
   */
  historico?: TurnoDeHistorico[];
  /**
   * A CHAVE JÁ RESOLVIDA POR QUEM CHAMOU — e por que isto existe.
   *
   * ⚠️ ROTA PÚBLICA. `resolveProviderKey(provider)` SEM `workspaceId` cai num
   * `findFirst` global: "a primeira chave que existir no banco". Numa base com
   * duas agências, qualquer visitante com um laço de requisições gasta a chave
   * de uma delas, escolhida por ordem de inserção. `lib/ai/chave-publica.ts`
   * existe exatamente para fechar essa porta, e ligar o SDR na camada NÃO PODE
   * reabri-la.
   *
   * Então a regra é esta, e ela é inegociável: quem atende sem sessão resolve a
   * chave pela regra da rota pública e a entrega PRONTA aqui. Com este campo
   * preenchido, a camada usa exatamente este provedor e esta chave — não
   * consulta o cofre, não anda na ordem de preferência, não tem reserva. A
   * decisão de quem paga já foi tomada por quem sabia fazê-la com segurança.
   */
  chaveJaResolvida?: { provider: AiProvider; apiKey: string; model: string | null };
  /**
   * Pede CACHE do prompt de sistema. Ausente = desligado, o de sempre.
   *
   * Só ligue quando o MESMO `system` for reenviado várias vezes seguidas — é o
   * caso de uma conversa (o SDR reenvia 10.700 tokens a cada um dos 16 turnos).
   * Gravar no cache custa ~1,25x; para quem chama uma vez só, o cache nunca
   * seria lido e a gravação apenas encareceria. Ver o comentário em `callClaude`.
   */
  cachearSistema?: boolean;
  /**
   * A forma que a resposta TEM de ter, como esquema de ferramenta.
   *
   * Só o Claude a aplica hoje — é o provedor cuja garantia de formato é uso de
   * ferramenta forçado (ver `formato-garantido.ts`). Os outros garantem JSON
   * por outro mecanismo, que não carrega forma. Passar `esquema` para eles não
   * quebra nada e também não promete nada, e isto está escrito em vez de
   * suposto.
   */
  esquema?: Record<string, unknown>;
  /** Teto de espera por chamada. Ausente = 60s, o de sempre. O SDR usa 30s:
   *  é conversa ao vivo, e quem está do outro lado não espera um minuto. */
  timeoutMs?: number;
  /**
   * Quantas vezes insistir no provedor preferido antes de desistir dele.
   * Ausente = 3, o de sempre.
   *
   * O SDR manda 1, e o motivo é o prospect: insistir é virtude em trabalho de
   * fundo (uma peça vale esperar), e é defeito numa conversa ao vivo. Com 3
   * tentativas e teto de 30s, um provedor pendurado deixaria alguém olhando
   * para a tela por 90 segundos — quando o certo, ali, é cair no motor de
   * regras em 30 e seguir a conversa. Antes de entrar na camada esta rota não
   * tinha repetição nenhuma; manter 1 preserva o comportamento que o prospect
   * já tinha, em vez de herdar sem querer o de outro caso de uso.
   */
  tentativas?: number;
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

  // Chave entregue pronta (rota pública): ela É a ordem inteira. Sem cofre,
  // sem preferência, sem reserva — ver `chaveJaResolvida`.
  const order = options.chaveJaResolvida
    ? [options.chaveJaResolvida.provider]
    : preferido
      ? (semReserva
          ? [preferido]
          : [preferido, ...preferenceOrder().filter((p) => p !== preferido)])
      : preferenceOrder();
  const messages: OpenAIMessages = {
    system: options.system,
    user: options.user,
    ...(options.historico?.length ? { historico: options.historico } : {}),
  };

  // A conta pode vir por dois caminhos, e o de cima manda: quem passou
  // `workspaceId` já disse tudo. `contaDoWorkspace` é a saída da rota pública,
  // que precisa da conta SEM o cofre e SEM a fixação de provedor — ver o campo.
  const workspaceDaConta = options.workspaceId ?? options.contaDoWorkspace ?? null;

  const anotar = (p: {
    provider: string; model: string; status: "success" | "error";
    uso?: UsoDeTokens | null; duracaoMs: number; erro?: string | null;
    fallbackUsed?: boolean; fallbackReason?: string | null;
  }) => {
    if (!workspaceDaConta) {
      // Não dá para atribuir a workspace nenhum — e ficar calado faria o
      // relatório de gasto parecer completo quando não é.
      console.warn(`[custo-de-ia] chamada SEM workspace, fora da conta — ${p.provider}/${p.model}`);
      return;
    }
    // Sem `await`: a contabilidade não segura a entrega. `registrarChamadaDeIa`
    // nunca rejeita, então não há promessa órfã capaz de derrubar o processo.
    void registrarChamadaDeIa({
      workspaceId:  workspaceDaConta,
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
  // ── O DESFECHO DA PRIMEIRA TENTATIVA VIAJA JUNTO COM A FALHA ──────────────
  // Pego por teste em 24/08/2026: o retorno final de erro montava um objeto
  // NOVO e `motivoDeParada`/`textoCru` evaporavam ali. Quem precisa deles é
  // justamente quem falhou — é do texto cru que sai o `repararJsonTruncado` e,
  // com ele, a regra de que o escopo sobrevive mesmo sem a fala. Perder isso no
  // caminho do erro seria perder exatamente no caso em que ele importa.
  let desfechoDaPrimeira: DesfechoDaGeracao = {};
  const tried: string[] = [];

  for (const provider of order) {
    // ⚠️ A chave entregue pronta NUNCA passa por `resolveProviderKey` — é essa
    // linha que impede a rota pública de cair no `findFirst` global.
    const resolved =
      options.chaveJaResolvida && options.chaveJaResolvida.provider === provider
        ? { apiKey: options.chaveJaResolvida.apiKey, source: "ui" as const, model: options.chaveJaResolvida.model }
        : await resolveProviderKey(provider, options.workspaceId);
    if (!resolved) continue;                       // sem chave não é falha, é ausência

    // Modelo fixado na tela do cliente vence o modelo salvo com a chave: quem
    // fixou "gemini-flash-lite-latest" naquele cliente fixou por um motivo.
    const model = (fixado && provider === fixado.provider ? modeloFixado : null) ?? resolved.model ?? modeloPadrao(provider);
    const attempts = tried.length === 0 ? (options.tentativas ?? 3) : 1;
    const comecou = Date.now();
    const result = await callProvider(provider, resolved.apiKey, model, messages, maxTokens, attempts, options.timeoutMs, options.cachearSistema, options.esquema);
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
    if (firstFailure === null) {
      desfechoDaPrimeira = { motivoDeParada: result.motivoDeParada ?? null, textoCru: result.textoCru ?? null };
    }
    firstFailure ??= result.error;
    tried.push(`${provider} (${result.error})`);
  }

  if (tried.length > 0) {
    // Reporta a PRIMEIRA falha, não a última: a primeira é a do provedor que
    // devia ter atendido, e é a que a pessoa precisa investigar.
    const porFixacao = fixado ? ` [provedor fixado no cliente: ${fixado.provider}, sem reserva]` : "";
    return {
      ok: false,
      error: `IA indisponível: ${firstFailure}${tried.length > 1 ? ` (reservas também falharam: ${tried.length - 1})` : ""}${porFixacao}`,
      ...desfechoDaPrimeira,
    };
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
