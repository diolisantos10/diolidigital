// registro.ts — O REGISTRO ÚNICO DOS PRODUTOS CANÔNICOS DA CASA.
//
// ─── O DEFEITO QUE ISTO FECHA (Operação Salvaguarda, 25/08/2026) ─────────────
//
// Story, post e carrossel caíam no MESMO atendimento da triagem
// (`post-ou-carrossel`), com o MESMO item de catálogo (`balcao-post-feed`) e o
// MESMO especialista. A palavra "story" existia apenas dentro da frase `quando`
// — texto para o modelo ler, nunca um tipo. **O que o cliente pediu não
// sobrevivia à triagem.** Ele pedia um Story vertical e a casa cobrava e
// produzia (quando produzia) uma peça de feed 1080×1350.
//
// Um produto que não tem id não tem como ser conferido no fim da corrente.
// "O formato permanece `story` em todas as transições" (critério A) é uma
// pergunta que nem podia ser feita, porque não havia sujeito.
//
// ─── O QUE ESTE ARQUIVO É, E O QUE NÃO É ────────────────────────────────────
//
// É a IDENTIDADE do produto: id, formato, dimensão exigida, MIME exigido, item
// de catálogo que dá preço e prazo, e quantas peças o preço cobre. Nada mais.
//
// NÃO é um segundo catálogo: o preço continua morando em `SELF_SERVE_CATALOG`,
// e aqui só está o *ponteiro* (`itemDeCatalogo`). Duas tabelas de preço é a
// doença que esta casa já pagou.
//
// NÃO é um segundo registro de formatos: as dimensões saem de `FORMATOS` do
// molde (`design/molde.ts`), que é quem o renderizador realmente obedece.
// Escrever 1080×1920 à mão aqui criaria uma segunda verdade que divergiria do
// molde no primeiro ajuste — e a conferência do arquivo final passaria a medir
// contra um número que ninguém desenha.
//
// NÃO é um segundo registro de MIME: o MIME exigido é o que a Meta aceita
// (`MIME_DE_IMAGEM_ACEITO`), e quem confere que os bytes produzidos batem com
// ele é `conferencia-do-arquivo.ts`. O renderizador desta casa já produz JPEG
// (`SAIDA_DA_PECA` em `design/renderizar.ts`); esta linha é a EXIGÊNCIA, não a
// declaração otimista de quem produz.
//
// ⚠️ ESTE MÓDULO É PURO. Sem Prisma, sem Playwright, sem `node:*`. A triagem, a
// vitrine e a conferência leem daqui, e duas delas rodam onde não há servidor.

import { FORMATOS, type FormatoDaPeca } from "@/lib/agency/design/molde";
import { MIME_DE_IMAGEM_ACEITO } from "@/lib/integrations/meta/formato-de-midia";

/** O id canônico do primeiro produto da Operação Salvaguarda. Constante
 *  exportada, e não literal repetido: o dia em que ela virar string solta é o
 *  dia em que um lado da corrente escreve `story_v1` e o outro não acha. */
export const ID_STORY_V1 = "instagram_story_estatico_v1";

