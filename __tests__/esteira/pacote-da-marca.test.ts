// pacote-da-marca.test.ts — O QUE SE PRODUZ PARA A MARCA (CEO, 27/09/2026).
//
// O que estes testes travam:
//   • um pacote bem formado passa e devolve o objeto tipado;
//   • pacote nulo/ausente recusa com "preciso do pacote da marca" — nunca um
//     default inventado;
//   • pacote incoerente (mais posts por semana do que dias×postsPorDia
//     permite) recusa, mesmo com todos os campos presentes.

import { describe, it, expect } from "vitest";
import { PacoteDaMarcaSchema, lerPacote } from "@/lib/agency/esteira/pacote-da-marca";

const PACOTE_VALIDO = {
  postsPorDia: 1,
  postsPorSemana: 5,
  formatos: ["feed_imagem", "reels"],
  dias: [1, 2, 3, 4, 5],
  horarios: ["09:00", "18:30"],
  pilares: [{ nome: "bastidor", peso: 1 }, { nome: "produto", peso: 2 }],
};

describe("lerPacote — o válido passa", () => {
  it("devolve o pacote tipado quando o JSON é válido", () => {
    const r = lerPacote(JSON.stringify(PACOTE_VALIDO));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.pacote.postsPorSemana).toBe(5);
      expect(r.pacote.formatos).toContain("reels");
    }
  });
});

describe("lerPacote — nulo recusa com a frase que a esteira reconhece", () => {
  it("null vira 'preciso do pacote da marca'", () => {
    const r = lerPacote(null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/^preciso do pacote da marca/);
  });

  it("string vazia também recusa", () => {
    const r = lerPacote("");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/^preciso do pacote da marca/);
  });

  it("JSON quebrado recusa (nunca lança)", () => {
    const r = lerPacote("{ isto não é json");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/^preciso do pacote da marca/);
  });
});

describe("lerPacote — incoerente recusa", () => {
  it("postsPorSemana maior que postsPorDia × dias declarados recusa", () => {
    const incoerente = { ...PACOTE_VALIDO, postsPorDia: 1, dias: [1], postsPorSemana: 5 };
    const r = lerPacote(JSON.stringify(incoerente));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/^preciso do pacote da marca/);
  });

  it("formato fora da lista fechada recusa", () => {
    const invalido = { ...PACOTE_VALIDO, formatos: ["reel_de_verdade"] };
    const r = lerPacote(JSON.stringify(invalido));
    expect(r.ok).toBe(false);
  });

  it("horário fora do formato HH:MM recusa", () => {
    const invalido = { ...PACOTE_VALIDO, horarios: ["9h"] };
    const r = lerPacote(JSON.stringify(invalido));
    expect(r.ok).toBe(false);
  });

  it("dia da semana fora de 0..6 recusa", () => {
    const invalido = { ...PACOTE_VALIDO, dias: [7] };
    const r = lerPacote(JSON.stringify(invalido));
    expect(r.ok).toBe(false);
  });

  it("lista vazia (formatos, dias, horarios ou pilares) recusa", () => {
    expect(lerPacote(JSON.stringify({ ...PACOTE_VALIDO, pilares: [] })).ok).toBe(false);
    expect(lerPacote(JSON.stringify({ ...PACOTE_VALIDO, formatos: [] })).ok).toBe(false);
  });
});

describe("PacoteDaMarcaSchema — usada direto pela rota PUT", () => {
  it("safeParse aceita o pacote válido", () => {
    expect(PacoteDaMarcaSchema.safeParse(PACOTE_VALIDO).success).toBe(true);
  });

  it("safeParse recusa corpo que não é objeto", () => {
    expect(PacoteDaMarcaSchema.safeParse("nao é objeto").success).toBe(false);
    expect(PacoteDaMarcaSchema.safeParse(null).success).toBe(false);
  });
});

// ─── STORIES, E MARCA SÓ DE STORIES (CEO, 27/09/2026) ───────────────────────

const STORIES_VALIDO = {
  porDiaMin: 6,
  porDiaMax: 8,
  aPartirDe: "18:00",
  intervaloMinimoMin: 30,
  combosMinPorDia: 1,
  mistura: ["combo", "reciclado", "repost"] as const,
};

describe("pacote com stories — o bloco novo, aditivo", () => {
  it("pacote com feed + stories válido passa e devolve o bloco tipado", () => {
    const r = lerPacote(JSON.stringify({ ...PACOTE_VALIDO, formatos: ["feed_imagem", "stories"], stories: STORIES_VALIDO }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.pacote.stories?.porDiaMin).toBe(6);
      expect(r.pacote.stories?.mistura).toContain("reciclado");
    }
  });

  it("porDiaMax < porDiaMin recusa", () => {
    const r = lerPacote(
      JSON.stringify({
        ...PACOTE_VALIDO,
        formatos: ["feed_imagem", "stories"],
        stories: { ...STORIES_VALIDO, porDiaMin: 8, porDiaMax: 6 },
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/^preciso do pacote da marca/);
  });

  it("pacote antigo (sem `stories`) continua válido do mesmo jeito", () => {
    const r = lerPacote(JSON.stringify(PACOTE_VALIDO));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pacote.stories).toBeUndefined();
  });
});

describe("marca SÓ DE STORIES — postsPorDia/postsPorSemana/horarios podem ser 0/vazios", () => {
  const PACOTE_SUSHI_CAZZA = {
    formatos: ["stories"] as const,
    dias: [0, 1, 2, 3, 4, 5, 6],
    postsPorDia: 0,
    postsPorSemana: 0,
    horarios: [] as string[],
    pilares: [{ nome: "combo", peso: 1 }, { nome: "produto", peso: 1 }],
    stories: STORIES_VALIDO,
  };

  it("só-stories com postsPorDia 0 e horarios vazios é válido", () => {
    const r = lerPacote(JSON.stringify(PACOTE_SUSHI_CAZZA));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.pacote.postsPorDia).toBe(0);
      expect(r.pacote.horarios).toEqual([]);
    }
  });

  it("stories ausente com formatos:['stories'] e postsPorDia 0 CONTINUA recusando (não é 'só de stories' de verdade sem o bloco)", () => {
    const { stories: _semStories, ...semBlocoDeStories } = PACOTE_SUSHI_CAZZA;
    const r = lerPacote(JSON.stringify(semBlocoDeStories));
    expect(r.ok).toBe(false);
  });

  it("marca com feed E postsPorDia 0 continua recusando — só formatos:['stories'] libera o zero", () => {
    const r = lerPacote(
      JSON.stringify({ ...PACOTE_SUSHI_CAZZA, formatos: ["feed_imagem", "stories"] }),
    );
    expect(r.ok).toBe(false);
  });
});
