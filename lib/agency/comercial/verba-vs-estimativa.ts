// A DIFERENÇA ENTRE O QUE A PESSOA DISSE QUE TEM E O QUE O PEDIDO DELA CUSTA.
//
// ─── O CASO QUE PRODUZIU ESTE ARQUIVO ────────────────────────────────────────
// 16/08/2026, piloto ao vivo. O CEO declarou **R$ 500/mês**. A casa devolveu uma
// estimativa de **R$ 1.800 – R$ 3.400**. E não disse **uma palavra** sobre a
// diferença.
//
// Esse é o pior tipo de resposta comercial: a pessoa disse quanto tem, e a casa
// fingiu que não ouviu. Não é um erro de cálculo — o cálculo estava certo. É um
// erro de conversa: perguntar a faixa de investimento e depois ignorar a
// resposta transforma a pergunta em teatro. Quem lê uma estimativa 6x acima do
// que declarou entende uma coisa só: "eles não estão falando comigo".
//
// ─── O QUE ESTE MÓDULO FAZ, E O QUE ELE SE RECUSA A FAZER ────────────────────
// Ele NOMEIA a diferença e mostra **o que cabe** na verba — nada além disso.
//   • Não inventa plano. Não inventa desconto. Não inventa promessa. O que se
//     oferece sai de `PLANOS` (`lib/agency/planos.ts`), a fonte única de preço
//     desta casa, e nada é escrito à mão aqui. Preço em dois lugares vira dois
//     preços na semana em que um deles muda — e o cliente sempre acha o menor.
//   • Não desce preço, não negocia e não conhece piso. Isso é de
//     `negociacao.ts`, que é fail-closed de propósito. Este módulo só compara e
//     aponta o degrau que já existe na prateleira.
//   • Não empurra o degrau de baixo como se fosse a única saída. Seguir com o
//     escopo maior continua sendo um caminho, e ele é dito com todas as letras
//     em `oCaminhoQueContinua`. Honestidade sobre preço vira empurrão de degrau
//     no instante em que a alternativa some da tela.
//
// ─── POR QUE ELE CALA NA MAIORIA DOS CASOS ───────────────────────────────────
// Silêncio é o comportamento padrão, e isso é deliberado. Aviso que aparece
// sempre deixa de ser lido, e aí o dia em que ele importa de verdade passa
// despercebido junto com todos os outros. Só fala quando os três valem juntos:
// a pessoa declarou a verba, o teto dessa verba é um número finito, e a
// estimativa passa dele **já no piso** — no cenário mais barato possível.

import { PLANOS, precoEmReais, type Plano } from "../planos";
import { FAIXAS, normalizarFaixa } from "./negociacao";

/** O que a tela (ou a proposta) já calculou. Os mesmos campos de `LiveEstimate`,
 *  copiados como contrato mínimo para este módulo não depender do calculador —
 *  quem só compara não precisa saber como a soma foi feita. */
export interface EstimativaParaComparar {
  totalMin: number;
  totalMax: number;
}

/** Um degrau que cabe no bolso declarado. `implantacao` vem junto **sempre**, e
 *  nunca como detalhe: dizer "cabe nos seus R$ 500" escondendo os R$ 390 de
 *  entrada do Ritmo seria a mesma desonestidade que este arquivo veio corrigir,
 *  só que com o sinal trocado. */
export interface PlanoQueCabeNaVerba {
  id: Plano["id"];
  nome: string;
  preco: number;
  implantacao: number | null;
  /** O que este degrau NÃO faz. É esta lista que evita a briga do terceiro mês —
   *  e oferecer o degrau de baixo sem ela é vender o que não vai ser entregue. */
  naoInclui: string[];
}

export interface VerbaVsEstimativa {
  /** O rótulo exato que a pessoa escolheu, para ser citado de volta com as
   *  palavras dela. */
  verbaDeclarada: string;
  tetoDaVerba: number;
  estimativa: EstimativaParaComparar;
  /** A frase que nomeia a diferença. É o entregável central deste módulo. */
  diferenca: string;
  planosQueCabem: PlanoQueCabeNaVerba[];
  /** A oferta escrita, já com implantação declarada quando ela existe. */
  oQueCabe: string;
  /** A saída que continua aberta. Sem ela, a mensagem vira "é isso ou nada". */
  oCaminhoQueContinua: string;
}

