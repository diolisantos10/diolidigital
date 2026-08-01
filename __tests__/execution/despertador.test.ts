import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({ project: { findMany: vi.fn() } }));
const runProjectExecution = vi.hoisted(() => vi.fn());
const dispatchWhatsAppNotifications = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/execution/run-execution", () => ({ runProjectExecution }));
vi.mock("@/lib/integrations/meta/notifications", () => ({ dispatchWhatsAppNotifications }));

import { baterORelogio } from "@/lib/agency/despertador";

beforeEach(() => {
  vi.clearAllMocks();
  db.project.findMany.mockResolvedValue([]);
  runProjectExecution.mockResolvedValue({ ok: true, status: "done", produced: ["X"], askedClient: [], skipped: [] });
  dispatchWhatsAppNotifications.mockResolvedValue({ scanned: 0, sent: 0, failed: 0, skipped: 0, details: [] });
});

describe("o despertador — o que faz a agência trabalhar às 3 da manhã", () => {
  it("retoma a produção parada e dispara os avisos na mesma batida", async () => {
    db.project.findMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);
    dispatchWhatsAppNotifications.mockResolvedValue({ scanned: 3, sent: 2, failed: 0, skipped: 1, details: [] });

    const r = await baterORelogio();
    expect(runProjectExecution).toHaveBeenCalledTimes(2);
    expect(r.retomados).toBe(2);
    expect(r.avisos).toBe(2);
  });

  it("só acorda projeto cuja direção o cliente JÁ aprovou", async () => {
    // Sem este filtro o relógio atropelaria o portão de direção — produziria
    // um mês inteiro de trabalho que o cliente ainda não avalizou.
    await baterORelogio();
    const where = db.project.findMany.mock.calls[0]![0].where;
    expect(where.directionApprovedAt).toEqual({ not: null });
  });

  it("acorda os três estados que ficariam parados para sempre", async () => {
    await baterORelogio();
    const where = db.project.findMany.mock.calls[0]![0].where;
    const estados = where.OR.map((o: { executionStatus: string }) => o.executionStatus);
    expect(estados).toContain("running"); // caiu no meio
    expect(estados).toContain("failed");  // falha momentânea de IA
    expect(estados).toContain("pending"); // aprovou e o disparo não chegou a acontecer
  });

  it("desiste depois de tentar demais — insistir para sempre queima dinheiro de IA", async () => {
    await baterORelogio();
    const where = db.project.findMany.mock.calls[0]![0].where;
    expect(where.executionAttempts).toEqual({ lt: 5 });
  });

  it("recuperação é recuperação, não enxurrada: no máximo 5 por rodada", async () => {
    await baterORelogio();
    expect(db.project.findMany.mock.calls[0]![0].take).toBe(5);
  });

  it("o mais antigo primeiro — quem espera há mais tempo tem a vez", async () => {
    await baterORelogio();
    expect(db.project.findMany.mock.calls[0]![0].orderBy).toEqual({ executionRequestedAt: "asc" });
  });
});

describe("o relógio nunca pode morrer", () => {
  it("um projeto que explode não derruba os outros da rodada", async () => {
    db.project.findMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }, { id: "p3" }]);
    runProjectExecution
      .mockResolvedValueOnce({ ok: true, status: "done", produced: ["A"], askedClient: [], skipped: [] })
      .mockRejectedValueOnce(new Error("banco fora"))
      .mockResolvedValueOnce({ ok: true, status: "done", produced: ["C"], askedClient: [], skipped: [] });

    const r = await baterORelogio();
    expect(runProjectExecution).toHaveBeenCalledTimes(3);
    expect(r.retomados).toBe(2);
  });

  it("banco fora na busca não impede o disparo dos avisos", async () => {
    db.project.findMany.mockRejectedValue(new Error("banco fora"));
    dispatchWhatsAppNotifications.mockResolvedValue({ scanned: 1, sent: 1, failed: 0, skipped: 0, details: [] });

    const r = await baterORelogio();
    expect(r.retomados).toBe(0);
    expect(r.avisos).toBe(1);
  });

  it("WhatsApp fora do ar não impede a produção de ser retomada", async () => {
    db.project.findMany.mockResolvedValue([{ id: "p1" }]);
    dispatchWhatsAppNotifications.mockRejectedValue(new Error("Meta fora"));

    const r = await baterORelogio();
    expect(r.retomados).toBe(1);
    expect(r.avisos).toBe(0);
  });
});
