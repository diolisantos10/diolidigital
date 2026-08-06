// ads.ts — MARKETING API. O único lugar da casa que gasta o dinheiro do cliente.
//
// Tudo o mais que esta agência automatiza é reversível: um post ruim se apaga,
// um texto errado se refaz, uma peça torta a Qualidade barra. Aqui não. Uma
// campanha ativa com orçamento errado gasta o dinheiro de um cliente pagante
// enquanto ninguém está olhando, e não existe "desfazer" para dinheiro gasto.
//
// Por isso este arquivo é o mais travado do repositório, e as travas são
// MECANISMO, não recomendação (regra 3 do kit: para o que causa dano real,
// exija mecanismo — prompt é sugestão):
//
//   1. TUDO NASCE PAUSADO. Nenhuma função aqui cria algo com status ACTIVE.
//      Ativar exige `ativarCampanha`, que é uma decisão registrada.
//   2. TETO DE ORÇAMENTO OBRIGATÓRIO. Toda criação recebe o teto que o cliente
//      aprovou e é conferida contra ele ANTES da chamada — a Meta não é quem
//      descobre que o número está errado.
//   3. NENHUMA IA CHEGA AQUI. Este módulo recebe números já decididos. Um
//      modelo de linguagem não escolhe orçamento nesta casa.
//
// `ads_management` e `ads_read` são permissões AVANÇADAS: sem App Review
// aprovado, a Meta recusa tudo abaixo mesmo com token válido. As funções
// devolvem esse motivo em português em vez de um erro cru da Graph.

import { graphGet, graphPost, GraphApiError } from "./graph";
import { loadConnectionToken } from "./connections";
import { TIPO_DE_RITMO_DA_CASA } from "./ritmo";

/** Teto absoluto da casa, em reais por dia, independente do que for pedido.
 *  É a última linha de defesa: se todo o resto falhar, o estrago é limitado. */
export const TETO_DIARIO_ABSOLUTO_BRL = Number(process.env.ADS_TETO_DIARIO_BRL ?? 500);

/** Piso da Meta para orçamento diário. Abaixo disto a campanha nem entrega. */
export const PISO_DIARIO_BRL = 6;

export interface ResultadoDeAnuncio<T = unknown> {
  ok: boolean;
  dados?: T;
  erro?: string;
  /** `sem_permissao` = App Review pendente. É o caso mais comum, e é do CEO.
   *  `ritmo` = a CASA freou antes de a Meta reclamar (ver ritmo.ts). Não é
   *  defeito nem falta de permissão: é a trava de 03/08 funcionando. */
  motivo?: "sem_permissao" | "sem_conta" | "orcamento_invalido" | "erro_da_meta" | "sem_conexao" | "ritmo";
}

export interface ContaDeAnuncio {
  id: string;          // "act_123456"
  nome: string;
  moeda: string;
  status: number;      // 1 = ativa
}

function traduzirErro<T>(e: unknown): ResultadoDeAnuncio<T> {
  if (e instanceof GraphApiError) {
    const msg = e.detail?.message ?? e.message;
    // Freio da casa: chega carimbado por ritmo.ts, com a frase já pronta. Vem
    // ANTES de tudo para não ser confundido com falta de permissão.
    if (e.detail?.type === TIPO_DE_RITMO_DA_CASA) {
      return { ok: false, motivo: "ritmo", erro: msg };
    }
    // A Meta responde permissão faltando de várias formas; todas significam a
    // mesma coisa para quem opera: falta o App Review.
    if (/permission|ads_management|ads_read|not authorized|requires/i.test(msg)) {
      return {
        ok: false,
        motivo: "sem_permissao",
        erro: "A Meta ainda não liberou as permissões de anúncio deste app (ads_management/ads_read). Isso depende do App Review — não é erro de configuração.",
      };
    }
    return { ok: false, motivo: "erro_da_meta", erro: msg };
  }
  return { ok: false, motivo: "erro_da_meta", erro: e instanceof Error ? e.message : "erro desconhecido" };
}

/** As contas de anúncio que o token alcança. É o primeiro passo de qualquer
 *  gestão de tráfego: sem conta, não há onde criar nada. */
