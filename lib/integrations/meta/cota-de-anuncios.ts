// cota-de-anuncios.ts — A COTA POR PONTUAÇÃO da Marketing API, CONTADA NO BANCO.
//
// ─── O NÚMERO ERRADO QUE ESTAVA NO CÓDIGO ───────────────────────────────────
// Até 06/08/2026 esta casa acreditava que a Marketing API era limitada por
// "300 + 40 × anúncios ativos CHAMADAS POR HORA" (o número da página geral da
// Graph API, que continua existindo como camada BUC). Com esse número, uma
// campanha inteira — campanha, conjunto, criativo, anúncio — parecia custar 4
// de 300, e o teto da casa (200 chamadas/hora, `ritmo.ts`) parecia folgado.
//
// A recaptura de 06/08/2026 mostrou que a Marketing API tem lógica PRÓPRIA, e
// que ela é a que morde primeiro:
//
//   "A limitação de volume está no nível da conta de anúncios."
//   "Cada chamada da API de Marketing recebe uma pontuação."
//   "uma chamada da API de leitura é igual a 1 ponto, e uma chamada da API de
//    gravação é igual a 3 pontos, e quando a pontuação máxima for atingida,
//    lançaremos um erro de limitação."
//   "Se o app estiver no nível de desenvolvimento da API de Marketing:
//    A pontuação máxima é 60. A taxa de decaimento é de 300 segundos.
//    Se atingir a pontuação máxima, você passará por 300 segundos de bloqueio."
//   (fonte: docs/plataformas/meta/fontes/marketing-api-limites-de-taxa.md,
//    capturado em 06/08/2026 de
//    https://developers.facebook.com/docs/marketing-api/overview/rate-limiting)
//
// Traduzindo para a nossa operação: no nível em que o app está hoje
// (development / "acesso limitado"), **20 escritas travam a conta por 5
// minutos**. Não é teto de hora nenhum: é 60 pontos em 300 segundos.
//
// ─── POR QUE NO BANCO, E NÃO EM MEMÓRIA ─────────────────────────────────────
// O teto anterior (`leitura.ts`, `ritmo.ts`) era um Map em memória de processo.
// Dois defeitos conhecidos e escritos lá:
//   • com N réplicas no ar, o teto efetivo na MESMA conta da Meta vira N × teto
//     — e o eixo que a Meta pontua é a CONTA, exatamente o que memória de
//     processo não soma;
//   • todo deploy zera o contador; uma rajada interrompida por um redeploy
//     recomeça do zero enquanto a Meta continua contando a rajada inteira.
// Em 03/08/2026 foi uma conta que foi restringida, não um processo. O contador
// mora no banco desde 06/08/2026 — uma linha por (conta, janela de 300s), com
// incremento ATÔMICO num único UPDATE condicional.
//
// ─── AS REGRAS DESTE ARQUIVO ────────────────────────────────────────────────
//  1. Conta por CONTA DE ANÚNCIOS (`act_...`), como a Meta conta.
//  2. Peso por tipo de operação: leitura 1, escrita 3 (catálogo em `travas.ts`).
//  3. FAIL-CLOSED: operação de peso desconhecido paga o peso mais caro; banco
//     indisponível NEGA a chamada em vez de deixar passar sem contar.
//  4. Estourou: PARA E ESPERA. Devolve o tempo de espera e não retenta. Retry
//     cego contra limite de taxa é auto-bloqueio ("Quando o limite tiver sido
//     atingido, pare de fazer chamadas à API" — fontes/graph-api-limites-de-taxa.md).

import { pesoDaOperacao } from "./travas";
import { tierDeAnunciosObservado } from "./ritmo";

// ─── Os números, e a fonte de cada um ───────────────────────────────────────

/** Janela de decaimento da pontuação, em segundos (fonte: cabeçalho). */
export const JANELA_SEGUNDOS = 300;

/** Pontuação máxima no nível de DESENVOLVIMENTO (acesso limitado). */
export const TETO_DESENVOLVIMENTO = 60;

/** Pontuação máxima no nível de acesso TOTAL (antigo "standard/advanced"). */
export const TETO_ACESSO_TOTAL = 9_000;

/** Bloqueio que a Meta aplica ao estourar, por nível (segundos). */
export const BLOQUEIO_DESENVOLVIMENTO_S = 300;
export const BLOQUEIO_ACESSO_TOTAL_S = 60;

