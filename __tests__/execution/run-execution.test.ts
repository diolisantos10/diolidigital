import { describe, it, expect, beforeEach, vi } from "vitest";

// Mocks das dependências do núcleo.
const db = vi.hoisted(() => ({
  project: { findUnique: vi.fn(), update: vi.fn() },
  clientRequestDb: { findUnique: vi.fn() },
  client: { findFirst: vi.fn() },
  brainArtifact: { findMany: vi.fn() },
  deliverable: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  portalMessage: { create: vi.fn() },
  task: { updateMany: vi.fn() },
  materialRequest: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
}));
const generate = vi.hoisted(() => vi.fn());
const createApprovalRequest = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/ai/generate", () => ({ generate }));
vi.mock("@/lib/agency/persistence/approval-service", () => ({ createApprovalRequest }));
// O maestro (PM) é testado à parte — aqui devolve um plano fixo pra isolar o motor.
vi.mock("@/lib/agency/execution/pm-conductor", () => ({
  planProduction: vi.fn(async () => ({ orderedDepartments: ["social-media"], goal: "g", warnings: [], pmMode: "rule_based" })),
}));
// Qualidade é testada à parte; aqui devolve parecer "pass" (sombra, não bloqueia).
vi.mock("@/lib/agency/execution/quality-auditor", () => ({
  auditDeliverable: vi.fn(async () => ({ verdict: "pass", issues: [], note: "ok" })),
}));
// Biblioteca do Radar é testada à parte; aqui não injeta nada.
vi.mock("@/lib/agency/radar/library", () => ({
  getActiveInsights: vi.fn(async () => []),
  buildInsightBlock: vi.fn(() => ""),
}));

import { runProjectExecution } from "@/lib/agency/execution/run-execution";
import { auditDeliverable } from "@/lib/agency/execution/quality-auditor";

const baseProject = {
  id: "p1", workspaceId: "ws1", clientId: "c1", clientRequestId: "cr1",
  agents: JSON.stringify(["a3"]), executionStatus: "idle", executionStartedAt: null, executionRequestedAt: null,
  // O portão de direção: a produção só roda com o aval do cliente. Um projeto
  // em produção necessariamente já passou por ele.
  directionApprovedAt: new Date("2026-08-01"),
};

beforeEach(() => {
  vi.clearAllMocks();
  db.project.update.mockResolvedValue({});
  db.clientRequestDb.findUnique.mockResolvedValue({ id: "cr1", businessName: "Loja X", services: JSON.stringify(["social"]), objectives: "[]", briefingJson: "{}" });
  db.client.findFirst.mockResolvedValue({ id: "c1", name: "Loja X", brandBrain: null });
  db.brainArtifact.findMany.mockResolvedValue([]);
  db.deliverable.findMany.mockResolvedValue([]);
  db.deliverable.create.mockResolvedValue({ id: "d1" });
  db.deliverable.update.mockResolvedValue({});
  db.portalMessage.create.mockResolvedValue({});
  db.task.updateMany.mockResolvedValue({ count: 1 });
  db.materialRequest.findFirst.mockResolvedValue(null);
  db.materialRequest.create.mockResolvedValue({ id: "mr1" });
  db.materialRequest.findMany.mockResolvedValue([]);
  db.materialRequest.updateMany.mockResolvedValue({ count: 0 });
  createApprovalRequest.mockResolvedValue({});
});

describe("runProjectExecution — produção durável e confiável", () => {
  it("produz a entrega e marca o projeto como 'done'", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    generate.mockResolvedValue({ ok: true, data: { title: "Pacote Social", summary: "resumo", items: [{ format: "feed", headline: "Oi", caption: "legenda bem completa aqui", visual: "foto" }] } });

    const r = await runProjectExecution("p1");
    expect(r.ok).toBe(true);
    expect(r.produced).toContain("Social Media");
    expect(db.deliverable.create).toHaveBeenCalled();
    // marcou running no começo e done no fim
    const statuses = db.project.update.mock.calls.map((c) => c[0].data.executionStatus);
    expect(statuses).toContain("running");
    expect(statuses).toContain("done");
  });

  it("Qualidade reprovou → agente REVISA e reentrega a MELHOR versão (loop de correção)", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    const auditMock = auditDeliverable as unknown as ReturnType<typeof vi.fn>;
    auditMock.mockResolvedValueOnce({ verdict: "flag", issues: ["clichê vazio"], note: "revisar" })
             .mockResolvedValueOnce({ verdict: "pass", issues: [], note: "melhorou" });
    generate.mockResolvedValue({ ok: true, data: { title: "Pacote", summary: "s", items: [{ format: "feed", headline: "Oi", caption: "legenda bem completa aqui", visual: "foto" }] } });

    const r = await runProjectExecution("p1");
    expect(generate).toHaveBeenCalledTimes(2);          // geração original + 1 revisão
    expect(db.deliverable.create).toHaveBeenCalledTimes(1); // publica só a melhor versão
    expect(r.produced).toContain("Social Media");
  });

  it("IA indisponível → NÃO perde: marca 'failed' pra o cron re-tentar", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    generate.mockResolvedValue({ ok: false });
    const r = await runProjectExecution("p1");
    expect(r.status).toBe("failed");
    expect(db.deliverable.create).not.toHaveBeenCalled();
    const last = db.project.update.mock.calls.at(-1)?.[0].data;
    expect(last.executionStatus).toBe("failed");
  });

  it("gate de saída: resposta curta/vazia é barrada (não chega ao cliente)", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    generate.mockResolvedValue({ ok: true, data: { title: "X", summary: "", items: [] } });
    const r = await runProjectExecution("p1");
    expect(db.deliverable.create).not.toHaveBeenCalled();
    expect(r.skipped.join(" ")).toMatch(/insuficiente/);
  });

  it("idempotente: departamento já produzido é pulado", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    db.deliverable.findMany.mockResolvedValue([{ ownerAgentId: "a3" }]); // social já feito
    const r = await runProjectExecution("p1");
    expect(generate).not.toHaveBeenCalled();
    expect(r.produced).toHaveLength(0);
  });

  it("anti-concorrência: já rodando há pouco → não roda de novo", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject, executionStatus: "running", executionStartedAt: new Date() });
    const r = await runProjectExecution("p1");
    expect(r.status).toBe("skipped_running");
    expect(generate).not.toHaveBeenCalled();
  });

  it("projeto sem solicitação vinculada → falha limpa", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject, clientRequestId: null });
    const r = await runProjectExecution("p1");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/solicita/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  A ESTEIRA: o portão de direção, a tarefa que anda, e uma voz para o cliente
