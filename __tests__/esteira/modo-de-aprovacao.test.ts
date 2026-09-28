// modo-de-aprovacao.test.ts — CADA MARCA ESCOLHE COMO APROVA (CEO, 27/09/2026).
//
// O que estes testes travam:
//   • cada carimbo de regra vale SÓ no modo que ele declara — `client:` é a
//     única exceção, e vale em qualquer modo (é o cliente decidindo);
//   • a troca de modo NUNCA muda o ciclo em curso: `modoEmVigor` continua no
//     modo velho até a data de vigência, e só então troca;
//   • uma marca não sai de APROVACAO_CEO antes de o master ter aprovado a
//     primeira semana real dela;
//   • a data do carimbo é a de BRASÍLIA, não a UTC crua.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  client: { findFirst: vi.fn(), update: vi.fn() },
  socialPost: { findMany: vi.fn() },
  approvalRequest: { create: vi.fn() },
}));
const agendarPecasAprovadas = vi.hoisted(() =>
  vi.fn(async (): Promise<{ agendados: number; ignorados: Array<{ postId: string; status: string }> }> => ({
    agendados: 0,
    ignorados: [],
  })),
);

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/esteira/publicacao", () => ({ agendarPecasAprovadas }));

import {
  MODO_INICIAL,
  MODOS_DE_APROVACAO,
  modoEmVigor,
  carimboDoModo,
  carimboDoSilencio,
  carimboDoCeo,
  carimboValeNoModo,
  registrarAprovacaoPorRegra,
  solicitarTrocaDeModo,
  inicioDoDiaBrasilia,
  fimDoDiaBrasilia,
} from "@/lib/agency/esteira/modo-de-aprovacao";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("a lista de modos", () => {
  it("nasce em APROVACAO_CEO", () => {
    expect(MODO_INICIAL).toBe("APROVACAO_CEO");
    expect(MODOS_DE_APROVACAO).toContain("APROVACAO_CEO");
  });
});

// ─── Um caso por modo: o carimbo certo vale, o de outro modo não ────────────

describe("carimboValeNoModo — um caso por modo", () => {
  const data = new Date("2026-09-28T12:00:00Z");

  it("piloto automático vale em PILOTO_AUTOMATICO, e só nele", () => {
    const carimbo = carimboDoModo("PILOTO_AUTOMATICO", data);
    expect(carimboValeNoModo(carimbo, "PILOTO_AUTOMATICO")).toBe(true);
    expect(carimboValeNoModo(carimbo, "SEMANAL")).toBe(false);
    expect(carimboValeNoModo(carimbo, "MENSAL")).toBe(false);
    expect(carimboValeNoModo(carimbo, "APROVACAO_CEO")).toBe(false);
  });

  it("silêncio vale em SEMANAL e em MENSAL", () => {
    const carimbo = carimboDoSilencio(data);
    expect(carimboValeNoModo(carimbo, "SEMANAL")).toBe(true);
    expect(carimboValeNoModo(carimbo, "MENSAL")).toBe(true);
    expect(carimboValeNoModo(carimbo, "PILOTO_AUTOMATICO")).toBe(false);
  });

  it("carimbo do CEO só vale em APROVACAO_CEO", () => {
    const carimbo = carimboDoCeo("user-1", data);
    expect(carimboValeNoModo(carimbo, "APROVACAO_CEO")).toBe(true);
    expect(carimboValeNoModo(carimbo, "SEMANAL")).toBe(false);
    expect(carimboValeNoModo(carimbo, "PILOTO_AUTOMATICO")).toBe(false);
    expect(carimboValeNoModo(carimbo, "MENSAL")).toBe(false);
  });

  it("NÃO existe silêncio em APROVACAO_CEO", () => {
    expect(carimboValeNoModo(carimboDoSilencio(data), "APROVACAO_CEO")).toBe(false);
  });

  it("`client:` vale em qualquer modo — é o cliente decidindo", () => {
    for (const modo of MODOS_DE_APROVACAO) {
      expect(carimboValeNoModo("client:Dioli Santos", modo)).toBe(true);
    }
  });

  it("carimbo seco, vazio, ou de grafia desconhecida nunca vale", () => {
    for (const modo of MODOS_DE_APROVACAO) {
      expect(carimboValeNoModo("", modo)).toBe(false);
      expect(carimboValeNoModo("cliente", modo)).toBe(false);
      expect(carimboValeNoModo("equipe:alguem@dioli.com", modo)).toBe(false);
      expect(carimboValeNoModo("grafia-inventada:x", modo)).toBe(false);
    }
  });
});

