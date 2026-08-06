import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  project: { findUnique: vi.fn(), update: vi.fn() },
  task: { findMany: vi.fn() },
  deliverable: { findMany: vi.fn(), updateMany: vi.fn() },
  materialRequest: { count: vi.fn() },
  approvalRequest: { updateMany: vi.fn() },
  portalMessage: { create: vi.fn() },
  cycle: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  activityEvent: { create: vi.fn() },
  departmentLadder: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
const runProjectExecution = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/execution/run-execution", () => ({ runProjectExecution }));

import { pedirDirecao, aprovarDirecao, apresentar, aprovarPacote } from "@/lib/agency/esteira/marcos";
import { escadaToda } from "../_escada";

const PROJETO = {
  id: "p1", name: "Padaria do João", clientRequestId: "cr1",
  directionApprovedAt: null as Date | null,
  presentedAt: null as Date | null,
  clientApprovedAt: null as Date | null,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.project.findUnique.mockResolvedValue({ ...PROJETO });
  db.project.update.mockResolvedValue({});
  db.deliverable.updateMany.mockResolvedValue({});
  db.cycle.update.mockResolvedValue({});
  db.task.findMany.mockResolvedValue([{ title: "Pacote de social" }, { title: "Conceito visual" }]);
  // `ownerAgentId` é o que diz de que departamento é a peça — sem ele a escada
  // de exposição retém, e com razão (executor desconhecido = fail-closed).
  db.deliverable.findMany.mockResolvedValue([{ id: "d1", name: "Pacote Social", revisionStatus: "quality_ok", ownerAgentId: "a3" }]);
  db.activityEvent.create.mockResolvedValue({});
  // A METADE LEGÍTIMA: com o departamento em `wide`, apresentar segue sem
  // atrito. A metade que barra tem teste próprio (escada-de-exposicao.test.ts).
  db.departmentLadder.findMany.mockResolvedValue(escadaToda("wide"));
  db.materialRequest.count.mockResolvedValue(0);
  db.approvalRequest.updateMany.mockResolvedValue({ count: 1 });
  db.portalMessage.create.mockResolvedValue({});
  db.cycle.findUnique.mockResolvedValue(null);
  db.cycle.findFirst.mockResolvedValue(null);
  db.cycle.create.mockResolvedValue({ id: "cy1", reference: "2026-08", startsOn: "2026-08-01", endsOn: "2026-08-31", planJson: "[]", summary: null });
  runProjectExecution.mockResolvedValue({ ok: true, status: "done", produced: ["Social Media"], askedClient: [], skipped: [] });
});

describe("MARCO 0 — pedir a direção", () => {
  it("manda o plano ao cliente assim que o projeto nasce", async () => {
    const r = await pedirDirecao("p1");
    expect(r.ok).toBe(true);
    expect(r.avisouCliente).toBe(true);
    const msg = db.portalMessage.create.mock.calls[0][0].data.body;
    expect(msg).toContain("Pacote de social");
    expect(msg).toContain("Conceito visual");
  });

  it("explica que mudar agora é barato — é o motivo do portão existir", async () => {
    await pedirDirecao("p1");
    expect(db.portalMessage.create.mock.calls[0][0].data.body).toMatch(/agora é a melhor hora|custa bem mais/i);
  });

  it("direção já aprovada não pede de novo", async () => {
    db.project.findUnique.mockResolvedValue({ ...PROJETO, directionApprovedAt: new Date() });
    await pedirDirecao("p1");
    expect(db.portalMessage.create).not.toHaveBeenCalled();
  });
});

describe("MARCO 1 — aprovar a direção dispara a produção", () => {
  it("carimba, pede execução e roda o motor", async () => {
    const r = await aprovarDirecao("p1");
    expect(r.ok).toBe(true);
    const dados = db.project.update.mock.calls[0][0].data;
    expect(dados.directionApprovedAt).toBeInstanceOf(Date);
    expect(dados.executionStatus).toBe("pending");
    expect(runProjectExecution).toHaveBeenCalledWith("p1");
  });

  it("o pedido de produção fica no banco — se a chamada morrer, o cron retoma", async () => {
    await aprovarDirecao("p1", { produzirAgora: false });
    expect(db.project.update.mock.calls[0][0].data.executionRequestedAt).toBeInstanceOf(Date);
    expect(runProjectExecution).not.toHaveBeenCalled();
  });

  it("aprovar duas vezes não re-dispara nem duplica mensagem", async () => {
    db.project.findUnique.mockResolvedValue({ ...PROJETO, directionApprovedAt: new Date() });
    await aprovarDirecao("p1");
    expect(runProjectExecution).not.toHaveBeenCalled();
    expect(db.portalMessage.create).not.toHaveBeenCalled();
  });
});