// ─────────────────────────────────────────────────────────────────────────────

describe("o portão de direção", () => {
  it("sem o aval do cliente, a produção NÃO começa", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject, directionApprovedAt: null });
    const r = await runProjectExecution("p1");
    expect(generate).not.toHaveBeenCalled();
    expect(db.deliverable.create).not.toHaveBeenCalled();
    expect(r.error).toMatch(/direção/i);
  });

  it("não deixa o projeto marcado como falho — ele está esperando, não quebrado", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject, directionApprovedAt: null });
    await runProjectExecution("p1");
    const ultimo = db.project.update.mock.calls.at(-1)?.[0].data;
    expect(ultimo.executionStatus).toBe("idle");
    expect(ultimo.executionError).toBeNull();
  });

  it("com o aval, a produção roda normalmente", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    generate.mockResolvedValue({ ok: true, data: { title: "T", summary: "resumo", items: [{ headline: "A", caption: "uma legenda bem completa para passar do piso" }] } });
    const r = await runProjectExecution("p1");
    expect(r.produced).toContain("Social Media");
  });
});

describe("a tarefa segue a produção", () => {
  it("produzindo → em revisão → entregue, ligada ao entregável", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    generate.mockResolvedValue({ ok: true, data: { title: "T", summary: "resumo", items: [{ headline: "A", caption: "uma legenda bem completa para passar do piso" }] } });
    await runProjectExecution("p1");

    const estados = db.task.updateMany.mock.calls.map((c) => c[0].data.status);
    expect(estados).toEqual(["in_progress", "review", "done"]);

    const fechamento = db.task.updateMany.mock.calls.at(-1)?.[0].data;
    expect(fechamento.deliverableId).toBe("d1");
  });

  it("IA fora do ar devolve a tarefa para a fila — não fica presa em produzindo", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    generate.mockResolvedValue({ ok: false });
    await runProjectExecution("p1");
    expect(db.task.updateMany.mock.calls.at(-1)?.[0].data.status).toBe("pending");
  });

  it("falta de material bloqueia a tarefa em vez de deixá-la parecendo ativa", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject, agents: JSON.stringify(["a2"]) });
    db.client.findFirst.mockResolvedValue({ id: "c1", name: "Loja X", brandBrain: null }); // sem assets de marca
    await runProjectExecution("p1");
    const estados = db.task.updateMany.mock.calls.map((c) => c[0].data.status);
    expect(estados).toContain("blocked");
  });
});

describe("uma voz para o cliente", () => {
  it("o agente ABRE pedido — não manda mensagem por conta própria", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject, agents: JSON.stringify(["a2"]) });
    db.client.findFirst.mockResolvedValue({ id: "c1", name: "Loja X", brandBrain: null });
    db.materialRequest.findMany.mockResolvedValue([
      { id: "mr1", type: "design", description: "precisamos do logo e das cores", requestedByLabel: "Design", askedClientAt: null },
    ]);

    const r = await runProjectExecution("p1");
    expect(db.materialRequest.create).toHaveBeenCalled();
    expect(r.askedClient).toContain("Design");
  });

  it("quem fala com o cliente é o gerente de projeto, uma vez só", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject, agents: JSON.stringify(["a2"]) });
    db.client.findFirst.mockResolvedValue({ id: "c1", name: "Loja X", brandBrain: null });
    db.materialRequest.findMany.mockResolvedValue([
      { id: "mr1", type: "design", description: "precisamos do logo e das cores", requestedByLabel: "Design", askedClientAt: null },
    ]);

    await runProjectExecution("p1");
    const mensagens = db.portalMessage.create.mock.calls.map((c) => c[0].data);
    expect(mensagens).toHaveLength(1);
    expect(mensagens[0].authorName).toBe("Gerente de projeto");
  });

  it("a entrega pronta NÃO pinga sozinha no portal do cliente", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    generate.mockResolvedValue({ ok: true, data: { title: "T", summary: "resumo", items: [{ headline: "A", caption: "uma legenda bem completa para passar do piso" }] } });
    await runProjectExecution("p1");
    expect(db.portalMessage.create).not.toHaveBeenCalled();
    expect(createApprovalRequest.mock.calls[0][0].clientVisible).toBe(false);
  });
});
