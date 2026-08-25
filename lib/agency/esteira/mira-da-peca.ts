// mira-da-peca.ts — QUAL DAS PEÇAS O CLIENTE APONTOU, quando ele apontou uma.
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUE ISTO EXISTE (Auditor, 4ª rodada, 25/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// Sonda na corrente rodando: o cliente escreveu *"A TERCEIRA peça está escura
// demais, quero ela mais clara"*. O contrato de aceite exige, no caso de
// ajuste, que **"somente a peça apontada volta"** — e o risco 4 do plano de
// recuperação já se chamava "refação sem mira".
//
// A refação mirava o `Deliverable` (o documento de texto inteiro). Não havia
// nada, em lugar nenhum da casa, que soubesse que ele estava falando da
// TERCEIRA de quatro. Refazer as quatro custa quatro imagens pagas e destrói
// três peças que estavam boas — o mesmo prejuízo que a mira por departamento
// já causou nesta casa (Farol 27, 24/08).
//
// ═══════════════════════════════════════════════════════════════════════════
// O QUE ESTE MÓDULO PODE E O QUE ELE NÃO PODE AFIRMAR
// ═══════════════════════════════════════════════════════════════════════════
//
// Ele lê ORDINAIS EXPLÍCITOS. "a terceira", "peça 3", "a 2ª imagem", "a
// última". Nada mais. Não interpreta, não chama modelo, não adivinha por
// semelhança de assunto.
//
// **E ausência de mira NÃO é mira em nada.** Quando o cliente não numerou —
// "está tudo escuro demais" — este módulo devolve `null`, e quem chama refaz
// o conjunto, que é o comportamento conservador correto: ele reclamou de tudo.
// Concluir "então é a primeira" a partir do silêncio seria concluir uma
// afirmação do silêncio, que é o guardrail 1 desta casa.
//
// ── A ARMADILHA QUE ESTE ARQUIVO EVITA DE PROPÓSITO ────────────────────────
//
// Número ANTES do substantivo no plural é CONTAGEM, não referência:
//
//     "quero 3 stories mais claros"     → contagem. Mira: nenhuma.
//     "a peça 3 está mais clara"        → referência. Mira: 3.
//
// Uma régua que lesse "3" nos dois casos mandaria refazer a terceira peça de
// quem pediu três peças — e o cliente veria uma peça mudar sem ter pedido.
// Errar a mira é pior que não ter mira: sem mira a casa refaz tudo (caro, mas
// atende); com a mira errada ela estraga a peça certa e deixa a errada de pé.

/** Os substantivos com que um cliente chama uma peça. */
const COMO_ELE_CHAMA = "(?:pe[çc]as?|storys?|stories|imagem|imagens|fotos?|artes?|criativos?|cards?|posts?|telas?|v[íi]deos?)";

/** As palavras de ordem, por extenso. Índice 1 é a primeira. */
const ORDINAIS_POR_EXTENSO: Array<[RegExp, number]> = [
  [/\bprimeir[oa]\b/, 1],
  [/\bsegund[oa]\b/, 2],
  [/\bterceir[oa]\b/, 3],
  [/\bquart[oa]\b/, 4],
  [/\bquint[oa]\b/, 5],
  [/\bsext[oa]\b/, 6],
];

/** Normaliza para comparar sem acento e sem caixa. */
function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export interface MiraDoCliente {
  /** O índice 1-based da peça apontada. */
  indice: number;
  /** O trecho que provou a mira — vai para o registro e para a mensagem ao
   *  cliente, para que a decisão da máquina seja conferível por uma pessoa. */
  trecho: string;
}

/**
 * QUAL PEÇA O CLIENTE APONTOU — ou `null` quando ele não apontou nenhuma.
 *
 * `quantasPecas` é o teto: "a peça 7" num pedido de 4 peças não é mira, é
 * engano (ou outro assunto), e refazer a 7ª de 4 não existe. Fora da faixa,
 * devolve `null` — e quem chama trata como "ele não apontou".
 *
 * Quando o texto aponta DUAS peças diferentes ("a primeira e a terceira"), a
 * resposta também é `null`: este módulo devolve UMA mira ou nenhuma, e fingir
 * que "a primeira e a terceira" é só a primeira mutilaria o pedido dele.
 */
export function pecaApontadaPeloCliente(
  comentario: string | null | undefined,
  quantasPecas: number,
): MiraDoCliente | null {
  const t = normalizar(comentario ?? "");
  if (!t.trim() || quantasPecas <= 0) return null;

  const achados = new Map<number, string>();

  // 1. ORDINAL POR EXTENSO — "a terceira", "o segundo story". Não tem como ser
  //    contagem: ninguém pede "terceira peças".
  for (const [re, n] of ORDINAIS_POR_EXTENSO) {
    const m = re.exec(t);
    if (m) achados.set(n, m[0]);
  }

  // 2. ÚLTIMA / DERRADEIRA — ordinal relativo, resolvido pela quantidade real.
  const ultima = /\b(?:ultim[oa]|derradeir[oa])\b/.exec(t);
  if (ultima) achados.set(quantasPecas, ultima[0]);

  // 3. MARCADOR DE ORDINAL EM ALGARISMO — "3ª", "2o", "1º". Também inequívoco.
  //    Sem espaço entre o número e o marcador, de propósito: "4 a 5 peças" é
  //    uma faixa, não a quarta peça, e um espaço permitido aqui a leria como
  //    mira. A mira errada é pior que mira nenhuma.
  // `ª`/`º` não são caracteres de palavra: um `\b` depois deles nunca casa.
  for (const m of t.matchAll(/\b(\d{1,2})(?:[ºª°]|[oa]\b)/g)) {
    achados.set(Number(m[1]), m[0].trim());
  }

  // 4. SUBSTANTIVO SEGUIDO DE NÚMERO — "peça 3", "story 2", "imagem n 4".
  //    A ordem importa e é a trava contra a contagem: em "3 stories" o número
  //    vem ANTES, e este padrão não casa.
  for (const m of t.matchAll(new RegExp(`\\b${COMO_ELE_CHAMA}\\s*(?:n[uº°o]?\\.?\\s*)?(\\d{1,2})\\b`, "g"))) {
    achados.set(Number(m[1]), m[0].trim());
  }

  // Fora da faixa não é mira: some antes de contar quantas sobraram, senão
  // "a peça 7" num pedido de 4 viraria "duas miras" e mascararia o caso.
  for (const n of [...achados.keys()]) {
    if (!Number.isInteger(n) || n < 1 || n > quantasPecas) achados.delete(n);
  }

  // Duas peças apontadas = nenhuma mira. Ver o comentário do contrato acima.
  if (achados.size !== 1) return null;

  const [indice, trecho] = [...achados.entries()][0]!;
  return { indice, trecho };
}