export async function listarContasDeAnuncio(
  workspaceId: string,
  connectionId: string,
): Promise<ResultadoDeAnuncio<ContaDeAnuncio[]>> {
  const conn = await loadConnectionToken(workspaceId, connectionId);
  if (!conn) return { ok: false, motivo: "sem_conexao", erro: "Conexão Meta não encontrada ou token inválido" };

  try {
    const r = await graphGet<{ data?: Array<{ id: string; name?: string; currency?: string; account_status?: number }> }>(
      "me/adaccounts", conn.token, { fields: "id,name,currency,account_status", limit: 50 },
      { operacao: "listar_contas" },
    );
    const contas = (r.data ?? []).map((c) => ({
      id: c.id, nome: c.name ?? c.id, moeda: c.currency ?? "BRL", status: c.account_status ?? 0,
    }));
    if (contas.length === 0) {
      return { ok: false, motivo: "sem_conta", erro: "Nenhuma conta de anúncio encontrada nesta conexão. O cliente precisa dar acesso à conta de anúncios dele." };
    }
    return { ok: true, dados: contas };
  } catch (e) {
    return traduzirErro(e);
  }
}

export interface PlanoDeCampanha {
  /** "act_..." — a conta de anúncio do CLIENTE. */
  contaId: string;
  nome: string;
  /** O que a campanha persegue. Mapeado para o objetivo da Meta. */
  objetivo: "trafego" | "alcance" | "engajamento" | "conversas" | "leads";
  /** Reais por dia. Conferido contra `tetoAprovadoBRL` E contra o teto da casa. */
  orcamentoDiarioBRL: number;
  /** O teto que o CLIENTE aprovou, por escrito. Sem ele não se cria nada. */
  tetoAprovadoBRL: number;
}

const OBJETIVO_META: Record<PlanoDeCampanha["objetivo"], string> = {
  trafego: "OUTCOME_TRAFFIC",
  alcance: "OUTCOME_AWARENESS",
  engajamento: "OUTCOME_ENGAGEMENT",
  conversas: "OUTCOME_ENGAGEMENT",
  leads: "OUTCOME_LEADS",
};

/**
 * Confere o orçamento ANTES de qualquer chamada. Determinístico, sem rede.
 *
 * Separado de propósito: é a única parte que precisa estar certa mesmo se a
 * Meta mudar, se o token vencer ou se a rede cair — e a única que dá para
 * testar sem tocar em dinheiro de ninguém.
 */
export function conferirOrcamento(plano: {
  orcamentoDiarioBRL: number;
  tetoAprovadoBRL: number;
}): { ok: boolean; erro?: string } {
  const v = plano.orcamentoDiarioBRL;
  if (!Number.isFinite(v) || v <= 0) {
    return { ok: false, erro: "orçamento diário inválido" };
  }
  if (v < PISO_DIARIO_BRL) {
    return { ok: false, erro: `orçamento diário de R$ ${v} está abaixo do mínimo da Meta (R$ ${PISO_DIARIO_BRL}) — a campanha não entregaria` };
  }
  if (!Number.isFinite(plano.tetoAprovadoBRL) || plano.tetoAprovadoBRL <= 0) {
    return { ok: false, erro: "não há teto aprovado pelo cliente — sem isso não se cria campanha" };
  }
  if (v > plano.tetoAprovadoBRL) {
    return { ok: false, erro: `orçamento diário de R$ ${v} passa do teto que o cliente aprovou (R$ ${plano.tetoAprovadoBRL})` };
  }
  if (v > TETO_DIARIO_ABSOLUTO_BRL) {
    return { ok: false, erro: `orçamento diário de R$ ${v} passa do teto desta agência (R$ ${TETO_DIARIO_ABSOLUTO_BRL})` };
  }
  return { ok: true };
}

/**
 * Cria a campanha — SEMPRE PAUSADA.
 *
 * `status: "PAUSED"` é literal e não é parâmetro. Uma campanha criada ativa por
 * um processo automático é dinheiro do cliente saindo sem que ninguém tenha
 * dito "pode ir".
 */
