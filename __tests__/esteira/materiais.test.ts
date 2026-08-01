import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  materialRequest: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
  project: { findUnique: vi.fn(), update: vi.fn() },
}));
const moverTarefasDoAgente = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/esteira/tarefas", () => ({ moverTarefasDoAgente }));

import { materialRecebido } from "@/lib/agency/esteira/materiais";

const pedido = { id: "mr1", projectId: "p1", status: "pending", requestedByAgentId: "a2" };
const projetoPronto = { directionApprovedAt: new Date("2026-08-01"), executionStatus: "failed" };

beforeEach(() => {
  vi.clearAllMocks();
  db.materialRequest.findUnique.mockResolvedValue({ ...pedido });
  db.materialRequest.update.mockResolvedValue({});
  db.materialRequest.count.mockResolvedValue(0);
  db.project.findUnique.mockResolvedValue({ ...projetoPronto });
  db.project.update.mockResolvedValue({});
  moverTarefasDoAgente.mockResolvedValue({ count: 1 });
});

describe("o material chegou → a produção volta a andar", () => {
  it("chegou tudo → a produção volta para a fila", async () => {
    // O buraco que isto fecha: antes, o material chegava, virava "recebido"
    // numa tabela, e o projeto ficava parado PARA SEMPRE.
    const r = await materialRecebido("mr1");
    expect(r.producaoRetomada).toBe(true);
    expect(db.project.update.mock.calls[0]![0].data.executionStatus).toBe("pending");
  });

  it("o agente que estava travado volta para a fila", async () => {
    await materialRecebido("mr1");
    expect(moverTarefasDoAgente).toHaveBeenCalledWith("p1", "a2", "pending");
  });

  it("zera o contador de tentativas — as falhas foram por falta de material, não por defeito", async () => {
    // Sem isto, um projeto que esperou material chegaria ao teto de tentativas
    // do despertador e nunca mais seria retomado sozinho.
    await materialRecebido("mr1");
    expect(db.project.update.mock.calls[0]![0].data.executionAttempts).toBe(0);
  });

  it("ainda falta material → continua esperando de propósito", async () => {
    // Retomar agora produziria metade e cobraria o cliente de novo pelo resto.
    db.materialRequest.count.mockResolvedValue(2);
    const r = await materialRecebido("mr1");
    expect(r.aindaFaltam).toBe(2);
    expect(r.producaoRetomada).toBe(false);
    expect(db.project.update).not.toHaveBeenCalled();
  });
});

describe("o que o destrave NÃO pode atropelar", () => {
  it("sem o aval da direção não produz — nem com todo o material do mundo", async () => {
    db.project.findUnique.mockResolvedValue({ directionApprovedAt: null, executionStatus: "idle" });
    const r = await materialRecebido("mr1");
    expect(r.producaoRetomada).toBe(false);
    expect(db.project.update).not.toHaveBeenCalled();
  });

  it("já está rodando → deixa rodar, não empilha", async () => {
    db.project.findUnique.mockResolvedValue({ ...projetoPronto, executionStatus: "running" });
    const r = await materialRecebido("mr1");
    expect(r.producaoRetomada).toBe(false);
    expect(db.project.update).not.toHaveBeenCalled();
  });

  it("marcar de novo o que já estava recebido não re-grava o status", async () => {
    db.materialRequest.findUnique.mockResolvedValue({ ...pedido, status: "received" });
    await materialRecebido("mr1");
    expect(db.materialRequest.update).not.toHaveBeenCalled();
  });

  it("pedido inexistente falha limpo, sem tocar no projeto", async () => {
    db.materialRequest.findUnique.mockResolvedValue(null);
    const r = await materialRecebido("nao-existe");
    expect(r.ok).toBe(false);
    expect(db.project.update).not.toHaveBeenCalled();
  });

  it("o quadro de tarefas falhando não impede o destrave da produção", async () => {
    moverTarefasDoAgente.mockRejectedValue(new Error("banco fora"));
    const r = await materialRecebido("mr1");
    expect(r.producaoRetomada).toBe(true);
  });
});
