// ads-leitura.ts — A LEITURA ANALÍTICA DA MARKETING API. SÓ GET. SERVER-ONLY.
//
// Pedido do CEO em 06/08/2026, verbatim: "conectar as contas de anúncio da
// Meta, de qualquer cliente. Pra gente tirar dados... preciso de leitura,
// analítica dos dados, prioridade máxima agora é o que está com campanha na
// meta rolando."
//
// `ads.ts` já lia UMA campanha por vez (`lerDesempenho`), com quatro métricas e
// sem nenhuma noção de "isto está queimando dinheiro". Este arquivo é a camada
// que responde a pergunta do CEO — e ele é SÓ LEITURA: nenhuma função aqui
// escreve, ativa, pausa ou cria. As únicas operações declaradas são
// `listar_contas`, `ler_campanha` e `ler_desempenho`, todas de 1 ponto no
// catálogo de `travas.ts`.
//
// ─── POR QUE 2 CHAMADAS POR CONTA, E NÃO 1 POR CAMPANHA ─────────────────────
//
// O jeito ingênuo (listar campanhas e pedir /insights de cada uma) custa
// 1 + N pontos na conta. Com 30 campanhas ativas isso é 31 pontos de um teto de
// 48 (`cota-de-anuncios.ts`) — uma conta, uma leitura, e a cota da casa já
// estaria na metade. A própria Meta ensina o contrário:
//
//   "Use a borda /insights diretamente com objetos de anúncio de nível mais
//    baixo... use primeiro a consulta no nível da conta para consultar a lista
//    de números de identificação de objetos de nível mais baixo com os
//    parâmetros level ou filtering."
//     curl -G -d 'level=campaign' \
//       -d 'filtering=[{field:"ad.impressions",operator:"GREATER_THAN",value:0}]' \
//       'https://graph.facebook.com/.../act_<ACCOUNT_ID>/insights'
//   (fonte: docs/plataformas/meta/fontes/marketing-api-insights-limites.md,
//    capturado em 06/08/2026)
//
// Com `level=campaign` na borda da CONTA, o desempenho de TODAS as campanhas
// vem numa chamada só. Custo por conta: 2 pontos (campanhas + insights) em vez
// de 1 + N. Nas 9 contas ativas de hoje, a leitura inteira da agência custa 19
// pontos — e eles caem em 9 baldes diferentes, porque a cota da Meta é POR
// CONTA DE ANÚNCIOS. Nenhuma conta passa de 2 de 48.
//
// ─── POR QUE CPM, CPC E CTR SÃO CALCULADOS AQUI ─────────────────────────────
//
// A biblioteca desta casa tem LACUNA DECLARADA no dicionário de métricas do
// Insights: `marketing-api-insights-metricas` e `-parametros` FALHARAM na
// captura de 06/08/2026 (páginas SPA que não hidratam; ver o fim da cartilha),
// e a tentativa de conferir ao vivo em 06/08/2026 devolveu a mesma casca. Ou
// seja: os nomes `cpm`, `cpc`, `ctr` e `cost_per_action_type` NÃO estão
// atestados por fonte capturada.
//
// Pedir campo cujo nome não conferimos é apostar a chamada inteira: campo
// desconhecido devolve erro 100 e derruba a leitura da conta toda. Então esta
// casa pede só o que ESTÁ atestado — `spend`, `impressions`, `reach`,
// `frequency`, `clicks`, `actions`, `objective` — e CALCULA CPM/CPC/CTR/custo
// por resultado por aritmética. É o mesmo princípio de `cpcBRL` em `ads.ts`
// ("calculado aqui — nunca estimado"), e tem um efeito colateral bom: número
// derivado não muda de significado quando a Meta renomeia uma métrica.
//
// ─── A REGRA MAIOR: "NÃO MEDI" NUNCA VIRA "DEU ZERO" ────────────────────────
//
// Campo ausente na resposta vira `null`, não `0`. Conta sem campanha ativa vira
// `semCampanhaAtiva: true`, não uma lista vazia que parece desempenho zerado.
// Objetivo cujo resultado a Meta não devolveu entra em `naoMedido` com o motivo
// escrito. Num relatório de tráfego pago, confundir as duas coisas é o erro
// mais caro que existe.

import { graphGet, GraphApiError } from "./graph";
import { loadConnectionToken } from "./connections";
import { TIPO_DE_RITMO_DA_CASA } from "./ritmo";
import { filtrarAutorizados, ativoAutorizado, FRASE_SEM_AUTORIZACAO, normalizarId } from "./ativos-autorizados";

// ─── Contrato de erro (o mesmo de ads.ts, para a casa ter um vocabulário) ────

export interface ResultadoDeLeituraPaga<T> {
  ok: boolean;
  dados?: T;
  erro?: string;
  motivo?:
    | "sem_permissao"
    | "sem_conexao"
    | "erro_da_meta"
    | "ritmo"
    | "sem_dado"
    /** A lista de contas autorizadas está vazia, ou a conta pedida não está
     *  nela. NÃO é erro e NÃO é "sem dado": é a trava fazendo o trabalho. */
    | "sem_autorizacao";
}