export async function criarCampanhaPausada(
  workspaceId: string,
  connectionId: string,
  plano: PlanoDeCampanha,
): Promise<ResultadoDeAnuncio<{ campaignId: string }>> {
  const conferido = conferirOrcamento(plano);
  if (!conferido.ok) return { ok: false, motivo: "orcamento_invalido", erro: conferido.erro };

  const conn = await loadConnectionToken(workspaceId, connectionId);
  if (!conn) return { ok: false, motivo: "sem_conexao", erro: "Conexão Meta não encontrada ou token inválido" };

  try {
    const r = await graphPost<{ id: string }>(`${plano.contaId}/campaigns`, conn.token, {
      name: plano.nome.slice(0, 200),
      objective: OBJETIVO_META[plano.objetivo],
      status: "PAUSED",
      special_ad_categories: "[]",
      // Orçamento na campanha (CBO): a Meta distribui entre os conjuntos e o
      // teto vale para o todo. Orçamento por conjunto multiplicaria o gasto
      // pelo número de conjuntos — o jeito mais fácil de estourar sem perceber.
      daily_budget: String(Math.round(plano.orcamentoDiarioBRL * 100)), // centavos
    }, { operacao: "criar_campanha_pausada", conta: plano.contaId });
    return { ok: true, dados: { campaignId: r.id } };
  } catch (e) {
    return traduzirErro(e);
  }
}

export interface PublicoDoConjunto {
  /** Cidade em texto — a Meta resolve para o id dela. Ex.: "Campinas, SP". */
  cidade: string | null;
  /** Raio em km ao redor da cidade. O caso do padeiro é 5 km, não o Brasil. */
  raioKm: number;
  idadeMin: number;
  idadeMax: number;
  /** Ids de interesse da Meta, já resolvidos. Vazio = sem segmentação por
   *  interesse, que é melhor do que segmentar por um palpite. */
  interesses: Array<{ id: string; name: string }>;
}

/** Raio máximo. Acima disto não é "o bairro do padeiro" — é dinheiro jogado em
 *  gente que nunca vai atravessar a cidade para comprar pão. */
export const RAIO_MAX_KM = 50;
export const RAIO_MIN_KM = 1;

/**
 * Resolve uma cidade em id da Meta. Sem chute: se a Meta não encontrar, a
 * segmentação geográfica é OMITIDA e o conjunto entrega no país inteiro — o que
 * o chamador precisa saber, e por isso o retorno diz quando não achou.
 */
export async function buscarCidade(
  workspaceId: string,
  connectionId: string,
  termo: string,
): Promise<ResultadoDeAnuncio<{ key: string; name: string }>> {
  const conn = await loadConnectionToken(workspaceId, connectionId);
  if (!conn) return { ok: false, motivo: "sem_conexao", erro: "Conexão Meta não encontrada" };
  try {
    const r = await graphGet<{ data?: Array<{ key: string; name: string; country_code?: string }> }>(
      "search", conn.token,
      { type: "adgeolocation", location_types: '["city"]', q: termo.slice(0, 100), limit: 5 },
      { operacao: "buscar_cidade" },
    );
    const br = r.data?.find((c) => c.country_code === "BR") ?? r.data?.[0];
    if (!br) return { ok: false, motivo: "sem_conta", erro: `A Meta não conhece a cidade "${termo}"` };
    return { ok: true, dados: { key: br.key, name: br.name } };
  } catch (e) {
    return traduzirErro(e);
  }
}

/** Interesses reais da Meta a partir de palavras do briefing. Só entra no
 *  conjunto o que a Meta confirmou existir — interesse inventado é rejeitado
 *  pela API e derruba a criação inteira. */
export async function buscarInteresses(
  workspaceId: string,
  connectionId: string,
  termos: string[],
): Promise<Array<{ id: string; name: string }>> {
  const conn = await loadConnectionToken(workspaceId, connectionId);
  if (!conn) return [];
  const achados: Array<{ id: string; name: string }> = [];
  for (const termo of termos.slice(0, 5)) {
    try {
      const r = await graphGet<{ data?: Array<{ id: string; name: string }> }>(
        "search", conn.token, { type: "adinterest", q: termo.slice(0, 80), limit: 1 },
        { operacao: "buscar_interesse" },
      );
      const i = r.data?.[0];
      if (i && !achados.some((a) => a.id === i.id)) achados.push({ id: i.id, name: i.name });
    } catch { /* um termo que a Meta não conhece simplesmente não entra */ }
  }
  return achados;
}

/**
 * Cria o CONJUNTO DE ANÚNCIOS — pausado, como tudo aqui.
 *
 * Sem conjunto, a campanha não entrega nada: ela é só um envelope com verba.
 * Foi exatamente o buraco do raio-X de 02/08/2026 — a casa criava a campanha,
 * dizia "tráfego pago pronto", e nada rodava.
 *
 * O orçamento NÃO vai aqui. Ele mora na campanha (CBO) de propósito: orçamento
 * por conjunto multiplica o gasto pelo número de conjuntos, e é o jeito mais
 * fácil de estourar o teto sem ninguém perceber.
 */
