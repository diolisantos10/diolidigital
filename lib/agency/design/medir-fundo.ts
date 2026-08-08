// medir-fundo.ts — O ÚNICO LUGAR QUE DECODIFICA IMAGEM PARA A TRAVA DE FUNDO.
//
// A decisão mora em `trava-de-fundo.ts`, que é puro. Aqui só se MEDE. A divisão
// existe para que a régua possa ser exercitada sem `sharp` e para que trocar de
// biblioteca de imagem não reabra a discussão sobre o que é uma foto.
//
// A amostra é reduzida a 160px de largura de propósito: medir 1080×1350 inteiro
// custa tempo e não muda a resposta: desenho chapado continua chapado depois de
// reamostrado, e fotografia continua com textura. O que a redução PODE fazer é
// suavizar o grão de uma foto legítima — por isso o piso de textura é frouxo.

import { MedidaDoFundo } from "./trava-de-fundo";

/** Largura da amostra. Altura sai da proporção. */
const LARGURA_DA_AMOSTRA = 160;

/** Bits jogados fora por canal antes de contar cores. Sem isso, o ruído de
 *  compressão JPEG inventa "cores distintas" num campo chapado. */
const BITS_DESCARTADOS = 3;

/**
 * Mede um fundo a partir dos bytes de uma imagem. Nunca lança por conteúdo:
 * imagem que não decodifica devolve `null`, e quem chama trata a ausência de
 * medida como ausência de medida — nunca como aprovação.
 */
export async function medirFundo(bytes: Buffer): Promise<MedidaDoFundo | null> {
  let dados: { data: Buffer; info: { width: number; height: number; channels: number } };
  try {
    const { default: sharp } = await import("sharp");
    dados = await sharp(bytes)
      .resize({ width: LARGURA_DA_AMOSTRA, withoutEnlargement: false })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch {
    return null;
  }

  const { data, info } = dados;
  const { width: w, height: h, channels: c } = info;
  if (w < 2 || h < 2) return null;

  const contagem = new Map<number, number>();
  let somaDeDiferencas = 0;
  let paresMedidos = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * c;
      const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;

      const chave =
        ((r >> BITS_DESCARTADOS) << 16) | ((g >> BITS_DESCARTADOS) << 8) | (b >> BITS_DESCARTADOS);
      contagem.set(chave, (contagem.get(chave) ?? 0) + 1);

      // Vizinho da direita e vizinho de baixo. Dois eixos, e não um: uma
      // imagem de listras horizontais é lisa no eixo x e não é foto.
      if (x + 1 < w) {
        const j = (y * w + x + 1) * c;
        somaDeDiferencas +=
          (Math.abs(r - data[j]!) + Math.abs(g - data[j + 1]!) + Math.abs(b - data[j + 2]!)) / 3;
        paresMedidos++;
      }
      if (y + 1 < h) {
        const j = ((y + 1) * w + x) * c;
        somaDeDiferencas +=
          (Math.abs(r - data[j]!) + Math.abs(g - data[j + 1]!) + Math.abs(b - data[j + 2]!)) / 3;
        paresMedidos++;
      }
    }
  }

  const total = w * h;
  let dominante = 0;
  for (const n of contagem.values()) if (n > dominante) dominante = n;

  return {
    coresDistintas: contagem.size,
    fracaoDaCorDominante: dominante / total,
    texturaMedia: paresMedidos === 0 ? 0 : somaDeDiferencas / paresMedidos / 255,
  };
}
