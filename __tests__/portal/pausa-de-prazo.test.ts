// A outra ponta da dúvida (T5b): quando a AGÊNCIA responde no card, o prazo
// despausa — e o tempo que ficou parado é DEVOLVIDO ao `expiresAt`. Despausar
// sem devolver seria punir o cliente por ter perguntado.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  approvalComment: { create: vi.fn() },
  approvalRequest: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import { addApprovalComment } from "@/lib/agency/persistence/approval-service";

const DUAS_HORAS = 2 * 60 * 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  db.approvalComment.create.mockResolvedValue({ id: "cm1" });
  db.approvalRequest.update.mockResolvedValue({});
});

describe("resposta da agência despausa o prazo", () => {
  it("devolve ao expiresAt o tempo que a dúvida ficou aberta", async () => {
    const abertaHa = new Date(Date.now() - DUAS_HORAS);
    const prazo = new Date(Date.now() + 24 * 60 * 60 * 1000);
    db.approvalRequest.findUnique.mockResolvedValue({ questionOpenedAt: abertaHa, expiresAt: prazo });

    await addApprovalComment({
      approvalRequestId: "ap1", authorName: "Equipe", authorRole: "internal",
      kind: "answer", body: "Vai no feed!", isClientVisible: true,
    });

    const data = db.approvalRequest.update.mock.calls[0]![0].data;
    expect(data.questionOpenedAt).toBeNull();
    const devolvido = (data.expiresAt as Date).getTime() - prazo.getTime();
    // ~2h devolvidas (tolerância para o tempo de execução do teste).
    expect(devolvido).toBeGreaterThanOrEqual(DUAS_HORAS - 1000);
    expect(devolvido).toBeLessThan(DUAS_HORAS + 60_000);
  });

  it("sem dúvida aberta, a resposta não mexe em nada", async () => {
    db.approvalRequest.findUnique.mockResolvedValue({ questionOpenedAt: null, expiresAt: new Date() });
    await addApprovalComment({
      approvalRequestId: "ap1", authorName: "Equipe", body: "obs", isClientVisible: true,
    });
    expect(db.approvalRequest.update).not.toHaveBeenCalled();
  });

  it("comentário do CLIENTE não despausa — a bola continua com a agência", async () => {
    await addApprovalComment({
      approvalRequestId: "ap1", authorName: "Cliente", authorRole: "client",
      body: "complementando a dúvida…", isClientVisible: true,
    });
    expect(db.approvalRequest.findUnique).not.toHaveBeenCalled();
    expect(db.approvalRequest.update).not.toHaveBeenCalled();
  });

  it("comentário interno INVISÍVEL ao cliente não despausa — resposta que ele não vê não devolve a bola", async () => {
    await addApprovalComment({
      approvalRequestId: "ap1", authorName: "Equipe", body: "nota interna", isClientVisible: false,
    });
    expect(db.approvalRequest.update).not.toHaveBeenCalled();
  });
});