export async function criarConjuntoPausado(
  workspaceId: string,
  connectionId: string,
  input: {
    contaId: string;
    campaignId: string;
    nome: string;
    objetivo: PlanoDeCampanha["objetivo"];
    publico: PublicoDoConjunto;
    /** Id da página do Facebook — obrigatório para os objetivos de conversa. */
    pageId?: string;
  },
): Promise<ResultadoDeAnuncio<{ adSetId: string; segmentouGeografia: boolean }>> {
  const conn = await loadConnectionToken(workspaceId, connectionId);
  if (!conn) return { ok: false, motivo: "sem_conexao", erro: "Conexão Meta não encontrada" };

  const p = input.publico;
  const raio = Math.max(RAIO_MIN_KM, Math.min(RAIO_MAX_KM, Math.round(p.raioKm || 10)));

  let geo: Record<string, unknown> = { countries: ["BR"] };
  let segmentouGeografia = false;
  if (p.cidade) {
    const cidade = await buscarCidade(workspaceId, connectionId, p.cidade);
    if (cidade.ok && cidade.dados) {
      geo = { cities: [{ key: cidade.dados.key, radius: raio, distance_unit: "kilometer" }] };
      segmentouGeografia = true;
    }
    // Cidade não resolvida: cai no país. Não inventamos coordenada.
  }

  const targeting: Record<string, unknown> = {
    geo_locations: geo,
    age_min: Math.max(18, Math.min(65, p.idadeMin || 18)),
    age_max: Math.max(18, Math.min(65, p.idadeMax || 65)),
    ...(p.interesses.length > 0
      ? { flexible_spec: [{ interests: p.interesses.map((i) => ({ id: i.id, name: i.name })) }] }
      : {}),
  };

  const corpo: Record<string, string> = {
    name: input.nome.slice(0, 200),
    campaign_id: input.campaignId,
    status: "PAUSED",
    billing_event: "IMPRESSIONS",
    optimization_goal: METAS[input.objetivo],
    targeting: JSON.stringify(targeting),
  };
  if (input.objetivo === "conversas" && input.pageId) {
    corpo.destination_type = "MESSENGER";
    corpo.promoted_object = JSON.stringify({ page_id: input.pageId });
  }

  try {
    const r = await graphPost<{ id: string }>(`${input.contaId}/adsets`, conn.token, corpo,
      { operacao: "criar_conjunto_pausado", conta: input.contaId });
    return { ok: true, dados: { adSetId: r.id, segmentouGeografia } };
  } catch (e) {
    return traduzirErro(e);
  }
}

const METAS: Record<PlanoDeCampanha["objetivo"], string> = {
  trafego: "LINK_CLICKS",
  alcance: "REACH",
  engajamento: "POST_ENGAGEMENT",
  conversas: "CONVERSATIONS",
  leads: "LEAD_GENERATION",
};

/**
 * Cria o ANÚNCIO: o criativo e o anúncio que o aponta. Pausado.
 *
 * `imagemUrl` precisa ser alcançável pelos servidores da Meta — é o mesmo link
 * assinado que a publicação orgânica usa.
 */
