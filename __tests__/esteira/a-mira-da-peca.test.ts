// A MIRA DA PEÇA — "somente a peça apontada volta" deixa de ser promessa.
//
// ── O QUE FOI MEDIDO CONTRA A CASA (Auditor, 4ª rodada, 25/08/2026) ────────
//
// O cliente escreveu "A TERCEIRA peça está escura demais, quero ela mais
// clara". A refação mirava a entrega inteira: a terceira peça nunca era
// mirada. Risco 4 do plano ("refação sem mira"), aberto, sem trava.
//
// ── A RÉGUA TEM DUAS METADES, E A SEGUNDA É A QUE IMPORTA ──────────────────
//
// Achar a mira quando ela existe é a metade fácil. A difícil é NÃO achar mira
// onde não há — porque errar o alvo é pior que não ter alvo: sem mira a casa
// refaz tudo (caro, mas atende o cliente); com a mira errada ela estraga a
// peça que estava boa e deixa de pé a que ele reclamou.
//
// Por isso metade deste arquivo são casos que TÊM de devolver `null`.

import { describe, it, expect } from "vitest";
import { pecaApontadaPeloCliente } from "@/lib/agency/esteira/mira-da-peca";

const QUATRO = 4;

describe("o cliente apontou uma peça — a mira acha", () => {
  it("a frase exata da sonda do Auditor", () => {
    const m = pecaApontadaPeloCliente("A TERCEIRA peça está escura demais, quero ela mais clara", QUATRO);
    expect(m?.indice).toBe(3);
    expect(m?.trecho, "a mira carrega a prova, para uma pessoa conferir").toBe("terceira");
  });

  it("ordinal por extenso, com e sem acento, nos dois gêneros", () => {
    expect(pecaApontadaPeloCliente("muda a primeira", QUATRO)?.indice).toBe(1);
    expect(pecaApontadaPeloCliente("o segundo story ficou torto", QUATRO)?.indice).toBe(2);
    expect(pecaApontadaPeloCliente("na QUARTA o texto sumiu", QUATRO)?.indice).toBe(4);
  });

  it("substantivo seguido de número — 'peça 3', 'imagem 2', 'story n 4'", () => {
    expect(pecaApontadaPeloCliente("a peça 3 está escura", QUATRO)?.indice).toBe(3);
    expect(pecaApontadaPeloCliente("imagem 2 com a cor errada", QUATRO)?.indice).toBe(2);
    expect(pecaApontadaPeloCliente("story n 4 precisa de mais luz", QUATRO)?.indice).toBe(4);
    expect(pecaApontadaPeloCliente("o card 1 ficou bom, o resto não", QUATRO)?.indice).toBe(1);
  });

  it("marcador de ordinal em algarismo — 3ª, 2º", () => {
    expect(pecaApontadaPeloCliente("a 3ª está escura", QUATRO)?.indice).toBe(3);
    expect(pecaApontadaPeloCliente("o 2º ficou melhor que os outros", QUATRO)?.indice).toBe(2);
  });

  it("'a última' é resolvida pela quantidade REAL, não por um chute", () => {
    expect(pecaApontadaPeloCliente("a última está escura", QUATRO)?.indice).toBe(4);
    expect(pecaApontadaPeloCliente("a última está escura", 2)?.indice).toBe(2);
  });
});

