// A LEGIBILIDADE DO TÍTULO SOBRE FOTO — a dívida nº 3, com régua.
//
// ── O QUE FOI MEDIDO CONTRA A CASA (Auditor, 4ª e 5ª rodadas) ──────────────
//
// O `O_QUE_NAO_FOI_MEDIDO` do e2e dizia, com todas as letras: "o título é
// branco sobre foto de alto ruído, e **ninguém mede esse par**. O portão não
// reprova porque não olha para lá." O Auditor abriu a peça e confirmou com os
// olhos: praticamente ilegível.
//
// Este arquivo prova as propriedades da régua em isolamento. A prova de que ela
// alcança a PEÇA DE VERDADE está no e2e do Story, medindo o JPEG que a rota
// pública serviu — aqui não se pode provar isso, e não se finge que sim.

import { describe, it, expect } from "vitest";
import {
  medirLegibilidadeDoTitulo,
  motivoDaLegibilidade,
  CONTRASTE_MINIMO_DO_TITULO,
} from "@/lib/agency/design/legibilidade-do-titulo";

const L = 400, A = 200;
const CAIXA = { x: 0, y: 0, largura: L, altura: A };

/** Uma imagem de teste: `cor(x, y)` devolve [r,g,b]. */
async function imagem(cor: (x: number, y: number) => [number, number, number]): Promise<Buffer> {
  const { default: sharp } = await import("sharp");
  const buf = Buffer.alloc(L * A * 3);
  for (let y = 0; y < A; y++) {
    for (let x = 0; x < L; x++) {
      const [r, g, b] = cor(x, y);
      const i = (y * L + x) * 3;
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b;
    }
  }
  return sharp(buf, { raw: { width: L, height: A, channels: 3 } }).png().toBuffer();
}

describe("a régua acha o título que some no fundo", () => {
  it("BRANCO SOBRE FUNDO CLARO reprova — é o caso que o Auditor viu com os olhos", async () => {
    const m = await medirLegibilidadeDoTitulo(await imagem(() => [230, 230, 230]), CAIXA, "#ffffff");
    expect(m).toBeTruthy();
    expect(m!.suficiente).toBe(false);
    expect(m!.razaoNoPior).toBeLessThan(CONTRASTE_MINIMO_DO_TITULO);
  });

  it("BRANCO SOBRE FUNDO ESCURO passa — a régua não reprova o que está bom", async () => {
    // Uma régua que reprova peça legível é abandonada na primeira semana, e aí
    // não protege ninguém.
    const m = await medirLegibilidadeDoTitulo(await imagem(() => [20, 30, 45]), CAIXA, "#ffffff");
    expect(m!.suficiente).toBe(true);
    expect(m!.razaoNoPior).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_DO_TITULO);
  });

  it("🔴 O PIOR PEDAÇO DECIDE, NÃO A MÉDIA — é aqui que a régua ingênua mente", async () => {
    // Metade escura em cima, metade clara embaixo. A MÉDIA dá um cinza com
    // contraste aceitável; a linha de baixo do título some. A pessoa lê a linha
    // inteira, não a média dela — e é exatamente assim que um título "aprovado
    // na média" chega ilegível ao cliente do cliente.
    const meioAMeio = await imagem((_x, y) => (y < A / 2 ? [10, 10, 10] : [235, 235, 235]));
    const m = await medirLegibilidadeDoTitulo(meioAMeio, CAIXA, "#ffffff");
    expect(m).toBeTruthy();
    expect(
      m!.suficiente,
      "a metade clara faz o título sumir, e uma régua de média aprovaria esta peça",
    ).toBe(false);
    expect(
      m!.razaoNaMedia,
      "e a prova de que a armadilha era real: NA MÉDIA esta peça passaria",
    ).toBeGreaterThan(m!.razaoNoPior);
  });

  it("a frase da recusa traz O NÚMERO — placar sem número não é prova", async () => {
    const m = await medirLegibilidadeDoTitulo(await imagem(() => [230, 230, 230]), CAIXA, "#ffffff");
    const frase = motivoDaLegibilidade(m!);
    expect(frase).toContain(String(m!.razaoNoPior));
    expect(frase, "dono").toMatch(/Dono:/);
    expect(frase, "próxima ação").toMatch(/Próxima ação:/);
  });
});

describe("não medir NÃO é aprovar (guardrail 1)", () => {
  it("tinta inválida devolve null, não um veredito", async () => {
    expect(await medirLegibilidadeDoTitulo(await imagem(() => [0, 0, 0]), CAIXA, "não-é-cor")).toBeNull();
  });

  it("caixa minúscula devolve null", async () => {
    const img = await imagem(() => [0, 0, 0]);
    expect(await medirLegibilidadeDoTitulo(img, { x: 0, y: 0, largura: 2, altura: 2 }, "#ffffff")).toBeNull();
  });

  it("bytes que não decodificam devolvem null — e nunca lançam", async () => {
    expect(await medirLegibilidadeDoTitulo(Buffer.from("isto não é uma imagem"), CAIXA, "#ffffff")).toBeNull();
  });

  it("caixa FORA do quadro é recortada, não inventada", async () => {
    // Medir o que não existe devolveria preto e um contraste ótimo de mentira.
    const img = await imagem(() => [235, 235, 235]);
    const m = await medirLegibilidadeDoTitulo(img, { x: L - 20, y: A - 20, largura: 900, altura: 900 }, "#ffffff");
    expect(m).toBeTruthy();
    expect(m!.suficiente, "o pedaço real é claro; a parte fora do quadro não pode salvá-lo").toBe(false);
  });
});
