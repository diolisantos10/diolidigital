// ritmo.ts — O BALDE. O controle de ritmo de TODA chamada à Meta. SERVER-ONLY.
//
// ─── POR QUE ESTE ARQUIVO EXISTE ────────────────────────────────────────────
// Em 03/08/2026 a conta de anúncios da agência (act_3416644181895443) foi
// RESTRINGIDA pela Meta com o motivo "conta criada ou usada com uma automação
// que não segue nossas regras". O gatilho não foi um limite técnico estourado:
// foi RITMO DE MÁQUINA — 36 uploads e criação/exclusão de campanha em minutos,
// numa conta que nunca tinha recebido tráfego por API.
//
// Até esta madrugada, `graph.ts` — a ÚNICA porta desta casa para a Meta — não
// tinha controle de ritmo nenhum: só um timeout de 20s. O único teto que
// existia morava em `leitura.ts`, era por processo e SÓ a leitura de métricas
// passava por ele. Publicação, anúncios, WhatsApp, descoberta e templates iam
// diretos. Este módulo é o balde que `graph.ts` consulta antes de CADA chamada,
// de qualquer caminho — inclusive os que contornavam o teto antigo.
//
// ─── AS DUAS METADES (o método) ─────────────────────────────────────────────
// Um balde que só barra é um balde que quebra o produto: dashboard aberto não
// pode virar erro. Por isso são camadas com respostas diferentes:
//
//   1. ANTI-RAJADA (curto prazo) — balde de fichas: capacidade de rajada para o
//      uso humano passar inteiro e instantâneo; acima disso as chamadas são
//      ESPAÇADAS (a chamada ESPERA, não falha). É a tradução literal do que a
//      Meta manda fazer: "Espalhe as consultas de maneira uniforme para evitar
//      picos de tráfego" (fontes/graph-api-limites-de-taxa.md, Boas práticas).
//
//   2. TETO POR HORA — acima dele a chamada FALHA na hora, sem esperar. Também
//      é regra da Meta, com todas as letras: "Quando o limite tiver sido
//      atingido, pare de fazer chamadas à API. Se você seguir fazendo chamadas,
//      a contagem delas continuará aumentando" (mesma fonte). Esperar 40 min
//      dentro de um request seria pior que falhar.
//
//   3. O QUE A META DIZ — os cabeçalhos `X-App-Usage` e
//      `X-Business-Use-Case-Usage` trazem o uso REAL em percentual e o tempo
//      estimado de bloqueio. Contar só por conta própria é adivinhar quando a
//      própria plataforma está dizendo o número. Quando a Meta diz que estamos
//      em 90%, o balde freia — mesmo que a nossa conta local esteja folgada.
//
//   4. ERRO DE LIMITE = FREIO, NÃO RETENTATIVA. Códigos 4/17/32/613 (plataforma)
//      e 80000/80001/80002/80003/80004 (BUC) bloqueiam a chave, com o tempo que
//      a própria Meta informou em `estimated_time_to_regain_access` quando ele
//      vier no cabeçalho. Retentativa só existe para 5xx/rede, com espera
//      crescente.
//
// ─── ✅ 06/08/2026 — O TETO E O FREIO SAÍRAM DA MEMÓRIA ─────────────────────
// Este cabeçalho trazia uma limitação declarada: "os contadores são MEMÓRIA DE
// PROCESSO; com N réplicas o teto efetivo na MESMA conta vira N × TETO_POR_HORA,
// e todo redeploy zera tudo". Ela está FECHADA em duas etapas:
//   • a MARKETING API já contava no banco por pontuação (`./cota-de-anuncios.ts`);
//   • agora o TETO POR HORA (camada 2) e o FREIO (camada 4) de TODA a Graph —
//     Instagram, Páginas, WhatsApp inclusive — são contados no VOLUME, em
//     `./ritmo-no-banco.ts`. Uma linha por (chave, hora), incremento atômico.
//
// O que continua em memória, de propósito, é SÓ o ESPAÇAMENTO (camada 1): ele dá
// forma à curva de UM processo, e um processo recém-subido não tem rajada em
// curso para espalhar. Fazê-lo no banco poria uma escrita por FICHA, com sono no
// caminho quente. Os porquês inteiros estão no cabeçalho de `ritmo-no-banco.ts`
// — leia lá antes de "unificar" as duas camadas.
//
// FAIL-CLOSED: banco fora do ar NEGA a chamada à Meta. Sem contador não dá para
// saber se a próxima é a 199ª ou a 201ª. Não custa disponibilidade real — o
// token da conexão também sai do banco.

