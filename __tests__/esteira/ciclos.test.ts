import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  cycle: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  task: { findMany: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import { abrirCiclo, cicloAberto, fecharCiclo, historicoDeCiclos, referenciaDe } from "@/lib/agency/esteira/ciclos";

const AGOSTO = new Date("2026-08-14T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  db.cycle.findUnique.mockResolvedValue(null);
  db.cycle.findFirst.mockResolvedValue(null);
  db.cycle.findMany.mockResolvedValue([]);
  db.cycle.update.mockResolvedValue({});
  db.task.findMany.mockResolvedValue([
    { title: "Pacote de social", agentId: "a3" },
    { title: "Conceito visual", agentId: "a2" },
  ]);
  db.cycle.create.mockImplementation(async ({ data }: { data: Record<string, string> }) => ({
    id: "cy1", reference: data.reference, startsOn: data.startsOn, endsOn: data.endsOn,
    planJson: data.planJson, summary: null, status: "aberto",
  }));
});

describe("o ciclo é o mês", () => {
  it("a referência é AAAA-MM", () => {
    expect(referenciaDe(AGOSTO)).toBe("2026-08");
    expect(referenciaDe(new Date("2026-01-03T00:00:00Z"))).toBe("2026-01");
  });

  it("abre do primeiro ao último dia do mês", async () => {
    const c = await abrirCiclo("p1", AGOSTO);
    expect(c?.referencia).toBe("2026-08");
    expect(c?.comeca).toBe("2026-08-01");
    expect(c?.termina).toBe("2026-08-31");
  });

  it("fevereiro fecha no dia certo — inclusive em ano bissexto", async () => {
    const c = await abrirCiclo("p1", new Date("2028-02-10T00:00:00Z"));
    expect(c?.termina).toBe("2028-02-29");
  });

  it("abrir duas vezes no mesmo mês devolve o mesmo ciclo", async () => {
    db.cycle.findUnique.mockResolvedValue({
      id: "cy1", reference: "2026-08", status: "aberto", startsOn: "2026-08-01", endsOn: "2026-08-31",
      planJson: "[]", summary: null,
    });
    const c = await abrirCiclo("p1", AGOSTO);
    expect(db.cycle.create).not.toHaveBeenCalled();
    expect(c?.id).toBe("cy1");
  });
});

describe("o plano é congelado na abertura", () => {
  it("o que a agência prometeu no mês fica gravado", async () => {
    const c = await abrirCiclo("p1", AGOSTO);
    expect(c?.itens).toHaveLength(2);
    expect(c?.itens[0]).toEqual({ agentId: "a3", titulo: "Pacote de social" });
  });

  it("projeto sem tarefas abre ciclo vazio em vez de falhar", async () => {
    db.task.findMany.mockResolvedValue([]);
    const c = await abrirCiclo("p1", AGOSTO);
    expect(c?.itens).toEqual([]);
  });
});

describe("fechar é o que permite comparar mês a mês", () => {
  it("grava resultados e resumo, e abre o próximo mês", async () => {
    const r = await fecharCiclo({
      projectId: "p1", cycleId: "cy1",
      resultados: { alcance: 12000, engajamento: 4.2 },
      resumo: "Alcance subiu 30% em relação a julho.",
      quando: AGOSTO,
    });
    expect(r.fechado).toBe(true);
    const dados = db.cycle.update.mock.calls[0][0].data;
    expect(dados.status).toBe("fechado");
    expect(JSON.parse(dados.resultsJson).alcance).toBe(12000);
    expect(dados.closedAt).toBeInstanceOf(Date);
    expect(r.proximo?.referencia).toBe("2026-09");
  });

  it("dezembro vira janeiro do ano seguinte", async () => {
    const r = await fecharCiclo({
      projectId: "p1", cycleId: "cy1", resultados: {}, resumo: "ok",
      quando: new Date("2026-12-20T00:00:00Z"),
    });
    expect(r.proximo?.referencia).toBe("2027-01");
  });

  it("dá para fechar sem abrir o próximo — encerramento de contrato", async () => {
    const r = await fecharCiclo({ projectId: "p1", cycleId: "cy1", resultados: {}, resumo: "fim", abrirProximo: false });
    expect(r.proximo).toBeNull();
    expect(db.cycle.create).not.toHaveBeenCalled();
  });
});

describe("leitura", () => {
  it("o ciclo em andamento é o mais recente aberto ou entregue", async () => {
    db.cycle.findFirst.mockResolvedValue({
      id: "cy2", reference: "2026-09", status: "entregue", startsOn: "2026-09-01", endsOn: "2026-09-30",
      planJson: "[]", summary: "setembro forte",
    });
    const c = await cicloAberto("p1");
    expect(c?.referencia).toBe("2026-09");
    expect(c?.status).toBe("entregue");
  });

  it("sem ciclo devolve null — o projeto ainda não virou rotina", async () => {
    expect(await cicloAberto("p1")).toBeNull();
  });

  it("o histórico vem do mais novo para o mais velho", async () => {
    db.cycle.findMany.mockResolvedValue([
      { id: "c2", reference: "2026-09", status: "aberto", startsOn: "", endsOn: "", planJson: "[]", summary: null },
      { id: "c1", reference: "2026-08", status: "fechado", startsOn: "", endsOn: "", planJson: "[]", summary: "ok" },
    ]);
    const h = await historicoDeCiclos("p1");
    expect(h.map((c) => c.referencia)).toEqual(["2026-09", "2026-08"]);
  });

  it("banco fora do ar não derruba a leitura", async () => {
    db.cycle.findFirst.mockRejectedValue(new Error("db down"));
    expect(await cicloAberto("p1")).toBeNull();
  });
});