export interface ProdutoCanonico {
  /** O id que atravessa a corrente inteira, do pedido ao arquivo. */
  id: string;
  /** Como o cliente chamaria isso. */
  label: string;
  /** A rede a que a peça se destina. Uma só por produto — "Instagram ou
   *  Facebook" não é um produto, é uma indecisão. */
  rede: "instagram";
  /**
   * O `SocialPost.format` que esta peça DEVE ter, do começo ao fim. É este
   * valor que o critério A confere em cada transição.
   */
  formatoDoPost: "story" | "feed" | "carousel" | "reel";
  /** O formato do MOLDE — o que o renderizador desenha. */
  formatoDaPeca: FormatoDaPeca;
  /** O MIME que o arquivo final PRECISA ter para ser publicável. */
  mimeExigido: string;
  /**
   * De onde saem PREÇO e PRAZO. Id de `SELF_SERVE_CATALOG`.
   *
   * NUNCA `null` num produto canônico: um produto sem preço de tabela não é um
   * produto, é um orçamento — e orçamento para na triagem, como sempre parou.
   */
  itemDeCatalogo: string;
  /** Quantas peças o preço do item cobre. É o que a corrente produz, e o que a
   *  conferência espera achar no fim. */
  quantidadeDePecas: number;
  /** Vai ao ar no perfil do cliente? Todo produto canônico de peça vai — o que
   *  não vai é documento, e documento não passa por aqui. */
  publicavel: true;
  /**
   * O briefing MÍNIMO deste produto é cobrado antes de produzir?
   *
   * As três entradas INCONDICIONAIS do §4 do plano: o que comunicar, objetivo
   * e chamada para ação. Declarado por produto e não ligado para a casa
   * inteira: obrigar CTA num relatório ou numa pauta do mês barraria o pedido
   * correto de quem não tem ação nenhuma a pedir.
   *
   * Ver `briefing-minimo.ts` para por que a ausência dela custa caro num Story.
   */
  exigeBriefingMinimo: boolean;
  /**
   * AS LINHAS DE FORMATO QUE VÃO NO PROMPT DO ESPECIALISTA.
   *
   * ⚠️ AVISO, NÃO TRAVA — a regra da casa é literal ("prompt é aviso; código é
   * trava"), e o que confere formato e quantidade continua sendo código:
   * `conferirContrato`, o portão de quantidade da corrente e a conferência dos
   * bytes do arquivo final.
   *
   * Existe como CAMPO, e obrigatório, por um defeito com endereço: até
   * 25/08/2026 `blocoDoProduto` (`esteira/producao-de-pedido.ts`) escrevia
   * "Cada peça é um STORY VERTICAL" **na mão**, para qualquer produto. No dia
   * em que o segundo produto entrasse no registro, o especialista de uma peça
   * de FEED receberia, por escrito, a ordem de fazer um story. Campo
   * obrigatório é o que faz o produto novo não compilar sem dizer o que é.
   */
  instrucoesDeFormato: readonly string[];
  /** Por que este produto existe separado dos vizinhos. Documentação que o
   *  código carrega, no padrão de `tipos-de-entrega.ts`. */
  porque: string;
}

/**
 * INSTAGRAM STORY ESTÁTICO V1 — o recorte da Operação Salvaguarda.
 *
 * Uma imagem vertical, com a marca do cliente aplicada, margens seguras
 * respeitadas, aprovável e baixável pelo cliente no portal dele.
 *
 * ── Por que `balcao-4-stories` e não um item novo ──────────────────────────
 *
 * Porque o item JÁ EXISTE, com preço de tabela (R$ 99), prazo (2 dias) e a
 * descrição correta ("Quatro stories verticais com margem protegida",
 * 1080×1920) — e a triagem simplesmente nunca o escolhia. Era o achado 2.2 do
 * plano: "o produto correto existe, mas não é usado".
 *
 * Criar aqui um "1 story" com preço inventado seria repetir, com outro nome,
 * exatamente o erro de 06/08/2026 que `triagem.ts` documenta no próprio corpo
 * ("Emprestar o preço do reel foi exatamente o erro"). **Preço não se inventa,
 * nem quando a alternativa é uma resposta mais bonita.** Um item de uma peça só
 * é decisão comercial do CEO, e está registrada como pendência da entrega.
 *
 * A consequência é boa para a prova, aliás: com quatro peças na mesma decisão,
 * "refazer somente a peça apontada" (critério do caso de ajuste) deixa de ser
 * afirmação e vira algo que só passa se a mira funcionar.
 */
