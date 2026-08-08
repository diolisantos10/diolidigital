// A LETRA DA PEÇA É A LETRA CERTA — e há como provar isso sem olhar a peça.
//
// O CEO reprovou as peças do CityJobs em 08/08/2026, e uma das causas foi
// tipográfica: o molde pedia `Inter`/`Helvetica Neue`/`Arial` e o contêiner que
// rasteriza não tem nenhuma das três. A peça saía em Liberation Sans, em
// silêncio — pilha de fonte não avisa quando cai.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  cssDasFontesEmbutidas,
  ARCHIVO_BLACK_WOFF2_BASE64,
  ARCHIVO_WOFF2_BASE64,
} from "@/lib/agency/design/fontes-embutidas";
import {
  montarHtmlDaPeca,
  moldeDoCliente,
  FAMILIAS_DA_ARTE,
  FAMILIAS_DE_DISPLAY,
} from "@/lib/agency/design/molde";

const FONTES = join(process.cwd(), "public/fonts");

describe("os bytes embutidos são os bytes do arquivo — duas cópias divergem", () => {
  it.each([
    ["ArchivoBlack-latin.woff2", ARCHIVO_BLACK_WOFF2_BASE64],
    ["Archivo-latin.woff2", ARCHIVO_WOFF2_BASE64],
  ])("%s bate byte a byte com o base64 do módulo", (arquivo, base64) => {
    const doDisco = readFileSync(join(FONTES, arquivo));
    expect(Buffer.from(base64, "base64").equals(doDisco)).toBe(true);
  });

  it("o que está embutido é WOFF2 de verdade, não um arquivo qualquer", () => {
    for (const b64 of [ARCHIVO_BLACK_WOFF2_BASE64, ARCHIVO_WOFF2_BASE64]) {
      // Assinatura do WOFF2: os 4 primeiros bytes são `wOF2`.
      expect(Buffer.from(b64, "base64").subarray(0, 4).toString("latin1")).toBe("wOF2");
    }
  });
});

describe("a fonte viaja DENTRO do documento", () => {
  const molde = moldeDoCliente({
    primaryColor: "#0D2B4D",
    secondaryColor: "#16A34A",
    typography: "Arial Black / Arial / Helvetica, sans-serif",
  });
  const html = montarHtmlDaPeca(
    { formato: "feed", composicao: "dividido-reto", titulo: "Teste", selo: "Alto Tietê" },
    molde,
  );

  it("as duas famílias entram como @font-face base64 — as duas, ou nenhuma", () => {
    const css = cssDasFontesEmbutidas();
    expect(css).toContain("font-family:'Archivo Black'");
    expect(css).toContain("font-family:'Archivo'");
    expect(html).toContain("data:font/woff2;base64,");
    expect(html).toContain("font-family:'Archivo Black'");
  });

  it("🔴 NENHUMA fonte é buscada na rede — o render roda offline", () => {
    expect(html).not.toMatch(/@import/);
    expect(html).not.toMatch(/https?:\/\/fonts\./);
    expect(html).not.toMatch(/url\(\s*['"]?https?:/);
  });

  it("o título usa a família de DISPLAY, e o corpo a do texto", () => {
    expect(molde.familiaDisplay).toBe(FAMILIAS_DE_DISPLAY.neutra);
    expect(molde.familia).toBe(FAMILIAS_DA_ARTE.neutra);
    expect(html).toContain(`font-family: ${FAMILIAS_DE_DISPLAY.neutra}`);
  });

  it("a pilha começa por uma fonte que EXISTE de verdade no rasterizador", () => {
    // A regra que faltava: não basta a pilha terminar em `sans-serif`. Se a
    // primeira família da lista não viajar embutida, a peça cai para a fonte do
    // sistema e ninguém fica sabendo.
    expect(FAMILIAS_DA_ARTE.neutra!.startsWith("'Archivo'")).toBe(true);
    expect(FAMILIAS_DE_DISPLAY.neutra!.startsWith("'Archivo Black'")).toBe(true);
  });
});
