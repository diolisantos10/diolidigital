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
  // ── COMBO SEM PREÇO SAI SEM NÚMERO (CEO, 01/10/2026) ─────────────────────
  // Antes, cardápio vazio virava "preciso confirmar o preço do combo" e o story
  // de combo não saía — e o pacote do Sushi Cazza pede um por dia. Agora sai:
  // nome vazio + preço vazio = "um combo da casa", SEM nome inventado e SEM
  // número nenhum de valor (`legendaCitaPreco` barra a legenda que trouxer).
  if (combos.length === 0) {
    return { ok: true, combo: { nome: "", preco: "" } };
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

/** A legenda cita um preço? Usado para barrar combo SEM PREÇO que a IA
 *  "completou" com um valor — preço inventado é o caso que nenhuma revisão
 *  posterior conserta. */
export function legendaCitaPreco(legenda: string): boolean {
  return /R\$\s*\d|\d+[.,]\d{2}\b|\breais\b/i.test(legenda);
}

/** Texto do combo para o prompt: com preço, exato; sem preço, proibido citar. */
export function instrucaoDoCombo(combo: ComboEscolhido): string {
  if (combo.preco) {
    return `COMBO OBRIGATÓRIO: "${combo.nome}", preço EXATO "${combo.preco}" — nunca mude, calcule ou arredonde este valor`;
  }
  const nome = combo.nome ? `"${combo.nome}"` : "um combo da casa (sem inventar nome)";
  return `COMBO OBRIGATÓRIO: destaque ${nome} SEM PREÇO — não escreva nenhum valor, número de preço, "R$" ou "reais"`;
}