describe("MARCO 2 — apresentar, de uma vez", () => {
  it("recusa apresentar o que a Qualidade reprovou", async () => {
    db.project.findUnique.mockResolvedValue({ ...PROJETO, directionApprovedAt: new Date() });
    db.deliverable.findMany.mockResolvedValue([{ id: "d1", name: "X", revisionStatus: "quality_flag" }]);
    const r = await apresentar("p1");
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/ressalva/i);
    expect(db.portalMessage.create).not.toHaveBeenCalled();
  });

  it("com ordem explícita, apresenta mesmo com ressalva", async () => {
    db.project.findUnique.mockResolvedValue({ ...PROJETO, directionApprovedAt: new Date() });
    db.deliverable.findMany.mockResolvedValue([{ id: "d1", name: "X", revisionStatus: "quality_flag" }]);
    const r = await apresentar("p1", { mesmoComRessalva: true });
    expect(r.ok).toBe(true);
  });

  it("só aí as aprovações ficam visíveis ao cliente — nada pinga antes", async () => {
    db.project.findUnique.mockResolvedValue({ ...PROJETO, directionApprovedAt: new Date() });
    await apresentar("p1");
    expect(db.approvalRequest.updateMany.mock.calls[0][0].data.clientVisible).toBe(true);
  });

  it("apresentar carimba as entregas como 'compartilhado' — antes disso o portal não as mostra", async () => {
    // Hub, Lote 1: `visibility` nasce "interno" (fail-closed) e a apresentação
    // é o ato explícito de publicação. Sem o carimbo, o card fica sem corpo.
    db.project.findUnique.mockResolvedValue({ ...PROJETO, directionApprovedAt: new Date() });
    await apresentar("p1");
    // Publica por LISTA DE IDS, não pelo projeto inteiro: quem decide quais é a
    // escada de exposição (`escadaFiltraEntregas`). Aqui o departamento está em
    // `wide`, então a entrega legítima atravessa — a metade que retém está em
    // `__tests__/qualidade/escada-de-exposicao.test.ts`.
    expect(db.deliverable.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ["d1"] } },
      data: { visibility: "compartilhado" },
    }));
  });

  it("lista as entregas numa mensagem só, do gerente de projeto", async () => {
    db.project.findUnique.mockResolvedValue({ ...PROJETO, directionApprovedAt: new Date() });
    db.deliverable.findMany.mockResolvedValue([
      { id: "d1", name: "Pacote Social", revisionStatus: "quality_ok" },
      { id: "d2", name: "Conceito Visual", revisionStatus: "quality_ok" },
    ]);
    await apresentar("p1");
    const msgs = db.portalMessage.create.mock.calls.map((c) => c[0].data);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].authorName).toBe("Gerente de projeto");
    expect(msgs[0].body).toContain("Pacote Social");
    expect(msgs[0].body).toContain("Conceito Visual");
  });

  it("avisa sobre material ainda pendente sem travar a análise", async () => {
    db.project.findUnique.mockResolvedValue({ ...PROJETO, directionApprovedAt: new Date() });
    db.materialRequest.count.mockResolvedValue(2);
    await apresentar("p1");
    expect(db.portalMessage.create.mock.calls[0][0].data.body).toMatch(/ainda faltam 2/i);
  });

  it("sem direção aprovada não apresenta", async () => {
    const r = await apresentar("p1");
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/direção/i);
  });

  it("sem nada pronto não apresenta", async () => {
    db.project.findUnique.mockResolvedValue({ ...PROJETO, directionApprovedAt: new Date() });
    db.deliverable.findMany.mockResolvedValue([]);
    const r = await apresentar("p1");
    expect(r.ok).toBe(false);
  });
});

describe("MARCO 3 — o aval do cliente abre a rotina", () => {
  it("carimba, aprova as pendências e abre o primeiro ciclo", async () => {
    db.project.findUnique.mockResolvedValue({ ...PROJETO, directionApprovedAt: new Date(), presentedAt: new Date() });
    const r = await aprovarPacote("p1");
    expect(r.ok).toBe(true);
    expect(db.project.update.mock.calls[0][0].data.clientApprovedAt).toBeInstanceOf(Date);
    expect(db.approvalRequest.updateMany.mock.calls[0][0].data.status).toBe("approved");
    expect(db.cycle.create).toHaveBeenCalled();
  });

  it("não aprova o que nunca foi apresentado", async () => {
    db.project.findUnique.mockResolvedValue({ ...PROJETO, directionApprovedAt: new Date() });
    const r = await aprovarPacote("p1");
    expect(r.ok).toBe(false);
    expect(db.cycle.create).not.toHaveBeenCalled();
  });

  it("aprovar de novo não abre um segundo ciclo", async () => {
    db.project.findUnique.mockResolvedValue({ ...PROJETO, presentedAt: new Date(), clientApprovedAt: new Date() });
    await aprovarPacote("p1");
    expect(db.cycle.create).not.toHaveBeenCalled();
  });
});
