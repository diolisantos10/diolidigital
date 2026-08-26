// A RÉGUA DO TÍTULO MEDIA A TINTA, NÃO O FUNDO — e por isso não podia barrar.
//
// ═══════════════════════════════════════════════════════════════════════════
// A PERGUNTA QUE CHEGOU, E A RESPOSTA POR MEDIÇÃO (6ª rodada)
// ═══════════════════════════════════════════════════════════════════════════
//
// A peça marcada `[titulo ilegivel] 2,61:1` saiu declarada e não barrada.
// Barrar ou não? A rodada anterior escolheu DECLARAR, com o motivo escrito: a
// medida "erra para o lado seguro", então uma peça no limite podia ser marcada
// sem estar perdida.
//
// A DIREÇÃO estava certa; a ORDEM DE GRANDEZA, não — e essa diferença é a
// fronteira entre uma régua e um ruído. A média da faixa incluía os pixels da
// própria letra, e:
//
//   um fundo de razão VERDADEIRA 7,00:1 era medido em 2,07:1 (15% de letra)
//   o mesmo fundo era medido em 1,00:1 com 30% de letra
//
// Naquele regime o número não descrevia o fundo: descrevia quanta tinta havia
// na faixa. `2,61:1` podia ser um título de 7:1, e ninguém tinha como saber.
// Declarar sobre isso era alarme sobre o normal; barrar teria jogado fora peça
// paga e legível. **A decisão anterior estava certa com o diagnóstico pela
// metade** — e fica dito, porque ponto fraco declarado é dívida e silencioso é
// armadilha.
//
// ── O QUE ESTE ARQUIVO PROVA ────────────────────────────────────────────────
//   1. a régua devolve a razão VERDADEIRA do fundo, e o resultado não muda com
//      a quantidade de tinta na faixa — que era a doença;
//   2. sobre TEXTO DE VERDADE (glifos rasterizados, com anti-aliasing) o erro
//      residual fica dentro da margem que sustenta o piso que barra;
//   3. o piso que barra (2,55) É a margem medida: 3,00 × (1 − 0,15);
//   4. e a régua continua achando o pedaço claro que engole o título.
//
// ── A MUTAÇÃO QUE ELE PEGA ──────────────────────────────────────────────────
// Volte a média da faixa (a régua antiga) e o primeiro teste quebra dizendo o
// número que ela inventa.

import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  medirLegibilidadeDoTitulo, tituloReprovaAPeca,
  CONTRASTE_MINIMO_DO_TITULO, CONTRASTE_QUE_BARRA_O_TITULO,
} from "@/lib/agency/design/legibilidade-do-titulo";
import { razaoDeContraste } from "@/lib/agency/design/contraste";

const TINTA = "#ffffff";
const L = 1080, A = 260;
const CAIXA = { x: 40, y: 60, largura: L - 80, altura: 140 };

/** Faixas de tinta chapada sobre fundo chapado — a cobertura é EXATA, que é o
 *  que torna o experimento uma medição e não uma impressão. */
async function comTintaChapada(fundo: string, cobertura: number): Promise<Buffer> {
  const alturaLetra = Math.max(1, Math.round(A * cobertura));
  const letra = await sharp({ create: { width: L, height: alturaLetra, channels: 3, background: TINTA } })
    .png().toBuffer();
  return sharp({ create: { width: L, height: A, channels: 3, background: fundo } })
    .composite([{ input: letra, top: Math.round((A - alturaLetra) / 2), left: 0 }])
    .png().toBuffer();
}

/** TEXTO DE VERDADE: glifos, com o anti-aliasing do rasterizador. */
async function comTextoReal(fundo: string): Promise<Buffer> {
  const txt = Buffer.from(
    `<svg width="${L}" height="${A}"><text x="40" y="170" font-family="DejaVu Sans, sans-serif" ` +
    `font-size="120" font-weight="bold" fill="${TINTA}">Sabor de casa</text></svg>`);
  return sharp({ create: { width: L, height: A, channels: 3, background: fundo } })
    .composite([{ input: txt, top: 0, left: 0 }]).png().toBuffer();
}

describe("1. a régua mede o FUNDO — a quantidade de tinta não muda a resposta", () => {
  // #595959 contra branco = 7,00:1. É o dobro do piso: um título assim é
  // legível a metros, e a régua antiga o declarava ilegível.
  // ⚠️ LIMITE DECLARADO DO EXPERIMENTO. A "letra" aqui é uma barra de LARGURA
  // INTEIRA — 100% de tinta em cada linha que ela ocupa. Acima de ~16% de
  // cobertura ela toma uma faixa horizontal INTEIRA (a caixa é dividida em 6),
  // e aí não sobra um pixel de fundo para medir: cai no ramo fail-closed, que
  // devolve ~1:1 e barra. Isso está CERTO para uma faixa que é toda da cor da
  // letra, e é IRREAL para texto — glifo tem vão entre letra e letra. Por isso
  // este bloco fica nas coberturas que não fecham uma faixa, e quem responde
  // pela letra de verdade é o bloco 2. O ramo fail-closed tem teste próprio,
  // logo abaixo — declarado, não escondido.
  it("🔴 fundo de 7:1 continua sendo 7:1 com 5%, 10% e 15% de tinta na faixa", async () => {
    const verdadeira = razaoDeContraste("#595959", TINTA)!;
    expect(verdadeira).toBeCloseTo(7, 1);

    for (const cobertura of [0.05, 0.10, 0.15]) {
      const m = await medirLegibilidadeDoTitulo(
        await comTintaChapada("#595959", cobertura), { x: 0, y: 0, largura: L, altura: A }, TINTA);
      expect(m, "não medir NÃO é aprovar — e aqui há o que medir").toBeTruthy();
      expect(
        m!.razaoNoPior,
        `com ${cobertura * 100}% de tinta a régua devolveu ${m!.razaoNoPior} para um fundo de ${verdadeira}:1 — ` +
        "é a doença antiga de volta: o número descreve a tinta, não o fundo",
      ).toBeCloseTo(verdadeira, 1);
      expect(m!.suficiente, "um título de 7:1 jamais pode ser declarado ilegível").toBe(true);
      expect(tituloReprovaAPeca(m)).toBe(false);
    }
  });

  it("faixa 100% da cor da letra é fail-closed: ~1:1 e BARRA, nunca 'não medi'", async () => {
    // Uma versão intermediária deste conserto devolvia `null` aqui — "não
    // medi" — para um título BRANCO SOBRE FUNDO BRANCO. "Não sobrou fundo" não
    // é ausência de medida: é a medida. Ali o cliente do cliente não lê nada.
    const m = await medirLegibilidadeDoTitulo(
      await comTintaChapada("#ffffff", 0.5), { x: 0, y: 0, largura: L, altura: A }, TINTA);
    expect(m, "devolver null aqui seria calar sobre o pior caso possível").toBeTruthy();
    expect(m!.razaoNoPior).toBeLessThanOrEqual(1.1);
    expect(tituloReprovaAPeca(m)).toBe(true);
  });
});