/**
 * Margem da casa: só gastamos 80% da pontuação publicada.
 *
 * ⚠️ ESCOLHA NOSSA, não número da Meta — declarada aqui para não ser confundida
 * com fonte. A assimetria justifica: parar em 48 pontos custa alguns minutos de
 * espera; chegar em 60 custa 300 segundos de bloqueio da CONTA INTEIRA, no meio
 * de uma operação de cliente, e mais um sinal de automação na conta que a Meta
 * já restringiu uma vez.
 */
export const MARGEM_DA_CASA = 0.8;

/** Códigos/subcódigos de limitação da Marketing API citados na fonte de 06/08:
 *  17/2446079, 613/1487742 (conta), 613/5044001 (100 QPS de mutação),
 *  80000/80003/80004/80014 (BUC por conta). */
export const SUBCODIGOS_DE_LIMITE_DA_CONTA = [2446079, 1487742, 5044001, 1487225];

// ─── Relógio e banco injetáveis (o teste não fala com o Prisma real) ────────

export interface BancoDaCota {
  /** Executa um comando e devolve o NÚMERO DE LINHAS AFETADAS. */
  executar(sql: string, params: unknown[]): Promise<number>;
  /** Executa uma consulta e devolve as linhas. */
  consultar<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]>;
}

let agora: () => number = () => Date.now();
let banco: BancoDaCota | null = null;

/** O banco real: Prisma, carregado sob demanda. Importar o cliente no topo
 *  puxaria o Prisma inteiro para dentro de qualquer teste que toque a Meta. */
async function bancoReal(): Promise<BancoDaCota> {
  const { prisma } = await import("@/lib/db/client");
  return {
    executar: (sql, params) => prisma.$executeRawUnsafe(sql, ...params),
    consultar: <T>(sql: string, params: unknown[]) =>
      prisma.$queryRawUnsafe(sql, ...params) as Promise<T[]>,
  };
}

/** Só para teste e diagnóstico: troca relógio e banco. Sem argumento, volta ao
 *  real. */
export function configurarCota(opts: { agora?: () => number; banco?: BancoDaCota | null } = {}): void {
  agora = opts.agora ?? (() => Date.now());
  banco = opts.banco ?? null;
}

async function db(): Promise<BancoDaCota> {
  if (!banco) banco = await bancoReal();
  return banco;
}

// ─── Teto vigente ───────────────────────────────────────────────────────────

/**
 * O teto de pontos desta janela, já com a margem da casa.
 *
 * FAIL-CLOSED no nível do app: enquanto a Meta não tiver declarado
 * `ads_api_access_tier` num cabeçalho, assumimos DESENVOLVIMENTO (60) — o
 * menor. Supor acesso total sem prova é o mesmo que não ter teto.
 */
export function tetoDePontos(tier: string | null = tierDeAnunciosObservado()): number {
  const total = tier === "standard_access" || tier === "full_access";
  return Math.floor((total ? TETO_ACESSO_TOTAL : TETO_DESENVOLVIMENTO) * MARGEM_DA_CASA);
}

/** Quanto tempo a Meta bloqueia ao estourar, no nível vigente. */
export function bloqueioDaMetaSegundos(tier: string | null = tierDeAnunciosObservado()): number {
  const total = tier === "standard_access" || tier === "full_access";
  return total ? BLOQUEIO_ACESSO_TOTAL_S : BLOQUEIO_DESENVOLVIMENTO_S;
}

// ─── O resultado ────────────────────────────────────────────────────────────

export type MotivoDaRecusa = "teto" | "freio" | "banco";

export type ResultadoDaCota =
  | { ok: true; pontos: number; gastosNaJanela: number; teto: number }
  | { ok: false; motivo: MotivoDaRecusa; frase: string; esperarSegundos: number };

function janelaDe(t: number): number {
  return Math.floor(t / 1000 / JANELA_SEGUNDOS);
}

/** Segundos até a janela atual virar — o tempo que a casa ESPERA quando o teto
 *  estoura. Não é palpite: é o decaimento publicado (300s). */
function segundosAteVirar(t: number): number {
  const fimDaJanela = (janelaDe(t) + 1) * JANELA_SEGUNDOS * 1000;
  return Math.max(1, Math.ceil((fimDaJanela - t) / 1000));
}

// ─── A reserva ──────────────────────────────────────────────────────────────

/**
 * Reserva os pontos de UMA chamada da Marketing API para uma conta de anúncios.
 *
 * Reserva ANTES da chamada, sempre: contar depois é deixar a rajada acontecer e
 * só então descobrir. Devolve `{ ok: false }` quando a resposta certa é PARAR —
 * e quem chama NÃO deve retentar em laço; `esperarSegundos` é quanto falta.
 *
 * A janela é tratada de forma CONSERVADORA: a soma considerada é a da janela
 * atual MAIS a anterior. A Meta usa decaimento contínuo de 300s; janela fixa
 * deixaria passar 2× o teto na virada (30 escritas em dois segundos, se caírem
 * uma de cada lado da fronteira). Somar as duas nunca libera mais do que o teto
 * em nenhum intervalo de 300 segundos — erra para o lado de esperar.
 */