import {
  reservarNaJanelaDoBanco, frearChaveNoBanco, retratoNoBanco,
} from "./ritmo-no-banco";

// ─── Os números, e a fonte de cada um ───────────────────────────────────────

/**
 * Teto de chamadas por hora, por chave.
 *
 * 200 é o MENOR piso publicado entre os casos de uso que esta casa toca, e por
 * isso é o único número que não estoura nenhum deles:
 *   • WhatsApp Business Management: "200 chamadas por hora em cada conta do
 *     WhatsApp Business (WABA)" — 5.000/h só para WABA com número registrado;
 *   • Graph API plataforma (token de app): "Calls within one hour =
 *     200 * Number of Users";
 *   • Gerenciamento de anúncios em development_access (o nosso caso hoje):
 *     "Calls within one hour = 300 + 40 * Number of Active ads" — ou seja, o
 *     piso é 300, e 200 fica ABAIXO dele de propósito;
 *   • Insights de anúncios em development_access: 600 + 400 × ativos.
 * (fonte: docs/plataformas/meta/fontes/graph-api-limites-de-taxa.md)
 *
 * O limite técnico não é a licença — é o teto de emergência. O aquecimento
 * (volume subindo ao longo de DIAS) continua sendo regra por cima disto
 * (cartilha.md, seção (a)).
 */
export const TETO_POR_HORA = 200;

/**
 * Fichas de rajada por chave: quantas chamadas passam instantaneamente antes de
 * o espaçamento entrar.
 *
 * ⚠️ LACUNA DA BIBLIOTECA, declarada: a Meta NÃO publica limite de rajada — ela
 * só manda "espalhar as consultas de maneira uniforme". Este 30 é escolha DESTA
 * CASA, calibrada pela interação humana mais cara que existe aqui: um dashboard
 * de cliente custa ~28 chamadas (perfil + série + totais + 2 por post; ver
 * leitura.ts). O objetivo é que a interação humana caiba inteira na rajada e a
 * varredura de máquina não.
 */
export const FICHAS_DE_RAJADA = 30;

/**
 * Reposição de fichas por segundo — o ESPAÇAMENTO depois que a rajada acaba.
 * Duas por segundo é ritmo de gente operando, não de laço. O teto por hora
 * continua sendo o limite que manda: 2/s só descreve a FORMA da curva
 * ("espalhe as consultas"), não o volume.
 */
export const FICHAS_POR_SEGUNDO = 2;

/**
 * Quanto uma chamada pode esperar pelo espaçamento antes de virar erro.
 * Acima disso é melhor falhar em português do que segurar um request HTTP.
 */
export const ESPERA_MAXIMA_MS = 15_000;

/**
 * Percentual de uso, lido dos cabeçalhos da Meta, a partir do qual freamos.
 * A Meta diz que a limitação acontece quando o contador "chega a 100"
 * (`call_count`, `total_time`, `total_cputime` são percentuais)
 * (fonte: fontes/graph-api-limites-de-taxa.md, seção Cabeçalhos). Freamos em 90
 * para ter margem: chegar a 100 é justamente o que não pode acontecer.
 */
export const USO_QUE_FREIA_PCT = 90;

/** Quanto tempo o freio por cabeçalho segura a chave, quando a Meta não diz o
 *  tempo dela (`estimated_time_to_regain_access` só vem no cabeçalho BUC). */
