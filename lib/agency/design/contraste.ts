// contraste.ts — ESCOLHER NÃO É CONFERIR.
//
// ═══════════════════════════════════════════════════════════════════════════
// O BURACO (Auditor, 25/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// `tintaSobre()` ESCOLHE a cor do texto por luminância: acima de 0,45 usa
// preto, abaixo usa branco. É uma boa heurística — e é só isso. **Ninguém
// CONFERE o resultado.**
//
// A diferença não é acadêmica. A escolha é binária e o limiar é único, então
// existe uma faixa inteira de cores de marca em que as duas opções ficam ruins
// e a heurística devolve a menos ruim sem dizer nada:
//
//   #808080 → luminância 0,216 → escolhe BRANCO → contraste 3,95:1
//
// 3,95 está abaixo do mínimo para texto normal. A peça sai, a coluna não
// registra nada, e quem lê o portal vê um texto que some no fundo da assinatura
// da marca. Escolher sem conferir é exatamente o padrão que esta operação já
// pagou três vezes: o mecanismo existe, o resultado dele não tem régua.
//
// ═══════════════════════════════════════════════════════════════════════════
// O QUE ESTE ARQUIVO MEDE, E O QUE ELE NÃO MEDE
// ═══════════════════════════════════════════════════════════════════════════
//
// MEDE: o contraste entre a COR DA MARCA e a TINTA que `tintaSobre` escolheu
// para escrever sobre ela — as superfícies chapadas da peça (a assinatura, os
// blocos de cor). É onde a escolha de `tintaSobre` é aplicada, e portanto é o
// resultado dela que aqui é conferido.
//
// NÃO MEDE: texto sobre FOTOGRAFIA. Ali não há uma cor de fundo — há milhões —
// e quem cuida disso é outro par de travas: `portao-do-fundo.ts` (a foto tem de
// ser foto) e o degradê do molde. Afirmar que este arquivo cobre aquele caso
// seria a mesma régua-mirada-no-irmão que ele veio consertar.
//
// Fórmula: WCAG 2.x, `(L1 + 0,05) / (L2 + 0,05)`, com L de `luminancia()` —
// que já é a luminância relativa da norma. Uma segunda implementação dela aqui
// divergiria da que o molde usa para escolher, e conferir a escolha com outra
// régua não confere nada.

import { luminancia, corValida } from "./molde";

/**
 * O MÍNIMO EXIGIDO, e por que este número.
 *
 * 4,5:1 é o piso da WCAG AA para texto normal. O molde usa a tinta tanto em
 * título grande quanto na assinatura — e a assinatura é pequena. Adotar o piso
 * de texto GRANDE (3:1) porque o título é grande deixaria a assinatura
 * desprotegida, que é justamente o elemento onde o nome do cliente aparece.
 *
 * Na dúvida entre dois pisos, o que protege o elemento menor.
 */
export const CONTRASTE_MINIMO = 4.5;

export interface MedidaDeContraste {
  /** A razão medida, arredondada em duas casas. */
  razao: number;
  fundo: string;
  tinta: string;
  suficiente: boolean;
}

/**
 * A razão de contraste entre duas cores. Nunca lança: cor inválida devolve
 * `null`, e `null` NÃO é aprovação — quem chama trata a ausência de medida
 * como ausência de medida.
 */
export function razaoDeContraste(fundo: string, tinta: string): number | null {
  const a = corValida(fundo);
  const b = corValida(tinta);
  if (!a || !b) return null;
  const la = luminancia(a);
  const lb = luminancia(b);
  const clara = Math.max(la, lb);
  const escura = Math.min(la, lb);
  return Math.round(((clara + 0.05) / (escura + 0.05)) * 100) / 100;
}

/**
 * A TINTA ESCOLHIDA SERVE PARA ESTE FUNDO?
 *
 * Confere o RESULTADO da escolha, não a escolha. `null` quando não deu para
 * medir — e não medir reprova, porque afirmar contraste sem medida é
 * exatamente o que esta função existe para acabar.
 */
export function conferirContraste(fundo: string, tinta: string): MedidaDeContraste | null {
  const razao = razaoDeContraste(fundo, tinta);
  if (razao === null) return null;
  return {
    razao,
    fundo,
    tinta,
    suficiente: razao >= CONTRASTE_MINIMO,
  };
}

/** A frase da recusa, com o NÚMERO. Placar sem número não é prova, e quem vai
 *  consertar a cor precisa saber de quanto para quanto. */
export function motivoDoContraste(m: MedidaDeContraste): string {
  return (
    `a cor da marca (${m.fundo}) com a tinta que o molde escolheu (${m.tinta}) dá contraste de ` +
    `${m.razao}:1, e o mínimo é ${CONTRASTE_MINIMO}:1. Nessa faixa o texto some no fundo — ` +
    "a peça sairia legível na tela de quem a produziu e ilegível na de quem a lê. " +
    "Dono: o Brand Hub do cliente. Próxima ação: ajustar a cor primária da marca."
  );
}
