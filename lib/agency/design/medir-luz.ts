// medir-luz.ts — QUANTA LUZ TEM ESTA PEÇA. O lado que decodifica.
//
// Irmão de `medir-fundo.ts`, e pelo mesmo motivo de arquitetura: a DECISÃO é
// pura e mora em `esteira/regua-da-refacao.ts`; aqui só se MEDE. A divisão
// permite exercitar a régua inteira sem `sharp` e sem imagem — e é o que faz a
// prova de mutação caber num teste de custo zero.
//
// ── POR QUE ESTA MEDIDA EXISTE (rodada paga, 27/08/2026) ────────────────────
//
// O cliente escreveu "o fundo ficou escuro demais... refaça com MAIS LUZ". A
// peça voltou com 26% MENOS luz (luminância média 40,5 → 29,8; terço de cima
// 64,2 → 42,1) e a casa entregou, verde, sem ninguém ficar vermelho — porque
// **nenhuma régua comparava a peça nova com a anterior**.
//
// Os números acima foram medidos com exatamente esta conta (Rec. 709, escala
// 0–255, amostra reduzida), sobre os dois arquivos guardados em
// `docs/entregas/refacao-27-08/`.
//
// ── O QUE ESTA MEDIDA **NÃO** ALCANÇA, e fica declarado ──────────────────────
//
// Luminância e contraste são pixel. "O prato em primeiro plano", "o prato
// some", "a foto ficou sem graça" **não são medidos aqui** e não podem ser
// fingidos: quem lê isso é `regua-da-refacao.ts`, que os devolve na lista de
// não-medidos, com dono e próxima ação. *Não inventar medida que não se sabe
// medir* é a metade honesta desta régua.

/** O que a peça tem de luz. Tudo em escala 0–255, como a fotometria da casa. */
export interface MedidaDeLuz {
  /** Luminância média de toda a peça (Rec. 709). */
  luminanciaMedia: number;
  /** Os três terços horizontais, de cima para baixo. */
  tercoSuperior: number;
  tercoMeio: number;
  tercoInferior: number;
  /** Desvio-padrão da luminância — o quanto a peça tem de claro E escuro. */
  contraste: number;
}

/** Largura da amostra. A mesma de `medir-fundo.ts`, pelo mesmo motivo: medir
 *  1080×1350 inteiro custa tempo e não muda a resposta de luz. */
const LARGURA_DA_AMOSTRA = 160;

/**
 * Mede a luz de uma imagem a partir dos bytes.
 *
 * Nunca lança: imagem que não decodifica (ou `sharp` ausente) devolve `null`,
 * e quem chama trata ausência de medida como ausência de medida — a régua da
 * refação escala para gente em vez de aprovar no escuro.
 */
export async function medirLuz(bytes: Buffer): Promise<MedidaDeLuz | null> {
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
  if (w < 3 || h < 3) return null;

  const somaPorFaixa = [0, 0, 0];
  const pixelsPorFaixa = [0, 0, 0];
  let soma = 0;
  let somaQuadrados = 0;

  const corte1 = Math.floor(h / 3);
  const corte2 = Math.floor((2 * h) / 3);

  for (let y = 0; y < h; y++) {
    const faixa = y < corte1 ? 0 : y < corte2 ? 1 : 2;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * c;
      // Rec. 709 — a mesma que `contraste.ts` usa para a razão de contraste do
      // título. Uma segunda fórmula de luminância nesta casa faria a régua da
      // refação e a da legibilidade discordarem sobre a mesma peça.
      const l = 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
      soma += l;
      somaQuadrados += l * l;
      somaPorFaixa[faixa]! += l;
      pixelsPorFaixa[faixa]!++;
    }
  }

  const total = w * h;
  const media = soma / total;
  const variancia = Math.max(0, somaQuadrados / total - media * media);
  const porFaixa = (i: number): number =>
    pixelsPorFaixa[i]! === 0 ? 0 : Math.round((somaPorFaixa[i]! / pixelsPorFaixa[i]!) * 10) / 10;

  return {
    luminanciaMedia: Math.round(media * 10) / 10,
    tercoSuperior: porFaixa(0),
    tercoMeio: porFaixa(1),
    tercoInferior: porFaixa(2),
    contraste: Math.round(Math.sqrt(variancia) * 10) / 10,
  };
}