export async function reservarPontosDaConta(
  contaId: string,
  opts: { operacao?: string; metodo?: string; pontos?: number } = {},
): Promise<ResultadoDaCota> {
  const conta = (contaId || "").trim() || "conta_desconhecida";
  const pontos = opts.pontos ?? pesoDaOperacao(opts.operacao, opts.metodo);
  const t = agora();
  const janela = janelaDe(t);
  const teto = tetoDePontos();

  let b: BancoDaCota;
  try {
    b = await db();
  } catch (e) {
    return recusaPorBanco(e);
  }

  try {
    // 1. A conta está de castigo? (freio gravado por erro de limite da Meta).
    //    O freio atravessa deploy e réplica — é por isso que ele está no banco.
    const freio = await b.consultar<{ ate: number | string | Date; motivo: string }>(
      `SELECT ate, motivo FROM MetaAdFreio WHERE contaId = ?`,
      [conta],
    );
    const ate = freio[0] ? new Date(freio[0].ate as string).getTime() : 0;
    if (Number.isFinite(ate) && ate > t) {
      const esperar = Math.ceil((ate - t) / 1000);
      return {
        ok: false,
        motivo: "freio",
        esperarSegundos: esperar,
        frase: `a conta ${conta} está freada com a Meta (${freio[0].motivo}) — voltamos a falar com ela em ~${Math.ceil(esperar / 60)} min`,
      };
    }

    // 2. Garante a linha da janela. `INSERT OR IGNORE` é atômico e não corre
    //    risco de duas réplicas criarem duas linhas: a unicidade é do banco.
    await b.executar(
      `INSERT OR IGNORE INTO MetaAdCota (id, contaId, janela, pontos, atualizadoEm)
       VALUES (?, ?, ?, 0, ?)`,
      [`${conta}:${janela}`, conta, janela, new Date(t).toISOString()],
    );

    // 3. O incremento CONDICIONAL — um único UPDATE, atômico no SQLite. Ou a
    //    linha muda (reserva feita), ou não muda (teto estourado). Não existe
    //    intervalo entre "ler o saldo" e "gastar" para duas réplicas caberem.
    const linhas = await b.executar(
      `UPDATE MetaAdCota
          SET pontos = pontos + ?, atualizadoEm = ?
        WHERE contaId = ? AND janela = ?
          AND pontos + ? + COALESCE(
                (SELECT p.pontos FROM MetaAdCota p
                  WHERE p.contaId = ? AND p.janela = ?), 0) <= ?`,
      [pontos, new Date(t).toISOString(), conta, janela, pontos, conta, janela - 1, teto],
    );

    if (linhas === 0) {
      const esperar = segundosAteVirar(t);
      return {
        ok: false,
        motivo: "teto",
        esperarSegundos: esperar,
        frase:
          `seguramos o ritmo com a Meta: a conta ${conta} já usou a cota de ${teto} pontos ` +
          `desta janela de ${JANELA_SEGUNDOS}s (leitura=1, escrita=3) — a casa espera ${esperar}s ` +
          `em vez de insistir, porque insistir estende o bloqueio`,
      };
    }

    // 4. Faxina barata: as janelas velhas só existem para ninguém precisar
    //    delas. Roda pouco (uma vez por janela nova) e nunca no caminho quente.
    if (Math.random() < 0.02) {
      await b.executar(`DELETE FROM MetaAdCota WHERE janela < ?`, [janela - 4]).catch(() => 0);
    }

    const gastos = await pontosNaJanela(b, conta, janela);
    return { ok: true, pontos, gastosNaJanela: gastos, teto };
  } catch (e) {
    return recusaPorBanco(e);
  }
}

/**
 * Banco indisponível = chamada NEGADA.
 *
 * É a escolha desconfortável e certa: sem contador não há como saber se a
 * próxima escrita é a 19ª ou a 21ª, e a 21ª bloqueia a conta por 5 minutos. Uma
 * trava que se abre sozinha quando o banco tosse não é trava.
 */
function recusaPorBanco(e: unknown): ResultadoDaCota {
  return {
    ok: false,
    motivo: "banco",
    esperarSegundos: 60,
    frase:
      "não consegui contabilizar a cota da Marketing API no banco e por isso NÃO falei com a Meta " +
      `(sem contador, a próxima chamada pode ser a que bloqueia a conta): ${e instanceof Error ? e.message : String(e)}`,
  };
}

