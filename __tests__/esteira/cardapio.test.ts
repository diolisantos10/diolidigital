// cardapio.test.ts — O COMBO QUE UM STORY "COMBO" PODE CITAR (W12a).
//
// O que estes testes travam:
//   • marca com cardápio devolve o combo do índice, em rodízio;
//   • marca sem cardápio (ou cardápio vazio) recusa com "preciso confirmar o
//     preço do combo" — nunca inventa preço.

import { describe, it, expect } from "vitest";
import { comboParaStory } from "@/lib/agency/esteira/cardapio";
import { PacoteDaMarcaSchema, type PacoteDaMarca } from "@/lib/agency/esteira/pacote-da-marca";

const PACOTE_BASE = {
  postsPorDia: 1,
  postsPorSemana: 5,
  formatos: ["feed_imagem"],
  dias: [1, 2, 3, 4, 5],
  horarios: ["09:00"],
  pilares: [{ nome: "combo", peso: 1 }],
};

function pacoteComCardapio(combos: Array<{ nome: string; preco: string; descricao?: string }>): PacoteDaMarca {
  return PacoteDaMarcaSchema.parse({ ...PACOTE_BASE, cardapio: { combos } });
}

describe("comboParaStory — com cardápio", () => {
  const pacote = pacoteComCardapio([
    { nome: "Combo 1", preco: "R$ 39,90" },
    { nome: "Combo 2", preco: "R$ 59,90", descricao: "com bebida" },
  ]);

  it("devolve o combo no índice pedido", () => {
    const r = comboParaStory(pacote, 0);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.combo).toEqual({ nome: "Combo 1", preco: "R$ 39,90" });
  });

  it("preserva a descrição quando existir", () => {
    const r = comboParaStory(pacote, 1);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.combo.descricao).toBe("com bebida");
  });

  it("faz rodízio determinístico (módulo do tamanho da lista)", () => {
    const r0 = comboParaStory(pacote, 2);
    const r1 = comboParaStory(pacote, 0);
    expect(r0).toEqual(r1);
  });

  it("índice negativo não lança e ainda faz rodízio correto", () => {
    const r = comboParaStory(pacote, -1);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.combo.nome).toBe("Combo 2");
  });
});

describe("comboParaStory — sem cardápio (ausência nunca vira default)", () => {
  it("marca sem bloco `cardapio` recusa", () => {
    const pacote = PacoteDaMarcaSchema.parse(PACOTE_BASE);
    const r = comboParaStory(pacote, 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("preciso confirmar o preço do combo");
  });

  it("marca com `cardapio.combos: []` (CEO ainda não cadastrou) recusa", () => {
    const pacote = pacoteComCardapio([]);
    const r = comboParaStory(pacote, 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("preciso confirmar o preço do combo");
  });
});
