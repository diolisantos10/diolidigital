// O CONTADOR QUE MENTIA SOBRE SI MESMO.
//
// `jsonTemConteudo` media `Object.keys(v).length > 0` — contava CHAVE, não
// resposta. Com isso `{"dizemos":"x","naoDizemos":""}` e `{"descricao":""}`
// chegavam como campo `definido`: a ficha somava +1, a barra andava, e a
// metade que a régua exige estava em branco.
//
// **É isto que fazia a tela mostrar progresso com a porta fechada.** O cliente
// respondia, o número subia, `naoConstituida` continuava `true` — e nada na
// tela explicava por quê, porque quem contava e quem decidia eram duas contas
// diferentes sobre a mesma pergunta.
//
// ── Por que ESTE arquivo escreve JSON à mão, e o da porta não ──────────────
//
// As formas conferidas aqui são exatamente as que **o escritor antigo gravou
// no banco** e que ninguém mais produz — `reprovadas: []`, `naoDizemos: ""`.
// São dados LEGADOS. Escrevê-los à mão é a única maneira de representá-los, e
// o que está sob teste é o LEITOR. A prova de que o escritor faz o certo mora
// em `a-porta-que-nunca-abria.test.ts`, e passa pela rota.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({ brandBrain: { findUnique: vi.fn() } }));
vi.mock("@/lib/db/client", () => ({ prisma: db }));
const proib = vi.hoisted(() => ({ lerProibicoes: vi.fn() }));
vi.mock("@/lib/agency/esteira/proibicoes", () => proib);

import { lerFichaDeMarca } from "@/lib/agency/esteira/ficha-de-marca";

/** A ficha completa, no formato que o escritor de HOJE produz. */
const CHEIA = {
  purposeAndPromise: "conecta quem procura trabalho a vagas do próprio bairro",
  audienceRelation: "fala como vizinho, não como consultoria",
  voicePairsJson: JSON.stringify([{ dizemos: "vaga perto de você", naoDizemos: "oportunidade de carreira" }]),
  lexiconJson: JSON.stringify({ nome: "CityJobs" }),
  referencesJson: JSON.stringify({ aprovadas: ["post-1"], reprovadas: ["post-9"] }),
  formalTokensJson: JSON.stringify({ descricao: "verde escuro" }),
  promiseLimits: "não prometemos contratação",
  ownerAndHierarchyJson: JSON.stringify({ dono: "Marcos" }),
  fieldStatesJson: "{}",
  primaryColor: null, secondaryColor: null, typography: null, tagline: null, targetAudience: null,
};

const TRES_PROIBICOES = {
  lidas: true,
  itens: [{ frase: "a" }, { frase: "b" }, { frase: "c" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  db.brandBrain.findUnique.mockResolvedValue(CHEIA);
  proib.lerProibicoes.mockResolvedValue(TRES_PROIBICOES);
});

const estadoDe = async (campo: string) =>
  (await lerFichaDeMarca("cli1")).campos.find((c) => c.campo === campo)!.estado;

describe("⭐ o contador mede a metade que a régua exige", () => {
  it("legado `reprovadas: []` NÃO conta como referência definida", async () => {
    db.brandBrain.findUnique.mockResolvedValue({
      ...CHEIA, referencesJson: JSON.stringify({ aprovadas: ["post-1"], reprovadas: [] }),
    });
    expect(
      await estadoDe("referencias"),
      "a tela conta o campo como respondido enquanto a porta o recusa",
    ).toBe("lacuna");
  });

  it("legado `naoDizemos: \"\"` NÃO conta como voz definida", async () => {
    db.brandBrain.findUnique.mockResolvedValue({
      ...CHEIA, voicePairsJson: JSON.stringify([{ dizemos: "vaga perto de você", naoDizemos: "" }]),
    });
    expect(await estadoDe("voz")).toBe("lacuna");
  });

  it("objeto só com chave e valor vazio é ENVELOPE, não resposta", async () => {
    db.brandBrain.findUnique.mockResolvedValue({
      ...CHEIA, formalTokensJson: JSON.stringify({ descricao: "" }), primaryColor: null,
    });
    expect(await estadoDe("atributos_formais")).toBe("lacuna");
  });

  it("a metade oposta: com as duas metades, os três campos contam", async () => {
    for (const campo of ["referencias", "voz", "atributos_formais"]) {
      expect(await estadoDe(campo), `${campo} deixou de contar`).toBe("definido");
    }
  });
});

describe("⭐ o número da tela e o número que decide não podem divergir", () => {
  it("com a ficha completa, nada falta e a porta abre", async () => {
    const f = await lerFichaDeMarca("cli1");
    expect(f.oQueFaltaParaPublicar).toEqual([]);
    expect(f.naoConstituida).toBe(false);
  });

  it("a lista está VAZIA exatamente quando a porta abre — nunca uma segunda conta", async () => {
    // O contrato entre os dois campos, conferido em todos os cenários deste
    // arquivo. Divergir aqui é o defeito voltando com outra roupa.
    const cenarios = [
      {},
      { referencesJson: JSON.stringify({ aprovadas: ["p"], reprovadas: [] }) },
      { voicePairsJson: JSON.stringify([{ dizemos: "x", naoDizemos: "" }]) },
      { purposeAndPromise: null, tagline: null },
      { ownerAndHierarchyJson: "{}" },
    ];
    for (const over of cenarios) {
      db.brandBrain.findUnique.mockResolvedValue({ ...CHEIA, ...over });
      const f = await lerFichaDeMarca("cli1");
      expect(
        f.oQueFaltaParaPublicar.length === 0,
        `divergiu em ${JSON.stringify(over)}: falta=${JSON.stringify(f.oQueFaltaParaPublicar)} naoConstituida=${f.naoConstituida}`,
      ).toBe(!f.naoConstituida);
    }
  });

  it("faltando o contraexemplo, a lista DIZ que é ele que falta", async () => {
    db.brandBrain.findUnique.mockResolvedValue({
      ...CHEIA, referencesJson: JSON.stringify({ aprovadas: ["p"], reprovadas: [] }),
    });
    const f = await lerFichaDeMarca("cli1");
    expect(f.oQueFaltaParaPublicar.join(" ")).toMatch(/NÃO era a cara/i);
  });

  it("com 1 proibição de 3, a lista mostra o PLACAR — não só 'falta'", async () => {
    // Uma proibição registrada É uma regra e o piso a cobra: o campo fica
    // `definido`, com razão. O gatilho pede três. As duas coisas são
    // verdadeiras ao mesmo tempo, e antes só a primeira aparecia na tela.
    proib.lerProibicoes.mockResolvedValue({ lidas: true, itens: [{ frase: "a" }] });
    const f = await lerFichaDeMarca("cli1");
    expect(f.campos.find((c) => c.campo === "proibicoes")!.estado).toBe("definido");
    expect(f.oQueFaltaParaPublicar.join(" ")).toContain("1 de 3");
    expect(f.naoConstituida).toBe(true);
  });
});