export const FREIO_POR_CABECALHO_MS = 5 * 60_000;

/** Escada do freio por ERRO de limite, em minutos, quando a Meta não informou
 *  `estimated_time_to_regain_access`. Cresce a cada erro seguido na mesma
 *  chave: insistir aumenta a contagem e estende o bloqueio (regra da Meta). */
const ESCADA_DE_FREIO_MIN = [1, 2, 5, 15, 30];

/** Códigos de limite da PLATAFORMA (fonte: graph-api-limites-de-taxa.md,
 *  "Códigos de erro de limitações"): 4 = app, 17 = usuário, 32 = Página,
 *  613 = limite customizado (subcódigo 1996 = volume inconsistente). */
export const CODIGOS_DE_LIMITE_DA_PLATAFORMA = [4, 17, 32, 613];

/** Códigos de limite de BUC (mesma fonte, "Códigos de erro" do BUC):
 *  80000 = ads_insights, 80001 = messenger, 80002 = instagram,
 *  80003 = custom_audience, 80004 = ads_management. */
export const CODIGOS_DE_LIMITE_DE_BUC = [80000, 80001, 80002, 80003, 80004];

const CODIGOS_DE_LIMITE = new Set([
  ...CODIGOS_DE_LIMITE_DA_PLATAFORMA,
  ...CODIGOS_DE_LIMITE_DE_BUC,
]);

export function ehCodigoDeLimite(code: number | undefined): boolean {
  return code !== undefined && CODIGOS_DE_LIMITE.has(code);
}

/** A chave da casa: existe para o app inteiro não virar uma rajada só porque
 *  cada cliente, sozinho, está dentro do teto dele. Só ESPAÇA (não tem teto por
 *  hora): um teto horário aqui derrubaria a agência inteira por causa de um
 *  cliente movimentado. O limite da plataforma por app é 200 × usuários/h —
 *  cresce com o uso, então o que precisa ser contido aqui é o PICO, não o total. */
export const CHAVE_DA_CASA = "__casa__";
const FICHAS_DE_RAJADA_DA_CASA = 60;
const FICHAS_POR_SEGUNDO_DA_CASA = 4;

// ─── Relógio e sono injetáveis (o teste não pode dormir de verdade) ─────────

let agora: () => number = () => Date.now();
let dormir: (ms: number) => Promise<void> = (ms) =>
  new Promise((r) => setTimeout(r, ms));

/** Só para teste: troca relógio e sono. Sem argumento, volta ao real. */
export function configurarRitmo(
  opts: { agora?: () => number; dormir?: (ms: number) => Promise<void> } = {},
): void {
  agora = opts.agora ?? (() => Date.now());
  dormir = opts.dormir ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
}

// ─── O estado ───────────────────────────────────────────────────────────────

interface Balde {
  fichas: number;
  ultimoRefil: number;
  /**
   * Freio LOCAL desta réplica.
   *
   * ⚠️ Não é a fonte de verdade — a fonte é `MetaRitmoFreio`, no banco
   * (`./ritmo-no-banco.ts`), que atravessa deploy e réplica. Este aqui existe
   * para o caso em que a gravação do freio no banco FALHA: a réplica que viu o
   * erro de limite continua freada mesmo assim. Degradação, não silêncio.
   * Ele só ADICIONA freio; nunca libera nada que o banco tenha freado.
   */
  bloqueadoAte: number;
  motivo: string;
  errosSeguidos: number;
  /** Corrente de promessas: serializa as reservas da mesma chave. Sem isto,
   *  dez chamadas simultâneas leem o mesmo saldo e passam todas. */
  fila: Promise<void>;
  ultimoUso: number;
}

const baldes = new Map<string, Balde>();

/** Último `ads_api_access_tier` que a Meta declarou nos cabeçalhos.
 *  `development_access` significa cota ~300× menor (fonte: cartilha (d)). */