describe("o cliente NÃO apontou peça nenhuma — e a mira diz isso", () => {
  it("silêncio não vira mira: ausência de informação não é informação", () => {
    expect(pecaApontadaPeloCliente("está tudo escuro demais", QUATRO)).toBeNull();
    expect(pecaApontadaPeloCliente("", QUATRO)).toBeNull();
    expect(pecaApontadaPeloCliente(null, QUATRO)).toBeNull();
    expect(pecaApontadaPeloCliente("quero mais claro, por favor", QUATRO)).toBeNull();
  });

  it("⚠️ NÚMERO ANTES DO SUBSTANTIVO É CONTAGEM — não referência", () => {
    // "quero 3 stories mais claros" pede TRÊS peças claras. Ler isso como "a
    // terceira" mandaria refazer a peça 3 de quem falou do conjunto.
    expect(pecaApontadaPeloCliente("quero 3 stories mais claros", QUATRO)).toBeNull();
    expect(pecaApontadaPeloCliente("as 4 peças estão escuras", QUATRO)).toBeNull();
    expect(pecaApontadaPeloCliente("me manda 2 imagens novas", QUATRO)).toBeNull();
  });

  it("faixa de números não é mira — '4 a 5' é uma faixa, não a quarta", () => {
    expect(pecaApontadaPeloCliente("de 4 a 5 tons mais claro", QUATRO)).toBeNull();
  });

  it("DUAS peças apontadas = nenhuma mira — mutilar o pedido dele é pior", () => {
    // Devolver "a primeira" aqui refaria uma e deixaria a outra reclamada de pé,
    // com o cliente achando que pediu as duas.
    expect(pecaApontadaPeloCliente("a primeira e a terceira estão escuras", QUATRO)).toBeNull();
    expect(pecaApontadaPeloCliente("peça 2 e peça 4 com problema", QUATRO)).toBeNull();
  });

  it("fora da faixa não é mira — 'a peça 7' num pedido de 4 não existe", () => {
    expect(pecaApontadaPeloCliente("a peça 7 está escura", QUATRO)).toBeNull();
    expect(pecaApontadaPeloCliente("a quinta ficou ruim", QUATRO)).toBeNull();
    // E some ANTES da contagem: senão viraria "duas miras" e mascararia o caso.
    expect(pecaApontadaPeloCliente("a peça 7 e a peça 2 estão escuras", QUATRO)?.indice).toBe(2);
  });

  it("sem peça nenhuma no pedido, não há o que mirar", () => {
    expect(pecaApontadaPeloCliente("a terceira está escura", 0)).toBeNull();
  });

  it("CONTROLE: um preço ou um horário no texto não vira mira", () => {
    // Números soltos aparecem o tempo todo num pedido de ajuste.
    expect(pecaApontadaPeloCliente("troca o horário para 7 da manhã", QUATRO)).toBeNull();
    expect(pecaApontadaPeloCliente("o pão custa 12 reais, corrige", QUATRO)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A MIRA APLICADA À LISTA REAL — `pecasApontadasPeloAjuste`
// ═══════════════════════════════════════════════════════════════════════════
//
// ── O QUE FOI MEDIDO CONTRA A CASA (Auditor, 5ª rodada, 25/08/2026) ────────
//
// A mira existia em UM lugar só: o laço de arte. A rota do portal carimbava
// `revision_requested` em TODAS as peças do cartão e só depois a mira era
// aplicada — ao PIXEL. Contra o controle:
//
//              peça 1              peça 2              peça 3     peça 4
//   ajuste:    revision_requested  revision_requested  scheduled  revision_requested
//   controle:  scheduled           scheduled           scheduled  scheduled
//
// `ESTADOS_PROMOVIVEIS` não inclui `revision_requested`, de propósito. Três
// quartos do que o cliente pagou e aprovou nunca entravam na fila de entrega.
//
// Agora o ESTADO e o ARQUIVO perguntam à MESMA função. Duas contas parecidas em
// dois arquivos foi exatamente como isso nasceu.
import { pecasApontadasPeloAjuste } from "@/lib/agency/esteira/mira-da-peca";

const CARTAO = ["p1", "p2", "p3", "p4"];

describe("a mira aplicada ao cartão — o ESTADO e o ARQUIVO leem a mesma resposta", () => {
  it("a frase da sonda alcança SÓ a terceira", () => {
    expect(pecasApontadasPeloAjuste(CARTAO, "A TERCEIRA peça está escura demais")).toEqual(["p3"]);
  });

  it("sem mira o ajuste alcança o cartão inteiro — ele reclamou de tudo", () => {
    expect(pecasApontadasPeloAjuste(CARTAO, "está tudo escuro demais")).toEqual(CARTAO);
  });

  it("comentário ausente não vira mira em nada (guardrail 1)", () => {
    expect(pecasApontadasPeloAjuste(CARTAO, null)).toEqual(CARTAO);
    expect(pecasApontadasPeloAjuste(CARTAO, undefined)).toEqual(CARTAO);
    expect(pecasApontadasPeloAjuste(CARTAO, "")).toEqual(CARTAO);
  });

  it("mira fora da faixa não é mira — 'a peça 7' num cartão de 4", () => {
    expect(pecasApontadasPeloAjuste(CARTAO, "a peça 7 está escura")).toEqual(CARTAO);
  });

  it("cartão sem peça não alcança nada — e não estoura", () => {
    expect(pecasApontadasPeloAjuste([], "a terceira está escura")).toEqual([]);
  });

  it("contagem antes do plural continua sendo contagem, não referência", () => {
    expect(pecasApontadasPeloAjuste(CARTAO, "quero 3 stories mais claros")).toEqual(CARTAO);
  });
});