export async function criarAnuncioPausado(
  workspaceId: string,
  connectionId: string,
  input: {
    contaId: string;
    adSetId: string;
    pageId: string;
    nome: string;
    imagemUrl: string;
    /** Texto principal — o que aparece acima da imagem. */
    texto: string;
    titulo: string;
    descricao?: string;
    /** Para onde o clique leva. Sem destino não há tráfego a comprar. */
    link: string;
    cta?: string;
  },
): Promise<ResultadoDeAnuncio<{ adId: string; creativeId: string }>> {
  const conn = await loadConnectionToken(workspaceId, connectionId);
  if (!conn) return { ok: false, motivo: "sem_conexao", erro: "Conexão Meta não encontrada" };
  if (!input.imagemUrl || !input.link) {
    return { ok: false, motivo: "orcamento_invalido", erro: "anúncio sem imagem ou sem destino não é anúncio" };
  }

  try {
    const criativo = await graphPost<{ id: string }>(`${input.contaId}/adcreatives`, conn.token, {
      name: `${input.nome} — criativo`.slice(0, 200),
      object_story_spec: JSON.stringify({
        page_id: input.pageId,
        link_data: {
          picture: input.imagemUrl,
          link: input.link,
          message: input.texto.slice(0, 2000),
          name: input.titulo.slice(0, 100),
          ...(input.descricao ? { description: input.descricao.slice(0, 200) } : {}),
          call_to_action: { type: CTA_VALIDOS.includes(input.cta ?? "") ? input.cta : "LEARN_MORE" },
        },
      }),
    }, { operacao: "criar_criativo", conta: input.contaId });

    const anuncio = await graphPost<{ id: string }>(`${input.contaId}/ads`, conn.token, {
      name: input.nome.slice(0, 200),
      adset_id: input.adSetId,
      creative: JSON.stringify({ creative_id: criativo.id }),
      status: "PAUSED",
    }, { operacao: "criar_anuncio_pausado", conta: input.contaId });

    return { ok: true, dados: { adId: anuncio.id, creativeId: criativo.id } };
  } catch (e) {
    return traduzirErro(e);
  }
}

/** Os CTAs que a Meta aceita e que fazem sentido para os clientes desta casa.
 *  Lista fechada: CTA inválido derruba a criação inteira do criativo. */
export const CTA_VALIDOS = [
  "LEARN_MORE", "SHOP_NOW", "BOOK_TRAVEL", "CONTACT_US", "MESSAGE_PAGE",
  "WHATSAPP_MESSAGE", "CALL_NOW", "GET_QUOTE", "SIGN_UP", "SUBSCRIBE",
];

/** Sobe conjunto e anúncio para ACTIVE junto com a campanha. Uma campanha ativa
 *  com conjunto pausado não entrega — e a conta parece "ligada" para quem olha. */
export async function ativarFilhos(
  workspaceId: string,
  connectionId: string,
  ids: { adSetId?: string | null; adId?: string | null; contaId?: string },
): Promise<void> {
  const conn = await loadConnectionToken(workspaceId, connectionId);
  if (!conn) return;
  for (const id of [ids.adSetId, ids.adId]) {
    if (!id) continue;
    // A operação é declarada: o catálogo (travas.ts) é o que autoriza a
    // escrita, e é dele que sai o peso de 3 pontos na cota da conta.
    await graphPost(id, conn.token, { status: "ACTIVE" }, { operacao: "ativar", conta: ids.contaId })
      .catch(() => { /* best-effort */ });
  }
}

/**
 * Ativa uma campanha. É a única função deste arquivo que faz dinheiro sair.
 *
 * Recebe `autorizadoPor` porque a ativação precisa ter dono. Uma chamada que
 * não sabe dizer quem autorizou é uma chamada que não deveria acontecer.
 */
export async function ativarCampanha(
  workspaceId: string,
  connectionId: string,
  campaignId: string,
  autorizadoPor: string,
  contaId?: string,
): Promise<ResultadoDeAnuncio<{ ativada: true }>> {
  if (!autorizadoPor?.trim()) {
    return { ok: false, motivo: "orcamento_invalido", erro: "ativação sem autorizador identificado" };
  }
  const conn = await loadConnectionToken(workspaceId, connectionId);
  if (!conn) return { ok: false, motivo: "sem_conexao", erro: "Conexão Meta não encontrada ou token inválido" };

  try {
    await graphPost(campaignId, conn.token, { status: "ACTIVE" },
      { operacao: "ativar", conta: contaId });
    return { ok: true, dados: { ativada: true } };
  } catch (e) {
    return traduzirErro(e);
  }
}

/** Pausa. Nunca falha por falta de autorização — parar de gastar é sempre
 *  permitido, e exigir cerimônia para frear é como não ter freio. */
export async function pausarCampanha(
  workspaceId: string,
  connectionId: string,
  campaignId: string,
  contaId?: string,
): Promise<ResultadoDeAnuncio<{ pausada: true }>> {
  const conn = await loadConnectionToken(workspaceId, connectionId);
  if (!conn) return { ok: false, motivo: "sem_conexao", erro: "Conexão Meta não encontrada ou token inválido" };
  try {
    await graphPost(campaignId, conn.token, { status: "PAUSED" },
      { operacao: "pausar", conta: contaId });
    return { ok: true, dados: { pausada: true } };
  } catch (e) {
    return traduzirErro(e);
  }
}

