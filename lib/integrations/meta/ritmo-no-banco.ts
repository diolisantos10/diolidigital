// ritmo-no-banco.ts — O TETO E O FREIO DA GRAPH API, CONTADOS NO VOLUME.
//
// ─── O QUE ESTE ARQUIVO TIRA DA MEMÓRIA ─────────────────────────────────────
// `ritmo.ts` nasceu com três camadas, todas num `Map` de processo:
//   1. espaçamento (balde de fichas) — dá FORMA à curva;
//   2. teto por hora — diz QUANTO cabe;
//   3. freio depois de um erro de limite — diz QUANDO parar de falar.
// As duas últimas são as que a Meta pontua, e as duas últimas são justamente as
// que memória de processo não guarda:
//   • todo deploy ZERA o contador. Esta casa publica várias vezes por dia: uma
//     rajada interrompida por um redeploy recomeça do zero enquanto a Meta
//     continua contando a rajada inteira — e o deploy vira ferramenta do
//     estouro, como já era ferramenta do atacante nas rotas públicas
//     (o mesmo defeito que `lib/security/limite-no-banco.ts` fechou em 05/08);
//   • com N réplicas, o teto efetivo na MESMA conta da Meta vira N × teto. Em
//     03/08/2026 o que a Meta restringiu foi uma CONTA, não um processo.
// Desde 06/08/2026 elas moram aqui: uma linha por (chave, janela de hora) e uma
// linha de freio por chave, no SQLite do volume. Atravessa deploy e réplica.
//
// ─── O QUE FICA (DE PROPÓSITO) NA MEMÓRIA ───────────────────────────────────
// O ESPAÇAMENTO continua sendo balde de fichas em memória, e isso não é dívida
// esquecida — é escolha:
//   • ele existe para ESPALHAR as chamadas de UM processo no tempo ("Espalhe as
//     consultas de maneira uniforme para evitar picos de tráfego" — fontes/
//     graph-api-limites-de-taxa.md). Espalhar é um comportamento de quem está
//     chamando agora; um processo que acabou de subir não tem rajada em curso
//     para espalhar, então zerar no deploy não perde nada;
//   • fazê-lo no banco poria uma escrita por FICHA, com sono dentro da
//     transação, no caminho quente de todo GET. Trocaria uma proteção real por
//     contenção de lock no mesmo volume que já guarda o resto.
// O volume por hora e o castigo, que são o que a Meta cobra, estão no banco.
//
// ─── FAIL-CLOSED, e por que ele não custa nada aqui ─────────────────────────
// Banco fora do ar => a chamada à Meta é NEGADA. Sem contador não dá para saber
// se a próxima é a 199ª ou a 201ª, e uma trava que se abre sozinha quando o
// banco tosse não é trava. O custo real é zero: o token da conexão TAMBÉM sai do
// banco, então "banco fora" não é um mundo em que esta casa falaria com a Meta.

// ─── Injeção (o teste não fala com o Prisma real) ───────────────────────────

export interface BancoDoRitmo {
  /** Executa um comando e devolve o NÚMERO DE LINHAS AFETADAS. */
  executar(sql: string, params: unknown[]): Promise<number>;
  /** Executa uma consulta e devolve as linhas. */
  consultar<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]>;
}

let agora: () => number = () => Date.now();
let banco: BancoDoRitmo | null = null;

/** O banco real: Prisma sob demanda. Importar o cliente no topo puxaria o
 *  Prisma inteiro para dentro de qualquer teste que toque a Meta. */
async function bancoReal(): Promise<BancoDoRitmo> {
  const { prisma } = await import("@/lib/db/client");
  return {
    executar: (sql, params) => prisma.$executeRawUnsafe(sql, ...params),
    consultar: <T>(sql: string, params: unknown[]) =>
      prisma.$queryRawUnsafe(sql, ...params) as Promise<T[]>,
  };
}

/** Só para teste e diagnóstico: troca relógio e banco. Sem argumento, volta ao
 *  real. */
export function configurarRitmoNoBanco(
  opts: { agora?: () => number; banco?: BancoDoRitmo | null } = {},
): void {
  agora = opts.agora ?? (() => Date.now());
  banco = opts.banco ?? null;
}

async function db(): Promise<BancoDoRitmo> {
  if (!banco) banco = await bancoReal();
  return banco;
}

