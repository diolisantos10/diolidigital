// leitura.ts — A CAMADA DE LEITURA da Meta. SÓ GET, nenhuma escrita. SERVER-ONLY.
//
// Existe por dois pedidos do CEO (04/08/2026): o dashboard com métricas REAIS
// por cliente, e a agência LER o Instagram do cliente (posts, estilo) antes de
// produzir. Como é leitura pura, a trava de plataforma não é acionada — mas as
// regras de ritmo valem do mesmo jeito: o rate limit de Insights/Instagram é
// por CONTA e por caso de uso (BUC), e estourar num endpoint bloqueia todos
// (docs/plataformas/meta/fontes/graph-api-limites-de-taxa.md). Daí o cache —
// e, desde 04/08/2026, daí também o TETO DE CHAMADAS POR CONEXÃO POR HORA:
// `desde`/`ate` vêm da query, cada janela distinta fura o cache, e varrer
// janelas era rajada de GET na mesma conta — a assinatura exata do que
// restringiu a conta da agência em 03/08 (fontes/integridade-da-conta.md).
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
  ritmoPorConexao.clear();
}

// ─── Teto de ritmo por conexão ──────────────────────────────────────────────
// O cache sozinho NÃO protege: `desde`/`ate` vêm da query e cada janela distinta
// é miss garantido. Varrer 30 janelas numa conta é ~90 GETs em segundos — a
// assinatura exata do que restringiu a conta da agência em 03/08/2026
// ("automação que não segue nossas regras"; fontes/integridade-da-conta.md).
// Por isso existe um teto DURO de chamadas à Graph por conexão por hora, que
// não depende do cache ter acertado.

/** Chamadas à Graph que uma conexão pode gastar por hora. Um dashboard inteiro
 *  com métricas por post custa ~28; o teto deixa passar o uso humano e barra a
 *  varredura de máquina. */
export const TETO_DE_CHAMADAS_POR_HORA = 200;

/** A frase que a UI mostra quando o teto estoura. */
export const FRASE_DO_TETO = "a Meta limitou nosso ritmo — tente daqui a pouco";

const ritmoPorConexao = new Map<string, { hora: number; gastas: number }>();

/** Reserva `custo` chamadas para a conexão nesta hora. `false` = estourou.
 *  Reserva ANTES de chamar: contar depois deixaria a rajada acontecer. */
function reservarChamadas(connectionId: string, custo: number): boolean {
  const hora = Math.floor(Date.now() / 3_600_000);
  const atual = ritmoPorConexao.get(connectionId);
  const contador = atual && atual.hora === hora ? atual : { hora, gastas: 0 };
  ritmoPorConexao.set(connectionId, contador);
  if (contador.gastas + custo > TETO_DE_CHAMADAS_POR_HORA) return false;
  contador.gastas += custo;
  return true;
}

function erroDeTeto(): ErroDeLeitura {
  return { ok: false, error: FRASE_DO_TETO };
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

  // Custo: uma chamada por página de 25.
  if (!reservarChamadas(conta.conexao.id, Math.ceil(limite / TAMANHO_DA_PAGINA))) return erroDeTeto();

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
    /** reach do período. O SIGNIFICADO depende de `alcanceOrigem` — leia lá
     *  antes de rotular isto na tela. */
    alcance: number | null;
    /** views — a métrica que SUBSTITUIU impressions (descontinuada v22.0). */
    visualizacoes: number | null;
    /** accounts_engaged — contas que interagiram. */
    contasComEngajamento: number | null;
    /** total_interactions — curtidas+comentários+salvos+compart.+respostas. */
    interacoes: number | null;
  };
  /**
   * De ONDE veio `totais.alcance`. Sem isto o número é ambíguo, e a ambiguidade
   * já produziu um relatório errado:
   *   `unicas_no_periodo` → `reach` com metric_type=total_value: contas ÚNICAS,
   *      deduplicadas na janela inteira. É o número honesto.
   *   `soma_diaria`       → a Meta não devolveu o total; somamos a série diária.
   *      Somar 28 dias conta a MESMA pessoa até 28 vezes: NÃO é "contas únicas".
   *   `null`              → não medi.
   */
  alcanceOrigem: "unicas_no_periodo" | "soma_diaria" | null;
  /** O rótulo EXATO que a tela deve usar para `totais.alcance`. Vem do servidor
   *  de propósito: quem calcula o número é quem sabe como chamá-lo. */
  rotuloDoAlcance: string;
  /** Diária, SÓ de alcance: `reach` é a única métrica de conta com
   *  metric_type=time_series na API vigente. As demais só têm total. */
  serie: PontoDaSerie[];
  /** Ressalva honesta quando algo foi medido parcialmente. */
  aviso?: string;
}

