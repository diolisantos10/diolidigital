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
  porque:
    "Story é vertical 1080×1920 com zona morta de interface em cima e embaixo. " +
    "Entregá-lo como peça de feed (1080×1350) não é uma aproximação: é o texto " +
    "do cliente cortado pela barra de progresso e pela caixa de resposta.",
};

export const PRODUTOS_CANONICOS: readonly ProdutoCanonico[] = [
  INSTAGRAM_STORY_ESTATICO_V1,
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
