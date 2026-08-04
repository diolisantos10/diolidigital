// leitura.ts — A CAMADA DE LEITURA da Meta. SÓ GET, nenhuma escrita. SERVER-ONLY.
//
// Existe por dois pedidos do CEO (04/08/2026): o dashboard com métricas REAIS
// por cliente, e a agência LER o Instagram do cliente (posts, estilo) antes de
// produzir. Como é leitura pura, a trava de plataforma não é acionada — mas as
// regras de ritmo valem do mesmo jeito: o rate limit de Insights/Instagram é
// por CONTA e por caso de uso (BUC), e estourar num endpoint bloqueia todos
// (docs/plataformas/meta/fontes/graph-api-limites-de-taxa.md). Daí o cache.
//
// MÉTRICAS — por que estas e não outras:
//   `impressions` foi DESCONTINUADA na conta (v22.0; todas as versões em
//   21/04/2025) e na mídia (criada após 02/07/2024). As vigentes, conferidas
//   na fonte oficial em 04/08/2026 (a biblioteca local tem LACUNA neste ponto
//   — declarada na cartilha):
//     conta: reach (única com time_series), views, accounts_engaged,
//            total_interactions — period=day, com since/until;
//     mídia: reach, views, likes, comments, saved, shares, total_interactions
//            (+ ig_reels_avg_watch_time em REELS; STORY tem set próprio).
//   Fontes: developers.facebook.com/docs/instagram-api/reference/ig-user/insights
//           developers.facebook.com/docs/instagram-api/reference/ig-media/insights
//
// CONTRATO DE ERRO: nada aqui lança exceção para o chamador. Tudo devolve
// `{ ok: false, error }` com dois qualificadores que a UI precisa distinguir:
//   `semConexao`        → o cliente nunca conectou a rede ("nenhuma rede conectada");
//   `precisaReconectar` → existiu conexão, mas o token venceu/foi revogado.
// Confundir os dois manda o cliente "reconectar" uma conta que nunca existiu.

import { graphGet, GraphApiError } from "./graph";
import {
  conexaoDoCliente, loadConnectionToken, marcarConexaoExpirada,
  type ConexaoResolvida,
} from "./connections";

// ─── Contrato de resultado ──────────────────────────────────────────────────

export interface ErroDeLeitura {
  ok: false;
  error: string;
  /** true quando a saída é reconectar (token vencido, revogado ou ilegível). */
  precisaReconectar?: boolean;
  /** true quando o cliente simplesmente não tem a rede conectada. */
  semConexao?: boolean;
}
export type ResultadoDeLeitura<T> = ({ ok: true } & T) | ErroDeLeitura;

// ─── Cache honesto ──────────────────────────────────────────────────────────
// Em memória, por (conexão, janela/página), TTL curto. Não é "dado histórico
// guardado" — é só para o dashboard aberto três vezes seguidas não virar três
// rajadas de GET. O limite BUC do Instagram escala com as impressões da conta
// (contas pequenas = cota pequena); ver fontes/graph-api-limites-de-taxa.md.

export const TTL_DO_CACHE_MS = 10 * 60_000;
const cache = new Map<string, { validoAte: number; valor: unknown }>();

function doCache<T>(chave: string): T | null {
  const hit = cache.get(chave);
  if (!hit) return null;
  if (Date.now() > hit.validoAte) { cache.delete(chave); return null; }
  return hit.valor as T;
}
function guardarNoCache(chave: string, valor: unknown): void {
  // Só sucesso entra no cache: guardar um erro por 10 min esconderia a
  // reconexão que o usuário acabou de fazer.
  cache.set(chave, { validoAte: Date.now() + TTL_DO_CACHE_MS, valor });
}
/** Para testes e para depois de reconectar uma conta. */
export function limparCacheDeLeitura(): void {
  cache.clear();
}

// ─── Erro da Graph em frase de gente (regra da casa nº 2) ───────────────────

/** Códigos de OAuth: token vencido/revogado/sem permissão de sessão. */
const CODIGOS_DE_TOKEN = new Set([190, 102]);
/** Códigos de limite de taxa (fontes/graph-api-limites-de-taxa.md). */
const CODIGOS_DE_RITMO = new Set([4, 17, 32, 613, 80000, 80001, 80002, 80004]);

