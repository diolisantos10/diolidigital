// O contrato de marca — a régua que chega a quem produz.
//
// Cada trava aqui tem AS DUAS METADES: prova que o problema plantado é pego E
// que o caso limpo não é acusado à toa.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({ brandBrain: { findUnique: vi.fn() } }));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const proib = vi.hoisted(() => ({ lerProibicoes: vi.fn() }));
vi.mock("@/lib/agency/esteira/proibicoes", () => proib);

const mat = vi.hoisted(() => ({ materiaisDeMarca: vi.fn() }));
vi.mock("@/lib/agency/esteira/material-do-drive", () => mat);

import { contratoDeMarca, versaoDe, TETO_DO_CONTRATO } from "@/lib/agency/esteira/contrato-de-marca";

const MARCA_CHEIA = {
  brandName: "CityJobs", tagline: "trabalho perto de casa",
  positioning: "o classificado de bairro", targetAudience: "quem procura emprego na região",
  tone: "direto, sem jargão", primaryColor: "#1B4D3E", secondaryColor: "#E8B54D",
  typography: "Inter",
};

beforeEach(() => {
  vi.clearAllMocks();
  db.brandBrain.findUnique.mockResolvedValue(MARCA_CHEIA);
  proib.lerProibicoes.mockResolvedValue({ lidas: true, itens: [{ frase: "nunca escreva o nome em letra gigante" }] });
  mat.materiaisDeMarca.mockResolvedValue([
    { papel: "logo", nome: "05_city_jobs_retangular.svg" },
    { papel: "referencia", nome: "post-que-funcionou.jpg" },
  ]);
});

describe("a régua CHEGA a quem produz", () => {
  it("o contrato traz quem é, o que nunca fazer, a forma e o material", async () => {
    const c = await contratoDeMarca("cli1");
    expect(c.texto).toContain("CityJobs");
    expect(c.texto).toContain("nunca escreva o nome em letra gigante");
    expect(c.texto).toContain("#1B4D3E");
    expect(c.texto).toContain("05_city_jobs_retangular.svg");
  });

  it("marca completa não inventa lacuna — a metade que impede acusação à toa", async () => {
    const c = await contratoDeMarca("cli1");
    expect(c.lacunas).toEqual([]);
    expect(c.naoConstituida).toBe(false);
  });
});

describe("o que a marca não decidiu vira LACUNA NOMEADA, nunca um valor plausível", () => {
  it("sem proibição registrada, o contrato diz que falta — não diz 'pode tudo'", async () => {
    proib.lerProibicoes.mockResolvedValue({ lidas: true, itens: [] });
    const c = await contratoDeMarca("cli1");
    expect(c.lacunas).toContain("proibições (o que a marca nunca faz)");
    expect(c.texto).toContain("AINDA NÃO DECIDIDO");
    expect(c.texto.toLowerCase()).not.toContain("pode tudo");
  });

  it("sem logo e sem referência, as duas faltas são nomeadas separadamente", async () => {
    mat.materiaisDeMarca.mockResolvedValue([]);
    const c = await contratoDeMarca("cli1");
    expect(c.lacunas).toContain("arquivo de logo");
    expect(c.lacunas).toContain("referência visual (o que a marca considera certo)");
  });

  it("a lacuna manda NÃO inventar — senão quem produz preenche com o próprio gosto", async () => {
    mat.materiaisDeMarca.mockResolvedValue([]);
    const c = await contratoDeMarca("cli1");
    expect(c.texto).toContain("Não invente estes");
  });
});

describe("marca sem nada é declarada, e não vira licença", () => {
  it("marca vazia entra em não-constituída e avisa quem produz", async () => {
    db.brandBrain.findUnique.mockResolvedValue(null);
    proib.lerProibicoes.mockResolvedValue({ lidas: true, itens: [] });
    mat.materiaisDeMarca.mockResolvedValue([]);
    const c = await contratoDeMarca("cli1");
    expect(c.naoConstituida).toBe(true);
    expect(c.texto).toContain("MARCA NÃO CONSTITUÍDA");
  });

  it("a metade oposta: marca com regra NÃO é declarada não-constituída", async () => {
    const c = await contratoDeMarca("cli1");
    expect(c.naoConstituida).toBe(false);
    expect(c.texto).not.toContain("MARCA NÃO CONSTITUÍDA");
  });
});

