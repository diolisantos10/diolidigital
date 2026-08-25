// proporcao-da-peca.ts — A FORMA COM QUE O CARTÃO MOSTRA A PEÇA.
//
// ═══════════════════════════════════════════════════════════════════════════
// O DEFEITO (25/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// `CarrosselDeTelas` renderizava TODA peça com `aspect-square object-cover`.
// Quadrado, com corte.
//
// Um Story é 1080×1920. Enfiado num quadrado com `object-cover`, ele perde
// ~44% da altura — e o que se perde não é margem: é **o topo e a base**,
// exatamente onde o molde põe o TÍTULO e a ASSINATURA DA MARCA.
//
// O cliente era chamado a aprovar uma peça vendo uma versão dela que a casa
// nunca vai publicar, sem o texto e sem a assinatura. O contrato de aceite tem
// isso na lista de reprovação imediata, com duas entradas: "formato quadrado" e
// "o cartão mostra a imagem real em tamanho legível".
//
// ── POR QUE UM MÓDULO, E NÃO UMA CLASSE ESCRITA NA TELA ────────────────────
//
// Porque a proporção do cartão TEM DE SER a mesma que o rasterizador desenha.
// `FORMATOS` (`design/molde.ts`) é a fonte, mas aquele arquivo arrasta o CSS do
// mockup e as fontes embutidas em base64 — importá-lo num componente de cliente
// mandaria tudo isso para o navegador do cliente por causa de uma fração.
//
// Então aqui há uma tabela pequena e PURA, e `__tests__/portal/...` confere que
// ela concorda com `FORMATOS` numeral por numeral. Duas cópias que um teste
// obriga a concordar não são duas verdades — são uma verdade com um guarda.

/**
 * A proporção `largura / altura` de cada formato, na forma que o Tailwind
 * entende (`aspect-[ 9/16 ]`).
 *
 * As chaves são os valores de `SocialPost.format`, que é o que o cartão recebe.
 */
const PROPORCAO_POR_FORMATO: Record<string, string> = {
  // 1080×1920 — tela cheia do celular.
  story: "9/16",
  // 1080×1350 — o vertical do feed.
  feed: "4/5",
  carousel: "4/5",
  carrossel: "4/5",
  // Reel é vídeo vertical, mesma proporção do story.
  reel: "9/16",
  // 1080×1080.
  quadrado: "1/1",
  square: "1/1",
};

/**
 * ⚠️ A CLASSE É ESCRITA POR EXTENSO, E ISSO NÃO É REDUNDÂNCIA.
 *
 * ── O DEFEITO (medido pelo Auditor, 25/08/2026) ───────────────────────────
 *
 * A versão anterior montava a classe por interpolação:
 *
 *     return `aspect-[${PROPORCAO_POR_FORMATO[f] ?? "4/5"}]`;
 *
 * O scanner do Tailwind v4 NÃO executa código: ele varre o texto-fonte
 * procurando candidatos a classe. `aspect-[${...}]` não é um candidato — logo
 * a regra `aspect-[ 9/16 ]` só existia no CSS compilado porque a string aparecia
 * POR ACIDENTE em outro lugar do repositório: um comentário JSDoc e um arquivo
 * de teste. O Auditor apagou os dois, recompilou, e TODAS as regras
 * `aspect-[ … ]` sumiram do CSS. A trava do cartão dependia de um comentário
 * estar no disco — isso não é trava, é sorte.
 *
 * E `aspect-[ 1/1 ]` nunca chegou a existir: nenhuma string dessas aparecia em
 * lugar nenhum, então a peça quadrada recebia uma classe sem efeito.
 *
 * ── A CORREÇÃO ────────────────────────────────────────────────────────────
 *
 * A classe COMPLETA é literal aqui. O scanner lê `aspect-[ 9/16 ]`,
 * `aspect-[ 4/5 ]` e `aspect-[ 1/1 ]` como texto e emite as três regras. Nada
 * depende mais de comentário nem de teste estar no disco.
 *
 * `__tests__/portal/o-cartao-nao-corta-o-story.test.tsx` COMPILA o CSS de
 * verdade e confere que cada uma destas regras existe nele — atributo no HTML
 * não prova regra no CSS.
 */
const CLASSE_POR_FORMATO: Record<string, string> = {
  story: "aspect-[9/16]",
  feed: "aspect-[4/5]",
  carousel: "aspect-[4/5]",
  carrossel: "aspect-[4/5]",
  reel: "aspect-[9/16]",
  quadrado: "aspect-[1/1]",
  square: "aspect-[1/1]",
};

/** O padrão conservador, também literal pelo mesmo motivo. */
const CLASSE_PADRAO = "aspect-[4/5]";

/**
 * A classe de proporção para esta peça.
 *
 * Formato desconhecido cai em `4/5` — o vertical do feed, que é o volume da
 * casa — e NÃO em quadrado. É a escolha conservadora certa: um quadrado corta
 * qualquer peça vertical, e todas as peças que esta casa produz são verticais.
 */
export function proporcaoDaPeca(format: string | null | undefined): string {
  const f = (format ?? "").trim().toLowerCase();
  return CLASSE_POR_FORMATO[f] ?? CLASSE_PADRAO;
}

/** A tabela crua, para o teste que a confere contra `FORMATOS`. */
export const PROPORCOES_DECLARADAS = PROPORCAO_POR_FORMATO;

/** As classes literais, para o teste que confere cada uma contra o CSS compilado. */
export const CLASSES_DECLARADAS = CLASSE_POR_FORMATO;