async function pontosNaJanela(b: BancoDaCota, conta: string, janela: number): Promise<number> {
  const r = await b.consultar<{ pontos: number | bigint }>(
    `SELECT COALESCE(SUM(pontos), 0) AS pontos FROM MetaAdCota
      WHERE contaId = ? AND janela IN (?, ?)`,
    [conta, janela, janela - 1],
  );
  return Number(r[0]?.pontos ?? 0);
}

// ─── O freio, quando a META diz que estourou ────────────────────────────────

/**
 * Grava o castigo da conta depois de um erro de limite da Marketing API.
 *
 * A Meta publica o tamanho do bloqueio (300s no nível de desenvolvimento, 60s
 * no acesso total). Enquanto ele durar, a casa não chama — e como o freio está
 * no BANCO, ele vale para todas as réplicas e sobrevive ao deploy. Era isso que
 * faltava: em memória, um redeploy no meio do castigo devolvia a rajada.
 */
export async function frearConta(
  contaId: string,
  segundos: number,
  motivo: string,
): Promise<void> {
  const conta = (contaId || "").trim() || "conta_desconhecida";
  const ate = new Date(agora() + Math.max(1, segundos) * 1000).toISOString();
  try {
    const b = await db();
    await b.executar(
      `INSERT INTO MetaAdFreio (contaId, ate, motivo, criadoEm)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(contaId) DO UPDATE SET
         ate = CASE WHEN excluded.ate > MetaAdFreio.ate THEN excluded.ate ELSE MetaAdFreio.ate END,
         motivo = excluded.motivo`,
      [conta, ate, motivo.slice(0, 300), new Date(agora()).toISOString()],
    );
  } catch {
    // Não conseguir gravar o freio não pode derrubar a chamada que já falhou —
    // mas o balde em memória de `ritmo.ts` continua freando nesta réplica.
  }
}

/** Diagnóstico: quanto esta conta já gastou na janela corrente. */
export async function retratoDaCota(contaId: string): Promise<{
  contaId: string; pontos: number; teto: number; freadaPorSegundos: number;
}> {
  const conta = (contaId || "").trim() || "conta_desconhecida";
  const t = agora();
  const teto = tetoDePontos();
  try {
    const b = await db();
    const pontos = await pontosNaJanela(b, conta, janelaDe(t));
    const freio = await b.consultar<{ ate: string }>(
      `SELECT ate FROM MetaAdFreio WHERE contaId = ?`, [conta],
    );
    const ate = freio[0] ? new Date(freio[0].ate).getTime() : 0;
    return {
      contaId: conta, pontos, teto,
      freadaPorSegundos: ate > t ? Math.ceil((ate - t) / 1000) : 0,
    };
  } catch {
    return { contaId: conta, pontos: -1, teto, freadaPorSegundos: 0 };
  }
}

// ─── Quem é conta de anúncios nesta URL ─────────────────────────────────────

/**
 * Extrai a conta de anúncios de uma URL da Graph, quando ela aparece.
 *
 * A cota é POR CONTA — então precisamos saber a conta. Quando a chamada é num
 * id solto (pausar uma campanha, por exemplo, é `POST /{campaign_id}`), a conta
 * não está na URL: quem chama declara em `escopoDaConta`. Sem nenhum dos dois,
 * o chamador cai num balde nomeado pelo próprio id — conservador, porque
 * contabiliza a mais, nunca a menos.
 */
export function contaDaUrl(url: string): string | null {
  const m = /\/(act_\d+)(?:[/?]|$)/.exec(url);
  return m ? m[1] : null;
}

/**
 * A chamada é da Marketing API? Usada por `graph.ts` para saber se a cota por
 * pontuação se aplica (a Marketing API "tem a própria lógica de limitação de
 * volume e está excluída de todos os limites de volume da Graph API" — fonte:
 * marketing-api-limites-de-taxa.md).
 *
 * ⚠️ `/insights` NÃO entra nesta lista de propósito: `{ig_media_id}/insights` e
 * `{campaign_id}/insights` são indistinguíveis pela URL, e cobrar o dashboard
 * de Instagram na cota da conta de anúncios bloquearia a leitura de métricas
 * sem nenhum motivo. O insights de CAMPANHA entra na cota porque `ads.ts`
 * declara a operação e a conta explicitamente.
 */
export function ehChamadaDaMarketingApi(url: string): boolean {
  if (contaDaUrl(url)) return true;
  return /\/(campaigns|adsets|adcreatives|adimages|adaccounts)(?:[/?]|$)/.test(url);
}
