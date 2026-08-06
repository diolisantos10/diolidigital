// Thin, typed wrapper around the Meta Graph API. SERVER-ONLY.
// Every call goes through here so error handling, timeouts, RITMO and the
// versioned base URL are consistent.
//
// ─── ESTA É A ÚNICA PORTA PARA A META — E POR ISSO É AQUI QUE MORA O FREIO ───
// Até 05/08/2026 este arquivo tinha exatamente uma proteção: um timeout de 20s.
// Zero controle de ritmo, zero backoff, zero leitura dos cabeçalhos de uso, zero
// tratamento dos códigos 4/17/32/613/80004. O único teto da casa vivia em
// `leitura.ts`, era opcional e só a leitura de métricas passava por ele —
// publicação, anúncios, WhatsApp, templates e descoberta iam DIRETO.
//
// Em 03/08/2026 a conta de anúncios da agência foi restringida pela Meta por
// "automação que não segue nossas regras": ritmo de máquina numa conta fria.
// Um teto que a metade dos caminhos contorna não é teto. Agora o balde
// (`./ritmo.ts`) é consultado ANTES de cada chamada, aqui dentro — não há como
// falar com a Meta nesta casa sem passar por ele.
//
// O que acontece em cada chamada, nesta ordem:
//   0. se for MARKETING API: a operação precisa estar no catálogo fechado
//      (`travas.ts`) quando é escrita, e a COTA POR PONTUAÇÃO da conta de
//      anúncios é reservada NO BANCO (`cota-de-anuncios.ts`) — leitura 1 ponto,
//      escrita 3, teto 60 por 300 segundos no nível de desenvolvimento
//      (fontes/marketing-api-limites-de-taxa.md, recapturado em 06/08/2026).
//      Estourou: PARA E ESPERA, sem laço de retentativa;
//   1. reserva no balde (espaça o uso normal, BARRA a rajada);
//   2. chama;
//   3. LÊ os cabeçalhos `X-App-Usage` / `X-Business-Use-Case-Usage` — a própria
//      Meta diz quanto da cota já foi gasto e quantos minutos faltam para
//      liberar; ignorar isso e contar só por conta própria é adivinhar;
//   4. erro de LIMITE (4/17/32/613/80000-80004) → freia a chave e NÃO retenta
//      ("Quando o limite tiver sido atingido, pare de fazer chamadas à API" —
//      fontes/graph-api-limites-de-taxa.md);
//   5. erro 5xx/rede → retenta poucas vezes, com espera crescente.

import { GRAPH_BASE } from "./config";
import {
  reservarChamadaNaGraph, registrarCabecalhos, registrarErroDeLimite,
  chaveDoToken, ehCodigoDeLimite, RitmoDaCasaError, lerUsoDosCabecalhos,
  TIPO_DE_RITMO_DA_CASA,
} from "./ritmo";
import {
  reservarPontosDaConta, frearConta, contaDaUrl, ehChamadaDaMarketingApi,
  bloqueioDaMetaSegundos,
} from "./cota-de-anuncios";
import { ehEscrita, operacaoConhecida, fraseDeOperacaoNaoCatalogada } from "./travas";

const TIMEOUT_MS = 20_000;

/** Retentativa é SÓ para falha transitória (5xx/rede). Erro de limite nunca
 *  retenta — insistir aumenta a contagem e estende o bloqueio. */
const TENTATIVAS_EM_FALHA_TRANSITORIA = 2;
const ESPERA_BASE_MS = 1_000;

export interface GraphError {
  message: string;
  type?: string;
  code?: number;
  fbtrace_id?: string;
}

export class GraphApiError extends Error {
  status: number;
  detail?: GraphError;
  constructor(message: string, status: number, detail?: GraphError) {
    super(message);
    this.name = "GraphApiError";
    this.status = status;
    this.detail = detail;
  }
}

/** Opções comuns às três verbos. `escopo` troca a chave do balde quando o
 *  chamador sabe melhor que o token quem é o dono da cota. */