let tierDeAnuncios: string | null = null;
export function tierDeAnunciosObservado(): string | null {
  return tierDeAnuncios;
}

function baldeDe(chave: string): Balde {
  let b = baldes.get(chave);
  if (!b) {
    const cheio = chave === CHAVE_DA_CASA ? FICHAS_DE_RAJADA_DA_CASA : FICHAS_DE_RAJADA;
    b = {
      fichas: cheio, ultimoRefil: agora(), bloqueadoAte: 0,
      motivo: "", errosSeguidos: 0, fila: Promise.resolve(), ultimoUso: agora(),
    };
    baldes.set(chave, b);
    podarBaldes();
  }
  b.ultimoUso = agora();
  return b;
}

/** Balde não pode virar vazamento de memória: chave sem uso há 2h some. */
function podarBaldes(): void {
  if (baldes.size < 500) return;
  const corte = agora() - 2 * 3_600_000;
  for (const [k, b] of baldes) if (b.ultimoUso < corte) baldes.delete(k);
}

/** Zera o estado EM MEMÓRIA (fichas, freio local, tier). Para teste e para
 *  depois de uma reconexão. Não toca o contador do banco de propósito: apagar a
 *  contagem da hora seria dar a rajada de volta a quem só reiniciou o processo
 *  — exatamente o defeito que tirou este contador da memória. */
export function limparRitmo(): void {
  baldes.clear();
  tierDeAnuncios = null;
}

// ─── O erro que o balde levanta ─────────────────────────────────────────────

/** Carimbo em `detail.type` para quem traduz erro saber que a trava é NOSSA, e
 *  não uma recusa da Meta. Dizer "a Meta limitou" quando fomos nós é mentira
 *  pequena que vira diagnóstico errado. */
export const TIPO_DE_RITMO_DA_CASA = "DioliRitmoDaCasa";

export interface DetalheDeRitmo {
  message: string;
  type: string;
  code: number;
  /** Minutos até liberar, quando dá para saber. */
  esperarMin?: number;
}

/** O detalhe pronto para virar `GraphApiError`. Fica aqui (e não em graph.ts)
 *  para o texto e o código morarem junto da regra que os produziu.
 *  `code: 613` = "limite de volume personalizado" — é literalmente o que é: um
 *  limite nosso, por cima do da Meta (fonte: graph-api-limites-de-taxa.md). */
export function detalheDeRitmo(motivo: string, esperarMin?: number): DetalheDeRitmo {
  return {
    message: esperarMin && esperarMin > 0
      ? `${motivo} — tente de novo em ~${esperarMin} min`
      : motivo,
    type: TIPO_DE_RITMO_DA_CASA,
    code: 613,
    ...(esperarMin ? { esperarMin } : {}),
  };
}

export class RitmoDaCasaError extends Error {
  readonly detalhe: DetalheDeRitmo;
  constructor(detalhe: DetalheDeRitmo) {
    super(detalhe.message);
    this.name = "RitmoDaCasaError";
    this.detalhe = detalhe;
  }
}

// ─── Reserva ────────────────────────────────────────────────────────────────

function repor(b: Balde, chave: string): void {
  const t = agora();
  const taxa = chave === CHAVE_DA_CASA ? FICHAS_POR_SEGUNDO_DA_CASA : FICHAS_POR_SEGUNDO;
  const teto = chave === CHAVE_DA_CASA ? FICHAS_DE_RAJADA_DA_CASA : FICHAS_DE_RAJADA;
  const decorrido = Math.max(0, t - b.ultimoRefil);
  b.fichas = Math.min(teto, b.fichas + (decorrido / 1000) * taxa);
  b.ultimoRefil = t;
}

/**
 * O ESPAÇAMENTO (camada 1) e o freio local. Memória de propósito — ver o
 * cabeçalho. O TETO POR HORA não está mais aqui: mora no banco.
 */