/** Os rótulos possíveis para `totais.alcance`. A UI NÃO deve inventar o dela. */
export const ROTULO_DO_ALCANCE = {
  unicas_no_periodo: "Contas únicas alcançadas no período",
  soma_diaria: "Soma do alcance diário (repete quem viu em mais de um dia)",
  naoMedido: "Alcance (não medido)",
} as const;

/** A Meta recusa janelas de insights de conta maiores que 30 dias. */
const JANELA_MAXIMA_DIAS = 30;

function dataISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function emSegundos(dataAAAA_MM_DD: string, fimDoDia = false): number {
  return Math.floor(Date.parse(`${dataAAAA_MM_DD}T${fimDoDia ? "23:59:59" : "00:00:00"}.000Z`) / 1000);
}
function diasEntre(desde: string, ate: string): number {
  return Math.round((Date.parse(ate) - Date.parse(desde)) / 86_400_000) + 1;
}

/**
 * A janela pedida, reduzida a uma FORMA CANÔNICA antes de virar chave de cache.
 *
 * A chave do cache é composta com o resultado disto — e é o que impede que
 * `?ate=2027-01-01`, `?ate=2027-01-02`, ... virem N misses e N rajadas de GET
 * numa conta que a Meta já pontua por ritmo.
 *
 * Três normalizações, todas honestas:
 *   1. tudo cai no bucket DIÁRIO (hora/fuso descartados);
 *   2. janela invertida é desinvertida em vez de virar uma janela vazia nova;
 *   3. `ate` no futuro vira hoje — a Meta não tem dado de amanhã, e deixar o
 *      futuro passar é criar chave de cache infinita de graça.
 * A janela ainda é aparada em 30 dias (teto da Meta) logo depois.
 */