export const INSTAGRAM_STORY_ESTATICO_V1: ProdutoCanonico = {
  id: ID_STORY_V1,
  label: "Stories para Instagram (imagem vertical)",
  rede: "instagram",
  formatoDoPost: "story",
  formatoDaPeca: "story",
  mimeExigido: MIME_DE_IMAGEM_ACEITO,
  itemDeCatalogo: "balcao-4-stories",
  quantidadeDePecas: 4,
  publicavel: true,
  // Story é peça de CONVERSÃO: ocupa a tela inteira por poucos segundos e some.
  // Sem dizer o que a pessoa deve fazer, a peça é um cartaz — e pior, quem
  // preenche a lacuna é o modelo, que inventa a ação e o canal junto.
  exigeBriefingMinimo: true,
  instrucoesDeFormato: [
    "Cada peça é um STORY VERTICAL de tela cheia do celular — não é arte de feed.",
    "Story tem barra de progresso em cima e caixa de resposta embaixo: nada de conteúdo essencial nas bordas.",
  ],
  porque:
    "Story é vertical 1080×1920 com zona morta de interface em cima e embaixo. " +
    "Entregá-lo como peça de feed (1080×1350) não é uma aproximação: é o texto " +
    "do cliente cortado pela barra de progresso e pela caixa de resposta.",
};


/** O id do post de feed. Mesma razão de `ID_STORY_V1` para ser constante. */
export const ID_POST_FEED_V1 = "instagram_post_feed_v1";

/**
 * POST PARA O FEED — o produto que a casa COBRAVA e NÃO PRODUZIA.
 *
 * ── O defeito, medido em produção em 25/08/2026 ────────────────────────────
 *
 * `post-ou-carrossel` (`esteira/triagem.ts`) não declarava `produtoId`. Sem
 * produto, `producao-de-pedido.ts` desviava para o caminho de TEXTO: criava um
 * `Deliverable` com a descrição da arte, abria um card no portal e carimbava o
 * pedido como "entregue". Nenhum `SocialPost`, nenhum `mediaUrl`, nenhuma
 * imagem. O cliente pagava R$ 79, lia "2 entregas disponíveis para você" e não
 * tinha arquivo nenhum para baixar.
 *
 * É a mesma dívida que a casa tirou da vitrine em D-0A3 — vitrine é promessa;
 * promessa sem produtor é dívida — só que aqui o dinheiro já tinha entrado.
 *
 * ── Por que produzir, e não parar de cobrar ────────────────────────────────
 *
 * Porque não falta capacidade nenhuma: `FORMATOS.feed` já existe no molde
 * (1080×1350, margens declaradas), `execution/artes.ts` já produz a arte e a
 * corrente visual de `story-instagram-v1.ts` já é escrita CONTRA
 * `ProdutoCanonico` — ela lê `formatoDoPost`, `formatoDaPeca` e
 * `quantidadeDePecas` do registro, e não a palavra "story". Ligar o feed é
 * declarar o produto, não escrever um segundo motor. Fechar a venda de algo
 * que a casa sabe fazer seria trocar uma dívida por outra.
 */
export const INSTAGRAM_POST_FEED_V1: ProdutoCanonico = {
  id: ID_POST_FEED_V1,
  label: "Post para o feed do Instagram",
  rede: "instagram",
  formatoDoPost: "feed",
  formatoDaPeca: "feed",
  mimeExigido: MIME_DE_IMAGEM_ACEITO,
  itemDeCatalogo: "balcao-post-feed",
  quantidadeDePecas: 1,
  publicavel: true,
  // Mesma razão do story: a peça é de conversão e o cliente pagou por uma peça
  // só. Sem chamada, quem preenche a lacuna é o modelo — ele inventa a ação e
  // o canal junto, e aqui não há outras três peças para diluir o estrago.
  exigeBriefingMinimo: true,
  instrucoesDeFormato: [
    "Cada peça é uma ARTE DE FEED VERTICAL — a peça que FICA publicada no perfil, não a que some em 24h.",
    "Não é story: não há barra de progresso nem caixa de resposta, mas o corte do grid do perfil come as bordas.",
  ],
  porque:
    "Feed é 1080×1350 e fica publicado. Entregá-lo como story (1080×1920) é a " +
    "peça cortada no grid do perfil; entregá-lo como TEXTO — que é o que a casa " +
    "fazia — é cobrar R$ 79 por um card sem arquivo.",
};

