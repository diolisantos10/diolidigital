// A ficha de marca — nove campos, cada um com estado declarado.
//
// Cada trava tem AS DUAS METADES: pega o problema plantado E não acusa o caso
// limpo. Uma ficha que declara tudo em lacuna é tão inútil quanto uma que
// declara tudo definido.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({ brandBrain: { findUnique: vi.fn() } }));
vi.mock("@/lib/db/client", () => ({ prisma: db }));
const proib = vi.hoisted(() => ({ lerProibicoes: vi.fn() }));
vi.mock("@/lib/agency/esteira/proibicoes", () => proib);

import {
  lerFichaDeMarca, proximasPerguntas, PERGUNTAS_POR_RODADA, MODO_MINIMO, CAMPOS_DA_MARCA,
} from "@/lib/agency/esteira/ficha-de-marca";

const CHEIA = {
  tagline: "trabalho perto de casa",
  targetAudience: "quem procura emprego na região",
  purposeAndPromise: "conecta quem procura trabalho a vagas do próprio bairro",
  audienceRelation: "fala como vizinho, não como consultoria",
  voicePairsJson: JSON.stringify([{ dizemos: "vaga perto de você", naoDizemos: "oportunidade de carreira" }]),
  lexiconJson: JSON.stringify({ nome: "CityJobs", proibidas: ["emprego dos sonhos"] }),
  referencesJson: JSON.stringify({ aprovadas: ["post-1"], reprovadas: ["post-9"] }),
  formalTokensJson: JSON.stringify({ primaria: "#1B4D3E" }),
  promiseLimits: "não prometemos contratação",
  ownerAndHierarchyJson: JSON.stringify({ dono: "Marcos", canal: "portal", prazoHoras: 48 }),
  fieldStatesJson: "{}",
  primaryColor: "#1B4D3E", secondaryColor: null, typography: "Inter",
};

const TRES_PROIBICOES = {
  lidas: true,
  itens: [{ frase: "nunca escreva o nome em letra gigante" }, { frase: "não cite concorrente" }, { frase: "não fale de salário exato" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  db.brandBrain.findUnique.mockResolvedValue(CHEIA);
  proib.lerProibicoes.mockResolvedValue(TRES_PROIBICOES);
});

describe("os nove campos, e o estado de cada um", () => {
  it("ficha completa declara os nove como definidos", async () => {
    const f = await lerFichaDeMarca("cli1");
    expect(f.definidos).toBe(CAMPOS_DA_MARCA.length);
    expect(f.lacunas).toEqual([]);
  });

  it("a metade oposta: ficha vazia declara os nove em lacuna, e nenhum como 'pode tudo'", async () => {
    db.brandBrain.findUnique.mockResolvedValue(null);
    proib.lerProibicoes.mockResolvedValue({ lidas: true, itens: [] });
    const f = await lerFichaDeMarca("cli1");
    expect(f.definidos).toBe(0);
    expect(f.lacunas.length).toBe(CAMPOS_DA_MARCA.length);
    expect(f.campos.every((c) => c.estado === "lacuna")).toBe(true);
  });

  it("banco fora do ar devolve tudo em lacuna, nunca uma ficha 'sem nada a declarar'", async () => {
    db.brandBrain.findUnique.mockRejectedValue(new Error("db down"));
    proib.lerProibicoes.mockRejectedValue(new Error("db down"));
    const f = await lerFichaDeMarca("cli1");
    expect(f.definidos).toBe(0);
    expect(f.naoConstituida).toBe(true);
  });
});

describe("adjetivo não conta como voz definida", () => {
  it("ter só o tom NÃO define a voz — 'natural e direto' não é verificável", async () => {
    db.brandBrain.findUnique.mockResolvedValue({ ...CHEIA, voicePairsJson: "[]", tone: "natural e direto" });
    const f = await lerFichaDeMarca("cli1");
    expect(f.campos.find((c) => c.campo === "voz")!.estado).toBe("lacuna");
  });

  it("a metade oposta: um par de exemplo define", async () => {
    const f = await lerFichaDeMarca("cli1");
    expect(f.campos.find((c) => c.campo === "voz")!.estado).toBe("definido");
  });
});

describe("o dia zero fecha por GATILHO, não por opinião", () => {
  it("com os exigidos, 3 proibições e as duas referências, a marca sai de não-constituída", async () => {
    const f = await lerFichaDeMarca("cli1");
    expect(f.naoConstituida).toBe(false);
  });

  it("duas proibições NÃO bastam — o gatilho pede três", async () => {
    proib.lerProibicoes.mockResolvedValue({ lidas: true, itens: TRES_PROIBICOES.itens.slice(0, 2) });
    const f = await lerFichaDeMarca("cli1");
    expect(f.naoConstituida).toBe(true);
  });

  it("referência só aprovada NÃO basta — o contra-exemplo ensina mais que o exemplo", async () => {
    db.brandBrain.findUnique.mockResolvedValue({ ...CHEIA, referencesJson: JSON.stringify({ aprovadas: ["p1"], reprovadas: [] }) });
    const f = await lerFichaDeMarca("cli1");
    expect(f.naoConstituida).toBe(true);
  });
});

describe("as perguntas ao dono", () => {
  it("no máximo cinco por rodada — questionário longo é questionário abandonado", async () => {
    db.brandBrain.findUnique.mockResolvedValue(null);
    proib.lerProibicoes.mockResolvedValue({ lidas: true, itens: [] });
    const f = await lerFichaDeMarca("cli1");
    expect(proximasPerguntas(f).length).toBe(PERGUNTAS_POR_RODADA);
  });

  it("o modo mínimo vem primeiro — sem ele não há julgamento nem escalada", async () => {
    db.brandBrain.findUnique.mockResolvedValue(null);
    proib.lerProibicoes.mockResolvedValue({ lidas: true, itens: [] });
    const f = await lerFichaDeMarca("cli1");
    const primeiras = proximasPerguntas(f).slice(0, MODO_MINIMO.length).map((c) => c.campo);
    for (const c of MODO_MINIMO) expect(primeiras).toContain(c);
  });

  it("toda lacuna carrega a pergunta pronta, em português de gente", async () => {
    db.brandBrain.findUnique.mockResolvedValue(null);
    proib.lerProibicoes.mockResolvedValue({ lidas: true, itens: [] });
    const f = await lerFichaDeMarca("cli1");
    for (const c of f.lacunas) {
      expect(c.pergunta, `campo ${c.campo} sem pergunta`).toBeTruthy();
      expect(c.pergunta!.length).toBeGreaterThan(10);
    }
  });

  it("campo definido NÃO gera pergunta — não se cobra o que já foi respondido", async () => {
    const f = await lerFichaDeMarca("cli1");
    expect(f.campos.every((c) => c.pergunta === null)).toBe(true);
  });
});

describe("as proibições não são duplicadas nesta ficha", () => {
  it("o campo de proibições é lido do lugar onde ele JÁ funciona", async () => {
    // Duplicá-las numa coluna criaria duas verdades sobre a mesma regra.
    proib.lerProibicoes.mockResolvedValue({ lidas: true, itens: [{ frase: "não use foto de banco de imagem" }] });
    const f = await lerFichaDeMarca("cli1");
    const campo = f.campos.find((c) => c.campo === "proibicoes")!;
    expect(campo.estado).toBe("definido");
    expect(campo.valor).toContain("banco de imagem");
  });
});