// ─── Achado 1 (Q8-qualidade, J4, 28/09/2026): a trava de com_risco de fonte
// externa — NENHUM carimbo de regra (piloto, silêncio) vale quando a peça é
// `pecaEhFonteExternaComRisco`, em NENHUM modo. As duas metades: com o
// contexto ligado, os dois carimbos de regra recusam; sem ele (ou `false`),
// nada regrediu — o comportamento de sempre continua.
describe("carimboValeNoModo — a trava de com_risco de fonte externa (Achado 1)", () => {
  const data = new Date("2026-09-28T12:00:00Z");

  it("piloto automático NUNCA vale quando pecaEhFonteExternaComRisco é true — em nenhum modo", () => {
    const carimbo = carimboDoModo("PILOTO_AUTOMATICO", data);
    for (const modo of MODOS_DE_APROVACAO) {
      expect(carimboValeNoModo(carimbo, modo, { pecaEhFonteExternaComRisco: true })).toBe(false);
    }
  });

  it("silêncio NUNCA vale quando pecaEhFonteExternaComRisco é true — nem em SEMANAL nem em MENSAL", () => {
    const carimbo = carimboDoSilencio(data);
    expect(carimboValeNoModo(carimbo, "SEMANAL", { pecaEhFonteExternaComRisco: true })).toBe(false);
    expect(carimboValeNoModo(carimbo, "MENSAL", { pecaEhFonteExternaComRisco: true })).toBe(false);
  });

  it("sem o contexto (ou explicitamente false), os dois carimbos continuam decidindo só por modo — nada regrediu", () => {
    const carimboPiloto = carimboDoModo("PILOTO_AUTOMATICO", data);
    const carimboSilencio = carimboDoSilencio(data);
    expect(carimboValeNoModo(carimboPiloto, "PILOTO_AUTOMATICO")).toBe(true);
    expect(carimboValeNoModo(carimboPiloto, "PILOTO_AUTOMATICO", { pecaEhFonteExternaComRisco: false })).toBe(true);
    expect(carimboValeNoModo(carimboSilencio, "SEMANAL")).toBe(true);
    expect(carimboValeNoModo(carimboSilencio, "SEMANAL", { pecaEhFonteExternaComRisco: false })).toBe(true);
  });

  it("`client:` e `ceo:` continuam valendo mesmo com pecaEhFonteExternaComRisco — são aprovação HUMANA", () => {
    expect(carimboValeNoModo("client:Dioli Santos", "SEMANAL", { pecaEhFonteExternaComRisco: true })).toBe(true);
    expect(carimboValeNoModo(carimboDoCeo("user-1", data), "APROVACAO_CEO", { pecaEhFonteExternaComRisco: true })).toBe(true);
  });
});

// ─── A troca de modo vale só no PRÓXIMO ciclo ───────────────────────────────

describe("modoEmVigor — a troca nunca muda o ciclo em curso", () => {
  it("antes da vigência, continua valendo o modo ATUAL", () => {
    const cliente = {
      modoAprovacao: "APROVACAO_CEO",
      modoPendente: "SEMANAL",
      modoPendenteVigenteEm: new Date("2026-10-05T03:00:00Z"),
    };
    expect(modoEmVigor(cliente, new Date("2026-10-04T23:00:00Z"))).toBe("APROVACAO_CEO");
  });

  it("depois da vigência (inclusive), vale o modo PENDENTE", () => {
    const cliente = {
      modoAprovacao: "APROVACAO_CEO",
      modoPendente: "SEMANAL",
      modoPendenteVigenteEm: new Date("2026-10-05T03:00:00Z"),
    };
    expect(modoEmVigor(cliente, new Date("2026-10-05T03:00:00Z"))).toBe("SEMANAL");
    expect(modoEmVigor(cliente, new Date("2026-10-06T12:00:00Z"))).toBe("SEMANAL");
  });

  it("sem troca pendente, vale o modo gravado", () => {
    const cliente = { modoAprovacao: "PILOTO_AUTOMATICO", modoPendente: null, modoPendenteVigenteEm: null };
    expect(modoEmVigor(cliente, new Date())).toBe("PILOTO_AUTOMATICO");
  });

  it("modo desconhecido no banco cai em APROVACAO_CEO — fail-closed", () => {
    const cliente = { modoAprovacao: "MODO_DE_UMA_VERSAO_FUTURA", modoPendente: null, modoPendenteVigenteEm: null };
    expect(modoEmVigor(cliente, new Date())).toBe("APROVACAO_CEO");
  });
});

// ─── A data do carimbo é a de BRASÍLIA ──────────────────────────────────────

