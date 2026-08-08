// kit-de-marca.test.ts — O LOGO DA CASA, E A REGRA QUE ELE NÃO PODE QUEBRAR.
//
// A cobrança do CEO em 08/08/2026: "você tem um designer aí dentro do seu
// sistema que não consegue deixar um logo transparente?". A agência vinha
// pedindo a ele o arquivo do logo da Dioli — que estava versionado o tempo
// inteiro — porque a peça só sabia buscar logo no Google Drive DO CLIENTE, e a
// Dioli não conecta um Drive para si mesma.
//
// Este arquivo prova as DUAS metades, e a segunda é a que importa mais:
//   1. a Dioli assina a peça com o logo REAL;
//   2. todo o resto continua com o comportamento honesto — sem arquivo,
//      monograma das iniciais e a falta DECLARADA. Nenhum logo desenhado.
//
// A metade 2 é o teste que impede a metade 1 de virar uma porta aberta.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { montarHtmlDaPeca, moldeDoCliente, moldeComLogo, LACUNA_DO_LOGO, NEUTRO, tintaSobre } from "@/lib/agency/design/molde";
import { logoDaCasa, ehACasa, tomDaCasaSobre, NOMES_DA_CASA } from "@/lib/agency/design/logo-da-casa";
import { LOGOTIPO_DA_CASA, SIMBOLO_DA_CASA } from "@/lib/agency/design/marca-da-casa";

const peca = {
  formato: "feed" as const,
  titulo: "Estratégia humana. Execução inteligente.",
  assinatura: "Dioli Digital",
  fundo: null,
};

