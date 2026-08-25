// legibilidade-do-titulo.ts — O TÍTULO SOBRE FOTOGRAFIA, MEDIDO NO ARQUIVO.
//
// ═══════════════════════════════════════════════════════════════════════════
// A DÍVIDA QUE ESTE ARQUIVO FECHA (Auditor, 4ª e 5ª rodadas)
// ═══════════════════════════════════════════════════════════════════════════
//
// Item 3 do `O_QUE_NAO_FOI_MEDIDO`, escrito pela própria casa contra si mesma:
//
//   "O portão de contraste mede pares de superfície CHAPADA. Na peça que saiu,
//    o título é branco sobre foto de alto ruído, e **ninguém mede esse par**.
//    O portão não reprova porque não olha para lá."
//
// O Auditor abriu a peça e confirmou com os olhos: o título estava no limite da
// ilegibilidade. É a dívida de maior consequência para quem paga — o título é a
// primeira coisa que o cliente do cliente lê, e a única que ele lê se estiver
// com pressa.
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUE ISTO NÃO É UM SEGUNDO `contraste.ts`
// ═══════════════════════════════════════════════════════════════════════════
//
// `contraste.ts` mede um PAR DE CORES: a primária da marca contra a tinta que
// `tintaSobre` escolheu. É a régua certa para superfície chapada — e ele diz,
// com todas as letras, que NÃO mede texto sobre foto, porque ali não há uma cor
// de fundo, há milhões.
//
// Aqui o fundo é medido, não declarado: os PIXELS REAIS do JPEG que saiu, dentro
// da caixa que o título ocupa (`ConferenciaDaLetra.tituloCaixa`, medida no DOM
// depois do encolhimento — que é quando ela é verdade). A fórmula é a MESMA
// (`razaoDeContraste`, WCAG): duas réguas com fórmulas diferentes não se
// conferem, se contradizem.
//
// ═══════════════════════════════════════════════════════════════════════════
// O QUE ESTA RÉGUA AFIRMA — E O QUE ELA AINDA NÃO AFIRMA
// ═══════════════════════════════════════════════════════════════════════════
//
// AFIRMA: o pior pedaço do fundo sob o título tem contraste X com a tinta do
// título. "Pior pedaço" e não "média": a média é a armadilha desta medição —
// um fundo metade preto e metade branco tem média cinza e contraste médio
// aceitável, e o título some justamente na metade clara. A pessoa lê a linha
// inteira, não a média dela.
//
// NÃO AFIRMA: que a peça está bonita, que a tipografia é boa, ou que o título
// é legível a três metros. Legibilidade tipográfica continua não medida, e
// continua declarada.

import { luminancia, corValida } from "./molde";
import { razaoDeContraste, CONTRASTE_MINIMO } from "./contraste";

/**
 * O PISO PARA O TÍTULO, e por que ele NÃO é o mesmo de `contraste.ts`.
 *
 * `CONTRASTE_MINIMO` (4,5:1) é o piso da WCAG AA para texto NORMAL, e lá ele é
 * o certo porque a mesma tinta escreve a assinatura, que é pequena.
 *
 * O título de um story tem 96px em 1920 de altura. A WCAG chama isso de texto
 * grande com folga, e o piso de texto grande é 3:1. Adotar 4,5 aqui reprovaria
 * peças legíveis, e uma régua que reprova o que está bom é abandonada na
 * primeira semana — e aí não protege ninguém.
 *
 * O que NÃO se faz é o contrário: afrouxar abaixo de 3.
 */
export const CONTRASTE_MINIMO_DO_TITULO = 3;

/** Quanto do bloco é amostrado. Reduzir a leitura não muda a resposta e evita
 *  percorrer ~200 mil pixels por peça. */
const PASSO_DA_AMOSTRA = 3;

/**
 * Em quantas faixas horizontais a caixa é dividida antes de medir.
 *
 * O PIOR PEDAÇO precisa de um pedaço. Medindo a caixa inteira como uma coisa
 * só, o degradê do molde (escuro embaixo, claro em cima) vira uma média que
 * não descreve nenhuma linha do título. Faixa a faixa, a linha que sumiu
 * aparece.
 */
const FAIXAS = 6;

export interface MedidaDaLegibilidade {
  /** A razão do PIOR pedaço do fundo sob o título. É esta que decide. */
  razaoNoPior: number;
  /** A razão do fundo médio — só para o registro de oficina. Nunca decide. */
  razaoNaMedia: number;
  /** A tinta do título, como o DOM a computou. */
  tinta: string;
  /** A cor do pior pedaço do fundo, em `#rrggbb`. */
  fundoNoPior: string;
  suficiente: boolean;
}

export interface CaixaDoTitulo {
  x: number; y: number; largura: number; altura: number;
}