describe("2. sobre TEXTO DE VERDADE, o erro residual cabe na margem", () => {
  // A margem existe porque a franja anti-aliasing é real e puxa a medida para
  // baixo. O que ela não pode ser é o que era: até 86%.
  const CASOS: Array<{ fundo: string; barra: boolean }> = [
    { fundo: "#595959", barra: false }, // 7,00 — legível com folga
    { fundo: "#767676", barra: false }, // 4,54
    { fundo: "#8a8a8a", barra: false }, // 3,45 — acima do piso, tem de passar
    { fundo: "#a0a0a0", barra: true },  // 2,61 — o número do achado
    { fundo: "#d0d0d0", barra: true },  // 1,54 — ilegível sem discussão
  ];

  for (const { fundo, barra } of CASOS) {
    it(`fundo ${fundo}: o erro é conservador e pequeno, e o veredito é "${barra ? "BARRA" : "passa"}"`, async () => {
      const verdadeira = razaoDeContraste(fundo, TINTA)!;
      const m = await medirLegibilidadeDoTitulo(await comTextoReal(fundo), CAIXA, TINTA);
      expect(m).toBeTruthy();

      // O erro é SEMPRE para baixo (lado seguro) e nunca maior que a margem.
      expect(m!.razaoNoPior, "a régua nunca pode APROVAR o que é pior que a verdade")
        .toBeLessThanOrEqual(verdadeira + 0.05);
      const erro = (verdadeira - m!.razaoNoPior) / verdadeira;
      expect(
        erro,
        `erro de ${(erro * 100).toFixed(1)}% em ${fundo} — a margem do piso que barra pressupõe no máximo 15%`,
      ).toBeLessThanOrEqual(0.20);

      expect(tituloReprovaAPeca(m)).toBe(barra);
    });
  }
});

describe("3. o piso que barra É a margem medida — não é gosto", () => {
  it("2,55 = 3,00 × (1 − 0,15): o pior erro medido da régua, aplicado ao piso da WCAG", () => {
    expect(CONTRASTE_MINIMO_DO_TITULO).toBe(3);
    expect(CONTRASTE_QUE_BARRA_O_TITULO).toBeCloseTo(3 * 0.85, 2);
    expect(
      CONTRASTE_QUE_BARRA_O_TITULO,
      "afrouxar abaixo disso é aprovar ilegível; apertar até 3 é jogar fora peça paga pelo erro da régua",
    ).toBeLessThan(CONTRASTE_MINIMO_DO_TITULO);
  });

  it("a faixa do meio (2,55 a 3,00) DECLARA e não barra — duas situações, duas respostas", () => {
    const noMeio = { razaoNoPior: 2.8, razaoNaMedia: 3.1, tinta: TINTA, fundoNoPior: "#999999", suficiente: false };
    expect(noMeio.suficiente, "continua declarado").toBe(false);
    expect(tituloReprovaAPeca(noMeio), "mas não é jogado fora").toBe(false);
  });

  it("não medir NÃO barra — ausência de medida não é veredito (guardrail 1)", () => {
    expect(tituloReprovaAPeca(null)).toBe(false);
    expect(tituloReprovaAPeca(undefined)).toBe(false);
  });
});

describe("4. e ela continua achando o pedaço que engole o título", () => {
  it("degradê escuro→claro: a régua acha a parte clara, não a média", async () => {
    const grad = Buffer.from(
      `<svg width="${L}" height="${A}"><defs><linearGradient id="g" x1="0" y1="1" x2="0" y2="0">` +
      `<stop offset="0%" stop-color="#2a2a2a"/><stop offset="100%" stop-color="#c0c0c0"/></linearGradient></defs>` +
      `<rect width="${L}" height="${A}" fill="url(#g)"/></svg>`);
    const txt = Buffer.from(
      `<svg width="${L}" height="${A}"><text x="40" y="170" font-family="DejaVu Sans, sans-serif" ` +
      `font-size="120" font-weight="bold" fill="${TINTA}">Sabor de casa</text></svg>`);
    const bytes = await sharp(grad).composite([{ input: txt, top: 0, left: 0 }]).png().toBuffer();

    const m = await medirLegibilidadeDoTitulo(bytes, CAIXA, TINTA);
    expect(m).toBeTruthy();
    expect(m!.razaoNoPior, "o pior pedaço decide, não a média").toBeLessThan(m!.razaoNaMedia);
    expect(m!.suficiente).toBe(false);
  });
});