function traduzirErro<T>(e: unknown): ResultadoDeLeituraPaga<T> {
  if (e instanceof GraphApiError) {
    const msg = e.detail?.message ?? e.message;
    if (e.detail?.type === TIPO_DE_RITMO_DA_CASA) return { ok: false, motivo: "ritmo", erro: msg };
    if (/permission|ads_management|ads_read|not authorized|requires/i.test(msg)) {
      return {
        ok: false,
        motivo: "sem_permissao",
        erro: "A Meta não liberou a leitura de anúncios para este acesso (ads_read). Depende do App Review — não é erro de configuração.",
      };
    }
    return { ok: false, motivo: "erro_da_meta", erro: msg };
  }
  return { ok: false, motivo: "erro_da_meta", erro: e instanceof Error ? e.message : "erro desconhecido" };
}

/** A Meta devolve número como string. Ausente = `null` = NÃO MEDI. */
function num(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function arredondar(v: number, casas = 2): number {
  const f = Math.pow(10, casas);
  return Math.round(v * f) / f;
}

// ─── 1. As contas de anúncio que o acesso alcança ───────────────────────────

/** Status da conta, conforme a referência oficial (fonte:
 *  fontes/marketing-api-referencia-conta-de-anuncios.md). */
export const STATUS_DA_CONTA: Record<number, string> = {
  1: "ativa",
  2: "desativada",
  3: "não quitada",
  7: "em análise de risco",
  8: "aguardando pagamento",
  9: "em período de carência",
  100: "em processo de encerramento",
  101: "encerrada",
};

/** Motivo da desativação (mesma fonte). O `1` é o do incidente de 03/08/2026. */
export const MOTIVO_DA_DESATIVACAO: Record<number, string> = {
  0: "nenhum",
  1: "política de integridade de anúncios",
  2: "análise de propriedade intelectual",
  3: "risco de pagamento",
  4: "encerramento de conta cinza",
  5: "análise de AFC",
  6: "integridade do negócio (RAR)",
  7: "encerramento permanente",
  8: "conta de revendedor sem uso",
  9: "conta sem uso",
};

export interface ContaDeAnuncioLida {
  /** "act_123456". */
  id: string;
  nome: string;
  /** A moeda DA CONTA. Não presuma BRL: o token do CEO alcança 14 contas e
   *  somar gasto de moedas diferentes é relatório errado com cara de certo. */
  moeda: string;
  status: number;
  statusTexto: string;
  ativa: boolean;
  /** Preenchido só quando a conta NÃO está ativa e a Meta disse o porquê. */
  motivoDaDesativacao: string | null;
  /** Gasto acumulado da conta, na moeda dela. `null` = a Meta não devolveu. */
  gastoAcumulado: number | null;
  /** Teto de gasto da conta, quando existe. */
  tetoDeGasto: number | null;
  fusoHorario: string | null;
}

/** Campos pedidos na conta. Todos ATESTADOS na referência capturada — nenhum
 *  nome de campo entra aqui por memória. */
const CAMPOS_DA_CONTA =
  "id,account_id,name,currency,account_status,disable_reason,amount_spent,spend_cap,timezone_name";

/**
 * As contas de anúncio do acesso. Uma chamada, todas as contas.
 *
 * `amount_spent` e `spend_cap` vêm em CENTAVOS da moeda da conta na Marketing
 * API — convertidos aqui para a unidade da moeda, uma vez só, para nenhum
 * chamador ter que lembrar disso.
 */
export async function lerContasDeAnuncio(
  workspaceId: string,
  connectionId: string,
): Promise<ResultadoDeLeituraPaga<ContaDeAnuncioLida[]>> {
  const conn = await loadConnectionToken(workspaceId, connectionId);
  if (!conn) return { ok: false, motivo: "sem_conexao", erro: "Conexão Meta não encontrada ou token inválido" };

  try {
    const r = await graphGet<{ data?: Array<Record<string, unknown>> }>(
      "me/adaccounts", conn.token,
      { fields: CAMPOS_DA_CONTA, limit: 100 },
      { operacao: "listar_contas" },
    );
    const alcancadas = (r.data ?? []).map(normalizarConta);
    // "O acesso não alcança nada" ≠ "o cliente não autorizou nada". Duas ações
    // diferentes para quem lê a tela; misturar as duas é esconder qual é.
    if (alcancadas.length === 0) {
      return { ok: false, motivo: "sem_dado", erro: "Este acesso não alcança nenhuma conta de anúncio." };
    }

    // ── A TRAVA (06/08/2026) ────────────────────────────────────────────────
    // `me/adaccounts` devolve o que o TOKEN alcança. Em 06/08/2026 isso foram
    // 14 contas do CEO num clique dado no portal da Foocci. O que sobe daqui é
    // só o que o DONO DESTE TOKEN marcou — e o dono é derivado da própria linha
    // de conexão (`conn.clientId`), nunca de um parâmetro do chamador.
    const { autorizados, recusados, listaVazia } = await filtrarAutorizados(
      workspaceId, conn.clientId, "ad_account", alcancadas, (c) => c.id,
    );

    if (listaVazia) {
      // Fail-closed: sem lista, NENHUMA conta é lida. E a mensagem diz o que
      // falta fazer, em vez de "nenhuma conta encontrada" — que faria o
      // operador concluir que o cliente não tem contas de anúncio.
      return { ok: false, motivo: "sem_autorizacao", erro: FRASE_SEM_AUTORIZACAO };
    }
    if (autorizados.length === 0) {
      return {
        ok: false,
        motivo: "sem_autorizacao",
        erro: `Este acesso alcança ${recusados.length} conta(s) de anúncio, e nenhuma delas está na lista autorizada pelo cliente. Nada foi lido.`,
      };
    }
    return { ok: true, dados: autorizados };
  } catch (e) {
    return traduzirErro(e);
  }
}

/**
 * O QUE O TOKEN ALCANÇA — cru, sem filtro. **Só para a tela de escolha do
 * PRÓPRIO DONO da conta.**
 *
 * Existe porque o cliente precisa ver a lista para poder marcar o que libera —
 * e essa é a única situação em que "tudo o que o token alcança" pode aparecer
 * numa tela: quem está olhando é o dono das contas, vendo as contas dele.
 *
 * ⚠️ NUNCA chamar isto de rota da agência, de motor de execução ou de
 * relatório. O caminho da agência é `lerContasDeAnuncio`, que filtra.
 */
export async function lerContasQueOAcessoAlcanca(
  workspaceId: string,
  connectionId: string,
): Promise<ResultadoDeLeituraPaga<ContaDeAnuncioLida[]>> {
  const conn = await loadConnectionToken(workspaceId, connectionId);
  if (!conn) return { ok: false, motivo: "sem_conexao", erro: "Conexão Meta não encontrada ou token inválido" };
  try {
    const r = await graphGet<{ data?: Array<Record<string, unknown>> }>(
      "me/adaccounts", conn.token,
      { fields: CAMPOS_DA_CONTA, limit: 100 },
      { operacao: "listar_contas" },
    );
    return { ok: true, dados: (r.data ?? []).map(normalizarConta) };
  } catch (e) {
    return traduzirErro(e);
  }
}

/** A frase de recusa de uma conta específica. Uma só, para o teste poder
 *  afirmar sobre ela e para a tela nunca improvisar. */
export function fraseDeContaNaoAutorizada(contaId: string): string {
  return `A conta ${contaId} não está na lista de contas que o cliente autorizou. Nada foi lido dela.`;
}

/**
 * A conferência que roda ANTES de qualquer chamada dirigida a uma conta.
 *
 * Está aqui, e não na rota, porque rota nova é exatamente o caminho que o
 * incidente de 06/08/2026 provou existir: `lerCampanhasAtivas` e
 * `lerDesempenhoDaConta` recebem `contaId` como argumento e qualquer chamador
 * pode inventar um. A trava tem que morar onde a chamada à Meta nasce.
 */
async function contaLiberada(
  workspaceId: string,
  clientId: string | null,
  contaId: string,
): Promise<boolean> {
  return ativoAutorizado(workspaceId, clientId, "ad_account", contaId);
}

export function normalizarConta(bruto: Record<string, unknown>): ContaDeAnuncioLida {
  const status = num(bruto.account_status) ?? 0;
  const motivo = num(bruto.disable_reason);
  const centavos = (v: unknown): number | null => {
    const n = num(v);
    return n === null ? null : arredondar(n / 100);
  };
  return {
    id: String(bruto.id ?? ""),
    nome: typeof bruto.name === "string" && bruto.name ? bruto.name : String(bruto.id ?? ""),
    moeda: typeof bruto.currency === "string" ? bruto.currency : "BRL",
    status,
    statusTexto: STATUS_DA_CONTA[status] ?? `status ${status} (a Meta não documenta este código na nossa fonte)`,
    ativa: status === 1,
    motivoDaDesativacao:
      status !== 1 && motivo !== null && motivo !== 0
        ? MOTIVO_DA_DESATIVACAO[motivo] ?? `código ${motivo}`
        : null,
    gastoAcumulado: centavos(bruto.amount_spent),
    tetoDeGasto: centavos(bruto.spend_cap),
    fusoHorario: typeof bruto.timezone_name === "string" ? bruto.timezone_name : null,
  };
}

// ─── 2. As campanhas ATIVAS da conta ────────────────────────────────────────

export interface CampanhaAtiva {
  id: string;
  nome: string;
  /** OUTCOME_TRAFFIC, OUTCOME_LEADS, ... (enum atestado em
   *  fontes/marketing-api-referencia-campanha.md). */
  objetivo: string | null;
  /** ACTIVE | WITH_ISSUES | IN_PROCESS — o que a Meta REALMENTE está fazendo.
   *  `WITH_ISSUES` é campanha ligada com anúncio reprovado: verba parada de pé. */
  statusEfetivo: string | null;
  orcamentoDiario: number | null;
  orcamentoTotal: number | null;
  criadaEm: string | null;
  comecouEm: string | null;
}

/** `effective_status` que contam como "rodando agora" (enum atestado:
 *  {ACTIVE, PAUSED, DELETED, ARCHIVED, IN_PROCESS, WITH_ISSUES}). */
export const STATUS_QUE_RODAM = ["ACTIVE", "WITH_ISSUES", "IN_PROCESS"];

const CAMPOS_DA_CAMPANHA =
  "id,name,objective,effective_status,daily_budget,lifetime_budget,created_time,start_time";

/**
 * As campanhas que a Meta considera no ar. O filtro vai na CHAMADA
 * (`effective_status`), não no nosso laço: filtrar depois é pedir a conta
 * inteira e jogar fora — mais linhas, mais chance de estourar o limite de dados
 * por chamada (erro 100/1487534, fontes/marketing-api-insights-limites.md).
 */
export async function lerCampanhasAtivas(
  workspaceId: string,
  connectionId: string,
  contaId: string,
): Promise<ResultadoDeLeituraPaga<CampanhaAtiva[]>> {
  const conn = await loadConnectionToken(workspaceId, connectionId);
  if (!conn) return { ok: false, motivo: "sem_conexao", erro: "Conexão Meta não encontrada ou token inválido" };

  // Trava ANTES da rede: conta fora da lista nem é perguntada à Meta. Barrar
  // depois de ler já teria deixado o dado passar pelo processo — e, com a cota
  // por conta contada no banco, teria gravado a linha de cota daquela conta.
  if (!(await contaLiberada(workspaceId, conn.clientId, contaId))) {
    return { ok: false, motivo: "sem_autorizacao", erro: fraseDeContaNaoAutorizada(normalizarId("ad_account", contaId)) };
  }

  try {
    const r = await graphGet<{ data?: Array<Record<string, unknown>> }>(
      `${contaId}/campaigns`, conn.token,
      {
        fields: CAMPOS_DA_CAMPANHA,
        effective_status: JSON.stringify(STATUS_QUE_RODAM),
        limit: 200,
      },
      { operacao: "ler_campanha", conta: contaId },
    );
    return { ok: true, dados: (r.data ?? []).map(normalizarCampanha) };
  } catch (e) {
    return traduzirErro(e);
  }
}

export function normalizarCampanha(bruto: Record<string, unknown>): CampanhaAtiva {
  const centavos = (v: unknown): number | null => {
    const n = num(v);
    return n === null ? null : arredondar(n / 100);
  };
  return {
    id: String(bruto.id ?? ""),
    nome: typeof bruto.name === "string" && bruto.name ? bruto.name : String(bruto.id ?? ""),
    objetivo: typeof bruto.objective === "string" ? bruto.objective : null,
    statusEfetivo: typeof bruto.effective_status === "string" ? bruto.effective_status : null,
    orcamentoDiario: centavos(bruto.daily_budget),
    orcamentoTotal: centavos(bruto.lifetime_budget),
    criadaEm: typeof bruto.created_time === "string" ? bruto.created_time : null,
    comecouEm: typeof bruto.start_time === "string" ? bruto.start_time : null,
  };
}

// ─── 3. O desempenho de TODAS as campanhas, numa chamada ────────────────────

/**
 * Qual ação da Meta é "o resultado" de cada objetivo, em ordem de preferência.
 *
 * ⚠️ HONESTIDADE SOBRE A FONTE: `post_engagement`, `link_click`, `comment`,
 * `like` e `post_reaction` estão atestados em
 * fontes/marketing-api-insights-recortes.md. Os demais nomes
 * (`lead`, `purchase`, `onsite_conversion.*`, `offsite_conversion.*`) NÃO estão
 * na biblioteca — o dicionário de métricas do Insights é lacuna declarada.
 *
 * Por isso esta tabela não é usada para PEDIR campo à Meta (o que quebraria a
 * chamada se o nome estivesse errado): ela é usada para ESCOLHER, dentro do
 * array `actions` que a Meta devolveu, qual linha é o resultado. Nome que não
 * existe simplesmente não casa, e o resultado sai `null` com o motivo escrito —
 * nunca zero.
 */
export const RESULTADO_POR_OBJETIVO: Record<string, string[]> = {
  OUTCOME_LEADS: ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead", "leadgen_grouped"],
  LEAD_GENERATION: ["lead", "leadgen_grouped", "onsite_conversion.lead_grouped"],
  OUTCOME_SALES: ["purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase"],
  CONVERSIONS: ["purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase"],
  PRODUCT_CATALOG_SALES: ["purchase", "offsite_conversion.fb_pixel_purchase"],
  OUTCOME_TRAFFIC: ["link_click"],
  LINK_CLICKS: ["link_click"],
  OUTCOME_ENGAGEMENT: [
    "onsite_conversion.messaging_conversation_started_7d",
    "onsite_conversion.total_messaging_connection",
    "post_engagement",
  ],
  MESSAGES: ["onsite_conversion.messaging_conversation_started_7d", "onsite_conversion.total_messaging_connection"],
  POST_ENGAGEMENT: ["post_engagement"],
  EVENT_RESPONSES: ["rsvp", "event_response"],
  PAGE_LIKES: ["like", "page_engagement"],
  VIDEO_VIEWS: ["video_view"],
  OUTCOME_APP_PROMOTION: ["mobile_app_install", "app_install"],
  APP_INSTALLS: ["mobile_app_install", "app_install"],
  STORE_VISITS: ["store_visit"],
};

/** Objetivos em que o resultado NÃO é uma ação: é o próprio alcance.
 *  Pedir "custo por lead" de campanha de alcance é inventar métrica. */
export const OBJETIVOS_DE_ALCANCE = ["OUTCOME_AWARENESS", "BRAND_AWARENESS", "REACH", "LOCAL_AWARENESS"];

export interface DesempenhoDaCampanha {
  campanhaId: string;
  nome: string;
  objetivo: string | null;
  /** Na moeda DA CONTA. `null` = a Meta não devolveu. */
  gasto: number | null;
  impressoes: number | null;
  alcance: number | null;
  /** Quantas vezes, em média, a mesma pessoa viu. Acima de 3 é criativo cansado
   *  (limiar da CASA — ver `FREQUENCIA_DE_ALERTA`). */
  frequencia: number | null;
  cliques: number | null;
  /** Calculados aqui: gasto/impressões×1000, gasto/cliques, cliques/impressões. */
  cpm: number | null;
  cpc: number | null;
  ctrPct: number | null;
  /** O resultado do objetivo, quando a Meta devolveu uma ação que casa. */
  resultado: { tipo: string; quantidade: number } | null;
  custoPorResultado: number | null;
  /** TUDO que veio em `actions`, para ninguém precisar confiar só no nosso mapa. */
  acoes: Record<string, number>;
  /** O que a Meta NÃO devolveu, com o motivo. Nunca vira zero. */
  naoMedido: string[];
}

const CAMPOS_DO_INSIGHTS = "campaign_id,campaign_name,objective,spend,impressions,reach,frequency,clicks,actions";

/**
 * O desempenho de todas as campanhas da conta no período. UMA chamada.
 *
 * `level=campaign` na borda da conta é o padrão que a própria Meta ensina
 * (fontes/marketing-api-insights-limites.md). O `time_range` é explícito em vez
 * de `date_preset` porque o relatório precisa dizer QUAL janela mediu — "últimos
 * 30 dias" muda de significado conforme o dia em que alguém abre a tela.
 */
export async function lerDesempenhoDaConta(
  workspaceId: string,
  connectionId: string,
  contaId: string,
  periodo: { desde: string; ate: string },
): Promise<ResultadoDeLeituraPaga<DesempenhoDaCampanha[]>> {
  const conn = await loadConnectionToken(workspaceId, connectionId);
  if (!conn) return { ok: false, motivo: "sem_conexao", erro: "Conexão Meta não encontrada ou token inválido" };

  // Mesma trava do `campaigns`: derivada do dono do token, antes da rede.
  if (!(await contaLiberada(workspaceId, conn.clientId, contaId))) {
    return { ok: false, motivo: "sem_autorizacao", erro: fraseDeContaNaoAutorizada(normalizarId("ad_account", contaId)) };
  }

  try {
    const r = await graphGet<{ data?: Array<Record<string, unknown>> }>(
      `${contaId}/insights`, conn.token,
      {
        level: "campaign",
        fields: CAMPOS_DO_INSIGHTS,
        time_range: JSON.stringify({ since: periodo.desde, until: periodo.ate }),
        limit: 200,
      },
      { operacao: "ler_desempenho", conta: contaId },
    );
    return { ok: true, dados: (r.data ?? []).map(normalizarDesempenho) };
  } catch (e) {
    return traduzirErro(e);
  }
}

export function normalizarDesempenho(bruto: Record<string, unknown>): DesempenhoDaCampanha {
  const naoMedido: string[] = [];
  const gasto = num(bruto.spend);
  const impressoes = num(bruto.impressions);
  const alcance = num(bruto.reach);
  const cliques = num(bruto.clicks);
  const objetivo = typeof bruto.objective === "string" ? bruto.objective : null;

  if (gasto === null) naoMedido.push("a Meta não devolveu o gasto deste período");
  if (impressoes === null) naoMedido.push("a Meta não devolveu impressões");
  if (alcance === null) naoMedido.push("a Meta não devolveu alcance");

  const acoes: Record<string, number> = {};
  const lista = Array.isArray(bruto.actions) ? (bruto.actions as Array<Record<string, unknown>>) : null;
  if (lista) {
    for (const a of lista) {
      const tipo = typeof a.action_type === "string" ? a.action_type : null;
      const v = num(a.value);
      if (tipo && v !== null) acoes[tipo] = v;
    }
  }

  const item: DesempenhoDaCampanha = {
    campanhaId: String(bruto.campaign_id ?? ""),
    nome: typeof bruto.campaign_name === "string" ? bruto.campaign_name : String(bruto.campaign_id ?? ""),
    objetivo,
    gasto,
    impressoes,
    alcance,
    frequencia: num(bruto.frequency),
    cliques,
    // Derivados. Divisão por zero vira `null` (não medi), nunca Infinity.
    cpm: gasto !== null && impressoes ? arredondar((gasto / impressoes) * 1000) : null,
    cpc: gasto !== null && cliques ? arredondar(gasto / cliques) : null,
    ctrPct: impressoes && cliques !== null ? arredondar((cliques / impressoes) * 100) : null,
    resultado: null,
    custoPorResultado: null,
    acoes,
    naoMedido,
  };

  // O resultado do objetivo.
  if (objetivo && OBJETIVOS_DE_ALCANCE.includes(objetivo)) {
    if (alcance !== null) item.resultado = { tipo: "alcance", quantidade: alcance };
  } else {
    const preferidas = objetivo ? RESULTADO_POR_OBJETIVO[objetivo] ?? [] : [];
    const casou = preferidas.find((t) => acoes[t] !== undefined);
    if (casou) {
      item.resultado = { tipo: casou, quantidade: acoes[casou] };
    } else if (!lista) {
      naoMedido.push("a Meta não devolveu ações (`actions`) — sem isso não há resultado nem custo por resultado");
    } else if (!objetivo) {
      naoMedido.push("a campanha não declarou objetivo — não dá para dizer qual ação é 'o resultado'");
    } else if (preferidas.length === 0) {
      naoMedido.push(`objetivo "${objetivo}" não está no mapa de resultados desta casa — ações recebidas: ${Object.keys(acoes).join(", ") || "nenhuma"}`);
    } else {
      naoMedido.push(`a Meta não devolveu nenhuma ação de "${preferidas[0]}" para o objetivo ${objetivo} — ações recebidas: ${Object.keys(acoes).join(", ") || "nenhuma"}`);
    }
  }

  if (item.resultado && item.resultado.quantidade > 0 && gasto !== null) {
    item.custoPorResultado = arredondar(gasto / item.resultado.quantidade);
  }
  return item;
}

// ─── 4. A ANÁLISE — o veredito, com o número que o sustenta ─────────────────
//
// ⚠️ OS LIMIARES ABAIXO SÃO ESCOLHA DESTA CASA, NÃO NÚMERO DA META. Estão
// declarados como constantes exportadas de propósito: número de julgamento que
// mora escondido no meio de um `if` é opinião disfarçada de dado.

/** Frequência média a partir da qual o criativo é tratado como cansado. */
export const FREQUENCIA_DE_ALERTA = 3;

/** Quantas vezes acima da mediana da conta o custo por resultado precisa estar
 *  para ser chamado de "fora da curva". */
export const MULTIPLO_FORA_DA_CURVA = 2;

/** E abaixo de quanto da mediana ele vira candidato a escalar. */
export const FRACAO_PARA_ESCALAR = 0.7;

/** Gasto mínimo no período para uma campanha merecer veredito. Abaixo disso o
 *  número é ruído: 3 cliques não provam nem sucesso nem fracasso. */
export const GASTO_MINIMO_PARA_JULGAR = 20;

export type TipoDeAchado = "queima" | "escala" | "ativo_indevido" | "lacuna";

export interface Achado {
  tipo: TipoDeAchado;
  campanhaId: string | null;
  /** A frase em linguagem de negócio. */
  frase: string;
  /** O número que sustenta a frase. Achado sem número não entra. */
  numero: number | null;
  /** Quanto se economiza (queima) ou quanto já está funcionando (escala), na
   *  moeda da conta. `null` quando não dá para estimar honestamente. */
  emJogo: number | null;
}

export interface PanoramaDaConta {
  conta: ContaDeAnuncioLida;
  periodo: { desde: string; ate: string };
  /** true = a conta não tem NENHUMA campanha no ar. Não é "gastou zero". */
  semCampanhaAtiva: boolean;
  campanhas: CampanhaAtiva[];
  desempenho: DesempenhoDaCampanha[];
  totais: { gasto: number | null; impressoes: number | null; alcance: number | null; cliques: number | null };
  achados: Achado[];
  /** A recomendação da conta, uma frase, sempre ancorada num número. */
  recomendacao: string;
  /** O que não deu para ler, e por quê. Vazio quando leu tudo. */
  lacunas: string[];
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : arredondar((v[meio - 1] + v[meio]) / 2);
}

/**
 * O veredito da conta. FUNÇÃO PURA: recebe o que a Meta devolveu e devolve a
 * análise, sem tocar em rede. É de propósito — é a parte que precisa estar
 * certa e que dá para testar sem gastar um centavo de ninguém.
 */
export function analisarConta(entrada: {
  conta: ContaDeAnuncioLida;
  periodo: { desde: string; ate: string };
  campanhas: CampanhaAtiva[];
  desempenho: DesempenhoDaCampanha[];
  lacunas?: string[];
}): PanoramaDaConta {
  const { conta, periodo, campanhas, desempenho } = entrada;
  const lacunas = [...(entrada.lacunas ?? [])];
  const achados: Achado[] = [];

  const soma = (f: (d: DesempenhoDaCampanha) => number | null): number | null => {
    const vs = desempenho.map(f).filter((v): v is number => v !== null);
    return vs.length === 0 ? null : arredondar(vs.reduce((a, b) => a + b, 0));
  };
  const totais = {
    gasto: soma((d) => d.gasto),
    impressoes: soma((d) => d.impressoes),
    alcance: soma((d) => d.alcance),
    cliques: soma((d) => d.cliques),
  };

  // Conta sem campanha no ar é um ESTADO, não desempenho zero.
  if (campanhas.length === 0) {
    return {
      conta, periodo, semCampanhaAtiva: true, campanhas, desempenho, totais, achados,
      recomendacao: conta.ativa
        ? "Sem campanha ativa no período — não há o que otimizar aqui, e nada está gastando."
        : `Conta ${conta.statusTexto}${conta.motivoDaDesativacao ? ` (${conta.motivoDaDesativacao})` : ""} — não é possível veicular até a Meta liberar.`,
      lacunas,
    };
  }

  // Campanha ligada que NÃO apareceu no insights: está no ar e não entregou.
  const comDado = new Set(desempenho.map((d) => d.campanhaId));
  for (const c of campanhas) {
    if (comDado.has(c.id)) continue;
    achados.push({
      tipo: "ativo_indevido",
      campanhaId: c.id,
      frase: `"${c.nome}" está ligada e a Meta não devolveu NENHUMA linha de desempenho no período — ou não entregou nada, ou está presa em análise (status ${c.statusEfetivo ?? "?"}).`,
      numero: c.orcamentoDiario,
      emJogo: null,
    });
  }

  // Campanha com pendência: verba de pé, anúncio parado.
  for (const c of campanhas.filter((c) => c.statusEfetivo === "WITH_ISSUES")) {
    achados.push({
      tipo: "ativo_indevido",
      campanhaId: c.id,
      frase: `"${c.nome}" está ATIVA com pendência na Meta (WITH_ISSUES) — normalmente anúncio reprovado. Verba alocada sem entrega.`,
      numero: c.orcamentoDiario,
      emJogo: c.orcamentoDiario !== null ? arredondar(c.orcamentoDiario * 30) : null,
    });
  }

  // A comparação de custo por resultado só vale DENTRO do mesmo tipo de
  // resultado: comparar custo por lead com custo por clique é conta errada com
  // aparência de análise.
  const porTipo = new Map<string, DesempenhoDaCampanha[]>();
  for (const d of desempenho) {
    if (!d.resultado || d.custoPorResultado === null) continue;
    if ((d.gasto ?? 0) < GASTO_MINIMO_PARA_JULGAR) continue;
    const lista = porTipo.get(d.resultado.tipo) ?? [];
    lista.push(d);
    porTipo.set(d.resultado.tipo, lista);
  }

  for (const [tipo, lista] of porTipo) {
    const med = mediana(lista.map((d) => d.custoPorResultado as number));
    if (med === null || med <= 0 || lista.length < 2) continue;
    for (const d of lista) {
      const custo = d.custoPorResultado as number;
      if (custo >= med * MULTIPLO_FORA_DA_CURVA) {
        // O que se economiza trazendo esta campanha para a mediana da conta.
        const desperdicio = arredondar((d.gasto as number) - med * (d.resultado as { quantidade: number }).quantidade);
        achados.push({
          tipo: "queima",
          campanhaId: d.campanhaId,
          frase: `"${d.nome}" paga ${conta.moeda} ${custo} por ${tipo}, ${arredondar(custo / med)}× a mediana da conta (${conta.moeda} ${med}). Gastou ${conta.moeda} ${d.gasto} no período.`,
          numero: custo,
          emJogo: desperdicio > 0 ? desperdicio : null,
        });
      } else if (custo <= med * FRACAO_PARA_ESCALAR) {
        achados.push({
          tipo: "escala",
          campanhaId: d.campanhaId,
          frase: `"${d.nome}" entrega ${tipo} a ${conta.moeda} ${custo}, ${arredondar((1 - custo / med) * 100)}% abaixo da mediana da conta (${conta.moeda} ${med}), com ${(d.resultado as { quantidade: number }).quantidade} resultados. É onde a verba rende mais.`,
          numero: custo,
          emJogo: d.gasto,
        });
      }
    }
  }

  // Gastou e não produziu resultado nenhum.
  for (const d of desempenho) {
    if ((d.gasto ?? 0) < GASTO_MINIMO_PARA_JULGAR) continue;
    if (d.resultado === null) {
      achados.push({
        tipo: "lacuna",
        campanhaId: d.campanhaId,
        frase: `"${d.nome}" gastou ${conta.moeda} ${d.gasto} e a Meta não devolveu resultado atribuível ao objetivo ${d.objetivo ?? "(não declarado)"} — não é "zero resultado", é resultado NÃO MEDIDO. ${d.naoMedido[d.naoMedido.length - 1] ?? ""}`.trim(),
        numero: d.gasto,
        emJogo: null,
      });
    } else if (d.resultado.quantidade === 0) {
      achados.push({
        tipo: "queima",
        campanhaId: d.campanhaId,
        frase: `"${d.nome}" gastou ${conta.moeda} ${d.gasto} e produziu ZERO ${d.resultado.tipo} no período.`,
        numero: d.gasto,
        emJogo: d.gasto,
      });
    }
  }

  // Criativo cansado.
  for (const d of desempenho) {
    if (d.frequencia !== null && d.frequencia >= FREQUENCIA_DE_ALERTA && (d.gasto ?? 0) >= GASTO_MINIMO_PARA_JULGAR) {
      achados.push({
        tipo: "queima",
        campanhaId: d.campanhaId,
        frase: `"${d.nome}" está com frequência ${d.frequencia} — a mesma pessoa viu o anúncio ${Math.round(d.frequencia)}× no período. Criativo cansado: o custo sobe sozinho daqui para frente.`,
        numero: d.frequencia,
        emJogo: null,
      });
    }
  }

  return {
    conta, periodo, semCampanhaAtiva: false, campanhas, desempenho, totais, achados,
    recomendacao: recomendarPara(conta, totais, achados, desempenho),
    lacunas,
  };
}

function recomendarPara(
  conta: ContaDeAnuncioLida,
  totais: PanoramaDaConta["totais"],
  achados: Achado[],
  desempenho: DesempenhoDaCampanha[],
): string {
  const queima = achados.filter((a) => a.tipo === "queima").sort((a, b) => (b.emJogo ?? 0) - (a.emJogo ?? 0));
  const escala = achados.filter((a) => a.tipo === "escala");
  const parado = achados.filter((a) => a.tipo === "ativo_indevido");
  const gasto = totais.gasto;

  if (gasto === null) {
    return "A Meta não devolveu gasto para este período — sem esse número não há recomendação honesta a dar.";
  }
  if (gasto === 0) {
    return `${desempenho.length} campanha(s) no ar e ${conta.moeda} 0 gasto no período: a conta está ligada e não entrega. Conferir orçamento, público e status dos anúncios antes de qualquer otimização.`;
  }
  if (queima.length > 0 && queima[0].emJogo !== null) {
    const total = arredondar(queima.reduce((s, a) => s + (a.emJogo ?? 0), 0));
    return `PAUSAR o que está fora da curva: ${conta.moeda} ${total} dos ${conta.moeda} ${gasto} gastos no período estão em campanha com custo por resultado acima do dobro da mediana ou sem resultado nenhum. Maior ofensora: ${queima[0].frase}`;
  }
  if (parado.length > 0) {
    return `Nada queimando de forma clara, mas ${parado.length} campanha(s) estão ligadas sem entregar. Resolver a pendência ou desligar antes de pôr mais verba.`;
  }
  if (escala.length > 0) {
    return `Conta saudável: ${conta.moeda} ${gasto} no período sem custo fora da curva. ${escala[0].frase} Escalar aqui é a decisão de maior retorno — com aumento gradual, e a ativação/aumento continua sendo decisão humana (travas.ts).`;
  }
  return `${conta.moeda} ${gasto} gastos no período em ${desempenho.length} campanha(s), sem campanha fora da curva nem candidata clara a escalar. Manter e reavaliar com mais período medido.`;
}

// ─── 5. A leitura da agência inteira ────────────────────────────────────────

export interface PanoramaDaAgencia {
  periodo: { desde: string; ate: string };
  totalDeContas: number;
  contasAtivas: number;
  contasComCampanhaAtiva: number;
  contas: PanoramaDaConta[];
  /** Contas que existem mas não foram lidas, e o motivo de cada uma. */
  naoLidas: Array<{ conta: string; nome: string; motivo: string }>;
  /** Pontos de cota gastos nesta leitura, por conta. Diagnóstico honesto. */
  pontosGastos: number;
}

/** A janela padrão do pedido do CEO: últimos 30 dias, fechados em ontem — o dia
 *  corrente ainda está consolidando na Meta e entra sempre subestimado. */
export function ultimos30Dias(hoje: Date = new Date()): { desde: string; ate: string } {
  const dia = (d: Date): string => d.toISOString().slice(0, 10);
  const ate = new Date(hoje.getTime() - 86_400_000);
  const desde = new Date(ate.getTime() - 29 * 86_400_000);
  return { desde: dia(desde), ate: dia(ate) };
}

/**
 * A leitura completa: todas as contas ATIVAS, campanhas no ar e desempenho.
 *
 * ─── O RITMO, QUE AQUI É O ASSUNTO PRINCIPAL ───────────────────────────────
 * Custo: 1 chamada para listar as contas (balde do token) + 2 por conta ativa
 * (balde DAQUELA conta). Com 9 contas ativas: 19 pontos no total, nunca mais de
 * 2 na mesma conta — de um teto de 48 por conta por 300s (`cota-de-anuncios.ts`).
 *
 * As contas são lidas EM SÉRIE, nunca em paralelo. Não é medo de estourar a
 * cota (2 de 48 não estoura): é que 18 GETs disparados no mesmo instante são
 * uma RAJADA, e foi rajada — não estouro de cota — que restringiu a conta da
 * agência em 03/08/2026 ("automação que não segue nossas regras"). A porta
 * única (`graph.ts` → `ritmo.ts`) já espaça; o `for` sequencial é o que garante
 * que ela consiga espaçar.
 *
 * Erro numa conta NÃO derruba as outras: entra em `naoLidas` com o motivo.
 */
export async function lerPanoramaDaAgencia(
  workspaceId: string,
  connectionId: string,
  opts: { periodo?: { desde: string; ate: string }; apenasContas?: string[]; incluirInativas?: boolean } = {},
): Promise<ResultadoDeLeituraPaga<PanoramaDaAgencia>> {
  const periodo = opts.periodo ?? ultimos30Dias();

  const listagem = await lerContasDeAnuncio(workspaceId, connectionId);
  if (!listagem.ok || !listagem.dados) {
    return { ok: false, motivo: listagem.motivo, erro: listagem.erro };
  }
  const todas = listagem.dados;
  let pontos = 1;

  const alvo = todas.filter((c) => {
    if (opts.apenasContas && opts.apenasContas.length > 0) return opts.apenasContas.includes(c.id);
    return opts.incluirInativas ? true : c.ativa;
  });

  const contas: PanoramaDaConta[] = [];
  const naoLidas: PanoramaDaAgencia["naoLidas"] = [];

  // Contas não ativas que ficaram de fora entram DECLARADAS, não sumidas.
  for (const c of todas) {
    if (alvo.some((a) => a.id === c.id)) continue;
    naoLidas.push({
      conta: c.id,
      nome: c.nome,
      motivo: `conta ${c.statusTexto}${c.motivoDaDesativacao ? ` — ${c.motivoDaDesativacao}` : ""}; não veicula, não foi consultada`,
    });
  }

  for (const conta of alvo) {
    const lacunas: string[] = [];

    const campanhas = await lerCampanhasAtivas(workspaceId, connectionId, conta.id);
    pontos += 1;
    if (!campanhas.ok || !campanhas.dados) {
      naoLidas.push({ conta: conta.id, nome: conta.nome, motivo: campanhas.erro ?? "não consegui listar as campanhas" });
      // Ritmo: quando a Meta (ou a casa) freou, PARAR é a resposta certa —
      // insistir nas contas seguintes estende o bloqueio.
      if (campanhas.motivo === "ritmo") break;
      continue;
    }

    // Conta sem campanha no ar não precisa de insights: a chamada seria 1 ponto
    // gasto para receber lista vazia.
    if (campanhas.dados.length === 0) {
      contas.push(analisarConta({ conta, periodo, campanhas: [], desempenho: [], lacunas }));
      continue;
    }

    const desempenho = await lerDesempenhoDaConta(workspaceId, connectionId, conta.id, periodo);
    pontos += 1;
    if (!desempenho.ok || !desempenho.dados) {
      lacunas.push(`desempenho não lido: ${desempenho.erro ?? "a Meta não respondeu"}`);
      contas.push(analisarConta({ conta, periodo, campanhas: campanhas.dados, desempenho: [], lacunas }));
      if (desempenho.motivo === "ritmo") break;
      continue;
    }

    contas.push(analisarConta({ conta, periodo, campanhas: campanhas.dados, desempenho: desempenho.dados, lacunas }));
  }

  return {
    ok: true,
    dados: {
      periodo,
      totalDeContas: todas.length,
      contasAtivas: todas.filter((c) => c.ativa).length,
      contasComCampanhaAtiva: contas.filter((c) => !c.semCampanhaAtiva).length,
      contas,
      naoLidas,
      pontosGastos: pontos,
    },
  };
}
