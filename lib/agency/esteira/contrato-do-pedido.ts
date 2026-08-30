// contrato-do-pedido.ts — O CONTRATO DE SAÍDA CONHECE O TAMANHO DO PEDIDO.
//
// ─── O DEFEITO, MEDIDO EM PRODUÇÃO EM 26/08/2026 ─────────────────────────────
//
// O contrato de saída do especialista de criativo é `exigirQuantidade(3, 8)`.
// Ele foi escrito pensando em PACOTE — a leva do mês, onde entregar 3 quando o
// cliente comprou 8 é erro de dinheiro. Nunca foi revisto para o pedido AVULSO.
//
// Consequência: um pedido de UMA peça produz UMA peça e o contrato reprova, com
// a razão certa pelo motivo errado ("entregou 1 e o contrato é de 3 a 8"). Na
// produção inicial isso já tinha sido consertado em 25/08 dentro de
// `producao-de-pedido.ts`. **A REFAÇÃO ficou de fora.** Medido: três tentativas
// de produzir peça nova barradas, e por isso o arquivo do ajuste não pôde ser
// provado em produção.
//
// ─── O QUE NÃO SE FAZ AQUI, E É O PONTO ──────────────────────────────────────
//
// **Não se afrouxa o contrato.** `exigirQuantidade(3, 8)` aceita qualquer coisa
// entre 3 e 8; o que este arquivo instala no lugar é `n === n` — o número EXATO
// que o cliente pagou. É mais ESTRITO, não menos: nem a menos (entregar magro
// por preço cheio) nem a mais (imagem paga que ninguém comprou).
//
// O que se corrigiu foi o contrato **conhecer o tamanho do pedido**: pedido de
// uma peça exige uma; pedido de pacote exige o pacote; pedido sem produto
// canônico declarado continua caindo no contrato do especialista, byte por
// byte como sempre.
//
// ─── UMA VERDADE, DOIS CAMINHOS ──────────────────────────────────────────────
//
// Este módulo existe porque a produção inicial e a refação PRECISAM contar as
// peças do mesmo jeito. Duas cópias da mesma regra é uma que envelhece sem
// ninguém notar — foi exatamente o que aconteceu aqui: o conserto entrou num
// arquivo e não no outro, e o cliente descobriu a diferença pedindo ajuste.

import { itensDe, type Especialista } from "@/lib/agency/execution/especialistas";
import { produtoCanonico } from "@/lib/agency/produtos/registro";

/**
 * A contagem EXATA que o produto vende. Lê os itens pela MESMA função que o
 * contrato do especialista usa (`itensDe`) — uma segunda leitura aqui faria o
 * conferente e o produtor discordarem sobre quantas peças existem.
 */
export function exigirQuantidadeExata(
  data: Record<string, unknown>,
  quantas: number,
  oQue: string,
): string[] {
  const n = itensDe(data).length;
  if (n === quantas) return [];
  return [
    `entregou ${n} peça(s) e o cliente comprou ${quantas} (${oQue}). ` +
    (n < quantas
      ? "Entregar a menos por um preço cheio é erro de dinheiro."
      : "Entregar a mais é imagem paga que ninguém comprou."),
  ];
}

/**
 * O contrato de saída deste PEDIDO — o do produto quando ele existe, o do
 * especialista quando não existe.
 *
 * `produtoId` nulo NÃO vira 1 e NÃO vira o pacote: vira o contrato do
 * especialista, que é o comportamento histórico da casa. Ausência de produto é
 * ausência de informação, e ausência de informação não decide nada.
 */
export function contratoDoPedido(
  esp: Pick<Especialista, "contrato"> | undefined,
  produtoId: string | null | undefined,
): Pick<Especialista, "contrato"> {
  const produto = produtoCanonico(produtoId);
  if (produto) {
    return {
      contrato: (d: Record<string, unknown>) =>
        exigirQuantidadeExata(d, produto.quantidadeDePecas, produto.label),
    };
  }
  return esp ?? {};
}