export interface OpcoesDaChamada {
  escopo?: string;
  /**
   * O nome da operação no catálogo fechado (`travas.ts`). Obrigatório para
   * ESCRITA na Marketing API: o que não está no catálogo não sai desta casa.
   * Também é o que dá o peso em pontos (leitura 1, escrita 3).
   */
  operacao?: string;
  /** A conta de anúncios dona da cota ("act_..."), quando ela não está na URL —
   *  é o caso de pausar/ativar, que são `POST /{id}`. */
  conta?: string;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function parse<T>(res: Response): Promise<T> {
  const raw = await res.text();
  let body: unknown = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    // non-JSON body
  }
  if (!res.ok) {
    const err = (body as { error?: GraphError } | null)?.error;
    throw new GraphApiError(
      err?.message ?? `Graph API HTTP ${res.status}`,
      res.status,
      err,
    );
  }
  return body as T;
}

function buildUrl(path: string, params: Record<string, string | number | undefined>): string {
  // Absolute path (starts with http) is used as-is; otherwise prefix the base.
  const base = path.startsWith("http") ? path : `${GRAPH_BASE}/${path.replace(/^\//, "")}`;
  const url = new URL(base);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  return url.toString();
}

function nodeUrl(path: string): string {
  return path.startsWith("http") ? path : `${GRAPH_BASE}/${path.replace(/^\//, "")}`;
}

