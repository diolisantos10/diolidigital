// direcao-interna.ts — O BRIEFING NÃO VAI PARA O INSTAGRAM DO CLIENTE.
//
// ═══════════════════════════════════════════════════════════════════════════
// O DEFEITO (rodada paga, 27/08/2026, medido em produção)
// ═══════════════════════════════════════════════════════════════════════════
//
// O cliente pediu um ajuste VISUAL. A refação regenerou o entregável inteiro e
// a legenda da peça voltou assim:
//
//     "Sexta é dia de estar aqui
//      Post destacando a atmosfera acolhedora da trattoria."
//
// A segunda linha não é legenda: é a DESCRIÇÃO DO POST, dentro do próprio
// post. Publicada, o perfil do cliente sai com o nosso briefing colado no pé
// da peça — e quem lê é o público dele, não a agência.
//
// Nenhuma régua pegou. O piso de verdade mede dado inventado; o contrato mede
// forma; a Qualidade não roda neste caminho (o árbitro é o cliente). Ninguém
// perguntava se aquilo era uma legenda.
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUE ISTO É CÓDIGO E NÃO AVISO NO PROMPT
// ═══════════════════════════════════════════════════════════════════════════
//
// *Prompt é aviso; código é trava.* O prompt do especialista já pede legenda e
// já recebeu direção interna de volta — porque `note` é, no vocabulário do
// especialista de criativo, "o texto que entra na arte", e ele às vezes escreve
// ali a descrição do que a arte deveria mostrar. Pedir de novo, com mais
// ênfase, é a mesma aposta que já falhou. O que falta é a peneira na SAÍDA, no
// funil por onde toda legenda passa (`captionDaPeca`).
//
// ═══════════════════════════════════════════════════════════════════════════
// A FRONTEIRA — o que este arquivo NÃO faz
// ═══════════════════════════════════════════════════════════════════════════
//
// Não julga qualidade de legenda, não mede tom, não reescreve texto. Ele
// reconhece UMA família de frase: a que fala DA peça em terceira pessoa, com o
// vocabulário de produção ("post", "peça", "carrossel", "story", "imagem",
// "arte", "criativo") como SUJEITO. É a forma que a direção interna tem quando
// vaza — e é estreita de propósito: uma legenda legítima que comece com "Post"
// é rara, e o custo de um falso positivo aqui é uma frase a menos na legenda,
// nunca uma peça perdida.
//
// ⚠️ PURO. Não fala com banco, não chama IA. Quem grava é quem chama.

/** O vocabulário de produção quando ele aparece como SUJEITO da frase. */
const SUJEITOS = "post|publica[çc][ãa]o|pe[çc]a|card|carrossel|story|stories|reel|reels|imagem|arte|criativo|conte[úu]do|legenda|copy";

/**
 * As formas que a direção interna assume quando vaza para a legenda.
 *
 * Cada padrão casa a FRASE inteira (do começo dela até o ponto final), porque
 * o que se remove é a frase — recortar meia frase deixaria um fragmento sem
 * sentido no perfil do cliente, que é pior que a frase inteira.
 */
const PADROES: RegExp[] = [
  // "Post destacando a atmosfera…", "Peça que comunica…", "Carrossel mostrando…"
  new RegExp(`^\\s*(?:o|a|este|esta|esse|essa|um|uma)?\\s*(?:${SUJEITOS})\\b[^.!?\\n]*\\b(?:destacando|destaca|comunicando|comunica|mostrando|mostra|apresentando|apresenta|refor[çc]ando|refor[çc]a|explorando|explora|traduzindo|traduz|evidenciando|evidencia|que\\s+(?:comunica|mostra|destaca|apresenta|refor[çc]a|traduz|explora))\\b[^.!?\\n]*[.!?]?`, "i"),
  // "Imagem com o prato em primeiro plano", "Arte em tom quente" — descrição da
  // peça, não fala com ninguém.
  //
  // ⚠️ ESTREITADO ANTES DE IR AO AR. A primeira redação aceitava qualquer
  // sujeito da lista com "de|para|sobre" — e casava "Conteúdo de qualidade para
  // você", que é legenda legítima de cliente. Como esta régua BARRA PUBLICAÇÃO,
  // o falso positivo custa o post de um cliente real; então só os sujeitos
  // VISUAIS entram, e só com "com|em".
  new RegExp(`^\\s*(?:o|a|este|esta|um|uma)?\\s*(?:imagem|arte|pe[çc]a|card|criativo|carrossel|story)\\b\\s+(?:com|em)\\b[^.!?\\n]*[.!?]?$`, "i"),
  // "Objetivo: …", "Direção de arte: …", "Briefing: …" — rótulo interno.
  /^\s*(?:objetivo|direção de arte|direcao de arte|direção|direcao|briefing|refer[êe]ncia|inten[çc][ãa]o|pilar|formato|p[úu]blico|cta)\s*:\s*.*$/i,
];

