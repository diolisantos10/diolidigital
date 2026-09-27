// limite-de-refacoes.test.ts — O LIMITE MENSAL DE REFAÇÕES (1C-C2, 28/09/2026).
//
// `@/lib/agency/esteira/semana-editorial` é mockado só com `civilBrasilia`
// reproduzido (a MESMA conta de 7 linhas, fuso Brasília fixo UTC-3) — importar
// o módulo de verdade puxaria `calendario-editorial.ts` e toda a árvore
// pesada que `semana-editorial.test.ts` já documenta evitar. Precedente já
// aberto naquele arquivo para `modoEmVigor`.
//
// Mocks TIPADOS (regra do CLAUDE.md).

import { describe, it, expect, vi, beforeEach } from "vitest";

interface ClienteFixture { limiteRefacoesMes: number | null }
interface RefacaoFixture { clientId: string; mesReferencia: string; contaNoLimite: boolean }

let clientes: Record<string, ClienteFixture> = {};
let refacoes: RefacaoFixture[] = [];

const db = vi.hoisted(() => ({
  client: { findUnique: vi.fn() },
  refacaoDaPeca: { count: vi.fn(), create: vi.fn() },
}));

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/esteira/semana-editorial", () => ({
  civilBrasilia: (agora: Date): { ano: number; mesIndex: number; dia: number; diaDaSemana: number; hora: number } => {
    const OFFSET_BRASILIA_MS = 3 * 60 * 60_000;
    const brt = new Date(agora.getTime() - OFFSET_BRASILIA_MS);
    return {
      ano: brt.getUTCFullYear(), mesIndex: brt.getUTCMonth(), dia: brt.getUTCDate(),
      diaDaSemana: brt.getUTCDay(), hora: brt.getUTCHours(),
    };
  },
}));

import {
  mesReferenciaBrasilia,
  refacoesNoMes,
  podeRefazer,
  registrarRefacaoDaPeca,
  LIMITE_PADRAO_MENSAL_DA_CASA,
  FRASE_LIMITE_ESTOURADO_AO_CLIENTE,
} from "@/lib/agency/esteira/limite-de-refacoes";

beforeEach(() => {
  clientes = {};
  refacoes = [];
  vi.clearAllMocks();

  db.client.findUnique.mockImplementation(
    async ({ where }: { where: { id: string } }): Promise<ClienteFixture | null> => clientes[where.id] ?? null,
  );
  db.refacaoDaPeca.count.mockImplementation(
    async ({ where }: { where: { clientId: string; mesReferencia: string; contaNoLimite: boolean } }): Promise<number> =>
      refacoes.filter(
        (r) => r.clientId === where.clientId && r.mesReferencia === where.mesReferencia && r.contaNoLimite === where.contaNoLimite,
      ).length,
  );
  db.refacaoDaPeca.create.mockImplementation(async ({ data }: { data: RefacaoFixture }): Promise<RefacaoFixture> => {
    refacoes.push(data);
    return data;
  });
});

describe("mesReferenciaBrasilia — AAAA-MM em Brasília, nunca UTC", () => {
  it("21h30 de Brasília do último dia do mês (00h30 UTC do dia seguinte) conta no mês que está terminando", () => {
    // 30/09/2026 21:30 BRT = 01/10/2026 00:30 UTC.
    expect(mesReferenciaBrasilia(new Date("2026-10-01T00:30:00.000Z"))).toBe("2026-09");
  });

  it("já virou o mês em Brasília (00:30 BRT = 03:30 UTC do dia 1)", () => {
    expect(mesReferenciaBrasilia(new Date("2026-10-01T03:30:00.000Z"))).toBe("2026-10");
  });
});

describe("podeRefazer", () => {
  it("abaixo do limite — passa, e informa quantas restam", async () => {
    clientes["c1"] = { limiteRefacoesMes: null }; // usa o padrão da casa
    refacoes.push({ clientId: "c1", mesReferencia: "2026-09", contaNoLimite: true });

    const r = await podeRefazer({ clientId: "c1", agora: new Date("2026-09-15T13:00:00.000Z") });
    expect(r.pode).toBe(true);
    if (r.pode) expect(r.restantes).toBe(LIMITE_PADRAO_MENSAL_DA_CASA - 1);
  });

  it("no limite — recusa, com a frase exata que o cliente lê", async () => {
    clientes["c1"] = { limiteRefacoesMes: 2 };
    refacoes.push({ clientId: "c1", mesReferencia: "2026-09", contaNoLimite: true });
    refacoes.push({ clientId: "c1", mesReferencia: "2026-09", contaNoLimite: true });

    const r = await podeRefazer({ clientId: "c1", agora: new Date("2026-09-15T13:00:00.000Z") });
    expect(r.pode).toBe(false);
    if (!r.pode) expect(r.motivo).toBe(FRASE_LIMITE_ESTOURADO_AO_CLIENTE);
  });

  it("refação registrada com contaNoLimite: false (antes da trava) NÃO consome o limite", async () => {
    clientes["c1"] = { limiteRefacoesMes: 1 };
    refacoes.push({ clientId: "c1", mesReferencia: "2026-09", contaNoLimite: false });
    refacoes.push({ clientId: "c1", mesReferencia: "2026-09", contaNoLimite: false });
    refacoes.push({ clientId: "c1", mesReferencia: "2026-09", contaNoLimite: false });

    const r = await podeRefazer({ clientId: "c1", agora: new Date("2026-09-15T13:00:00.000Z") });
    expect(r.pode).toBe(true);
  });

  it("mês de Brasília na virada — refação de 30/09 21h30 BRT conta em setembro, não em outubro", async () => {
    clientes["c1"] = { limiteRefacoesMes: 1 };
    // 30/09 21:30 BRT = 01/10 00:30 UTC — grava com o mês de Brasília.
    await registrarRefacaoDaPeca({
      workspaceId: "ws1", clientId: "c1", socialPostId: "sp1", motivo: "ajuste",
      origem: "cliente_portal", contaNoLimite: true, agora: new Date("2026-10-01T00:30:00.000Z"),
    });
    expect(refacoes[0]!.mesReferencia).toBe("2026-09");

    // Consultado ainda em setembro (Brasília) — já bateu o limite de 1.
    const emSetembro = await podeRefazer({ clientId: "c1", agora: new Date("2026-09-30T22:00:00.000Z") });
    expect(emSetembro.pode).toBe(false);

    // Consultado já em outubro (Brasília) — mês novo, limite reaberto.
    const emOutubro = await podeRefazer({ clientId: "c1", agora: new Date("2026-10-01T13:00:00.000Z") });
    expect(emOutubro.pode).toBe(true);
  });

  it("cliente sem limite configurado e sem histórico — usa o padrão da casa inteiro", async () => {
    clientes["c1"] = { limiteRefacoesMes: null };
    const r = await podeRefazer({ clientId: "c1", agora: new Date("2026-09-15T13:00:00.000Z") });
    expect(r.pode).toBe(true);
    if (r.pode) expect(r.restantes).toBe(LIMITE_PADRAO_MENSAL_DA_CASA);
  });
});

describe("refacoesNoMes", () => {
  it("só soma contaNoLimite: true", async () => {
    refacoes.push({ clientId: "c1", mesReferencia: "2026-09", contaNoLimite: true });
    refacoes.push({ clientId: "c1", mesReferencia: "2026-09", contaNoLimite: false });
    expect(await refacoesNoMes("c1", "2026-09")).toBe(1);
  });
});
