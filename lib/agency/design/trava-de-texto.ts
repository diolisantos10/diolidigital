// trava-de-texto.ts — O QUE PODE VIRAR PIXEL.
//
// ── POR QUE ESTA TRAVA EXISTE ───────────────────────────────────────────────
//
// Até 05/08/2026 `artes.ts` proibia QUALQUER texto na arte, e a proibição tinha
// duas razões escritas no cabeçalho dele (`lib/agency/execution/artes.ts:11`):
//
//   1. modelo de imagem erra letra;
//   2. "preço, telefone e prazo dentro de um pixel escapam do piso de verdade,
//      que lê texto e não enxerga imagem — seria o único lugar da casa onde um
//      dado inventado passaria sem ninguém conferir".
//
// O molde resolve a razão 1 por construção: a letra passa a sair do
// rasterizador de fonte. A razão 2 NÃO se resolve sozinha — ela piora, porque
// agora existe texto na imagem. Este arquivo é a resposta a ela, e é ele que
// autoriza o motor de molde a existir sem furar o piso da casa.
//
// ── AS DUAS CONDIÇÕES, AMBAS DETERMINÍSTICAS ────────────────────────────────
//
// A. LASTRO LITERAL. O texto pintado tem de ser TRECHO LITERAL do conteúdo que
//    já passou pela esteira e pelo piso de verdade (a legenda do post, ou a
//    cena descrita do carrossel). Não "parecido", não "resumido por IA": trecho
//    literal, conferido por comparação de string normalizada. Assim o pixel
//    não afirma nada que o texto auditado já não afirmasse — o que o auditor
//    lê continua sendo a mesma frase que o cliente vê na arte.
//
// B. NENHUMA CLASSE DE FATO PERIGOSA. Mesmo com lastro, dinheiro, percentual,
//    telefone, prazo e promessa superlativa NÃO entram na arte. Motivo: a
//    correção de uma legenda é uma edição de texto; a correção de um número
//    dentro de um PNG já publicado é um post apagado. E é justamente esta
//    classe que o piso de verdade existe para pegar — mantê-la fora do pixel
//    conserva a propriedade de que todo fato perigoso vive em texto auditável.
//
// Sem as duas condições, a peça sai SEM camada de texto (só a foto). Vazio é
// vazio: o motor prefere entregar a peça sóbria a entregar a peça que ninguém
// consegue conferir.

/** Tira acento, caixa e pontuação; colapsa espaço. É a forma em que os dois
 *  lados da comparação de lastro se encontram. */
export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * O texto é trecho literal da fonte auditada?
 *
 * Comparação por substring da forma normalizada. Normalizar antes é de
 * propósito: o layout aplica caixa alta e o corte pode comer a pontuação final,
 * e nenhuma das duas coisas muda o que a frase AFIRMA. O que a normalização
 * NÃO faz é aproximar palavra: token trocado quebra o lastro, que é o ponto.
 */
export function temLastroLiteral(texto: string, fonte: string): boolean {
  const t = normalizar(texto);
  if (!t) return false;
  return normalizar(fonte).includes(t);
}

/**
 * As classes de fato que não entram em pixel — com o nome que o relatório usa.
 *
 * A lista é curta de propósito: cada padrão aqui é uma classe que o piso de
 * verdade (`lib/agency/execution/piso-de-verdade.ts`) trata como afirmação
 * verificável. O que não é verificável em texto não vira imagem.
 */
export const CLASSES_PROIBIDAS_NA_ARTE: Array<{ classe: string; padrao: RegExp }> = [
  { classe: "preço", padrao: /(r\$|\breais\b|\bR\$)/i },
  { classe: "preço", padrao: /\b\d+[.,]\d{2}\b/ },
  { classe: "percentual", padrao: /\d+\s*%/ },
  { classe: "percentual", padrao: /\b\d+\s*por\s*cento\b/i },
  // Telefone/CNPJ/CEP: qualquer corrida longa de dígitos.
  { classe: "telefone ou documento", padrao: /\d[\d\s.\-()]{7,}/ },
  { classe: "prazo", padrao: /\b(\d{1,2}\s*(h|hs|horas?|dias?|minutos?|min)\b)/i },
  { classe: "prazo", padrao: /\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/ },
  { classe: "promessa comercial", padrao: /\b(gr[áa]tis|gratuito|desconto|promo[çc][ãa]o|frete\s+gr[áa]tis|cupom)\b/i },
  { classe: "superlativo não sustentável", padrao: /\b(melhor|maior|n[ºo°]\s*1|numero\s*1|[úu]nic[ao]|garantid[ao]|imperd[íi]vel|100%)\b/i },
];

