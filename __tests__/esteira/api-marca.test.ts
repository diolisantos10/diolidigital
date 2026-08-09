// A porta de escrita da ficha de marca.
//
// Rota que grava identidade de cliente. As duas metades em cada trava: grava o
// que deve, e recusa (ou declara) o que não deve.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const BRUTO = fs.readFileSync(
  path.join(process.cwd(), "app/api/agency/clients/[id]/marca/route.ts"),
  "utf8",
);
const SRC = BRUTO.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("ninguém escreve na ficha sem estar autenticado", () => {
  for (const metodo of ["GET", "PUT"]) {
    it(`${metodo} exige sessão`, () => {
      const i = SRC.indexOf(`export async function ${metodo}`);
      expect(i, `${metodo} sumiu da rota`).toBeGreaterThan(-1);
      const corpo = SRC.slice(i, i + 400);
      expect(corpo).toContain("await getSession()");
      expect(corpo).toContain("401");
    });
  }
});

describe("as proibições não têm porta aqui — elas já têm dono", () => {
  it("nenhuma coluna do mapa grava proibição", () => {
    // Escrever a mesma regra por dois caminhos é como nasce a divergência que
    // esta casa já pagou em preço e em material.
    const i = SRC.indexOf("const COLUNA");
    const mapa = SRC.slice(i, SRC.indexOf("};", i));
    expect(mapa.includes("proibicoes:"), "a rota passou a gravar proibição por um segundo caminho").toBe(false);
  });
});

describe("resposta de cliente não vai para o lixo em silêncio", () => {
  it("campo desconhecido é DECLARADO, não ignorado calado", () => {
    expect(SRC.includes("ignorados.push(campo)")).toBe(true);
    expect(SRC.includes("ignorados")).toBe(true);
  });

  it("texto puro num campo JSON é embrulhado, não recusado nem gravado cru", () => {
    // Recusar perderia a resposta; gravar cru quebraria a leitura seguinte e o
    // campo sumiria da ficha sem ninguém perceber.
    expect(SRC.includes("envelopar(")).toBe(true);
  });
});

describe("a tela não precisa contar nada sozinha", () => {
  it("o GET já devolve quantos faltam e o que a falta impede", () => {
    const i = SRC.indexOf("export async function GET");
    const corpo = SRC.slice(i, SRC.indexOf("export async function PUT"));
    expect(corpo).toContain("faltam");
    expect(corpo).toContain("oQueAFaltaImpede");
  });

  it("o GET já devolve as próximas perguntas prontas", () => {
    const i = SRC.indexOf("export async function GET");
    const corpo = SRC.slice(i, SRC.indexOf("export async function PUT"));
    expect(corpo).toContain("proximasPerguntas(ficha)");
  });
});