async function reservarUma(chave: string): Promise<void> {
  const b = baldeDe(chave);

  // Serializa as reservas DESTA chave. A corrente só protege a decisão; a
  // chamada HTTP em si continua fora dela.
  const anterior = b.fila;
  let liberar!: () => void;
  b.fila = new Promise<void>((r) => { liberar = r; });
  await anterior.catch(() => {});

  try {
    // 1. Freio LOCAL ativo: PARA. Não espera, não tenta — continuar chamando
    //    estende o bloqueio. (O freio que vale para todas as réplicas é o do
    //    banco, checado em `reservarChamadaNaGraph`; este é o de reserva.)
    if (b.bloqueadoAte > agora()) {
      const min = Math.max(1, Math.ceil((b.bloqueadoAte - agora()) / 60_000));
      throw new RitmoDaCasaError(detalheDeRitmo(b.motivo || "o ritmo com a Meta está freado", min));
    }

    // 2. Espaçamento. Aqui a chamada ESPERA em vez de falhar — é o que deixa o
    //    uso normal passar.
    repor(b, chave);
    if (b.fichas < 1) {
      const taxa = chave === CHAVE_DA_CASA ? FICHAS_POR_SEGUNDO_DA_CASA : FICHAS_POR_SEGUNDO;
      const esperaMs = Math.ceil(((1 - b.fichas) / taxa) * 1000);
      if (esperaMs > ESPERA_MAXIMA_MS) {
        throw new RitmoDaCasaError(detalheDeRitmo(
          "seguramos o ritmo com a Meta: chamadas demais ao mesmo tempo",
          Math.ceil(esperaMs / 60_000),
        ));
      }
      await dormir(esperaMs);
      repor(b, chave);
    }

    b.fichas -= 1;
  } finally {
    liberar();
  }
}

/**
 * Reserva uma chamada à Graph para `chave`. Lança `RitmoDaCasaError` quando a
 * resposta certa é PARAR. Passa (às vezes depois de esperar) quando é só ritmo.
 *
 * A ordem das três etapas é o desenho:
 *   1. ESPAÇA na chave da casa (em memória) — o app inteiro não vira um pico só;
 *   2. ESPAÇA na chave da conexão (em memória) e checa o freio local;
 *   3. RESERVA A VAGA DA HORA NO BANCO — o único contador que atravessa deploy
 *      e réplica, e que também guarda o freio.
 *
 * O passo 3 vem por último porque os dois primeiros SERIALIZAM e espalham as
 * chamadas: chegar ao banco já espaçado é o que evita dez UPDATEs simultâneos
 * na mesma linha do SQLite. Reservar depois de esperar pode "gastar" a espera
 * numa chamada que o banco vai recusar — é o lado barato do erro.
 *
 * A chave da casa NÃO tem teto por hora, e isso é decisão antiga: um teto
 * horário global derrubaria a agência inteira por causa de um cliente
 * movimentado. Ela só espaça.
 */
export async function reservarChamadaNaGraph(chave: string): Promise<void> {
  await reservarUma(CHAVE_DA_CASA);
  await reservarUma(chave);
  if (chave === CHAVE_DA_CASA) return;

  const r = await reservarNaJanelaDoBanco(chave, 1, TETO_POR_HORA);
  if (!r.ok) {
    throw new RitmoDaCasaError(
      detalheDeRitmo(r.frase, Math.max(1, Math.ceil(r.esperarSegundos / 60))),
    );
  }
}

// ─── Camada 3: o que a META diz nos cabeçalhos ──────────────────────────────

function maiorUso(entrada: Record<string, unknown>): number {
  return Math.max(
    Number(entrada.call_count ?? 0) || 0,
    Number(entrada.total_time ?? 0) || 0,
    Number(entrada.total_cputime ?? 0) || 0,
  );
}

function frear(chave: string, ms: number, motivo: string): void {
  const b = baldeDe(chave);
  const ate = agora() + ms;
  if (ate > b.bloqueadoAte) {
    b.bloqueadoAte = ate;
    b.motivo = motivo;
  }
}

