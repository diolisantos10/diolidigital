// leitura-de-formato.ts — O QUE O CLIENTE ESCREVEU, LIDO SEM IA.
//
// ─── POR QUE UMA LEITURA LÉXICA, SE JÁ EXISTE UM CLASSIFICADOR ──────────────
//
// Porque o classificador é um modelo, e modelo erra em silêncio. Em
// `triagem.ts` esta casa já aprendeu a lição e a escreveu no corpo do arquivo:
// a "TRAVA 1 · O VERBO CONTRA O ASSUNTO" confronta a escolha do modelo com uma
// leitura léxica do texto do próprio cliente (`leitura-do-pedido.ts`) e, quando
// as duas divergem, **pergunta em vez de cobrar**.
//
// Este módulo é a mesma ideia no eixo do FORMATO. Ele não escolhe atendimento e
// não fala com ninguém: ele só responde "o cliente escreveu, com todas as
// letras, que quer story?". A resposta serve de contraprova contra o mapeamento
// que a Operação Salvaguarda veio fechar — story cobrado e produzido como peça
// de feed.
//
// ⚠️ ELE NÃO DECIDE NADA SOZINHO. Silêncio aqui não quer dizer "não é story":
// quem escreve "quero uma arte vertical pro instagram" não usou a palavra e
// pode muito bem querer um story. Por isso `false` significa apenas "não achei
// a palavra", nunca "é outra coisa" — ausência de informação não é informação.
// A trava que usa isto só age no caso POSITIVO, que é o único em que há fato.
//
// Módulo PURO: sem banco, sem rede, sem IA.

import { normalizar } from "@/lib/agency/esteira/leitura-do-pedido";

/**
 * As grafias que a casa aceita como "o cliente disse story".
 *
 * `stories` e `storys` entram porque é assim que se escreve no Brasil; `estória`
 * NÃO entra, porque é outra palavra e o falso positivo aqui custa uma parada
 * desnecessária no pedido de alguém.
 *
 * A busca é por PALAVRA INTEIRA. Sem isso, "history", "storytelling" e
 * "diretório" (que contém "stor") ligariam a trava — e uma trava que dispara no
 * lugar errado é desligada por quem a encontra, o que é pior que não tê-la.
 */
const PALAVRAS_DE_STORY = ["story", "stories", "storie", "storys"];

/** O cliente escreveu "story" com todas as letras? Palavra inteira, sem acento,
 *  caixa ignorada. */
export function pediuStoryPorEscrito(textoDoCliente: string | null | undefined): boolean {
  const t = normalizar(textoDoCliente ?? "");
  if (!t) return false;
  return PALAVRAS_DE_STORY.some((p) => new RegExp(`(^|[^a-z0-9])${p}([^a-z0-9]|$)`).test(t));
}

/**
 * As palavras que dizem, com todas as letras, que a peça é de FEED — e que
 * portanto NÃO é story. Serve para a trava distinguir "quero um story" de
 * "quero um post pro feed e um story", que é pedido de duas coisas e não se
 * resolve com um item de tabela.
 */
const PALAVRAS_DE_FEED = ["feed", "carrossel", "carousel"];

export function pediuFeedPorEscrito(textoDoCliente: string | null | undefined): boolean {
  const t = normalizar(textoDoCliente ?? "");
  if (!t) return false;
  return PALAVRAS_DE_FEED.some((p) => new RegExp(`(^|[^a-z0-9])${p}([^a-z0-9]|$)`).test(t));
}
