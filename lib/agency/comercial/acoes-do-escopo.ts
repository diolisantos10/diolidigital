// OS BOTÕES DE AJUSTE DO BRIEFING PÚBLICO — dado, não markup.
//
// ── Por que eles saíram de dentro do `.tsx` (16/08/2026, terceira passada) ───
//
// O portão que os vigiava lia o CÓDIGO-FONTE do componente:
//
//     const bloco  = tela.slice(tela.indexOf("const QUICK_ACTIONS"), tela.indexOf("// ── Main component"));
//     const textos = [...bloco.matchAll(/text: "([^"]+)"/g)]
//
// Duas fraquezas medidas por `qualidade`, e as duas são da mesma família:
//   • **aspas simples, template literal ou constante ficam INVISÍVEIS** ao regex
//     — um botão escrito `text: 'sem reels'` não existia para o portão;
//   • o recorte parava numa linha de comentário (`// ── Main component`), então
//     mover o componente ou renomear o comentário esvaziava a lista em silêncio.
//
// Portão que lê texto de arquivo protege a grafia de hoje. Aqui a lista virou
// **módulo importável**: o portão importa o mesmo array que a tela renderiza, e
// não existe grafia que o esconda.
//
// ── E O TEXTO AQUI É ENTRADA DE MÁQUINA, NÃO FRASE DE TELA ───────────────────
//
// Medido em 16/08/2026: **4 dos 6** textos não casavam com ramo nenhum de
// `detectNegotiation` — "Pode tirar os reels por enquanto" não bate com
// `tira os reels?` (o "tirar" tem um "r" a mais). O prospect clicava em "Tirar
// reels" e o motor respondia com a próxima pergunta do roteiro, sem tirar nada.
// O caminho do modelo escondia o defeito porque o modelo entende qualquer frase.
//
// O portão exige as DUAS coisas, e a segunda faltava:
//   1. `detectNegotiation(text)` reconhece o texto;
//   2. o ramo reconhecido é o **que o rótulo promete** (`efeito`). Sem isso, um
//      botão `label: "Adicionar reels"` com `text: "sem reels"` passava verde
//      fazendo exatamente o oposto do que o rótulo diz.

import type { BriefingScope } from "../briefing-conversation";

/** O que o clique tem de PROVOCAR no escopo. É a promessa do rótulo, em dado —
 *  e é contra ela que o portão confere o ramo do motor de regras. */
export type EfeitoDaAcao =
  | "encolher_escopo"
  | "remover_reels"
  | "adicionar_reels"
  | "remover_trafego"
  | "adicionar_trafego"
  | "reduzir_posts";

export interface AcaoDeEscopo {
  /** O que o prospect lê no botão. **Nunca um nome de plano** — ver `planos.ts`. */
  label: string;
  /** O que é enviado ao motor de regras quando ele clica. */
  text: string;
  /** O efeito prometido pelo rótulo. O portão confere que o motor o cumpre. */
  efeito: EfeitoDaAcao;
  show: (scope: BriefingScope) => boolean;
}

export const ACOES_DE_ESCOPO: AcaoDeEscopo[] = [
  {
    // ⚠️ O rótulo era "Plano Starter": um plano que não existe em
    // `lib/agency/planos.ts` nem em `docs/precos.md`, virando BOTÃO na tela
    // pública do prospect. Trocado em 16/08/2026.
    label: "Começar menor",
    text: "Quero começar com um plano mais simples e barato",
    efeito: "encolher_escopo",
    show: (s) => !!s.wantsSocialMedia && (s.social?.postsPerWeek ?? 0) * 4 > 8,
  },
  {
    label: "Tirar reels",
    text: "Sem os reels por enquanto",
    efeito: "remover_reels",
    show: (s) => !!s.wantsSocialMedia && (s.social?.reelsPerMonth ?? 0) > 0,
  },
  {
    label: "Adicionar reels",
    text: "Quero adicionar reels",
    efeito: "adicionar_reels",
    show: (s) =>
      !!s.wantsSocialMedia &&
      s.social?.postsPerWeek !== undefined &&
      (s.social?.reelsPerMonth === 0 || s.social?.reelsPerMonth === undefined),
  },
  {
    label: "Sem tráfego pago",
    text: "Sem tráfego pago por enquanto",
    efeito: "remover_trafego",
    show: (s) => !!s.wantsPaidTraffic,
  },
  {
    label: "Incluir tráfego pago",
    text: "Quero incluir tráfego pago",
    efeito: "adicionar_trafego",
    show: (s) => !!s.wantsSocialMedia && s.wantsPaidTraffic === false && s.social?.postsPerWeek !== undefined,
  },
  {
    label: "Menos posts",
    text: "Quero reduzir posts",
    efeito: "reduzir_posts",
    show: (s) => !!s.wantsSocialMedia && (s.social?.postsPerWeek ?? 0) > 2,
  },
];