function frasearErroDeLeitura(e: unknown): { error: string; precisaReconectar?: boolean } {
  if (e instanceof GraphApiError) {
    const code = e.detail?.code;
    if (code !== undefined && CODIGOS_DE_TOKEN.has(code)) {
      return { error: "o acesso ao Instagram venceu — é preciso reconectar a conta", precisaReconectar: true };
    }
    if (code !== undefined && CODIGOS_DE_RITMO.has(code)) {
      return { error: "a Meta limitou nosso ritmo de leitura — tente de novo em alguns minutos" };
    }
    if (code === 10 || e.detail?.type === "OAuthException") {
      return { error: `a Meta recusou a leitura: ${e.detail?.message ?? e.message}` };
    }
    if (code === 100) {
      return { error: `a Meta não reconheceu o pedido (métrica ou campo fora da versão atual): ${e.detail?.message ?? e.message}` };
    }
    return { error: `a Meta respondeu com erro: ${e.detail?.message ?? e.message}` };
  }
  if (e instanceof Error && e.name === "AbortError") {
    return { error: "a Meta demorou demais para responder — tente de novo" };
  }
  return { error: e instanceof Error ? e.message : "erro desconhecido ao falar com a Meta" };
}

// ─── Resolução cliente → conta de Instagram pronta para ler ─────────────────

interface ContaLegivel {
  conexao: ConexaoResolvida;
  igUserId: string;
  token: string;
}

async function contaDoCliente(
  workspaceId: string,
  clientId: string,
): Promise<ContaLegivel | ErroDeLeitura> {
  let conexao: ConexaoResolvida | null;
  try {
    conexao = await conexaoDoCliente(workspaceId, clientId, "instagram");
  } catch {
    return { ok: false, error: "não consegui consultar as conexões deste cliente" };
  }
  if (!conexao) {
    return { ok: false, error: "o cliente ainda não conectou o Instagram", semConexao: true };
  }
  if (conexao.status !== "connected") {
    return { ok: false, error: "a conexão com o Instagram precisa ser refeita", precisaReconectar: true };
  }
  if (!conexao.token) {
    return { ok: false, error: "não consegui decifrar o token guardado — reconecte a conta", precisaReconectar: true };
  }
  if (conexao.tokenExpiresAt && conexao.tokenExpiresAt.getTime() < Date.now()) {
    return { ok: false, error: "o token do Instagram venceu — é preciso reconectar a conta", precisaReconectar: true };
  }
  return {
    conexao,
    igUserId: (conexao.metaJson.igUserId as string | undefined) ?? conexao.externalId,
    token: conexao.token,
  };
}

/** Converte a exceção da Graph no erro-contrato — e, se for token morto,
 *  carimba a conexão como expirada para o portal dizer a verdade na próxima. */
async function comoErro(e: unknown, connectionId: string): Promise<ErroDeLeitura> {
  const fraseado = frasearErroDeLeitura(e);
  if (fraseado.precisaReconectar) await marcarConexaoExpirada(connectionId);
  return { ok: false, ...fraseado };
}

// ─── 1. O feed publicado — o que o cliente REALMENTE posta ──────────────────

export interface PostDoFeed {
  id: string;
  caption: string | null;
  /** IMAGE | VIDEO | CAROUSEL_ALBUM */
  media_type: string;
  /** FEED | REELS | STORY | AD — é o que decide o set de métricas por post. */
  media_product_type: string | null;
  media_url: string | null;
  thumbnail_url: string | null;
  permalink: string | null;
  timestamp: string | null;
  /** null = a Meta não devolveu (ex.: contagem de curtidas oculta). */
  like_count: number | null;
  comments_count: number | null;
  children: Array<{ media_url: string | null; media_type: string }>;
}

const CAMPOS_DO_FEED =
  "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp," +
  "like_count,comments_count,children{media_url,media_type}";

/** Teto duro de posts por leitura. 24 por padrão; mais que 60 é raspagem, não
 *  leitura de estilo — e cada página é uma chamada contada no rate limit. */
export const LIMITE_PADRAO_DO_FEED = 24;
export const LIMITE_MAXIMO_DO_FEED = 60;
const TAMANHO_DA_PAGINA = 25;

interface PaginaDeMedia {
  data?: Array<Record<string, unknown>>;
  paging?: { next?: string };
}

function normalizarPost(bruto: Record<string, unknown>): PostDoFeed {
  const filhos = (bruto.children as { data?: Array<Record<string, unknown>> } | undefined)?.data ?? [];
  return {
    id: String(bruto.id ?? ""),
    caption: typeof bruto.caption === "string" ? bruto.caption : null,
    media_type: String(bruto.media_type ?? ""),
    media_product_type: typeof bruto.media_product_type === "string" ? bruto.media_product_type : null,
    media_url: typeof bruto.media_url === "string" ? bruto.media_url : null,
    thumbnail_url: typeof bruto.thumbnail_url === "string" ? bruto.thumbnail_url : null,
    permalink: typeof bruto.permalink === "string" ? bruto.permalink : null,
    timestamp: typeof bruto.timestamp === "string" ? bruto.timestamp : null,
    like_count: typeof bruto.like_count === "number" ? bruto.like_count : null,
    comments_count: typeof bruto.comments_count === "number" ? bruto.comments_count : null,
    children: filhos.map((f) => ({
      media_url: typeof f.media_url === "string" ? f.media_url : null,
      media_type: String(f.media_type ?? ""),
    })),
  };
}