describe("a data do carimbo é a de Brasília, não a UTC crua", () => {
  it("2026-10-01T02:00Z vira 2026-09-30 (ainda 23h da véspera em Brasília)", () => {
    const carimbo = carimboDoCeo("user-1", new Date("2026-10-01T02:00:00Z"));
    expect(carimbo).toBe("ceo:user-1@2026-09-30");
  });

  it("o mesmo vale para o carimbo de piloto automático e de silêncio", () => {
    const data = new Date("2026-10-01T02:00:00Z");
    expect(carimboDoModo("PILOTO_AUTOMATICO", data)).toBe("regra-da-marca:piloto_automatico@2026-09-30");
    expect(carimboDoSilencio(data)).toBe("regra-da-marca:silencio_publica@2026-09-30");
  });

  it("inicioDoDiaBrasilia/fimDoDiaBrasilia cobrem o dia inteiro em Brasília", () => {
    const inicio = inicioDoDiaBrasilia("2026-09-30")!;
    const fim = fimDoDiaBrasilia("2026-09-30")!;
    expect(inicio.toISOString()).toBe("2026-09-30T03:00:00.000Z");
    // 23:59:59.999 de Brasília = 02:59:59.999 UTC do dia seguinte.
    expect(fim.toISOString()).toBe("2026-10-01T02:59:59.999Z");
    expect(inicioDoDiaBrasilia("data-invalida")).toBeNull();
  });
});

// ─── Recusa sair de APROVACAO_CEO sem primeira semana aprovada ──────────────

describe("solicitarTrocaDeModo", () => {
  it("recusa sair de APROVACAO_CEO antes de primeiraSemanaAprovadaEm", async () => {
    db.client.findFirst.mockResolvedValue({ modoAprovacao: "APROVACAO_CEO", primeiraSemanaAprovadaEm: null });

    const r = await solicitarTrocaDeModo({
      workspaceId: "w1", clientId: "c1", novoModo: "PILOTO_AUTOMATICO", agora: new Date("2026-09-28T12:00:00Z"),
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/primeira semana/i);
    expect(db.client.update).not.toHaveBeenCalled();
  });

  it("permite a troca depois da primeira semana aprovada, e vale só no PRÓXIMO ciclo", async () => {
    db.client.findFirst.mockResolvedValue({
      modoAprovacao: "APROVACAO_CEO",
      primeiraSemanaAprovadaEm: new Date("2026-09-01T00:00:00Z"),
    });
    db.client.update.mockResolvedValue({});

    // Uma segunda-feira: 2026-09-28 é segunda. A vigência tem de ser a PRÓXIMA
    // segunda (05/10), nunca hoje.
    const r = await solicitarTrocaDeModo({
      workspaceId: "w1", clientId: "c1", novoModo: "SEMANAL", agora: new Date("2026-09-28T12:00:00Z"),
    });

    expect(r.ok).toBe(true);
    const vigenteEm = r.ok ? r.vigenteEm : null;
    expect(vigenteEm?.toISOString()).toBe("2026-10-05T03:00:00.000Z");
    expect(db.client.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { modoPendente: "SEMANAL", modoPendenteVigenteEm: vigenteEm },
    });
  });

  it("MENSAL vige no dia 1 do mês seguinte, em Brasília", async () => {
    db.client.findFirst.mockResolvedValue({
      modoAprovacao: "SEMANAL",
      primeiraSemanaAprovadaEm: new Date("2026-09-01T00:00:00Z"),
    });
    db.client.update.mockResolvedValue({});

    const r = await solicitarTrocaDeModo({
      workspaceId: "w1", clientId: "c1", novoModo: "MENSAL", agora: new Date("2026-09-15T12:00:00Z"),
    });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.vigenteEm.toISOString()).toBe("2026-10-01T03:00:00.000Z");
  });

  it("cliente não encontrado neste workspace: recusa", async () => {
    db.client.findFirst.mockResolvedValue(null);
    const r = await solicitarTrocaDeModo({ workspaceId: "w1", clientId: "c1", novoModo: "SEMANAL", agora: new Date() });
    expect(r.ok).toBe(false);
  });
});

// ─── registrarAprovacaoPorRegra ──────────────────────────────────────────────

