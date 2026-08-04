// resultados.ts — a matemática pura da tela de Resultados (portal e agência).
//
// Vive fora do componente por dois motivos:
//  1. os MESMOS números aparecem no portal do cliente e na ficha da agência —
//     duas telas, uma formatação, zero divergência de arredondamento;
//  2. escala de gráfico e formatação de número são exatamente o tipo de código
//     que quebra em silêncio (série vazia, valor nulo, um dia só) — aqui têm
//     teste unitário; dentro do JSX não teriam.

export interface PontoDeAlcance {
  /** AAAA-MM-DD */
  data: string;
  alcance: number;
}

/** Número compacto em pt-BR ("1,2 mil", "34"). `null` = a Meta não mediu —
 *  quem chama decide a palavra ("não medido"), nunca um zero inventado. */
export function formatarNumeroCompacto(n: number | null): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  if (Math.abs(n) < 1000) return new Intl.NumberFormat("pt-BR").format(n);
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/** "AAAA-MM-DD" → "dd/mm" sem passar por Date (fuso não pode deslocar o dia). */
export function diaCurto(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}`;
}

/** O período medido, legível: "08/07 a 04/08". */
export function formatarPeriodo(desde: string, ate: string): string {
  return `${diaCurto(desde)} a ${diaCurto(ate)}`;
}

export interface BarraDoGrafico {
  x: number;
  y: number;
  largura: number;
  altura: number;
  data: string;
  alcance: number;
}

/**
 * As barras da série diária de alcance, escaladas para um viewBox.
 * Base SEMPRE no zero — barra que não parte do zero é gráfico que mente.
 * Valor zero ganha 1px de presença: dia medido com zero é dado, não buraco.
 */
export function barrasDoGrafico(
  serie: PontoDeAlcance[],
  larguraTotal: number,
  alturaTotal: number,
  espaco = 2,
): BarraDoGrafico[] {
  const pontos = serie.filter((p) => Number.isFinite(p.alcance) && p.alcance >= 0);
  if (pontos.length === 0) return [];
  const maximo = Math.max(...pontos.map((p) => p.alcance));
  const larguraBarra = Math.max(1, (larguraTotal - espaco * (pontos.length - 1)) / pontos.length);
  return pontos.map((p, i) => {
    const altura = maximo === 0 ? 1 : Math.max(1, (p.alcance / maximo) * alturaTotal);
    return {
      x: i * (larguraBarra + espaco),
      y: alturaTotal - altura,
      largura: larguraBarra,
      altura,
      data: p.data,
      alcance: p.alcance,
    };
  });
}

/** Frase-resumo da série para leitores de tela e aria-label do gráfico. */
export function resumoDaSerie(serie: PontoDeAlcance[]): string {
  if (serie.length === 0) return "Sem dados diários de alcance no período.";
  const total = serie.reduce((s, p) => s + p.alcance, 0);
  const pico = serie.reduce((a, b) => (b.alcance > a.alcance ? b : a));
  return `Alcance por dia, de ${diaCurto(serie[0].data)} a ${diaCurto(serie[serie.length - 1].data)}. Total de ${new Intl.NumberFormat("pt-BR").format(total)} contas; melhor dia ${diaCurto(pico.data)} com ${new Intl.NumberFormat("pt-BR").format(pico.alcance)}.`;
}
