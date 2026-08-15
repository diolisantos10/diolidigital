// portao-do-fundo.ts — O PORTÃO DE PIXEL, LIGADO NO CAMINHO DE PRODUÇÃO.
//
// ── POR QUE ESTE ARQUIVO EXISTE (15/08/2026) ────────────────────────────────
//
// `trava-de-fundo.ts` foi escrito em 08/08 depois de o CEO reprovar duas peças
// do CityJobs com fundo de clipart — prédio-retângulo e sol-círculo. Ele é o
// ÚNICO portão desta casa que lê PIXEL. Tinha teste verde, cabeçalho de
// cinquenta linhas e números medidos contra as peças reprovadas de verdade.
//
// **E zero chamadores em `lib/`.** Os únicos eram
// `scripts/cityjobs-pecas-de-feed.mts` e o próprio teste. Ficou aberto em
// `docs/pendencias.md` por sete dias, com a frase certa escrita lá:
//
//   *"enquanto não estiver no caminho de produção, ele protege uma entrega,
//    não a casa."*
//
// Este arquivo é a fiação. Ele não inventa régua nenhuma: junta as duas
// perguntas que `trava-de-fundo.ts` já sabe fazer (a DECLARAÇÃO e o PIXEL),
// chama `medir-fundo.ts` para a segunda, e devolve um veredito só.
//
// ── ONDE ELE ENTRA, E POR QUE O LUGAR É MEDIDO ──────────────────────────────
//
// **No FUNDO CRU, antes de compor.** Não é preferência de arquitetura: na
// medição da auditoria, a separação entre foto real e clipart vetorial é de
// **29×** no fundo cru e cai para **1,2×** na peça já composta — porque o
// molde pinta painel sólido, degradê, tipografia e assinatura por cima, e isso
// enche a imagem de cores e bordas que não vieram de câmera nenhuma. Portão que
// mede a peça pronta é roleta; portão que mede o fundo é portão.
//
// ── O QUE ELE JULGA, E O QUE ELE NÃO JULGA ──────────────────────────────────
//
// Julga a imagem **GERADA POR IA**, que é de onde veio o clipart reprovado.
//
// **Não julga a foto que o CLIENTE mandou.** Não é buraco esquecido, é fronteira
// declarada: reprovar o material do próprio cliente seria a agência vetando a
// foto dele com uma régua estatística — e a régua está calibrada contra desenho
// vetorial, não contra a foto de celular de uma padaria. Quem decide se a foto
// do cliente entra é `escolha-de-foto.ts`, com o critério dele.
//
// ── FAIL-CLOSED, E ISSO TEM CONSEQUÊNCIA ────────────────────────────────────
//
// Não conseguir medir REPROVA. Se `sharp` não existir no contêiner, nenhuma
// peça com fundo gerado sai — e o motivo aparece por escrito, com o nome da
// dependência. É caro de propósito: um portão que se desliga sozinho quando a
// biblioteca some não é portão, e esta casa já pagou por essa lição em 28 de 31
// portões.

import { medirFundo } from "./medir-fundo";
import {
  travaDeFundoDeclarado,
  travaDeRiquezaDoFundo,
  type VereditoDoFundo,
} from "./trava-de-fundo";

/** Quantos bytes do começo do arquivo bastam para reconhecer SVG cru. O
 *  cabeçalho de um SVG (`<?xml`, `<svg`) mora nos primeiros bytes; ler o arquivo
 *  inteiro como texto para procurar `<svg` acharia a string dentro de qualquer
 *  PNG por acidente de compressão. */
const BYTES_DE_CABECALHO = 256;

/**
 * O fundo desta peça pode virar arte de cliente?
 *
 * Recebe os BYTES CRUS da foto de fundo, antes de qualquer composição. Nunca
 * lança: erro de decodificação vira `nao_foi_possivel_medir`, que reprova.
 */
export async function conferirFundoDaPeca(p: {
  bytes: Buffer | null | undefined;
  mime?: string | null;
}): Promise<VereditoDoFundo> {
  const bytes = p.bytes;
  if (!bytes || bytes.length === 0) {
    // Delegado de propósito: a frase de "sem fundo" já está escrita lá, com o
    // porquê. Duas cópias divergem em três meses.
    return travaDeFundoDeclarado(null);
  }

  // ── PERGUNTA 1: A DECLARAÇÃO ──────────────────────────────────────────────
  //
  // O MIME diz o que quem gravou ACHA que tem; o cabeçalho diz o que há. Os
  // dois entram, porque rasterizar um SVG e chamá-lo de PNG é exatamente o
  // contorno que `trava-de-fundo.ts` nomeia no cabeçalho dele.
  const cabecalho = bytes.subarray(0, BYTES_DE_CABECALHO).toString("latin1");
  const declaracao = `data:${(p.mime ?? "image/png").toLowerCase()};base64,`;
  const vDeclarado = travaDeFundoDeclarado(declaracao + cabecalho);
  if (!vDeclarado.ok) return vDeclarado;

  // ── PERGUNTA 2: O PIXEL ───────────────────────────────────────────────────
  const medida = await medirFundo(bytes).catch(() => null);
  if (!medida) {
    return {
      ok: false,
      motivo: "nao_foi_possivel_medir",
      detalhe:
        "não consegui MEDIR o fundo desta peça (a imagem não decodificou, ou a biblioteca de imagem não está " +
        "disponível neste ambiente — confira `sharp` em `dependencies`). Reprovado por construção: um portão de " +
        "pixel que aprova quando não consegue medir é o mesmo que não existir.",
    };
  }
  return travaDeRiquezaDoFundo(medida);
}

/** A frase curta que vai para `SocialPost.lastError` — o campo é lido por gente. */
export function motivoDoFundoEmUmaLinha(v: VereditoDoFundo): string {
  if (v.ok) return "";
  return `fundo reprovado (${v.motivo}) — ${v.detalhe}`;
}