/** O laço de paginação de verdade, já com a conta resolvida. */
async function lerFeedPorConta(
  conta: ContaLegivel,
  opts: { limite?: number } = {},
): Promise<ResultadoDeLeitura<{ posts: PostDoFeed[] }>> {
  const limite = Math.min(LIMITE_MAXIMO_DO_FEED, Math.max(1, opts.limite ?? LIMITE_PADRAO_DO_FEED));
  const chave = `feed:${conta.conexao.id}:${limite}`;
  const emCache = doCache<{ posts: PostDoFeed[] }>(chave);
  if (emCache) return { ok: true, ...emCache };

  const posts: PostDoFeed[] = [];
  try {
    // Primeira página pelo caminho normal; as seguintes pela URL `paging.next`
    // que a própria Meta monta (graphGet aceita URL absoluta).
    let proxima: string | null = `${conta.igUserId}/media`;
    let primeira = true;
    while (proxima && posts.length < limite) {
      const pagina: PaginaDeMedia = await graphGet<PaginaDeMedia>(
        proxima,
        conta.token,
        primeira
          ? { fields: CAMPOS_DO_FEED, limit: Math.min(TAMANHO_DA_PAGINA, limite) }
          : {},
      );
      for (const bruto of pagina.data ?? []) {
        if (posts.length >= limite) break;
        posts.push(normalizarPost(bruto));
      }
      // Sem `next` a lista acabou — pedir de novo seria chamada jogada fora.
      proxima = posts.length < limite ? pagina.paging?.next ?? null : null;
      primeira = false;
    }
  } catch (e) {
    return comoErro(e, conta.conexao.id);
  }

  guardarNoCache(chave, { posts });
  return { ok: true, posts };
}

/**
 * O feed publicado do cliente: o que foi ao ar, com engajamento por post.
 * É o que o Design olha antes de produzir — estilo não se lê por legenda.
 */
export async function lerFeedDoCliente(
  workspaceId: string,
  clientId: string,
  opts: { limite?: number } = {},
): Promise<ResultadoDeLeitura<{ posts: PostDoFeed[] }>> {
  const conta = await contaDoCliente(workspaceId, clientId);
  if ("ok" in conta) return conta;
  return lerFeedPorConta(conta, opts);
}

/**
 * Compatibilidade com quem já tinha um `connectionId` na mão (a rota antiga de
 * feed). O caminho novo é por cliente; este continua valendo.
 */
export async function lerFeedPorConexao(
  workspaceId: string,
  connectionId: string,
  opts: { limite?: number } = {},
): Promise<ResultadoDeLeitura<{ posts: PostDoFeed[] }>> {
  const conn = await loadConnectionToken(workspaceId, connectionId).catch(() => null);
  if (!conn) return { ok: false, error: "conexão de Instagram não encontrada", semConexao: true };
  if (conn.platform !== "instagram") return { ok: false, error: "a conexão informada não é de Instagram" };
  return lerFeedPorConta({
    conexao: {
      id: connectionId, platform: conn.platform, externalId: conn.externalId,
      status: "connected", tokenExpiresAt: null, metaJson: conn.metaJson, token: conn.token,
    },
    igUserId: (conn.metaJson.igUserId as string | undefined) ?? conn.externalId,
    token: conn.token,
  }, opts);
}

// ─── 2. Métricas da CONTA, com série temporal ───────────────────────────────

export interface PontoDaSerie {
  /** AAAA-MM-DD (dia do valor, na leitura da Meta). */
  data: string;
  alcance: number;
}

