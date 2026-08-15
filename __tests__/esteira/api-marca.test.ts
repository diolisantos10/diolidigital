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
const semComentario = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SRC = semComentario(BRUTO);

/** As outras duas pontas da mesma escrita. As três são lidas juntas porque o
 *  defeito de 15/08 morava na DIVERGÊNCIA entre elas, não dentro de uma. */
const PORTAL = semComentario(
  fs.readFileSync(path.join(process.cwd(), "app/api/portal/marca/route.ts"), "utf8"),
);
const ESCRITOR = semComentario(
  fs.readFileSync(path.join(process.cwd(), "lib/agency/esteira/escrita-da-ficha.ts"), "utf8"),
);

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
    //
    // O mapa saiu daqui em 15/08/2026 e virou fonte única em
    // `esteira/escrita-da-ficha.ts` — era a DUPLICAÇÃO dele (uma cópia por
    // rota) que gravava `reprovadas: []` fixo nas duas portas e mantinha todo
    // cliente com a marca não-constituída. O teste segue o mapa: procurar
    // `const COLUNA` num arquivo que não o tem mais devolveria -1 e passaria
    // sozinho, que é o pior desfecho possível para uma trava.
    const i = ESCRITOR.indexOf("export const COLUNA");
    expect(i, "o mapa de colunas mudou de casa — o teste ficou apontando para o vazio").toBeGreaterThan(-1);
    const mapa = ESCRITOR.slice(i, ESCRITOR.indexOf("};", i));
    expect(mapa.includes("proibicoes:"), "a ficha passou a gravar proibição por um segundo caminho").toBe(false);
  });

  it("nenhum dos dois lados escreve `BrandBrain` fora do escritor único", () => {
    // Um `upsert` solto numa rota é como a segunda cópia do envelope volta.
    expect(SRC.includes("prisma.brandBrain"), "a rota do painel voltou a escrever direto no banco").toBe(false);
    expect(PORTAL.includes("prisma.brandBrain"), "a rota do portal voltou a escrever direto no banco").toBe(false);
  });
});

describe("⭐ a metade que permite REPROVAR não pode nascer vazia", () => {
  it("nenhum escritor grava `reprovadas: []` nem `naoDizemos: \"\"` por literal", () => {
    // A linha que fechou a esteira inteira. Ela some do código e fica presa
    // aqui: quem a reintroduzir em qualquer um dos três arquivos vê vermelho.
    //
    // O que se procura é a metade negativa CONSTANTE ao lado de uma positiva
    // com valor — não um `""` qualquer. Um par vazio de partida é legítimo; o
    // defeito é gravar a resposta do cliente de um lado e o vazio do outro.
    const APROVADA_SEM_CONTRAEXEMPLO = /aprovadas:\s*\[[^\]]+\]\s*,\s*reprovadas:\s*\[\s*\]/;
    const DIZEMOS_SEM_O_QUE_NAO = /dizemos:(?!\s*"")\s*[^,\n]+,\s*naoDizemos:\s*""/;
    for (const [nome, fonte] of [["painel", SRC], ["portal", PORTAL], ["escritor", ESCRITOR]] as const) {
      expect(APROVADA_SEM_CONTRAEXEMPLO.test(fonte), `${nome}: \`reprovadas: []\` fixo voltou`).toBe(false);
      expect(DIZEMOS_SEM_O_QUE_NAO.test(fonte), `${nome}: \`naoDizemos: ""\` fixo voltou`).toBe(false);
    }
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
    expect(ESCRITOR.includes("export function envelopar(")).toBe(true);
    expect(SRC.includes("gravarRespostaDeMarca({")).toBe(true);
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