// ── CARROSSEL: A VENDA FOI FECHADA, NÃO LIGADA (25/08/2026) ─────────────────
//
// O carrossel tinha os DOIS defeitos ao mesmo tempo: era cobrado a preço de
// post avulso (`balcao-post-feed`, R$ 79, com o item certo — `balcao-carrossel-5`,
// R$ 129 — parado na tabela sem ninguém escolher) E entregue como texto.
//
// Ele NÃO virou produto canônico nesta rodada, e o motivo é mecânico, não de
// gosto: **a casa produz carrossel por uma gramática diferente da que esta
// corrente fala.**
//
//   • a corrente visual (`story-instagram-v1.ts`) cria N `SocialPost`, um por
//     peça, e confere os bytes de CADA UM contra `dimensaoExigida`;
//   • o produtor de carrossel da casa (`montarCarrossel`, em
//     `execution/artes.ts`) é o inverso: UM `SocialPost` com `scenesJson`, e
//     cada cena precisa declarar a sua FUNÇÃO no storyboard (gancho, tensão,
//     prova, mecanismo, resultado, ação) para passar por `conferirStoryboard`.
//
// Casar as duas gramáticas é trabalho de verdade — inclui o especialista passar
// a emitir cenas com função declarada e a conferência do arquivo aprender a
// medir N telas de um post só. Declarar aqui um `ProdutoCanonico` de carrossel
// sem isso ligaria a corrente a um produtor que não existe nessa forma, e o
// cliente voltaria a pagar por algo que para no meio — trocar uma dívida por
// outra.
//
// Então, pela regra desta casa (D-0A3: vitrine é promessa; promessa sem
// produtor é dívida), **a venda foi fechada**: o atendimento `carrossel` da
// triagem existe para o pedido não ser mais cobrado como post de feed, e ele
// PARA com o motivo declarado, sem preço. Foi o que a casa já fez com reel,
// logotipo e banner.
//
// ⚠️ O que NÃO foi tocado nesta rodada: o item `balcao-carrossel-5` continua na
// vitrine, e a compra por lá segue pelo motor grande (o ciclo), que é o caminho
// que chama `montarCarrossel`. Esse caminho NÃO foi medido por este trabalho —
// está declarado no relatório como o que ficou sem medida, não como o que
// funciona.

export const PRODUTOS_CANONICOS: readonly ProdutoCanonico[] = [
  INSTAGRAM_STORY_ESTATICO_V1,
  INSTAGRAM_POST_FEED_V1,
];

const PORID = new Map(PRODUTOS_CANONICOS.map((p) => [p.id, p]));

/** O produto, pelo id. `null` para id desconhecido — e `null` NUNCA vira um
 *  produto padrão: quem chama trata a ausência como ausência. */
export function produtoCanonico(id: string | null | undefined): ProdutoCanonico | null {
  return PORID.get((id ?? "").trim()) ?? null;
}

/**
 * A DIMENSÃO EXIGIDA do produto, derivada do molde que o renderizador obedece.
 *
 * Derivada e não digitada: é isto que faz a conferência do arquivo medir contra
 * o mesmo número que o desenho usa. Se alguém mudar `FORMATOS.story`, a régua
 * anda junto — que é o único jeito de uma régua não virar mentira.
 */
export function dimensaoExigida(p: ProdutoCanonico): { largura: number; altura: number } {
  const d = FORMATOS[p.formatoDaPeca];
  return { largura: d.largura, altura: d.altura };
}

/**
 * A MARGEM SEGURA exigida, do mesmo lugar. O renderizador já reprova a peça que
 * invade a zona morta (`renderizarHtml` devolve `zonaMorta`); esta função
 * existe para que a EVIDÊNCIA da entrega possa citar os números, em vez de
 * afirmar "margens respeitadas" sem dizer quais.
 */
export function margemSeguraExigida(p: ProdutoCanonico): {
  topo: number; base: number; lateral: number;
} {
  const d = FORMATOS[p.formatoDaPeca];
  return { topo: d.margemTopo, base: d.margemBase, lateral: d.margemLateral };
}
