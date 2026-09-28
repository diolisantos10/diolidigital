// A generalização de `tetoDeStoriesDoDia` para os 4 degraus do parecer `meta`
// (M4) — dias 1–7:3, 8–14:6, 15–21:10, 22+:pleno. O degrau único de sempre
// (sem `rampaDegraus`) é coberto por __tests__/esteira/w11-rampa-e-story-derivado.test.ts;
// este arquivo cobre só o caso NOVO: pacote que declara os 4 degraus.

import { describe, it, expect } from "vitest";
import { tetoDeStoriesDoDia, TETO_DA_RAMPA } from "@/lib/agency/esteira/publicacao";
import { RAMPA_DE_STORIES_CITYJOBS } from "@/lib/integracoes/cityjobs/regras";

const DIA_MS = 24 * 60 * 60_000;

describe("tetoDeStoriesDoDia com os 4 degraus do City Jobs", () => {
  const primeiro = new Date("2026-09-01T00:00:00Z");

  it("dia 3 (dentro de 1–7): teto 3", () => {
    const agora = new Date(primeiro.getTime() + 3 * DIA_MS);
    expect(
      tetoDeStoriesDoDia({ primeiroStoryEm: primeiro, agora, porDiaMax: 15, rampaDegraus: RAMPA_DE_STORIES_CITYJOBS }),
    ).toBe(3);
  });

  it("dia 10 (dentro de 8–14): teto 6", () => {
    const agora = new Date(primeiro.getTime() + 10 * DIA_MS);
    expect(
      tetoDeStoriesDoDia({ primeiroStoryEm: primeiro, agora, porDiaMax: 15, rampaDegraus: RAMPA_DE_STORIES_CITYJOBS }),
    ).toBe(6);
  });

  it("dia 18 (dentro de 15–21): teto 10", () => {
    const agora = new Date(primeiro.getTime() + 18 * DIA_MS);
    expect(
      tetoDeStoriesDoDia({ primeiroStoryEm: primeiro, agora, porDiaMax: 15, rampaDegraus: RAMPA_DE_STORIES_CITYJOBS }),
    ).toBe(10);
  });

  it("dia 25 (22+): cai no porDiaMax do pacote (pleno)", () => {
    const agora = new Date(primeiro.getTime() + 25 * DIA_MS);
    expect(
      tetoDeStoriesDoDia({ primeiroStoryEm: primeiro, agora, porDiaMax: 15, rampaDegraus: RAMPA_DE_STORIES_CITYJOBS }),
    ).toBe(15);
  });

  it("22+ sem porDiaMax declarado: fail-closed, cai no TETO_DA_RAMPA — nunca destrava sem número", () => {
    const agora = new Date(primeiro.getTime() + 25 * DIA_MS);
    expect(
      tetoDeStoriesDoDia({ primeiroStoryEm: primeiro, agora, porDiaMax: null, rampaDegraus: RAMPA_DE_STORIES_CITYJOBS }),
    ).toBe(TETO_DA_RAMPA);
  });

  it("degraus fora de ordem no pacote são ordenados por esta função, não pelo autor do pacote", () => {
    const fora_de_ordem = [{ ateDias: 21, teto: 10 }, { ateDias: 7, teto: 3 }, { ateDias: 14, teto: 6 }];
    const agora = new Date(primeiro.getTime() + 10 * DIA_MS);
    expect(
      tetoDeStoriesDoDia({ primeiroStoryEm: primeiro, agora, porDiaMax: 15, rampaDegraus: fora_de_ordem }),
    ).toBe(6);
  });
});