function numeroUtil(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/**
 * Compara a verba declarada com a estimativa. Devolve `null` quando não há nada
 * honesto a dizer.
 *
 * `null` em três situações, e cada uma tem seu motivo:
 *
 *   1. **Verba não declarada.** Ausência de informação não é informação. Sem o
 *      número da pessoa não existe diferença a nomear, e inventar uma faixa a
 *      partir do segmento ou do jeito de falar é chutar o bolso do cliente.
 *   2. **Verba sem teto** ("acima de R$ 5.000"). Não existe estimativa que
 *      "passe" de um teto infinito; disparar aqui seria alarme sem fato.
 *   3. **A estimativa cabe.** Se o piso da estimativa está dentro do teto
 *      declarado, não há desencontro — e falar assim mesmo é o ruído que faz o
 *      aviso perder o valor no dia em que ele importa.
 *
 * A régua é o **piso** da estimativa contra o **teto** da verba: é a leitura
 * mais generosa possível para o cliente. Só se afirma que não cabe quando não
 * cabe nem no cenário mais barato.
 */
export function verbaVsEstimativa(
  budgetRange: string | null | undefined,
  estimativa: EstimativaParaComparar,
): VerbaVsEstimativa | null {
  const rotulo = normalizarFaixa(budgetRange);
  if (!rotulo) return null;

  const faixa = FAIXAS.find((f) => f.rotulo === rotulo);
  if (!faixa || !Number.isFinite(faixa.ate)) return null;

  if (!numeroUtil(estimativa?.totalMin) || !numeroUtil(estimativa?.totalMax)) return null;
  if (estimativa.totalMin <= faixa.ate) return null;

  // A prateleira, lida da fonte única. Nenhum preço é escrito aqui.
  const planosQueCabem: PlanoQueCabeNaVerba[] = PLANOS
    .filter((p) => p.preco <= faixa.ate)
    .map((p) => ({
      id: p.id,
      nome: p.nome,
      preco: p.preco,
      implantacao: p.implantacao,
      naoInclui: p.naoInclui,
    }));

  const diferenca =
    `Você disse que pensa em investir ${rotulo} por mês. O que você descreveu, pela tabela da casa, ` +
    `fica entre ${precoEmReais(estimativa.totalMin)} e ${precoEmReais(estimativa.totalMax)} por mês — ` +
    `acima do que você me disse. Prefiro falar isso agora do que te mandar uma proposta que não cabe.`;

  const oQueCabe = planosQueCabem.length
    ? `Dentro do que você declarou, o que a casa tem hoje é: ` +
      planosQueCabem
        .map((p) =>
          `${p.nome} (${precoEmReais(p.preco)}/mês` +
          // A implantação é dita na mesma frase do preço, nunca num rodapé.
          // Quem lê "cabe no meu bolso" tem de ler o custo de entrada junto.
          (p.implantacao ? `, mais ${precoEmReais(p.implantacao)} de implantação na entrada` : ", sem taxa de entrada") +
          `)`,
        )
        .join(" · ") + "."
    : // Este ramo é defesa, não caso do dia: hoje o menor teto de faixa é o do
      // balcão e o Pulso cabe nele. Se um dia a tabela mudar, a casa diz que não
      // tem — em vez de empurrar o degrau de cima fingindo que cabe.
      `Dentro do que você declarou, hoje eu não tenho um plano fechado para oferecer — ` +
      `prefiro te dizer isso a te empurrar algo que não cabe. Preciso confirmar internamente o que dá para montar.`;

  const oCaminhoQueContinua =
    `E o escopo maior não sai da mesa: se ele for o que o seu negócio precisa, seguimos com ele ` +
    `e ajustamos o que entra em cada mês. Quem escolhe é você.`;

  return {
    verbaDeclarada: rotulo,
    tetoDaVerba: faixa.ate,
    estimativa: { totalMin: estimativa.totalMin, totalMax: estimativa.totalMax },
    diferenca,
    planosQueCabem,
    oQueCabe,
    oCaminhoQueContinua,
  };
}
