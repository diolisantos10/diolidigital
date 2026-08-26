// preco-do-item.ts — COMO SE LÊ E COMO SE SOMA UM ITEM DE PROPOSTA.
//
// ═══ POR QUE ISTO EXISTE (26/08/2026) ════════════════════════════════════════
//
// Com a tabela única, `EstimateItem.minPrice`/`maxPrice` passaram a aceitar
// `null` — "orçado à parte", que é o que a vitrine promete para tráfego pago,
// identidade visual e site: escopo declarado, preço caso a caso. A alternativa
// (cotar um número que a vitrine não tem) é "duas tabelas vivas" com outro
// rosto, e foi ela que produziu a proposta de "Plano Essencial · R$ 590".
//
// O compilador então apontou SEIS lugares que somavam ou imprimiam esses dois
// campos por conta própria — o painel da agência (duas vezes), a rota de reset,
// a sala pública de briefing, o simulador de SDR e o dossiê do lead.
//
// **Seis somas paralelas é como um `null` vira `R$ 0` em cinco telas e "grátis"
// numa delas.** Por isso a soma e o texto moram aqui, e só aqui: quem tem o
// item chama, ninguém reimplementa.
//
// ⚠️ A REGRA DO `null`, e ela é de dinheiro: **`null` NÃO É ZERO.** Zero soma —
// e somar zero diz ao cliente que aquilo é de graça. `null` não entra na conta
// e aparece por escrito como o que é.

/** O mínimo que um item precisa ter para ser lido por este módulo. */
export interface ItemComPreco {
  minPrice: number | null;
  maxPrice: number | null;
  unit?: string;
}

/** O texto que a casa usa quando o item não tem preço de tabela. Uma frase, um
 *  lugar: seis telas dizendo isso com seis redações é a mesma doença. */
export const ORCADO_A_PARTE_TEXTO = "orçado à parte";

/** Este item tem preço de tabela? */
export function temPreco(item: ItemComPreco): boolean {
  return typeof item.minPrice === "number" && typeof item.maxPrice === "number";
}

/**
 * O preço de UM item, em texto, com o formatador de quem chama.
 *
 * Existe para que "orçado à parte" tenha uma redação só nas quatro telas que
 * mostram item de proposta. `fmt` entra por parâmetro porque cada tela já tem o
 * seu (`fmtBRL`, `money`) — o que não pode divergir é a REGRA, não a máscara.
 *
 * Não escreve a unidade: quem chama já a desenha ao lado, e o item sem preço
 * não deve ganhar "/mês" pendurado num vazio.
 */
export function precoDoItemEmTexto(item: ItemComPreco, fmt: (n: number) => string): string {
  if (!temPreco(item)) return ORCADO_A_PARTE_TEXTO;
  const min = item.minPrice as number;
  const max = item.maxPrice as number;
  return min === max ? fmt(min) : `${fmt(min)}–${fmt(max)}`;
}

/**
 * A soma dos itens que TÊM preço. Os sem preço não entram — nem como zero.
 *
 * Devolve também quantos ficaram de fora, porque um total que esconde a
 * existência de itens não somados é um total que mente por omissão: quem mostra
 * precisa poder dizer "mais o que for orçado à parte".
 */
export function somaDosItens(itens: readonly ItemComPreco[]): {
  min: number;
  max: number;
  semPreco: number;
} {
  let min = 0;
  let max = 0;
  let semPreco = 0;
  for (const i of itens) {
    if (!temPreco(i)) {
      semPreco += 1;
      continue;
    }
    min += i.minPrice as number;
    max += i.maxPrice as number;
  }
  return { min, max, semPreco };
}
