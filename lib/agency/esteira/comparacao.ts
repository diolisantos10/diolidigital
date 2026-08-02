// comparacao.ts — "AGOSTO FOI MELHOR QUE JULHO".
//
// É a frase que segura um cliente por anos, e era a única que o relatório não
// sabia dizer. Ele descrevia o mês corrente e parava ali: 8 posts, 4.200 de
// alcance. Números soltos não respondem à pergunta que o cliente realmente faz
// quando olha a fatura — *"está melhorando?"*.
//
// ── POR QUE ISTO É UM ARQUIVO SEPARADO, DETERMINÍSTICO E SEM IA ────────────
//
// Comparar é aritmética. Se a IA calculasse a variação, ela poderia escrever
// "crescemos 30%" a partir de dois números que dão 12% — e um percentual errado
// num relatório de resultado é a mentira mais destrutiva que esta casa pode
// contar, porque é EXATAMENTE o número em que o cliente presta atenção.
//
// Aqui a conta é feita em código e o texto recebe o resultado pronto. A IA
// escreve a leitura; ela não calcula nada.

/** Variação abaixo disto é ruído, não notícia. Um alcance que foi de 4.200 para
 *  4.300 não "cresceu" — oscilou, e chamar isso de crescimento ensina o cliente
 *  a desconfiar dos próximos relatórios. */
export const RUIDO_PERCENTUAL = 5;

export type Direcao = "subiu" | "caiu" | "estavel" | "sem_base";

export interface Comparacao {
  metrica: string;
  atual: number;
  anterior: number | null;
  variacaoPercentual: number | null;
  direcao: Direcao;
  /** A frase pronta, em linguagem de gente. */
  leitura: string;
}

/** Métricas em que MENOS é melhor. Custo por clique caindo é boa notícia, e
 *  tratar tudo como "quanto maior melhor" inverteria o diagnóstico. */
const MENOS_E_MELHOR = new Set(["custo por clique"]);

/**
 * Compara uma métrica entre dois meses. Determinístico, sem rede, sem IA.
 *
 * `anterior: null` é "não havia mês passado" — o primeiro ciclo do cliente — e
 * NÃO é zero. Tratar ausência como zero produziria "crescemos infinito%", que é
 * o tipo de número que destrói a credibilidade de um relatório inteiro.
 */
export function compararMetrica(
  metrica: string,
  atual: number | null,
  anterior: number | null,
): Comparacao | null {
  if (atual === null) return null;

  if (anterior === null) {
    return {
      metrica, atual, anterior: null, variacaoPercentual: null, direcao: "sem_base",
      leitura: `${rotulo(metrica)}: ${formatar(metrica, atual)} (primeiro mês medido — é a partir daqui que vamos comparar)`,
    };
  }

  // Divisão por zero: sair de 0 para qualquer coisa não é "aumento de X%", é
  // simplesmente começar a existir.
  if (anterior === 0) {
    return {
      metrica, atual, anterior: 0, variacaoPercentual: null,
      direcao: atual > 0 ? "subiu" : "estavel",
      leitura: atual > 0
        ? `${rotulo(metrica)}: ${formatar(metrica, atual)} — mês passado era zero`
        : `${rotulo(metrica)}: continua em zero`,
    };
  }

  const variacao = Number((((atual - anterior) / anterior) * 100).toFixed(1));
  const menosEMelhor = MENOS_E_MELHOR.has(metrica);
  const dentroDoRuido = Math.abs(variacao) < RUIDO_PERCENTUAL;

  const direcao: Direcao = dentroDoRuido ? "estavel" : variacao > 0 ? "subiu" : "caiu";
  const melhorou = dentroDoRuido ? null : menosEMelhor ? variacao < 0 : variacao > 0;

  const leitura = dentroDoRuido
    ? `${rotulo(metrica)}: ${formatar(metrica, atual)} — praticamente igual ao mês passado (${formatar(metrica, anterior)})`
    : `${rotulo(metrica)}: ${formatar(metrica, atual)} contra ${formatar(metrica, anterior)} — ${sinal(variacao)} ${melhorou ? "✅" : "⚠️"}`;

  return { metrica, atual, anterior, variacaoPercentual: variacao, direcao, leitura };
}

export interface LeituraDaEvolucao {
  linhas: string[];
  /** Tem mês anterior para comparar? Quando não, o relatório diz isso em vez
   *  de fingir uma evolução. */
  temBase: boolean;
  /** O que piorou de forma relevante — vira alerta para o time. */
  pioraram: string[];
}

/**
 * A leitura completa da evolução, pronta para entrar no prompt do relatório.
 *
 * Recebe dois conjuntos de números já medidos. Não vai ao banco e não chama IA:
 * é a garantia de que a conta do relatório é sempre a mesma conta.
 */
export function lerEvolucao(
  atual: Record<string, number | null>,
  anterior: Record<string, number | null> | null,
): LeituraDaEvolucao {
  const linhas: string[] = [];
  const pioraram: string[] = [];

  for (const [metrica, valor] of Object.entries(atual)) {
    const c = compararMetrica(metrica, valor, anterior?.[metrica] ?? null);
    if (!c) continue;
    linhas.push(c.leitura);

    const menosEMelhor = MENOS_E_MELHOR.has(metrica);
    const piorou = c.direcao === (menosEMelhor ? "subiu" : "caiu");
    if (piorou) pioraram.push(`${rotulo(metrica)} (${sinal(c.variacaoPercentual ?? 0)})`);
  }

  return { linhas, temBase: anterior !== null, pioraram };
}

// ─── Internos ───────────────────────────────────────────────────────────────

function rotulo(m: string): string {
  return m.charAt(0).toUpperCase() + m.slice(1);
}

function sinal(v: number): string {
  return `${v > 0 ? "+" : ""}${v}%`;
}

function formatar(metrica: string, v: number): string {
  if (/custo|investido|gasto/.test(metrica)) return `R$ ${v.toFixed(2)}`;
  return String(Math.round(v) === v ? v : v.toFixed(1));
}