/**
 * MEDE A LEGIBILIDADE DO TÍTULO NO ARQUIVO QUE SAIU.
 *
 * Nunca lança: imagem que não decodifica, caixa fora do quadro ou tinta
 * inválida devolvem `null`. E **`null` não é aprovação** — quem chama trata a
 * ausência de medida como ausência de medida (guardrail 1). Afirmar
 * legibilidade sem medir é exatamente o que este arquivo veio acabar.
 */
export async function medirLegibilidadeDoTitulo(
  bytes: Buffer,
  caixa: CaixaDoTitulo,
  tinta: string,
): Promise<MedidaDaLegibilidade | null> {
  if (!corValida(tinta)) return null;
  if (caixa.largura < 4 || caixa.altura < 4) return null;

  let dados: { data: Buffer; info: { width: number; height: number; channels: number } };
  try {
    const { default: sharp } = await import("sharp");
    dados = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  } catch {
    return null;
  }

  const { data, info } = dados;
  const { width: w, height: h, channels: c } = info;

  // A caixa recortada ao quadro. Caixa que sai do quadro não é caixa: medir o
  // que não existe devolveria preto e um contraste ótimo de mentira.
  const x0 = Math.max(0, Math.min(caixa.x, w - 1));
  const y0 = Math.max(0, Math.min(caixa.y, h - 1));
  const x1 = Math.max(x0 + 1, Math.min(caixa.x + caixa.largura, w));
  const y1 = Math.max(y0 + 1, Math.min(caixa.y + caixa.altura, h));
  if (x1 - x0 < 4 || y1 - y0 < 4) return null;

  const alturaDaFaixa = Math.max(1, Math.floor((y1 - y0) / FAIXAS));

  let piorRazao = Infinity;
  let piorCor = "#000000";
  let somaR = 0, somaG = 0, somaB = 0, totalGeral = 0;

  for (let faixa = 0; faixa < FAIXAS; faixa++) {
    const fy0 = y0 + faixa * alturaDaFaixa;
    const fy1 = faixa === FAIXAS - 1 ? y1 : Math.min(y1, fy0 + alturaDaFaixa);
    if (fy1 - fy0 < 1) continue;

    let r = 0, g = 0, b = 0, n = 0;
    for (let y = fy0; y < fy1; y += PASSO_DA_AMOSTRA) {
      for (let x = x0; x < x1; x += PASSO_DA_AMOSTRA) {
        const i = (y * w + x) * c;
        r += data[i]!; g += data[i + 1]!; b += data[i + 2]!;
        n++;
      }
    }
    if (n === 0) continue;
    somaR += r; somaG += g; somaB += b; totalGeral += n;

    // ⚠️ A MÉDIA DA FAIXA INCLUI OS PIXELS DA PRÓPRIA LETRA, e isso é de
    // propósito: separar letra de fundo exigiria segmentar o glifo, e uma
    // segmentação errada mediria o par errado com ar de precisão. Incluir a
    // letra puxa a média NA DIREÇÃO DA TINTA, ou seja, aproxima os dois lados e
    // BAIXA a razão medida. A régua erra para o lado seguro: ela pode reprovar
    // um título que estava no limite, nunca aprovar um ilegível.
    const cor = hex(Math.round(r / n), Math.round(g / n), Math.round(b / n));
    const razao = razaoDeContraste(cor, tinta);
    if (razao !== null && razao < piorRazao) {
      piorRazao = razao;
      piorCor = cor;
    }
  }

  if (!Number.isFinite(piorRazao) || totalGeral === 0) return null;

  const corMedia = hex(
    Math.round(somaR / totalGeral), Math.round(somaG / totalGeral), Math.round(somaB / totalGeral),
  );
  const razaoNaMedia = razaoDeContraste(corMedia, tinta) ?? 0;

  return {
    razaoNoPior: piorRazao,
    razaoNaMedia,
    tinta,
    fundoNoPior: piorCor,
    suficiente: piorRazao >= CONTRASTE_MINIMO_DO_TITULO,
  };
}

/** A frase da recusa, COM O NÚMERO. Placar sem número não é prova, e quem vai
 *  consertar o molde precisa saber de quanto para quanto. */
export function motivoDaLegibilidade(m: MedidaDaLegibilidade): string {
  return (
    `o título saiu com contraste de ${m.razaoNoPior}:1 contra o pedaço mais difícil do fundo ` +
    `(${m.fundoNoPior}, tinta ${m.tinta}), e o mínimo para título é ${CONTRASTE_MINIMO_DO_TITULO}:1. ` +
    "Nessa faixa a primeira linha que o cliente do cliente lê é a que ele não consegue ler. " +
    "Dono: a agência (produção). Próxima ação: escurecer o degradê sob o título ou trocar a foto de fundo."
  );
}

function hex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0")).join("");
}

/** Reexportado para quem mede: o piso de superfície chapada continua sendo o
 *  de `contraste.ts`, e os dois números não podem ser confundidos. */
export { CONTRASTE_MINIMO, luminancia };