/** Leitura pública dos cabeçalhos, exposta para teste e diagnóstico. */
export interface UsoDeclaradoPelaMeta {
  /** Maior percentual de uso visto (call_count / total_time / total_cputime). */
  usoPct: number;
  /** Minutos até recuperar acesso, quando a Meta informa (só no BUC). */
  esperarMin: number;
  /** `development_access` | `standard_access`, quando vier. */
  tier: string | null;
}

export function lerUsoDosCabecalhos(headers: Headers): UsoDeclaradoPelaMeta {
  const resultado: UsoDeclaradoPelaMeta = { usoPct: 0, esperarMin: 0, tier: null };

  // X-App-Usage: um objeto plano com percentuais do APP.
  const app = headers.get("x-app-usage");
  if (app) {
    try {
      const o = JSON.parse(app) as Record<string, unknown>;
      resultado.usoPct = Math.max(resultado.usoPct, maiorUso(o));
    } catch { /* cabeçalho ilegível não pode derrubar a chamada */ }
  }

  // X-Business-Use-Case-Usage: mapa business-id → lista de entradas por tipo
  // (ads_insights, ads_management, instagram, pages, ...). Pode trazer até 32
  // objetos numa chamada (fonte: graph-api-limites-de-taxa.md, Cabeçalhos).
  const buc = headers.get("x-business-use-case-usage");
  if (buc) {
    try {
      const mapa = JSON.parse(buc) as Record<string, Array<Record<string, unknown>>>;
      for (const entradas of Object.values(mapa)) {
        for (const e of entradas ?? []) {
          resultado.usoPct = Math.max(resultado.usoPct, maiorUso(e));
          const espera = Number(e.estimated_time_to_regain_access ?? 0) || 0;
          if (espera > resultado.esperarMin) resultado.esperarMin = espera;
          const tier = e.ads_api_access_tier;
          if (typeof tier === "string" && tier) resultado.tier = tier;
        }
      }
    } catch { /* idem */ }
  }

  // X-Ad-Account-Usage: formato antigo (API de Anúncios ≤ 3.3), percentual da
  // conta. Barato de ler e ainda aparece em respostas de anúncios.
  const conta = headers.get("x-ad-account-usage");
  if (conta) {
    try {
      const o = JSON.parse(conta) as Record<string, unknown>;
      const pct = Number(o.acc_id_util_pct ?? 0) || 0;
      resultado.usoPct = Math.max(resultado.usoPct, pct);
      const tier = o.ads_api_access_tier;
      if (typeof tier === "string" && tier) resultado.tier = tier;
    } catch { /* idem */ }
  }

  return resultado;
}

/**
 * Registra o que a Meta declarou nesta resposta. Quando ELA diz que estamos
 * perto do limite, o número dela manda — é global de verdade, e o nosso
 * contador é palpite.
 *
 * O freio daqui vai para o BANCO e para a memória: o banco é o que vale para as
 * outras réplicas e para depois do próximo deploy; a memória é o que ainda
 * segura ESTA réplica se a gravação falhar.
 */
export async function registrarCabecalhos(
  chave: string,
  headers: Headers,
): Promise<UsoDeclaradoPelaMeta> {
  const uso = lerUsoDosCabecalhos(headers);
  if (uso.tier) tierDeAnuncios = uso.tier;

  if (uso.esperarMin > 0) {
    const motivo = `a Meta informou que o nosso app está limitado nesta conta`;
    frear(chave, uso.esperarMin * 60_000, motivo);
    await frearChaveNoBanco(chave, uso.esperarMin * 60, motivo);
  } else if (uso.usoPct >= USO_QUE_FREIA_PCT) {
    const motivo = `a Meta já registrou ${Math.round(uso.usoPct)}% da cota desta conta nesta hora`;
    frear(chave, FREIO_POR_CABECALHO_MS, motivo);
    await frearChaveNoBanco(chave, FREIO_POR_CABECALHO_MS / 1000, motivo);
  }

  // Resposta saudável zera a escada do freio: um erro isolado não pode deixar a
  // chave em regime de castigo para sempre.
  if (uso.usoPct < USO_QUE_FREIA_PCT && uso.esperarMin === 0) {
    baldeDe(chave).errosSeguidos = 0;
  }
  return uso;
}