export function normalizarJanela(
  janela: { desde?: string; ate?: string },
  hoje: Date = new Date(),
): { desde: string; ate: string; avisos: string[] } {
  const avisos: string[] = [];
  const hojeISO = dataISO(hoje);
  const dia = (v: string | undefined): string | null => {
    if (!v) return null;
    const t = Date.parse(v.length > 10 ? v : `${v}T00:00:00.000Z`);
    return Number.isFinite(t) ? dataISO(new Date(t)) : null;
  };

  let ate = dia(janela.ate) ?? hojeISO;
  if (ate > hojeISO) ate = hojeISO;
  let desde = dia(janela.desde) ?? dataISO(new Date(Date.parse(ate) - 27 * 86_400_000));
  if (desde > ate) [desde, ate] = [ate, desde];

  if (diasEntre(desde, ate) > JANELA_MAXIMA_DIAS) {
    const desdePedido = desde;
    desde = dataISO(new Date(Date.parse(ate) - (JANELA_MAXIMA_DIAS - 1) * 86_400_000));
    avisos.push(`a Meta só permite janelas de ${JANELA_MAXIMA_DIAS} dias — medi de ${desde} a ${ate} (pedido: desde ${desdePedido})`);
  }
  return { desde, ate, avisos };
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

  // Janela: canônica (bucket diário) ANTES da chave de cache; nunca mais que
  // 30 dias (teto da Meta).
  const { desde, ate, avisos: avisosDeJanela } = normalizarJanela(janela);

  const chave = `conta:${conta.conexao.id}:${desde}:${ate}`;
  const emCache = doCache<MetricasDaConta>(chave);
  if (emCache) return { ok: true, ...emCache };

  // Custo: perfil + série + totais = 3 chamadas.
  if (!reservarChamadas(conta.conexao.id, 3)) return erroDeTeto();

  const resultado: MetricasDaConta = {
    perfil: { seguidores: null, totalDePosts: null },
    periodo: { desde, ate },
    totais: { alcance: null, visualizacoes: null, contasComEngajamento: null, interacoes: null },
    alcanceOrigem: null,
    rotuloDoAlcance: ROTULO_DO_ALCANCE.naoMedido,
    serie: [],
    ...(avisosDeJanela.length > 0 ? { aviso: avisosDeJanela.join("; ") } : {}),
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

  const avisos: string[] = [...avisosDeJanela];
  const params = { period: "day", since: emSegundos(desde), until: emSegundos(ate, true) };
  const diasDaJanela = diasEntre(desde, ate);

  let serieLida = false;
  // 2. A série de alcance — `reach` é a única métrica de conta com time_series.
  //    Ela serve ao GRÁFICO. O total NÃO sai daqui quando dá para pedir o
  //    total_value: somar reach diário conta a mesma pessoa uma vez por dia.
  try {
    const r = await graphGet<RespostaDeInsights>(`${conta.igUserId}/insights`, conta.token, {
      ...params, metric: "reach", metric_type: "time_series",
    });
    const valores = r.data?.find((m) => m.name === "reach")?.values ?? [];
    resultado.serie = valores
      .filter((v) => typeof v.value === "number")
      .map((v) => ({ data: (v.end_time ?? "").slice(0, 10), alcance: v.value as number }));
    serieLida = true;
  } catch (e) {
    const f = frasearErroDeLeitura(e);
    if (f.precisaReconectar) return comoErro(e, conta.conexao.id);
    avisos.push(`alcance não medido: ${f.error}`);
  }

  // 3. Os totais. `reach` entra AQUI com metric_type=total_value — conferido na
  //    referência oficial de IG User Insights em 04/08/2026 (a biblioteca local
  //    tem LACUNA declarada neste ponto, item 6 da cartilha): `reach` aceita
  //    total_value E time_series; as demais, só total_value. Custa ZERO chamada
  //    extra (mesmo GET) e devolve o número deduplicado do período.
  try {
    const r = await graphGet<RespostaDeInsights>(`${conta.igUserId}/insights`, conta.token, {
      ...params, metric: "reach,views,accounts_engaged,total_interactions", metric_type: "total_value",
    });
    for (const m of r.data ?? []) {
      const v = m.total_value?.value ?? m.values?.[0]?.value;
      if (typeof v !== "number") continue;
      if (m.name === "reach") {
        resultado.totais.alcance = v;
        resultado.alcanceOrigem = "unicas_no_periodo";
      }
      if (m.name === "views") resultado.totais.visualizacoes = v;
      if (m.name === "accounts_engaged") resultado.totais.contasComEngajamento = v;
      if (m.name === "total_interactions") resultado.totais.interacoes = v;
    }
  } catch (e) {
    const f = frasearErroDeLeitura(e);
    if (f.precisaReconectar) return comoErro(e, conta.conexao.id);
    avisos.push(`visualizações/engajamento não medidos: ${f.error}`);
  }

  // 4. Sem total deduplicado, a soma da série é o que sobra — mas ela vira um
  //    número com OUTRO significado, e isso viaja no `alcanceOrigem` para não
  //    ser comparado com um mês medido na outra base.
  if (resultado.totais.alcance === null && resultado.serie.length > 0) {
    resultado.totais.alcance = resultado.serie.reduce((s, p) => s + p.alcance, 0);
    resultado.alcanceOrigem = "soma_diaria";
  }
  resultado.rotuloDoAlcance = resultado.alcanceOrigem
    ? ROTULO_DO_ALCANCE[resultado.alcanceOrigem]
    : ROTULO_DO_ALCANCE.naoMedido;

  // 5. A série mentia por omissão: conta pequena recebe 6 de 28 dias e o
  //    gráfico (e, na origem `soma_diaria`, o próprio total) passava como se
  //    fosse o período inteiro. Dia sem dado agora é dito.
  //    (quando a chamada da série falhou, o aviso do erro já foi dado acima —
  //    repetir a cobertura aqui seria dizer duas vezes a mesma coisa)
  if (serieLida && resultado.serie.length < diasDaJanela) {
    avisos.push(`alcance medido em ${resultado.serie.length} de ${diasDaJanela} dias do período`);
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

  // Custo: 2 chamadas por post (tipo da mídia + insights).
  if (!reservarChamadas(conta.conexao.id, ids.length * 2)) return erroDeTeto();

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