function esperar(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * O caminho único: reserva no balde → chama → lê os cabeçalhos → traduz o erro.
 *
 * Nenhum verbo da Graph escapa daqui. É de propósito: a proteção que depende de
 * o próximo desenvolvedor lembrar de chamá-la não é proteção.
 */
async function chamarAGraph<T>(
  chave: string,
  url: string,
  init: RequestInit,
  opts?: OpcoesDaChamada,
): Promise<T> {
  let ultimaFalha: unknown = null;
  const metodo = (init.method ?? "GET").toUpperCase();
  const cota = alvoDaCota(chave, url, metodo, opts);

  // 0. O CATÁLOGO FECHADO (travas.ts). Escrita na Marketing API que não foi
  //    declarada não acontece — nem é tentada. A trava de plataforma decidida
  //    pelo CEO em 03/08/2026 vira mecanismo aqui: parecer que depende de
  //    alguém lembrar de pedir não é trava, é aviso.
  if (cota && ehEscrita(opts?.operacao, metodo) && !operacaoConhecida(opts?.operacao)) {
    const frase = fraseDeOperacaoNaoCatalogada(opts?.operacao);
    throw new GraphApiError(frase, 403, { message: frase, type: TIPO_DE_RITMO_DA_CASA, code: 613 });
  }

  for (let tentativa = 0; tentativa <= TENTATIVAS_EM_FALHA_TRANSITORIA; tentativa++) {
    // 0.1 A COTA POR PONTUAÇÃO da conta de anúncios, contada no BANCO
    //     (leitura 1, escrita 3; teto 60 por 300s em development_access —
    //     fontes/marketing-api-limites-de-taxa.md). Reserva a cada tentativa:
    //     retentativa é chamada e pontua igual.
    if (cota) {
      const reserva = await reservarPontosDaConta(cota.conta, {
        operacao: opts?.operacao, metodo,
      });
      if (!reserva.ok) {
        // PARA E ESPERA: quem chamou recebe a frase e o tempo. Não existe laço
        // de retentativa aqui — insistir contra limite de taxa é auto-bloqueio.
        throw new GraphApiError(reserva.frase, 429, {
          message: reserva.frase,
          type: TIPO_DE_RITMO_DA_CASA,
          code: 613,
        });
      }
    }

    // 1. O freio, ANTES da rede. Uma retentativa também é uma chamada: conta.
    try {
      await reservarChamadaNaGraph(chave);
    } catch (e) {
      if (e instanceof RitmoDaCasaError) {
        throw new GraphApiError(e.detalhe.message, 429, e.detalhe);
      }
      throw e;
    }

    let res: Response;
    try {
      res = await fetchWithTimeout(url, init);
    } catch (e) {
      // Rede/timeout: transitório. AbortError sobe direto — o chamador já sabe
      // dizer "a Meta demorou demais para responder".
      if (e instanceof Error && e.name === "AbortError") throw e;
      ultimaFalha = e;
      if (tentativa < TENTATIVAS_EM_FALHA_TRANSITORIA) {
        await esperar(ESPERA_BASE_MS * Math.pow(2, tentativa));
        continue;
      }
      throw e;
    }

    // 3. O que a META diz sobre a cota — vale para resposta boa e ruim.
    let uso = { esperarMin: 0 };
    try {
      uso = registrarCabecalhos(chave, res.headers);
    } catch { /* cabeçalho estranho nunca derruba a chamada */ }

    try {
      return await parse<T>(res);
    } catch (e) {
      if (e instanceof GraphApiError) {
        // 4. Limite: freia e devolve. Não retenta.
        if (ehCodigoDeLimite(e.detail?.code) || res.status === 429) {
          registrarErroDeLimite(chave, e.detail?.code, uso.esperarMin);
          // O castigo da CONTA vai para o banco: memória de processo perde o
          // castigo no primeiro deploy, e a Meta não perde.
          if (cota) {
            await frearConta(
              cota.conta,
              uso.esperarMin > 0 ? uso.esperarMin * 60 : bloqueioDaMetaSegundos(),
              `a Meta recusou por limite de volume (código ${e.detail?.code ?? "?"})`,
            ).catch(() => {});
          }
          throw e;
        }
        // 5. 5xx é transitório; 4xx é resposta da Meta e é definitiva.
        if (res.status >= 500 && tentativa < TENTATIVAS_EM_FALHA_TRANSITORIA) {
          ultimaFalha = e;
          await esperar(ESPERA_BASE_MS * Math.pow(2, tentativa));
          continue;
        }
      }
      throw e;
    }
  }

  throw ultimaFalha instanceof Error
    ? ultimaFalha
    : new GraphApiError("Graph API indisponível", 503);
}

function chaveDaChamada(token: string, opts?: OpcoesDaChamada): string {
  return opts?.escopo ? `escopo:${opts.escopo}` : chaveDoToken(token);
}

/**
 * Esta chamada entra na cota por pontuação da Marketing API? E em nome de qual
 * conta de anúncios?
 *
 * Duas portas, de propósito:
 *   • a DECLARADA — quem chama diz a operação (catálogo de `travas.ts`) e, se
 *     souber, a conta. É o caminho de `ads.ts`;
 *   • a DETECTADA — a URL denuncia a Marketing API (`act_...`, `/campaigns`,
 *     `/adsets`, `/adcreatives`, ...). É a rede de segurança para o caminho que
 *     alguém escrever amanhã sem declarar nada.
 * Sem conta conhecida, o balde é o do próprio ator (a chave do token). Conta a
 * MAIS, nunca a menos.
 */
function alvoDaCota(
  chave: string,
  url: string,
  metodo: string,
  opts?: OpcoesDaChamada,
): { conta: string } | null {
  const declarada = !!opts?.operacao || !!opts?.conta;
  if (!declarada && !ehChamadaDaMarketingApi(url)) return null;
  void metodo;
  return { conta: opts?.conta ?? contaDaUrl(url) ?? `sem_conta:${chave}` };
}

// GET a Graph node/edge. Pass the access token as `accessToken`.
export async function graphGet<T = unknown>(
  path: string,
  accessToken: string,
  params: Record<string, string | number | undefined> = {},
  opts?: OpcoesDaChamada,
): Promise<T> {
  const url = buildUrl(path, { ...params, access_token: accessToken });
  return chamarAGraph<T>(chaveDaChamada(accessToken, opts), url, { method: "GET" }, opts);
}

// POST a JSON body — required by the WhatsApp Cloud API (/{phone}/messages),
// which does not accept form-encoded params for nested structures like
// `template.components`.
export async function graphPostJson<T = unknown>(
  path: string,
  accessToken: string,
  body: Record<string, unknown>,
  opts?: OpcoesDaChamada,
): Promise<T> {
  return chamarAGraph<T>(chaveDaChamada(accessToken, opts), nodeUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  }, opts);
}

// POST to a Graph node/edge. Body params are form-encoded (Graph convention).
export async function graphPost<T = unknown>(
  path: string,
  accessToken: string,
  body: Record<string, string | number | undefined> = {},
  opts?: OpcoesDaChamada,
): Promise<T> {
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...body, access_token: accessToken })) {
    if (v !== undefined && v !== null && v !== "") form.set(k, String(v));
  }
  return chamarAGraph<T>(chaveDaChamada(accessToken, opts), nodeUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  }, opts);
}

// Reexportado para quem precisa diagnosticar ritmo sem importar dois módulos.
export { lerUsoDosCabecalhos };