/** O mesmo banco, para os vizinhos que contam no volume (`cache-no-banco.ts`).
 *  Um acessador só = uma configuração só no teste, e nenhuma chance de metade
 *  do módulo falar com um banco e metade com outro. */
export async function bancoDoRitmo(): Promise<BancoDoRitmo> {
  return db();
}

// ─── A janela ───────────────────────────────────────────────────────────────

/** A hora é a janela: a Graph publica os tetos "por hora". */
export const JANELA_SEGUNDOS = 3_600;

function janelaDe(t: number): number {
  return Math.floor(t / 1000 / JANELA_SEGUNDOS);
}

function segundosAteVirar(t: number): number {
  const fim = (janelaDe(t) + 1) * JANELA_SEGUNDOS * 1000;
  return Math.max(1, Math.ceil((fim - t) / 1000));
}

export type MotivoDaRecusaDeRitmo = "teto" | "freio" | "banco";

export type ResultadoDoRitmoNoBanco =
  | { ok: true; gastasNaJanela: number; teto: number }
  | { ok: false; motivo: MotivoDaRecusaDeRitmo; frase: string; esperarSegundos: number };

/**
 * Reserva `custo` chamadas para `chave` na hora corrente.
 *
 * A janela é somada de forma CONSERVADORA — hora atual MAIS a anterior —, como
 * na cota de anúncios. Janela fixa pura deixaria passar 2× o teto na virada da
 * hora (200 chamadas às 10h59 e mais 200 às 11h01). Somar as duas nunca libera
 * mais que o teto em nenhum intervalo de 60 minutos: erra para o lado de
 * esperar, que é o lado barato.
 *
 * Reserva ANTES da chamada, sempre. Contar depois é deixar a rajada acontecer e
 * só então descobrir.
 */
export async function reservarNaJanelaDoBanco(
  chave: string,
  custo: number,
  teto: number,
): Promise<ResultadoDoRitmoNoBanco> {
  const k = (chave || "").trim() || "chave_desconhecida";
  const gasto = Math.max(1, Math.floor(custo));
  const t = agora();
  const janela = janelaDe(t);

  let b: BancoDoRitmo;
  try {
    b = await db();
  } catch (e) {
    return recusaPorBanco(e);
  }

  try {
    // 1. A chave está de castigo? O freio no banco é o que sobrevive ao deploy:
    //    em memória, um redeploy no meio do castigo devolvia a rajada.
    const freio = await b.consultar<{ ate: string; motivo: string }>(
      `SELECT ate, motivo FROM MetaRitmoFreio WHERE chave = ?`,
      [k],
    );
    const ate = freio[0] ? new Date(freio[0].ate).getTime() : 0;
    if (Number.isFinite(ate) && ate > t) {
      const esperar = Math.ceil((ate - t) / 1000);
      return {
        ok: false,
        motivo: "freio",
        esperarSegundos: esperar,
        frase:
          `${freio[0].motivo || "o ritmo com a Meta está freado"}` +
          ` — voltamos a falar com ela em ~${Math.max(1, Math.ceil(esperar / 60))} min`,
      };
    }

    // 2. Garante a linha da janela. `INSERT OR IGNORE` é atômico: duas réplicas
    //    colidem na chave primária em vez de criar duas linhas.
    await b.executar(
      `INSERT OR IGNORE INTO MetaRitmoJanela (id, chave, janela, gastas, atualizadoEm)
       VALUES (?, ?, ?, 0, ?)`,
      [`${k}:${janela}`, k, janela, new Date(t).toISOString()],
    );

    // 3. O incremento CONDICIONAL: o teste vai DENTRO do WHERE. Ou a linha muda
    //    (reserva feita), ou não muda (teto estourado). Não existe intervalo
    //    entre "ler o saldo" e "gastar" em que duas réplicas caibam.
    const linhas = await b.executar(
      `UPDATE MetaRitmoJanela
          SET gastas = gastas + ?, atualizadoEm = ?
        WHERE chave = ? AND janela = ?
          AND gastas + ? + COALESCE(
                (SELECT p.gastas FROM MetaRitmoJanela p
                  WHERE p.chave = ? AND p.janela = ?), 0) <= ?`,
      [gasto, new Date(t).toISOString(), k, janela, gasto, k, janela - 1, teto],
    );

    if (linhas === 0) {
      const esperar = segundosAteVirar(t);
      return {
        ok: false,
        motivo: "teto",
        esperarSegundos: esperar,
        frase:
          `seguramos o ritmo com a Meta: ${teto} chamadas nesta hora já é o nosso teto` +
          ` — a casa espera em vez de insistir, porque insistir estende o bloqueio`,
      };
    }

    // 4. Faxina barata das janelas velhas. Fora do caminho quente e sem poder
    //    derrubar ninguém: falhar aqui não nega nem libera nada.
    if (Math.random() < 0.02) {
      await b.executar(`DELETE FROM MetaRitmoJanela WHERE janela < ?`, [janela - 2]).catch(() => 0);
      await b
        .executar(`DELETE FROM MetaRitmoFreio WHERE ate < ?`, [new Date(t - 3_600_000).toISOString()])
        .catch(() => 0);
    }

    return { ok: true, gastasNaJanela: await gastasNaJanela(b, k, janela), teto };
  } catch (e) {
    return recusaPorBanco(e);
  }
}