describe("registrarAprovacaoPorRegra", () => {
  it("recusa o LOTE inteiro se uma peça não bate com o modo em vigor na data dela", async () => {
    db.client.findFirst.mockResolvedValue({
      modoAprovacao: "PILOTO_AUTOMATICO", modoPendente: null, modoPendenteVigenteEm: null,
    });
    db.socialPost.findMany.mockResolvedValue([
      { id: "sp1", scheduledFor: new Date("2026-09-28T12:00:00Z") },
    ]);

    // O carimbo é do CEO (só vale em APROVACAO_CEO), mas o modo em vigor é
    // PILOTO_AUTOMATICO.
    const r = await registrarAprovacaoPorRegra({
      workspaceId: "w1", clientId: "c1", postIds: ["sp1"], carimbo: carimboDoCeo("user-1", new Date()),
    });

    expect(r.ok).toBe(false);
    expect(db.approvalRequest.create).not.toHaveBeenCalled();
    expect(agendarPecasAprovadas).not.toHaveBeenCalled();
  });

  it("aprova e agenda quando o carimbo bate com o modo em vigor", async () => {
    db.client.findFirst.mockResolvedValue({
      modoAprovacao: "PILOTO_AUTOMATICO", modoPendente: null, modoPendenteVigenteEm: null,
    });
    db.socialPost.findMany.mockResolvedValue([
      { id: "sp1", scheduledFor: new Date("2026-09-28T12:00:00Z") },
    ]);
    db.approvalRequest.create.mockResolvedValue({ id: "ap1" });
    agendarPecasAprovadas.mockResolvedValue({ agendados: 1, ignorados: [] });

    const carimbo = carimboDoModo("PILOTO_AUTOMATICO", new Date());
    const r = await registrarAprovacaoPorRegra({ workspaceId: "w1", clientId: "c1", postIds: ["sp1"], carimbo });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.approvalRequestId).toBe("ap1");
      expect(r.agendados).toBe(1);
    }
    expect(db.approvalRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ clientId: "c1", status: "approved", reviewedBy: carimbo }),
      }),
    );
    expect(agendarPecasAprovadas).toHaveBeenCalledWith({ clientId: "c1", postIds: ["sp1"] });
  });

  it("recusa sem postIds", async () => {
    const r = await registrarAprovacaoPorRegra({ workspaceId: "w1", clientId: "c1", postIds: [], carimbo: "x" });
    expect(r.ok).toBe(false);
  });

  // ── Achado 1 (Q8-qualidade, J4, 28/09/2026) ──────────────────────────────
  it("recusa o LOTE quando a peça é de fonte externa com_risco, mesmo com o carimbo de piloto batendo com o modo", async () => {
    db.client.findFirst.mockResolvedValue({
      modoAprovacao: "PILOTO_AUTOMATICO", modoPendente: null, modoPendenteVigenteEm: null,
    });
    db.socialPost.findMany.mockResolvedValue([
      {
        id: "sp1",
        scheduledFor: new Date("2026-09-28T12:00:00Z"),
        scriptJson: JSON.stringify({ origem: "cityjobs", idExterno: "vaga-1", risco: "com_risco", prioridade: "paga" }),
      },
    ]);

    const r = await registrarAprovacaoPorRegra({
      workspaceId: "w1", clientId: "c1", postIds: ["sp1"], carimbo: carimboDoModo("PILOTO_AUTOMATICO", new Date()),
    });

    expect(r.ok).toBe(false);
    expect(db.approvalRequest.create).not.toHaveBeenCalled();
    expect(agendarPecasAprovadas).not.toHaveBeenCalled();
  });

  it("a MESMA peça, mas sem_risco (ou sem scriptJson de fonte externa), continua aprovando por piloto normalmente", async () => {
    db.client.findFirst.mockResolvedValue({
      modoAprovacao: "PILOTO_AUTOMATICO", modoPendente: null, modoPendenteVigenteEm: null,
    });
    db.socialPost.findMany.mockResolvedValue([
      {
        id: "sp1",
        scheduledFor: new Date("2026-09-28T12:00:00Z"),
        scriptJson: JSON.stringify({ origem: "cityjobs", idExterno: "vaga-1", risco: "sem_risco", prioridade: "paga" }),
      },
    ]);
    db.approvalRequest.create.mockResolvedValue({ id: "ap1" });
    agendarPecasAprovadas.mockResolvedValue({ agendados: 1, ignorados: [] });

    const r = await registrarAprovacaoPorRegra({
      workspaceId: "w1", clientId: "c1", postIds: ["sp1"], carimbo: carimboDoModo("PILOTO_AUTOMATICO", new Date()),
    });

    expect(r.ok).toBe(true);
  });

  it("fail-closed: peça de outro cliente/workspace no lote recusa tudo", async () => {
    db.client.findFirst.mockResolvedValue({
      modoAprovacao: "PILOTO_AUTOMATICO", modoPendente: null, modoPendenteVigenteEm: null,
    });
    // Só uma das duas peças pedidas voltou — a outra não é deste cliente/workspace.
    db.socialPost.findMany.mockResolvedValue([{ id: "sp1", scheduledFor: null }]);

    const r = await registrarAprovacaoPorRegra({
      workspaceId: "w1", clientId: "c1", postIds: ["sp1", "sp2"], carimbo: carimboDoModo("PILOTO_AUTOMATICO", new Date()),
    });

    expect(r.ok).toBe(false);
    expect(db.approvalRequest.create).not.toHaveBeenCalled();
  });
});