export interface MetricasDaConta {
  perfil: {
    /** null = não medi (a Meta não devolve para contas < 100 seguidores). */
    seguidores: number | null;
    totalDePosts: number | null;
  };
  /** A janela efetivamente medida, AAAA-MM-DD. Pode ser menor que a pedida —
   *  a Meta limita a 30 dias por chamada; quando encolher, `aviso` diz. */
  periodo: { desde: string; ate: string };
  totais: {
    /** reach — contas únicas alcançadas no período (soma da série diária). */
    alcance: number | null;
    /** views — a métrica que SUBSTITUIU impressions (descontinuada v22.0). */
    visualizacoes: number | null;
    /** accounts_engaged — contas que interagiram. */
    contasComEngajamento: number | null;
    /** total_interactions — curtidas+comentários+salvos+compart.+respostas. */
    interacoes: number | null;
  };
  /** Diária, SÓ de alcance: `reach` é a única métrica de conta com
   *  metric_type=time_series na API vigente. As demais só têm total. */
  serie: PontoDaSerie[];
  /** Ressalva honesta quando algo foi medido parcialmente. */
  aviso?: string;
}

/** A Meta recusa janelas de insights de conta maiores que 30 dias. */
const JANELA_MAXIMA_DIAS = 30;

function dataISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function emSegundos(dataAAAA_MM_DD: string, fimDoDia = false): number {
  return Math.floor(Date.parse(`${dataAAAA_MM_DD}T${fimDoDia ? "23:59:59" : "00:00:00"}.000Z`) / 1000);
}

interface RespostaDeInsights {
  data?: Array<{
    name: string;
    total_value?: { value?: number };
    values?: Array<{ value?: number; end_time?: string }>;
  }>;
}

/**
 * Métricas da conta do cliente numa janela (default: últimos 28 dias).
 * `null` num total significa "não medi" — nunca "deu zero"; quando os insights
 * falham mas o perfil respondeu, o resultado sai ok com `aviso` dizendo o quê.
 */
export async function lerMetricasDaConta(
  workspaceId: string,
  clientId: string,
  janela: { desde?: string; ate?: string } = {},
): Promise<ResultadoDeLeitura<MetricasDaConta>> {
  const conta = await contaDoCliente(workspaceId, clientId);
  if ("ok" in conta) return conta;

  // Janela: default últimos 28 dias; nunca mais que 30 (teto da Meta).
  const hoje = new Date();
  const ate = janela.ate ?? dataISO(hoje);
  let desde = janela.desde ?? dataISO(new Date(hoje.getTime() - 27 * 86_400_000));
  let avisoDeJanela: string | undefined;
  const dias = Math.round((Date.parse(ate) - Date.parse(desde)) / 86_400_000) + 1;
  if (Number.isFinite(dias) && dias > JANELA_MAXIMA_DIAS) {
    const desdePedido = desde;
    desde = dataISO(new Date(Date.parse(ate) - (JANELA_MAXIMA_DIAS - 1) * 86_400_000));
    avisoDeJanela = `a Meta só permite janelas de ${JANELA_MAXIMA_DIAS} dias — medi de ${desde} a ${ate} (pedido: desde ${desdePedido})`;
  }

  const chave = `conta:${conta.conexao.id}:${desde}:${ate}`;
  const emCache = doCache<MetricasDaConta>(chave);
  if (emCache) return { ok: true, ...emCache };

  const resultado: MetricasDaConta = {
    perfil: { seguidores: null, totalDePosts: null },
    periodo: { desde, ate },
    totais: { alcance: null, visualizacoes: null, contasComEngajamento: null, interacoes: null },
    serie: [],
    ...(avisoDeJanela ? { aviso: avisoDeJanela } : {}),
  };

  // 1. Perfil. Se ISTO falhar, a conexão inteira está ruim — erro de verdade.
  try {
    const perfil = await graphGet<{ followers_count?: number; media_count?: number }>(
      conta.igUserId,
      conta.token,
      { fields: "followers_count,media_count" },
    );
    resultado.perfil.seguidores = perfil.followers_count ?? null;
    resultado.perfil.totalDePosts = perfil.media_count ?? null;
  } catch (e) {
    return comoErro(e, conta.conexao.id);
  }

  const avisos: string[] = avisoDeJanela ? [avisoDeJanela] : [];
  const params = { period: "day", since: emSegundos(desde), until: emSegundos(ate, true) };

  // 2. A série de alcance — `reach` é a única métrica de conta com time_series.
  try {
    const r = await graphGet<RespostaDeInsights>(`${conta.igUserId}/insights`, conta.token, {
      ...params, metric: "reach", metric_type: "time_series",
    });
    const valores = r.data?.find((m) => m.name === "reach")?.values ?? [];
    resultado.serie = valores
      .filter((v) => typeof v.value === "number")
      .map((v) => ({ data: (v.end_time ?? "").slice(0, 10), alcance: v.value as number }));
    if (resultado.serie.length > 0) {
      resultado.totais.alcance = resultado.serie.reduce((s, p) => s + p.alcance, 0);
    }
  } catch (e) {
    const f = frasearErroDeLeitura(e);
    if (f.precisaReconectar) return comoErro(e, conta.conexao.id);
    avisos.push(`alcance não medido: ${f.error}`);
  }

  // 3. Os totais sem série (a API só dá total_value para estas).
  try {
    const r = await graphGet<RespostaDeInsights>(`${conta.igUserId}/insights`, conta.token, {
      ...params, metric: "views,accounts_engaged,total_interactions", metric_type: "total_value",
    });
    for (const m of r.data ?? []) {
      const v = m.total_value?.value ?? m.values?.[0]?.value;
      if (typeof v !== "number") continue;
      if (m.name === "views") resultado.totais.visualizacoes = v;
      if (m.name === "accounts_engaged") resultado.totais.contasComEngajamento = v;
      if (m.name === "total_interactions") resultado.totais.interacoes = v;
    }
  } catch (e) {
    const f = frasearErroDeLeitura(e);
    if (f.precisaReconectar) return comoErro(e, conta.conexao.id);
    avisos.push(`visualizações/engajamento não medidos: ${f.error}`);
  }

  if (avisos.length > 0) resultado.aviso = avisos.join("; ");
  guardarNoCache(chave, resultado);
  return { ok: true, ...resultado };
}

