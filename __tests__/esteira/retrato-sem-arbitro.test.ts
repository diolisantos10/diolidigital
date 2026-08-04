// "Quantas entregas foram ao cliente SEM árbitro?"
//
// Essa pergunta não tinha resposta em lugar nenhum do sistema. `retrato.ts`
// contava `quality_flag` (reprovada) e mais nada — o terceiro estado da
// Qualidade, `quality_nao_auditado`, estava gravado no banco desde o dia em que
// nasceu e não aparecia em contador algum.
//
// Isso importa porque a indisponibilidade da auditoria é NÃO-BLOQUEANTE de
// propósito: a operação não pode parar porque um provedor caiu. Essa escolha só
// é defensável enquanto for POSSÍVEL medir o que ela deixou passar. Sem o
// contador, "não bloqueia" vira "não conta", que é o fail-open com outro nome.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  project: { findUnique: vi.fn(), findFirst: vi.fn() },
  deliverable: { groupBy: vi.fn() },
  clientRequestDb: { findUnique: vi.fn() },
  socialPost: { groupBy: vi.fn() },
  metaConnection: { count: vi.fn() },
  task: { groupBy: vi.fn() },
  materialRequest: { findMany: vi.fn() },
  cycle: { findFirst: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import { statusDoProjeto } from "@/lib/agency/esteira/retrato";

beforeEach(() => {
  vi.clearAllMocks();
  db.project.findUnique.mockResolvedValue({
    id: "p1", name: "Padaria do João — Social", clientRequestId: "cr1", stage: "production",
    executionStatus: "done", directionApprovedAt: new Date("2026-08-01"),
    presentedAt: new Date("2026-08-03"), clientApprovedAt: null,
    workspaceId: "ws1", clientId: "c1", client: { name: "Padaria do João" },
  });
  db.clientRequestDb.findUnique.mockResolvedValue({ status: "accepted" });
  db.socialPost.groupBy.mockResolvedValue([]);
  db.metaConnection.count.mockResolvedValue(1);
  db.task.groupBy.mockResolvedValue([]);
  db.materialRequest.findMany.mockResolvedValue([]);
  db.cycle.findFirst.mockResolvedValue(null);
});

describe("o retrato conta as entregas que ninguém auditou", () => {
  it("METADE 1 — pacote inteiro auditado e aprovado: o contador fica em zero", async () => {
    db.deliverable.groupBy.mockResolvedValue([
      { status: "in_review", revisionStatus: "quality_ok", _count: { _all: 4 } },
    ]);
    const s = await statusDoProjeto("p1");
    expect(s!.numeros.entregaveis.total).toBe(4);
    expect(s!.numeros.entregaveis.semAuditoria).toBe(0);
  });

  it("METADE 2 — as não auditadas aparecem, e SEPARADAS das reprovadas", async () => {
    db.deliverable.groupBy.mockResolvedValue([
      { status: "in_review", revisionStatus: "quality_ok", _count: { _all: 2 } },
      { status: "in_review", revisionStatus: "quality_nao_auditado", _count: { _all: 3 } },
      { status: "in_review", revisionStatus: "quality_flag", _count: { _all: 1 } },
    ]);
    const s = await statusDoProjeto("p1");
    expect(s!.numeros.entregaveis.semAuditoria, "o dado estava no banco e não aparecia").toBe(3);
    expect(s!.numeros.entregaveis.comRessalva, "reprovada e não-auditada são coisas diferentes").toBe(1);
    expect(s!.numeros.entregaveis.total).toBe(6);
  });

  it("não auditada NÃO é contada como reprovada — misturar as duas é o fail-open de volta", async () => {
    db.deliverable.groupBy.mockResolvedValue([
      { status: "in_review", revisionStatus: "quality_nao_auditado", _count: { _all: 5 } },
    ]);
    const s = await statusDoProjeto("p1");
    expect(s!.numeros.entregaveis.comRessalva).toBe(0);
    expect(s!.numeros.entregaveis.semAuditoria).toBe(5);
  });

  it("nem como aprovada — `aprovados` é o status do fluxo, não o veredito da Qualidade", async () => {
    db.deliverable.groupBy.mockResolvedValue([
      { status: "in_review", revisionStatus: "quality_nao_auditado", _count: { _all: 5 } },
    ]);
    const s = await statusDoProjeto("p1");
    expect(s!.numeros.entregaveis.aprovados).toBe(0);
  });
});
