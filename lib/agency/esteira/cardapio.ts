// cardapio.ts — O COMBO QUE UM STORY "COMBO" PODE CITAR. PURO, SEM BANCO.
//
// `pacote.cardapio` (W12a, `pacote-da-marca.ts`) é a ÚNICA fonte de preço de
// combo desta casa — nunca um preço calculado ou lembrado de outra peça.
// Marca sem cardápio cadastrado (ou com `combos: []`, o caso de Foocci e
// Sushi Cazza antes do CEO preencher) não tem combo nenhum para citar: a
// função ESCALA ("preciso confirmar o preço do combo"), nunca inventa um
// valor. É a mesma regra de sempre — ausência de informação não é
// informação.
//
// `indice` é o ÍNDICE DO SLOT (ex.: o dia do mês, ou a posição do story na
// agenda) — o rodízio entre combos é determinístico (módulo do tamanho da
// lista), nunca `Math.random`: o mesmo pacote, o mesmo índice, sempre o
// mesmo combo.

import type { PacoteDaMarca } from "@/lib/agency/esteira/pacote-da-marca";

export interface ComboEscolhido {
  nome: string;
  preco: string;
  descricao?: string;
}

export type VereditoDoCombo =
  | { ok: true; combo: ComboEscolhido }
  | { ok: false; motivo: "preciso confirmar o preço do combo" };

/**
 * Escolhe o combo deste slot, em rodízio determinístico entre os combos do
 * cardápio da marca. Sem cardápio (ou cardápio vazio) → `ok: false`.
 */
export function comboParaStory(p: PacoteDaMarca, indice: number): VereditoDoCombo {
  const combos = p.cardapio?.combos ?? [];
  if (combos.length === 0) {
    return { ok: false, motivo: "preciso confirmar o preço do combo" };
  }
  // `((n % len) + len) % len`: rodízio correto mesmo se `indice` vier negativo.
  const i = ((indice % combos.length) + combos.length) % combos.length;
  const escolhido = combos[i]!;
  return {
    ok: true,
    combo: {
      nome: escolhido.nome,
      preco: escolhido.preco,
      ...(escolhido.descricao ? { descricao: escolhido.descricao } : {}),
    },
  };
}