function recusaPorBanco(e: unknown): ResultadoDoRitmoNoBanco {
  return {
    ok: false,
    motivo: "banco",
    esperarSegundos: 60,
    frase:
      "não consegui contabilizar o ritmo da Meta no banco e por isso NÃO falei com ela " +
      `(sem contador, a próxima chamada pode ser a que restringe a conta): ${e instanceof Error ? e.message : String(e)}`,
  };
}

async function gastasNaJanela(b: BancoDoRitmo, chave: string, janela: number): Promise<number> {
  const r = await b.consultar<{ gastas: number | bigint }>(
    `SELECT COALESCE(SUM(gastas), 0) AS gastas FROM MetaRitmoJanela
      WHERE chave = ? AND janela IN (?, ?)`,
    [chave, janela, janela - 1],
  );
  return Number(r[0]?.gastas ?? 0);
}

/**
 * Grava o castigo da chave depois de um erro de limite (ou de um cabeçalho no
 * vermelho). Só ESTENDE: um freio menor nunca encurta um maior já gravado.
 *
 * Não lança: falhar ao gravar o castigo não pode derrubar a chamada que já
 * falhou. Quando isso acontece, o balde em memória de `ritmo.ts` ainda freia
 * ESTA réplica — degradação, não silêncio.
 */
export async function frearChaveNoBanco(
  chave: string,
  segundos: number,
  motivo: string,
): Promise<void> {
  const k = (chave || "").trim() || "chave_desconhecida";
  const t = agora();
  const ate = new Date(t + Math.max(1, segundos) * 1000).toISOString();
  try {
    const b = await db();
    await b.executar(
      `INSERT INTO MetaRitmoFreio (chave, ate, motivo, criadoEm)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(chave) DO UPDATE SET
         ate = CASE WHEN excluded.ate > MetaRitmoFreio.ate THEN excluded.ate ELSE MetaRitmoFreio.ate END,
         motivo = excluded.motivo`,
      [k, ate, motivo.slice(0, 300), new Date(t).toISOString()],
    );
  } catch {
    /* ver o comentário acima: não derruba a chamada que já falhou */
  }
}

/** Zera o castigo de uma chave. Existe para a reconexão: token novo não herda o
 *  castigo do token velho. */
export async function limparFreioNoBanco(chave: string): Promise<void> {
  try {
    const b = await db();
    await b.executar(`DELETE FROM MetaRitmoFreio WHERE chave = ?`, [(chave || "").trim()]);
  } catch {
    /* diagnóstico, não trava */
  }
}

/** Diagnóstico: o retrato desta chave no banco. `gastas: -1` = banco não
 *  respondeu (e nesse caso a reserva NEGA, não libera). */
export async function retratoNoBanco(chave: string): Promise<{
  chave: string; gastas: number; freadaPorSegundos: number; motivo: string;
}> {
  const k = (chave || "").trim() || "chave_desconhecida";
  const t = agora();
  try {
    const b = await db();
    const gastas = await gastasNaJanela(b, k, janelaDe(t));
    const freio = await b.consultar<{ ate: string; motivo: string }>(
      `SELECT ate, motivo FROM MetaRitmoFreio WHERE chave = ?`, [k],
    );
    const ate = freio[0] ? new Date(freio[0].ate).getTime() : 0;
    return {
      chave: k,
      gastas,
      freadaPorSegundos: ate > t ? Math.ceil((ate - t) / 1000) : 0,
      motivo: ate > t ? (freio[0]?.motivo ?? "") : "",
    };
  } catch {
    return { chave: k, gastas: -1, freadaPorSegundos: 0, motivo: "" };
  }
}
