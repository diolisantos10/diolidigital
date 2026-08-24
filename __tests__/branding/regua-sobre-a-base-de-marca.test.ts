// A MEDIÇÃO QUE JUSTIFICA (OU DERRUBA) A ISENÇÃO DA BASE DE MARCA.
//
// ─── POR QUE ESTE ARQUIVO EXISTE ─────────────────────────────────────────────
//
// `brand-foundation` entrou em `TIPOS_DE_DOCUMENTO_INTERNO` — a lista dos tipos
// que a régua determinística de texto NÃO confere — por ANALOGIA com `strategy`:
// o raciocínio era que o núcleo do documento são contra-exemplos literais ("não
// dizemos assim", as palavras proibidas), e citar o jargão para PROIBI-LO casa
// com o detector pelo mesmo motivo que a peça ruim casa.
//
// Raciocínio não é medição, e **isenção herdada por analogia é como esta casa
// perde régua sem perceber**. Então aqui a régua roda de verdade sobre uma base
// de marca realista, e o resultado fica registrado ao lado da isenção.
//
// ─── O QUE FOI MEDIDO EM 24/08/2026 ──────────────────────────────────────────
//
// A régua REPROVA a base de marca, com 3 violações, TODAS em contra-exemplo
// declarado, e todas da família "superlativo não sustentável":
//
//   • "incomparavel"  — dentro de «Nunca dizemos assim: (...) 'qualidade
//                       incomparável'»
//   • "premium"       — dentro de «Proibidas: 'delivery premium'»
//   • "a mais tradicional do bairro" — dentro de «não afirmamos 'a mais
//                       tradicional do bairro'»
//
// Ou seja: a régua reprovaria o documento cuja função é proibir exatamente
// aquelas frases. A isenção está medida, não herdada.
//
// ⚠️ O CUSTO DELA, DECLARADO: se o jargão entrar pela base de marca como
// AFIRMAÇÃO (e não como contra-exemplo), esta régua não o pega na origem — e a
// base é régua das peças do mês. Quem o pega ali são o contrato de saída
// (`branding.ts`, que recusa campo inventado e exige `fonte` para "definido") e
// o juiz da Qualidade. É a mesma fronteira declarada do `strategy`, agora com
// número na mão.
//
// O dia em que a régua aprender contexto de negação, esta isenção sai — e este
// teste é que vai avisar: ele fica VERMELHO quando a medição mudar.

import { describe, it, expect } from "vitest";
import { conferirReguaDoTexto, reguaSeAplicaA, TIPOS_DE_DOCUMENTO_INTERNO } from "@/lib/agency/execution/regua-do-texto";
import { renderizarEntrega } from "@/lib/agency/esteira/renderizar-entrega";

/** Uma base de marca REALISTA — do jeito que o especialista a produz, com os
 *  contra-exemplos literais que são a razão de ser do documento. */
const BASE_DE_MARCA = {
  summary: "Farol 27 — pizzaria napolitana de bairro, base de marca.",
  items: [
    { campo: "proposito_e_promessa", headline: "O que vocês fazem", estado: "definido",
      conteudo: "Pizza napolitana assada em forno a lenha, servida no bairro do Cambuci desde 2011.", fonte: "briefing" },
    { campo: "publico_e_relacao", headline: "Com quem falam", estado: "definido",
      conteudo: "Famílias do bairro, na posição de vizinho — não de especialista.", fonte: "briefing" },
    { campo: "voz", headline: "Como falam e como não falam", estado: "definido",
      conteudo: "Dizemos assim: 'a massa descansa 48 horas'. Nunca dizemos assim: 'a melhor pizza da cidade', 'qualidade incomparável', 'a escolha número 1 de quem entende'.",
      fonte: "resposta do dono" },
    { campo: "lexico", headline: "Palavras permitidas e proibidas", estado: "definido",
      conteudo: "Grafia: Farol 27. Proibidas: 'delivery premium', 'experiência gastronômica única', 'o melhor da região', 'preço imbatível'.",
      fonte: "resposta do dono" },
    { campo: "proibicoes", headline: "O que a marca nunca faz", estado: "definido",
      conteudo: "Nunca comparar com concorrente pelo nome. Nunca prometer entrega em 30 minutos.", fonte: "resposta do dono" },
    { campo: "referencias", headline: "Exemplos", estado: "lacuna", falta: "um post que ficou certo e um que ficou errado" },
    { campo: "atributos_formais", headline: "Cor e tipografia", estado: "lacuna", falta: "paleta em hex e arquivo da fonte" },
    { campo: "limites_de_promessa", headline: "O que não se afirma", estado: "definido",
      conteudo: "Mesmo sendo verdade, não afirmamos 'a mais tradicional do bairro' nem 'todo mundo aprova' — são superlativos que não se provam.",
      fonte: "resposta do dono" },
    { campo: "hierarquia_e_dono", headline: "Quem decide", estado: "lacuna", falta: "quem aprova o material e por qual canal" },
    { campo: "materiais_da_marca", headline: "Materiais", estado: "lacuna",
      falta: "faltam: arquivo vetorial do logo; paleta de cores documentada; tipografia oficial; manual de marca; histórico de versões do logo" },
  ],
};

describe("a régua determinística sobre a base de marca — a medição", () => {
  const md = renderizarEntrega(BASE_DE_MARCA as never);
  const veredito = conferirReguaDoTexto(md);

  it("a régua REPROVARIA a base de marca — a isenção não é decorativa", () => {
    expect(veredito.aprovado).toBe(false);
    expect(veredito.violacoes.length).toBeGreaterThan(0);
  });

  it("e reprova SÓ em contra-exemplo declarado — não em afirmação da marca", () => {
    // Cada violação tem de estar dentro de uma frase de NEGAÇÃO: "nunca
    // dizemos", "proibidas", "não afirmamos". Se um dia a régua disparar fora
    // disso, o achado não é mais um falso positivo e a isenção precisa ser
    // rediscutida — este teste fica vermelho e obriga a conversa.
    const NEGACAO = /nunca|proibid|não afirmamos|não dizemos/i;
    for (const v of veredito.violacoes) {
      expect(NEGACAO.test(v.trecho), `violação fora de contexto de negação: "${v.achado}" em "${v.trecho}"`).toBe(true);
    }
  });

  it("os achados medidos em 24/08/2026 continuam sendo os mesmos", () => {
    const achados = veredito.violacoes.map((v) => v.achado).sort();
    expect(achados).toEqual(["a mais tradicional do bairro", "incomparavel", "premium"]);
    expect(new Set(veredito.violacoes.map((v) => v.classe))).toEqual(new Set(["superlativo não sustentável"]));
  });

  it("por isso `brand-foundation` está isento — e a isenção está aqui, com a medição ao lado", () => {
    expect(TIPOS_DE_DOCUMENTO_INTERNO).toContain("brand-foundation");
    expect(reguaSeAplicaA("brand-foundation")).toBe(false);
  });

  it("a isenção NÃO se estende ao que a base de marca não é: peça continua conferida", () => {
    expect(reguaSeAplicaA("social")).toBe(true);
    expect(reguaSeAplicaA("plano-de-conteudo")).toBe(true);
    expect(reguaSeAplicaA(null)).toBe(true); // ausência não é isenção
  });
});
