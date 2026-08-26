// A PEÇA COMPOSTA DE VERDADE, PARA QUEM DUBLA `montarPeca`.
//
// ── Por que este arquivo existe (26/08/2026) ───────────────────────────────
//
// `regua-da-peca-final.ts` entrou no caminho vivo de `artes.ts`: a peça é
// MEDIDA antes de virar arquivo, e "não decodifica" é reprovação — de
// propósito, porque foi assim que os portões de decoração desta casa nasceram.
//
// Vários testes dublavam `montarPeca` devolvendo `Buffer.from("peca")`. Aquilo
// exercitava a fiação e passou a fabricar exatamente o defeito que a régua
// existe para pegar. Eles não estavam errados: estavam desatualizados.
//
// Aqui mora o arquivo REAL — uma peça que estava viva em produção em
// 26/08/2026 (/api/media/med_1f79e9f3_mt8xj2gu, 1080x1350, 150.203 bytes,
// sha256 1f79e9f3781ea11dc20ff1b58a3704162d1f5b5847b8156e122b68adda67bf8b) —
// para que todo dublê use a MESMA peça boa, e para que trocá-la um dia seja
// um lugar só.

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const PECA_COMPOSTA_REAL: Buffer = readFileSync(
  join(process.cwd(), "docs/entregas/peca-final-26-08/boa-med_1f79e9f3_mt8xj2gu.jpg"),
);

/**
 * O retorno de sucesso de `montarPeca`, com bytes que são imagem de verdade.
 *
 * `textosPintados` é o que o rasterizador CONFERIU no DOM, e a régua da peça
 * final cobra o título e a assinatura contra essa lista. Quem dubla precisa
 * declarar os dois — passar `[]` significa "a caixa saiu vazia", que é
 * reprovação, e é a resposta certa para esse caso.
 */
export function pecaCompostaOk(
  textosPintados: string[] = [],
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ok: true,
    bytes: PECA_COMPOSTA_REAL,
    largura: 1080,
    altura: 1350,
    textosPintados,
    textoRecusado: [],
    encolheu: false,
    origemDoMolde: "marca",
    lacunasDoMolde: [],
    ...extra,
  };
}