export type MotivoDaTrava = "sem_lastro_no_conteudo_auditado" | "classe_de_fato_proibida" | "vazio";

export type VereditoDaTrava =
  | { ok: true; texto: string }
  | { ok: false; motivo: MotivoDaTrava; detalhe: string };

/**
 * O porteiro do pixel. Nunca lança; devolve veredito legível.
 *
 * `fonte` é o conteúdo JÁ AUDITADO (legenda do post ou cena do carrossel).
 */
export function travaDeTextoNaArte(texto: string, fonte: string): VereditoDaTrava {
  const t = (texto ?? "").trim();
  if (!t) return { ok: false, motivo: "vazio", detalhe: "nada a pintar" };

  for (const { classe, padrao } of CLASSES_PROIBIDAS_NA_ARTE) {
    if (padrao.test(t)) {
      return {
        ok: false,
        motivo: "classe_de_fato_proibida",
        detalhe: `${classe} — este tipo de afirmação fica na legenda, onde o piso de verdade a confere e onde dá para corrigir sem apagar o post`,
      };
    }
  }

  if (!temLastroLiteral(t, fonte)) {
    return {
      ok: false,
      motivo: "sem_lastro_no_conteudo_auditado",
      detalhe: "o texto da arte não é trecho literal do conteúdo que passou pela esteira",
    };
  }

  return { ok: true, texto: t };
}

/**
 * Deriva o título a partir da fonte auditada.
 *
 * Devolve sempre um PREFIXO da fonte, cortado em fronteira de palavra — ou
 * seja, o lastro literal é propriedade de construção, não sorte. Para o corte,
 * o que vier antes de quebra de linha, fim de frase, hashtag ou emenda ("—",
 * "|") já é o começo natural da ideia; foi assim que as telas da Foocci foram
 * escritas à mão.
 *
 * Devolve "" quando não sobra frase utilizável. Vazio é vazio: a peça sai sem
 * texto em vez de sair com um pedaço truncado sem sentido.
 */
export function tituloDaFonte(fonte: string, maxCaracteres = 68): string {
  const bruta = (fonte ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!bruta) return "";

  // Primeiro corte: onde a primeira ideia termina.
  const parada = bruta.search(/[.!?\n]|(\s[—|•]\s)|\s#/u);
  let frase = (parada > 0 ? bruta.slice(0, parada) : bruta).trim();
  // Emoji e símbolo de enfeite saem — mas só das PONTAS, para o miolo continuar
  // sendo um trecho contíguo do original.
  frase = frase.replace(/^[^\p{L}\p{N}]+/u, "").replace(/[^\p{L}\p{N}]+$/u, "");
  if (!frase) return "";
  // Uma palavra só não é chamada — é rótulo. Legenda que só tem hashtag
  // ("#padaria #paoquentinho") cairia aqui como "padaria", e a peça sairia com
  // uma palavra solta gigante no meio. Vazio é vazio: sem frase, sem texto.
  if (frase.split(/\s+/).length < 2) return "";

  if (frase.length <= maxCaracteres) return frase;

  // Corte duro em fronteira de palavra. Sem reticências: reticências não estão
  // na fonte, logo quebrariam o lastro literal.
  const cortada = frase.slice(0, maxCaracteres);
  const ultimo = cortada.lastIndexOf(" ");
  const final = (ultimo > maxCaracteres * 0.5 ? cortada.slice(0, ultimo) : cortada).trim();
  return final.replace(/[^\p{L}\p{N}]+$/u, "");
}
