import { describe, it, expect, beforeEach, vi } from "vitest";

// Mocks das dependências do núcleo.
const db = vi.hoisted(() => ({
  project: { findUnique: vi.fn(), update: vi.fn() },
  clientRequestDb: { findUnique: vi.fn() },
  client: { findFirst: vi.fn() },
  brainArtifact: { findMany: vi.fn() },
  deliverable: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  portalMessage: { create: vi.fn() },
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

import { runProjectExecution } from "@/lib/agency/execution/run-execution";

const baseProject = {
  id: "p1", workspaceId: "ws1", clientId: "c1", clientRequestId: "cr1",
  agents: JSON.stringify(["a3"]), executionStatus: "idle", executionStartedAt: null, executionRequestedAt: null,
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