/** Uma frase que não devia existir no que vai ao ar. */
export interface FraseInterna {
  frase: string;
  /** Qual padrão a reconheceu — o teste precisa dizer ONDE. */
  padrao: number;
}

/**
 * Quebra o texto em LINHAS e, dentro de cada linha, em frases. As duas
 * granularidades importam: a direção interna medida veio como uma LINHA
 * inteira, mas ela também aparece grudada no fim de uma legenda boa.
 */
function pedacos(texto: string): string[] {
  const saida: string[] = [];
  for (const linha of texto.split(/\n+/)) {
    const t = linha.trim();
    if (!t) continue;
    // Uma linha sem ponto final é um pedaço só. Com pontos, cada frase é um
    // pedaço — e o separador fica com a frase que o antecede.
    const frases = t.match(/[^.!?]+[.!?]*/g) ?? [t];
    for (const f of frases) if (f.trim()) saida.push(f.trim());
  }
  return saida;
}

/** As frases de direção interna que existem neste texto. Lista vazia = limpo. */
export function frasesDeDirecaoInterna(texto: string | null | undefined): FraseInterna[] {
  if (!texto) return [];
  const achadas: FraseInterna[] = [];
  for (const p of pedacos(texto)) {
    const i = PADROES.findIndex((re) => re.test(p));
    if (i >= 0) achadas.push({ frase: p, padrao: i });
  }
  return achadas;
}

/** Atalho de leitura — a pergunta que o portão de publicação faz. */
export function temDirecaoInterna(texto: string | null | undefined): boolean {
  return frasesDeDirecaoInterna(texto).length > 0;
}

/**
 * O TEXTO SEM A DIREÇÃO INTERNA.
 *
 * Remove as frases reconhecidas e devolve o resto, com a formatação de linha
 * preservada. Quando NADA sobra, devolve `""` — e quem chama decide: a legenda
 * vazia nunca é gravada por cima de uma legenda que existia (ver
 * `captionDaPeca`), porque apagar o texto do cliente é um estrago maior do que
 * a frase que se queria tirar.
 */
export function limparDirecaoInterna(texto: string | null | undefined): string {
  if (!texto) return "";
  const linhas: string[] = [];
  for (const linha of texto.split("\n")) {
    const t = linha.trim();
    if (!t) { linhas.push(""); continue; }
    const frases = t.match(/[^.!?]+[.!?]*/g) ?? [t];
    const sobrou = frases.filter((f) => f.trim() && !PADROES.some((re) => re.test(f.trim())));
    if (sobrou.length > 0) linhas.push(sobrou.join(" ").replace(/\s+/g, " ").trim());
  }
  return linhas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** A frase que a equipe lê quando a trava agiu. Motivo, dono e próxima ação. */
export function motivoDaDirecaoInterna(achadas: FraseInterna[]): string {
  return (
    `tirei ${achadas.length} frase(s) de DIREÇÃO INTERNA da legenda antes de ela virar peça ` +
    `(${achadas.map((a) => `"${a.frase.slice(0, 80)}"`).join(" · ")}). ` +
    "Isso é briefing, não legenda: publicado, sai no perfil do cliente. " +
    "Dono: a agência (produção). Próxima ação: conferir por que o especialista devolveu descrição da peça no campo de texto."
  );
}