// ─── 3. Métricas POR POST ───────────────────────────────────────────────────

export interface MetricasDoPost {
  mediaId: string;
  /** FEED | REELS | STORY — decide qual set de métricas foi pedido. */
  tipo: string | null;
  /** Nome oficial da métrica → valor (reach, views, likes, saved, ...). */
  metricas: Record<string, number>;
  /** Preenchido quando ESTE post não deixou ler — os outros seguem. */
  erro: string | null;
}

// Sets vigentes por tipo de mídia (fonte oficial conferida em 04/08/2026 —
// lacuna declarada na cartilha). REELS tem métrica própria de tempo assistido;
// STORY não tem likes/saved e tem replies/navigation.
const METRICAS_FEED = "reach,views,likes,comments,saved,shares,total_interactions";
const METRICAS_REELS = "reach,views,likes,comments,saved,shares,total_interactions,ig_reels_avg_watch_time";
const METRICAS_STORY = "reach,views,replies,shares,total_interactions,navigation,profile_visits";

function metricasParaTipo(tipo: string | null): string {
  if (tipo === "REELS") return METRICAS_REELS;
  if (tipo === "STORY") return METRICAS_STORY;
  return METRICAS_FEED;
}

/** Teto de posts por chamada: cada post custa até 2 GETs. */
export const LIMITE_DE_POSTS_COM_METRICAS = 25;

/**
 * Métricas dos posts pedidos, tolerante a falha individual: post sem permissão
 * ou sem métrica (ex.: criado antes da conta virar profissional) entra na
 * lista com `erro`, sem derrubar o lote. Token morto derruba o lote inteiro —
 * insistir post a post com token recusado é rajada de erro no rate limit.
 */
export async function lerMetricasDosPosts(
  workspaceId: string,
  clientId: string,
  mediaIds: string[],
): Promise<ResultadoDeLeitura<{ posts: MetricasDoPost[] }>> {
  const conta = await contaDoCliente(workspaceId, clientId);
  if ("ok" in conta) return conta;

  const ids = [...new Set(mediaIds.filter(Boolean))].slice(0, LIMITE_DE_POSTS_COM_METRICAS);
  const chave = `posts:${conta.conexao.id}:${[...ids].sort().join(",")}`;
  const emCache = doCache<{ posts: MetricasDoPost[] }>(chave);
  if (emCache) return { ok: true, ...emCache };

  const posts: MetricasDoPost[] = [];
  for (const mediaId of ids) {
    const item: MetricasDoPost = { mediaId, tipo: null, metricas: {}, erro: null };
    try {
      const media = await graphGet<{ media_product_type?: string }>(mediaId, conta.token, {
        fields: "media_product_type",
      });
      item.tipo = media.media_product_type ?? null;

      const r = await graphGet<RespostaDeInsights>(`${mediaId}/insights`, conta.token, {
        metric: metricasParaTipo(item.tipo),
      });
      for (const m of r.data ?? []) {
        const v = m.values?.[0]?.value ?? m.total_value?.value;
        if (typeof v === "number") item.metricas[m.name] = v;
      }
    } catch (e) {
      const f = frasearErroDeLeitura(e);
      // Token morto: parar já — os próximos N posts falhariam igual.
      if (f.precisaReconectar) return comoErro(e, conta.conexao.id);
      item.erro = f.error;
    }
    posts.push(item);
  }

  guardarNoCache(chave, { posts });
  return { ok: true, posts };
}
