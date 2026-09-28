// A trava do carimbo "paga + sem_risco → aprovação automática" (contrato
// §6.1): só vale para o cliente City Jobs, e só com a regra LIGADA no
// pacote dele. É TRAVA, não aviso — as duas metades vêm do BANCO, nunca do
// que a requisição afirma de si mesma.

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

const db = vi.hoisted(() => ({
  client: { findUnique: vi.fn(), findFirst: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));
// `modo-de-aprovacao.ts` importa `agendarPecasAprovadas` de `publicacao.ts` no
// topo do arquivo — mockado por INTEIRO (mesma régua de
// `__tests__/esteira/modo-de-aprovacao.test.ts`) para não arrastar a árvore
// pesada de import daquele módulo (cliente da Meta, mídia de story...) só
// para testar `clienteEhCityJobsComRegraLigada`/`carimboValeNoModo`.
const agendarPecasAprovadas = vi.hoisted(() =>
  vi.fn(async (): Promise<{ agendados: number; ignorados: Array<{ postId: string; status: string }> }> => ({
    agendados: 0,
    ignorados: [],
  })),
);
vi.mock("@/lib/agency/esteira/publicacao", () => ({ agendarPecasAprovadas }));

import {
  carimboDoCityJobsPagaSemRisco,
  carimboValeNoModo,
  clienteEhCityJobsComRegraLigada,
} from "@/lib/agency/esteira/modo-de-aprovacao";

const CLIENT_ID = "client_cityjobs_1";
const OUTRO_CLIENT_ID = "client_outro_2";

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.CITYJOBS_CLIENT_ID;
});
afterEach(() => {
  delete process.env.CITYJOBS_CLIENT_ID;
});

describe("clienteEhCityJobsComRegraLigada — as duas metades", () => {
  it("false sem CITYJOBS_CLIENT_ID configurado, mesmo com pacote dizendo true", async () => {
    db.client.findUnique.mockResolvedValue({
      pacoteJson: JSON.stringify(pacoteMinimo({ cityJobsPagaSemRiscoAutoAprovacao: true })),
    });
    expect(await clienteEhCityJobsComRegraLigada(CLIENT_ID, {})).toBe(false);
  });

  it("false quando o clientId não é o configurado", async () => {
    expect(
      await clienteEhCityJobsComRegraLigada(OUTRO_CLIENT_ID, { CITYJOBS_CLIENT_ID: CLIENT_ID }),
    ).toBe(false);
    expect(db.client.findUnique).not.toHaveBeenCalled();
  });

  it("false quando é o cliente certo mas a flag está desligada/ausente no pacote", async () => {
    db.client.findUnique.mockResolvedValue({ pacoteJson: JSON.stringify(pacoteMinimo({})) });
    expect(
      await clienteEhCityJobsComRegraLigada(CLIENT_ID, { CITYJOBS_CLIENT_ID: CLIENT_ID }),
    ).toBe(false);
  });

  it("true só com as DUAS metades: cliente certo + flag ligada no pacote", async () => {
    db.client.findUnique.mockResolvedValue({
      pacoteJson: JSON.stringify(pacoteMinimo({ cityJobsPagaSemRiscoAutoAprovacao: true })),
    });
    expect(
      await clienteEhCityJobsComRegraLigada(CLIENT_ID, { CITYJOBS_CLIENT_ID: CLIENT_ID }),
    ).toBe(true);
  });

  it("fail-closed: pacote ilegível (JSON quebrado) nunca vira permissão", async () => {
    db.client.findUnique.mockResolvedValue({ pacoteJson: "{ isto não é json" });
    expect(
      await clienteEhCityJobsComRegraLigada(CLIENT_ID, { CITYJOBS_CLIENT_ID: CLIENT_ID }),
    ).toBe(false);
  });

  it("fail-closed: banco fora do ar nunca vira permissão", async () => {
    db.client.findUnique.mockRejectedValue(new Error("banco fora do ar"));
    expect(
      await clienteEhCityJobsComRegraLigada(CLIENT_ID, { CITYJOBS_CLIENT_ID: CLIENT_ID }),
    ).toBe(false);
  });
});

describe("carimboValeNoModo — o carimbo do City Jobs, com contexto", () => {
  const data = new Date("2026-09-28T12:00:00Z");
  const carimbo = carimboDoCityJobsPagaSemRisco(data);

  it("vale em QUALQUER modo quando o contexto confirma", () => {
    for (const modo of ["APROVACAO_CEO", "PILOTO_AUTOMATICO", "SEMANAL", "MENSAL"] as const) {
      expect(carimboValeNoModo(carimbo, modo, { clienteEhCityJobsComRegraLigada: true })).toBe(true);
    }
  });

  it("fail-closed: SEM contexto, o carimbo nunca vale, em nenhum modo", () => {
    expect(carimboValeNoModo(carimbo, "APROVACAO_CEO")).toBe(false);
  });

  it("fail-closed: contexto explicitamente false não vale", () => {
    expect(carimboValeNoModo(carimbo, "APROVACAO_CEO", { clienteEhCityJobsComRegraLigada: false })).toBe(false);
  });

  it("um carimbo de outro cliente/regra continua decidindo só por modo (nada regrediu)", () => {
    // Não é o carimbo do City Jobs — regressão-guarda de que o parâmetro novo
    // não vazou para os outros três tipos de carimbo.
    const carimboPiloto = "regra-da-marca:piloto_automatico@2026-09-28";
    expect(carimboValeNoModo(carimboPiloto, "PILOTO_AUTOMATICO", { clienteEhCityJobsComRegraLigada: false }))
      .toBe(true);
  });
});

function pacoteMinimo(extra: Record<string, unknown>) {
  return {
    postsPorDia: 1,
    postsPorSemana: 1,
    formatos: ["feed_imagem"],
    dias: [1],
    horarios: ["10:00"],
    pilares: [{ nome: "vagas", peso: 1 }],
    ...extra,
  };
}