export interface DesempenhoPago {
  gastoBRL: number;
  impressoes: number;
  cliques: number;
  alcance: number;
  /** Custo por clique, calculado aqui — nunca estimado. */
  cpcBRL: number | null;
}

// ─── Cache do desempenho ────────────────────────────────────────────────────
// O motor da esteira varre as campanhas ATIVAS a cada 5 minutos e chama
// `lerDesempenho` uma vez por campanha. Com 50 campanhas isso é 600 chamadas
// por hora contra a MESMA conta de anúncios, no MESMO caso de uso — e o BUC da
// Marketing API é por conta de anúncios, compartilhado por todos os endpoints
// do caso de uso (fontes/graph-api-limites-de-taxa.md). É a assinatura exata do
// que restringiu a conta da agência em 03/08/2026.
//
// Gasto de anúncio não muda de forma útil em cinco minutos — a própria Meta
// consolida com atraso. Com 15 minutos de cache, três de cada quatro varreduras
// não tocam a rede: 50 campanhas caem de 600 para 200 chamadas/hora, folgado
// abaixo do piso de insights em development_access (600 + 400 × anúncios
// ativos por hora, mesma fonte).
//
// ⚠️ Em memória, como o cache de leitura.ts: todo deploy esvazia, e é por
// processo. Declarado aqui para não ser descoberto num e-mail de restrição.
export const TTL_DO_DESEMPENHO_MS = 15 * 60_000;
const cacheDeDesempenho = new Map<string, { validoAte: number; valor: DesempenhoPago }>();

/** Para teste e para quando a campanha muda de estado. */
export function limparCacheDeDesempenho(): void {
  cacheDeDesempenho.clear();
}

/**
 * O que a campanha gastou e rendeu. É o número que entra no relatório mensal.
 *
 * Devolve `ok: false` quando não conseguiu ler, em vez de zeros: zero gasto é
 * uma informação (a campanha não entregou); "não consegui medir" é outra.
 * Confundir as duas num relatório de tráfego pago é o erro mais caro possível.
 *
 * Passa pelo balde de `graph.ts` como todo o resto — não existe mais caminho de
 * anúncio que fale com a Meta sem ser contado.
 */
export async function lerDesempenho(
  workspaceId: string,
  connectionId: string,
  campaignId: string,
  periodo: { desde: string; ate: string },
  opts: { ignorarCache?: boolean; contaId?: string } = {},
): Promise<ResultadoDeAnuncio<DesempenhoPago>> {
  const chave = `${connectionId}:${campaignId}:${periodo.desde}:${periodo.ate}`;
  if (!opts.ignorarCache) {
    const hit = cacheDeDesempenho.get(chave);
    if (hit && hit.validoAte > Date.now()) return { ok: true, dados: hit.valor };
    if (hit) cacheDeDesempenho.delete(chave);
  }

  const conn = await loadConnectionToken(workspaceId, connectionId);
  if (!conn) return { ok: false, motivo: "sem_conexao", erro: "Conexão Meta não encontrada ou token inválido" };

  try {
    const r = await graphGet<{ data?: Array<Record<string, string>> }>(
      `${campaignId}/insights`, conn.token,
      {
        fields: "spend,impressions,clicks,reach",
        time_range: JSON.stringify({ since: periodo.desde, until: periodo.ate }),
      },
      { operacao: "ler_desempenho", conta: opts.contaId },
    );
    const linha = r.data?.[0];
    if (!linha) {
      return { ok: false, motivo: "erro_da_meta", erro: "a Meta não devolveu dados para este período" };
    }
    const gasto = Number(linha.spend ?? 0);
    const cliques = Number(linha.clicks ?? 0);
    const dados: DesempenhoPago = {
      gastoBRL: gasto,
      impressoes: Number(linha.impressions ?? 0),
      cliques,
      alcance: Number(linha.reach ?? 0),
      cpcBRL: cliques > 0 ? Number((gasto / cliques).toFixed(2)) : null,
    };
    // Só sucesso entra no cache: guardar um erro por 15 min esconderia a
    // reconexão ou a liberação da conta que acabou de acontecer.
    cacheDeDesempenho.set(chave, { validoAte: Date.now() + TTL_DO_DESEMPENHO_MS, valor: dados });
    return { ok: true, dados };
  } catch (e) {
    return traduzirErro(e);
  }
}