// ───────────────────────────────────────────────────────────────────────────
describe("🏠 metade 1 — a Dioli deixa de ser cliente sem logo", () => {
  it("a casa é reconhecida por NOME, com ou sem acento e caixa", () => {
    expect(ehACasa("Dioli Digital")).toBe(true);
    expect(ehACasa("  dioli   digital  ")).toBe(true);
    expect(ehACasa("Dioli Agência")).toBe(true);
    expect(ehACasa("DIOLI DIGITAL STUDIO")).toBe(true);
  });

  it("a peça da casa sai assinada com o SÍMBOLO REAL, e o monograma some", () => {
    const base = moldeDoCliente(null);
    const logo = logoDaCasa("Dioli Digital Studio", base.primaria);
    expect(logo).not.toBeNull();

    const molde = moldeComLogo(base, logo);
    const html = montarHtmlDaPeca(peca, molde);

    expect(html).toContain('class="logo-real"');
    // O monograma É o substituto declarado do logo. Tendo o logo, ele sai —
    // senão a peça é assinada duas vezes, uma delas com iniciais inventadas.
    expect(html).not.toContain('class="monograma"');
    // E a falta NÃO é mais declarada, porque ela não existe mais.
    expect(molde.lacunas).not.toContain(LACUNA_DO_LOGO);
  });

  it("os bytes no documento são MESMO o símbolo da casa — não um placeholder", () => {
    const logo = logoDaCasa("Dioli", NEUTRO.primaria)!;
    const svg = Buffer.from(logo.dataUrl.split(",")[1]!, "base64").toString("utf8");
    // Os dois anéis do "Oo", com os raios medidos no arquivo oficial.
    expect(svg).toContain("168.5");
    expect(svg).toContain("84.25");
    expect(svg).toContain('viewBox="0 0 548 338"');
    // Curvas, nunca `<text>`: SVG com font-family abre em Times New Roman na
    // máquina de quem não tem a fonte.
    expect(svg).not.toContain("<text");
    expect(svg).not.toContain("font-family");
  });

  it("o TOM é conta de contraste, não gosto — e bate com a tinta do texto ao lado", () => {
    // Fundo escuro pede logo branco; fundo claro pede navy. Se divergisse da
    // tinta do texto, o rodapé teria o nome numa cor e o símbolo em outra.
    expect(tomDaCasaSobre("#070A1F")).toBe("white");
    expect(tomDaCasaSobre("#F7F8FA")).toBe("navy");
    for (const fundo of ["#070A1F", "#F7F8FA", "#141414", "#FFFFFF", "#9AF5F0"]) {
      const branco = tintaSobre(fundo) === "#FFFFFF";
      expect(tomDaCasaSobre(fundo)).toBe(branco ? "white" : "navy");
    }
  });

  it("o SVG entregue é o do tom escolhido, byte a byte", () => {
    const claro = logoDaCasa("Dioli", "#FFFFFF")!;
    const escuro = logoDaCasa("Dioli", "#070A1F")!;
    const ler = (l: { dataUrl: string }) => Buffer.from(l.dataUrl.split(",")[1]!, "base64").toString("utf8");
    expect(ler(claro)).toBe(SIMBOLO_DA_CASA.navy);
    expect(ler(escuro)).toBe(SIMBOLO_DA_CASA.white);
    expect(ler(claro)).toContain("#070A1F");
    expect(ler(escuro)).toContain("#FFFFFF");
  });

  it("o MIME declarado é um que o navegador desenha — senão o molde recusaria", () => {
    const logo = logoDaCasa("Dioli", NEUTRO.primaria)!;
    expect(logo.mimeType).toBe("image/svg+xml");
    // A prova de que ele ATRAVESSA a guarda de MIME do molde:
    expect(moldeComLogo(moldeDoCliente(null), logo).logo).not.toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("🚧 metade 2 — para todo o resto, a ausência continua sendo ausência", () => {
  it("cliente que não é a casa recebe NULL — nunca a marca da agência", () => {
    for (const nome of ["Foocci", "Padaria do João", "CityJobs", "QA Portal — Cafeteria Aurora", "", null]) {
      expect(logoDaCasa(nome, "#070A1F")).toBeNull();
    }
  });

  it("a porta é uma LISTA FECHADA, não um prefixo — 'Dioli Móveis' não é a casa", () => {
    // Um `startsWith("Dioli")` entregaria a marca da agência a um cliente que
    // por acaso comece com a mesma palavra. Nome de marca é do dono dele.
    expect(ehACasa("Dioli Móveis")).toBe(false);
    expect(ehACasa("Dioli Digital Marketing Ltda")).toBe(false);
    expect(ehACasa("Grupo Dioli")).toBe(false);
    expect(logoDaCasa("Dioli Móveis", "#070A1F")).toBeNull();
  });

  it("sem logo, o comportamento honesto de sempre: monograma + falta DECLARADA", () => {
    const molde = moldeComLogo(moldeDoCliente(null), logoDaCasa("Padaria do João", NEUTRO.primaria));
    const html = montarHtmlDaPeca({ ...peca, assinatura: "Padaria do João" }, molde);

    expect(molde.logo).toBeNull();
    expect(molde.lacunas).toContain(LACUNA_DO_LOGO);
    expect(html).toContain('class="monograma"');
    expect(html).not.toContain('class="logo-real"');
    // O que NUNCA pode acontecer: um logo desenhado no lugar do que falta.
    expect(html).not.toContain("<img");
  });

  it("a lista de nomes da casa não cresce por descuido", () => {
    // Se alguém acrescentar um nome, este teste cai e a mudança precisa ser
    // deliberada. Uma lista fechada que ninguém percebe crescer não é fechada.
    expect([...NOMES_DA_CASA].sort()).toEqual([
      "dioli",
      "dioli agencia",
      "dioli agency os",
      "dioli digital",
      "dioli digital studio",
      "dioli studio",
    ]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("🎨 o kit em arquivo e o kit no código são o MESMO desenho", () => {
  const brand = (n: string) => readFileSync(join(process.cwd(), "public", "brand", n), "utf8").trimEnd();

  it("os SVGs de public/brand/ batem com as constantes embutidas", () => {
    // Dois artefatos, um gerador (`scripts/gerar-kit-de-marca.mjs`). Sem esta
    // trava, alguém edita o SVG à mão, a peça continua assinada com o desenho
    // antigo, e a divergência só aparece meses depois num carrossel publicado.
    expect(brand("dioli-logo-h-navy.svg")).toBe(LOGOTIPO_DA_CASA.navy);
    expect(brand("dioli-logo-h-white.svg")).toBe(LOGOTIPO_DA_CASA.white);
    expect(brand("dioli-mark-navy.svg")).toBe(SIMBOLO_DA_CASA.navy);
    expect(brand("dioli-mark-white.svg")).toBe(SIMBOLO_DA_CASA.white);
  });

  it("o kit tem as quatro peças que uma marca precisa para não quebrar", () => {
    for (const svg of [LOGOTIPO_DA_CASA.navy, LOGOTIPO_DA_CASA.white, SIMBOLO_DA_CASA.navy, SIMBOLO_DA_CASA.white]) {
      // Vetor de verdade: um caminho só, sem bitmap embutido. Os SVGs antigos
      // de `docs/brand/logo/` carregam `<image>` — são PNG disfarçado.
      expect(svg).not.toContain("<image");
      expect(svg).toContain("fill-rule=\"evenodd\"");
      // Tipografia em curvas: nada de dependência de fonte.
      expect(svg).not.toContain("font-family");
      // Acessibilidade: a marca tem nome para quem não vê a imagem.
      expect(svg).toContain("aria-label");
    }
    // O logotipo carrega o "Oo" E as cinco letras; o símbolo, só o "Oo".
    expect(LOGOTIPO_DA_CASA.navy).toContain("1330.1"); // o pingo do último "i"
    expect(SIMBOLO_DA_CASA.navy).not.toContain("1330.1");
  });

  it("as duas tintas são as do brand book, e o cyan NÃO entra no logo", () => {
    expect(LOGOTIPO_DA_CASA.navy).toContain("#070A1F");
    expect(LOGOTIPO_DA_CASA.white).toContain("#FFFFFF");
    for (const svg of Object.values({ ...LOGOTIPO_DA_CASA, ...SIMBOLO_DA_CASA })) {
      expect(svg.toUpperCase()).not.toContain("9AF5F0");
      expect(svg.toUpperCase()).not.toContain("2AE3F5");
    }
  });
});