describe("o teto de uma tela é código, não recomendação", () => {
  it("contrato gigante é cortado por BLOCO INTEIRO e o corte é declarado", async () => {
    // Meia regra é pior que nenhuma: quem lê "NUNCA — não cite conc" obedece o
    // pedaço e inventa o resto.
    proib.lerProibicoes.mockResolvedValue({
      lidas: true,
      itens: Array.from({ length: 80 }, (_, i) => ({ frase: `proibição número ${i} com texto longo o suficiente para encher` })),
    });
    const c = await contratoDeMarca("cli1");
    expect(c.texto.length).toBeLessThanOrEqual(TETO_DO_CONTRATO);
    expect(c.cortado.length).toBeGreaterThan(0);
    expect(c.texto).toContain("não couberam");
  });

  it("a metade oposta: contrato normal não é cortado nem avisa corte", async () => {
    const c = await contratoDeMarca("cli1");
    expect(c.cortado).toEqual([]);
    expect(c.texto).not.toContain("não couberam");
  });
});

describe("marca_versao identifica a RÉGUA, não o relógio", () => {
  it("mesmo conteúdo devolve a mesma versão", () => {
    expect(versaoDe("abc")).toBe(versaoDe("abc"));
  });

  it("conteúdo diferente devolve versão diferente — senão duas réguas se confundem", () => {
    expect(versaoDe("abc")).not.toBe(versaoDe("abd"));
  });

  it("o contrato carrega a versão do próprio texto", async () => {
    const c = await contratoDeMarca("cli1");
    expect(c.marcaVersao).toBe(versaoDe(c.texto));
    expect(c.marcaVersao).toMatch(/^mv_[0-9a-f]{10}$/);
  });
});

describe("nunca derruba a produção", () => {
  it("banco fora do ar não lança — vira lacuna, não exceção", async () => {
    db.brandBrain.findUnique.mockRejectedValue(new Error("db down"));
    proib.lerProibicoes.mockRejectedValue(new Error("db down"));
    mat.materiaisDeMarca.mockRejectedValue(new Error("db down"));
    const c = await contratoDeMarca("cli1");
    expect(c.naoConstituida).toBe(true);
    expect(c.lacunas.length).toBeGreaterThan(0);
  });

  it("sem cliente devolve resposta legítima, não erro", async () => {
    const c = await contratoDeMarca(null);
    expect(c.texto).toContain("SEM CLIENTE");
    expect(c.naoConstituida).toBe(true);
  });
});

// ── A METADE QUE DECIDE SE ISTO VALE ALGUMA COISA ───────────────────────────
//
// Um contrato perfeito guardado numa variável que ninguém lê é exatamente o
// defeito que ele veio consertar: "campo que ninguém lê é decoração". Estes
// testes olham o CÓDIGO-FONTE, não o comportamento, porque o que precisa ser
// garantido é estrutural — que a régua esteja no bloco compartilhado de prompt.

import fs from "node:fs";
import path from "node:path";

const ESPECIALISTAS = fs.readFileSync(path.join(process.cwd(), "lib/agency/execution/especialistas.ts"), "utf8");
const RUN = fs.readFileSync(path.join(process.cwd(), "lib/agency/execution/run-execution.ts"), "utf8");

describe("o contrato CHEGA ao prompt de quem produz", () => {
  it("está no bloco COMPARTILHADO — alcança todo especialista de uma vez", () => {
    const i = ESPECIALISTAS.indexOf("function ctxBlock");
    expect(i, "ctxBlock sumiu de especialistas.ts").toBeGreaterThan(-1);
    const bloco = ESPECIALISTAS.slice(i, i + 1400);
    expect(bloco.includes("c.contratoDeMarca"), "a régua não entra no prompt — voltou a ser decoração").toBe(true);
  });

  it("vem ANTES do resto do contexto — a ordem é a mensagem", () => {
    const i = ESPECIALISTAS.indexOf("function ctxBlock");
    const bloco = ESPECIALISTAS.slice(i, i + 1400);
    expect(bloco.indexOf("c.contratoDeMarca")).toBeLessThan(bloco.indexOf("c.businessName"));
  });

  it("a produção monta o contrato de verdade, e não deixa o campo vazio", () => {
    expect(RUN.includes("contratoDeMarca(project.clientId)")).toBe(true);
  });

  it("montar o contrato NÃO derruba a produção se falhar", () => {
    const i = RUN.indexOf("contratoDeMarca(project.clientId)");
    expect(RUN.slice(i, i + 120).includes(".catch(")).toBe(true);
  });
});
