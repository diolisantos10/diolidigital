// medir-peca-final.ts — O ÚNICO LUGAR QUE DECODIFICA A PEÇA COMPOSTA.
//
// A decisão mora em `regua-da-peca-final.ts`, que é puro. Aqui só se MEDE.
// Mesma divisão de `medir-fundo.ts`, e pelo mesmo motivo: a régua tem de poder
// ser exercitada sem `sharp`, e trocar de biblioteca de imagem não pode
// reabrir a discussão sobre o que é uma peça entregável.

import { MedidaDaPecaFinal } from "./regua-da-peca-final";

/** Largura da amostra. A altura sai da proporção do recorte. */
const LARGURA_DA_AMOSTRA = 160;
/** Bits jogados fora por canal antes de contar cores — o ruído do JPEG inventa
 *  "cores distintas" num campo chapado se ninguém reduzir a profundidade. */
const BITS_DESCARTADOS = 3;

// ── A FAIXA DA FOTO ─────────────────────────────────────────────────────────
//
// 35%..80% da altura, largura inteira. Não é um chute: é onde a FOTO está em
// todas as composições desta casa (`molde.ts`) — o título mora na faixa de
// cima, a assinatura e o logo na de baixo, e o miolo é imagem em foto-cheia,
// meia-tela e faixa-de-base. Medir a peça INTEIRA seria medir a tipografia
// junto, e foi isso que fez o portão do fundo não servir aqui.
const FAIXA_DA_FOTO_TOPO = 0.35;
const FAIXA_DA_FOTO_ALTURA = 0.45;

/**
 * Mede a peça composta a partir dos bytes do arquivo que vai ao cliente.
 *
 * Nunca lança por conteúdo: imagem que não decodifica devolve `null`, e quem
 * chama trata ausência de medida como ausência de medida — nunca como
 * aprovação (`reguaDaPecaFinal` reprova `null` de propósito).
 */
export async function medirPecaFinal(bytes: Buffer): Promise<MedidaDaPecaFinal | null> {
  let sharp: typeof import("sharp");
  try {
    sharp = (await import("sharp")).default as unknown as typeof import("sharp");
  } catch {
    return null;
  }

  let largura = 0, altura = 0;
  try {
    const meta = await sharp(bytes).metadata();
    largura = meta.width ?? 0;
    altura = meta.height ?? 0;
  } catch {
    return null;
  }
  if (largura < 8 || altura < 8) return null;

  const topo = Math.round(altura * FAIXA_DA_FOTO_TOPO);
  const alturaDaFaixa = Math.max(2, Math.round(altura * FAIXA_DA_FOTO_ALTURA));
  if (topo + alturaDaFaixa > altura) return null;

  let dados: { data: Buffer; info: { width: number; height: number; channels: number } };
  try {
    dados = await sharp(bytes)
      .extract({ left: 0, top: topo, width: largura, height: alturaDaFaixa })
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

      // Dois eixos, e não um: campo listrado é liso num eixo só e não é foto.
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
    coresNaFaixaDaFoto: contagem.size,
    dominanteNaFaixaDaFoto: dominante / total,
    texturaNaFaixaDaFoto: paresMedidos === 0 ? 0 : somaDeDiferencas / paresMedidos / 255,
    bytesPorMegapixel: bytes.length / ((largura * altura) / 1_000_000),
  };
}
