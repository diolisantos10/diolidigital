// prova-com-fonte.ts — TODO NÚMERO DE PROVA PRECISA APARECER COM FONTE. PURO.
//
// ═══════════════════════════════════════════════════════════════════════════
// O QUE CONTA COMO "NÚMERO DE PROVA"
// ═══════════════════════════════════════════════════════════════════════════
//
// Percentual ("50%"), multiplicador ("3x", "10 vezes mais"), valor em reais
// ("R$ 59,90"), quantidade em milhares por extenso ("50 mil clientes") e
// números com UNIDADE DE RESULTADO — a lista fechada em
// `UNIDADES_DE_RESULTADO` abaixo (ex.: "300 clientes", "10kg", "5 anos de
// mercado"). Todo número nessas categorias é uma AFIRMAÇÃO MENSURÁVEL sobre a
// marca — e afirmação mensurável sem fonte é exatamente o risco que
// `ClientKnowledgeSnapshot`/verdade ancorada existe para barrar (ver
// `docs/kit/01-filosofia.md`).
//
// NÃO conta como prova — e é MASCARADO antes de qualquer busca, para nunca
// virar falso positivo: datas ("27/09/2026"), horários ("12:00"), "3 passos"
// (contagem de passo a passo do carrossel, não uma métrica da marca) e
// números de card ("card 3", "3/6" — o mesmo formato D/D das datas já cobre
// a fração "3/6" de propósito).
//
// ═══════════════════════════════════════════════════════════════════════════
// A CONFERÊNCIA
// ═══════════════════════════════════════════════════════════════════════════
//
// Cada número de prova encontrado no texto TEM de aparecer, como substring
// literal, dentro de alguma `afirmacao` da lista de `fontes` (a mesma
// biblioteca de `pacote.fontesDeProva`) — senão a peça não sai:
// `"preciso confirmar a fonte: <números>"`. É a mesma régua de sempre:
// ausência de fonte não vira aprovação por omissão.
//
// Pura — sem banco, sem IA. Quem monta `fontes` (do pacote da marca, ou de
// onde vier) decide a origem; esta função só confere o que já chegou.

/** Lista FECHADA de unidades que, coladas a um número, descrevem um
 *  RESULTADO mensurável da marca — não uma data, hora ou contagem de card. */
const UNIDADES_DE_RESULTADO = [
  "kg",
  "km",
  "clientes",
  "vendas",
  "resultados",
  "anos",
  "meses",
  "estrelas",
  "litros",
  "unidades",
  "pessoas",
  "empresas",
  "seguidores",
  "avaliações",
  "avaliacoes",
] as const;

/** O que é IGNORADO antes de procurar número de prova — mascarado com "•"
 *  (mesmo comprimento do trecho original) para nunca virar falso positivo em
 *  cima da PRÓPRIA categoria que a máscara removeu. */
const IGNORE_REGEXES: RegExp[] = [
  // Datas "27/09/2026" / "27/09" — o MESMO formato D/D cobre "número de
  // card" no estilo "3/6" de propósito (ver o cabeçalho).
  /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g,
  // Datas ISO "2026-09-27".
  /\b\d{4}-\d{2}-\d{2}\b/g,
  // Horários "09:00", "18:30".
  /\b([01]?\d|2[0-3]):[0-5]\d\b/g,
  // "3 passos" / "3 passo" — contagem de passo a passo do carrossel.
  /\b\d+\s*passos?\b/gi,
  // "card 3", "Card 3 de 6" — número de card.
  /\bcard\s*\d+\b/gi,
];

/** O que CONTA como número de prova — buscado no texto já MASCARADO (ver
 *  `mascararIgnorados`), mas extraído do texto ORIGINAL (mesmos índices). */
const PROVA_REGEXES: RegExp[] = [
  // Percentual: "50%", "12,5%".
  /\b\d+(?:[.,]\d+)?\s*%/g,
  // Multiplicador "x": "3x", "10x mais".
  /\b\d+(?:[.,]\d+)?\s*x\b/gi,
  // "vezes": "3 vezes", "10 vezes mais barato".
  /\b\d+(?:[.,]\d+)?\s*vezes\b/gi,
  // Reais: "R$ 59,90", "R$1.200".
  /R\$\s?\d+(?:\.\d{3})*(?:,\d+)?/g,
  // Milhares por extenso: "50 mil", "3,5 mil".
  /\b\d+(?:[.,]\d+)?\s*mil\b/gi,
  // Números com unidade de resultado — lista fechada acima.
  new RegExp(`\\b\\d+(?:[.,]\\d+)?\\s*(?:${UNIDADES_DE_RESULTADO.join("|")})\\b`, "gi"),
];

/** Substitui cada trecho ignorado por "•" repetido (MESMO comprimento) — os
 *  índices do restante do texto não se movem, então o número de prova
 *  extraído depois vem sempre do texto ORIGINAL, nunca da máscara. */
function mascararIgnorados(texto: string): string {
  let mascarado = texto;
  for (const re of IGNORE_REGEXES) {
    mascarado = mascarado.replace(re, (trecho) => "•".repeat(trecho.length));
  }
  return mascarado;
}

/** Os números de prova do texto, sem duplicatas, na ordem em que aparecem. */
function extrairNumerosDeProva(texto: string): string[] {
  const mascarado = mascararIgnorados(texto);
  const vistos = new Set<string>();
  const encontrados: string[] = [];
  for (const re of PROVA_REGEXES) {
    for (const m of mascarado.matchAll(re)) {
      const idx = m.index ?? 0;
      const trecho = texto.slice(idx, idx + m[0].length).trim();
      if (trecho && !vistos.has(trecho)) {
        vistos.add(trecho);
        encontrados.push(trecho);
      }
    }
  }
  return encontrados;
}

export type VereditoDaProva =
  | { passa: true }
  | { passa: false; motivo: string; numeros: string[] };

/**
 * Confere se todo número de prova do texto aparece em alguma `afirmacao` da
 * lista de `fontes` (substring literal — a mesma casa decimal/unidade
 * precisa bater). Texto sem número de prova nenhum passa direto.
 */
export function conferirNumeroComFonte(a: {
  texto: string;
  fontes: { afirmacao: string; fonte: string }[];
}): VereditoDaProva {
  const numeros = extrairNumerosDeProva(a.texto);
  if (numeros.length === 0) return { passa: true };

  const semFonte = numeros.filter(
    (numero) => !a.fontes.some((f) => f.afirmacao.includes(numero)),
  );
  if (semFonte.length === 0) return { passa: true };

  return {
    passa: false,
    motivo: `preciso confirmar a fonte: ${semFonte.join(", ")}`,
    numeros: semFonte,
  };
}