/**
 * Registra um erro de LIMITE vindo da Meta. Não retenta: freia.
 * "Quando o limite tiver sido atingido, pare de fazer chamadas à API"
 * (fonte: fontes/graph-api-limites-de-taxa.md, Boas práticas).
 */
export async function registrarErroDeLimite(
  chave: string,
  code: number | undefined,
  esperarMinDaMeta = 0,
): Promise<void> {
  const b = baldeDe(chave);
  b.errosSeguidos = Math.min(b.errosSeguidos + 1, ESCADA_DE_FREIO_MIN.length);
  const min = esperarMinDaMeta > 0
    ? esperarMinDaMeta
    : ESCADA_DE_FREIO_MIN[b.errosSeguidos - 1];
  const motivo = `a Meta recusou por limite de volume (código ${code ?? "?"}) e paramos de chamar`;
  frear(chave, min * 60_000, motivo);
  // O castigo no BANCO é o que sobrevive ao deploy. Em memória, um redeploy no
  // meio do castigo devolvia a rajada — e a Meta não esquece a rajada.
  await frearChaveNoBanco(chave, min * 60, motivo);
}

// ─── Diagnóstico (para o Diretor e para o teste) ────────────────────────────

export interface RetratoDoRitmo {
  chave: string;
  gastasNaHora: number;
  fichas: number;
  bloqueadoPorMin: number;
  motivo: string;
}

/**
 * O retrato é ASSÍNCRONO desde 06/08/2026 porque `gastasNaHora` deixou de ser
 * uma lista na memória e passou a ser uma linha no banco — que é justamente o
 * ponto: o número que interessa é o de TODAS as réplicas, não o desta.
 * `bloqueadoPorMin` é o MAIOR entre o freio local e o do banco: o freio nunca
 * encurta por consulta.
 */
export async function retratoDoRitmo(chave: string): Promise<RetratoDoRitmo> {
  const b = baldes.get(chave);
  const noBanco = await retratoNoBanco(chave);
  const localMin =
    b && b.bloqueadoAte > agora() ? Math.ceil((b.bloqueadoAte - agora()) / 60_000) : 0;
  const bancoMin = noBanco.freadaPorSegundos > 0 ? Math.ceil(noBanco.freadaPorSegundos / 60) : 0;
  return {
    chave,
    gastasNaHora: Math.max(0, noBanco.gastas),
    fichas: b ? Math.floor(b.fichas) : FICHAS_DE_RAJADA,
    bloqueadoPorMin: Math.max(localMin, bancoMin),
    motivo: (b?.motivo || noBanco.motivo) ?? "",
  };
}

/**
 * A chave do balde a partir do token. NUNCA o token: uma impressão digital
 * FNV-1a de 32 bits, irreversível, que jamais volta a ser credencial num log
 * (regra nº 1 da casa: nada de credencial da Meta em arquivo, log ou commit).
 *
 * Por que a chave é o TOKEN e não o endpoint: o eixo que a Meta pontua é o ator
 * — a conta de anúncios, a Página, o WABA —, e um token corresponde a um ator.
 * O BUC da Marketing API é POR CONTA DE ANÚNCIOS e compartilhado entre TODOS os
 * endpoints do mesmo caso de uso: "se um ponto de extremidade fizer um número
 * excessivo de solicitações, outros pontos de extremidade configurados com o
 * mesmo caso de uso também receberão erros" (fonte:
 * fontes/graph-api-limites-de-taxa.md). Um balde por endpoint seria contar
 * errado de propósito.
 */
export function chaveDoToken(token: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `tk:${h.toString(16).padStart(8, "0")}`;
}
