import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  project: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  deliverable: { findMany: vi.fn(), update: vi.fn() },
  clientRequestDb: { findUnique: vi.fn() },
  activityEvent: { create: vi.fn() },
}));
const generate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/ai/generate", () => ({ generate }));

import { destravarPacote, pacotesTravados, MAX_TENTATIVAS_DE_REFAZER } from "@/lib/agency/esteira/pacote-travado";

const projeto = { id: "p1", workspaceId: "ws1", clientId: "c1", clientRequestId: "cr1", presentedAt: null };
const reprovada = {
  id: "d1", name: "Plano de Medição", content: "conteúdo fraco", ownerAgentId: "a5",
  lastFeedback: "operacionalização fraca, nomenclatura imprecisa", version: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.project.findUnique.mockResolvedValue({ ...projeto });
  db.project.update.mockResolvedValue({});
  db.deliverable.findMany.mockResolvedValue([{ ...reprovada }]);
  db.deliverable.update.mockResolvedValue({});
  db.clientRequestDb.findUnique.mockResolvedValue({ businessName: "Dioli Digital Studio" });
  db.activityEvent.create.mockResolvedValue({});
  generate.mockResolvedValue({
    ok: true,
    data: { title: "Plano de Medição v2", summary: "Agora com fontes e cadência definidas.", items: [{ headline: "Alcance", note: "medido no Instagram, semanal" }] },
  });
});

describe("a agência refaz sozinha o que ela mesma reprovou", () => {
  it("refaz a entrega com a crítica da Qualidade na mão", async () => {
    const r = await destravarPacote("p1");
    expect(r.corrigidas).toHaveLength(1);
    const prompt = generate.mock.calls[0]![0].user as string;
    expect(prompt, "o especialista precisa saber o que foi apontado").toContain("operacionalização fraca");
  });

  it("a peça refeita volta para 'boa' — a produção não se auto-absolve", async () => {
    // Marcar como aprovada aqui seria a produção dando o próprio veredito. Ela
    // volta ao estado normal e a auditoria decide de novo.
    await destravarPacote("p1");
    expect(db.deliverable.update.mock.calls[0]![0].data.revisionStatus).toBe("quality_ok");
  });

  it("o especialista refeito é proibido de inventar para preencher", async () => {
    await destravarPacote("p1");
    expect(generate.mock.calls[0]![0].user as string).toContain("PRECISO CONFIRMAR");
  });
});

describe("quando refazer não resolve, vira decisão do Diretor", () => {
  it("esgotou as tentativas → escala e registra no banco", async () => {
    db.deliverable.findMany.mockResolvedValue([{ ...reprovada, version: MAX_TENTATIVAS_DE_REFAZER + 1 }]);
    const r = await destravarPacote("p1");
    expect(r.escalado).toBe(true);
    expect(generate, "não gasta IA depois do teto").not.toHaveBeenCalled();
    expect(db.activityEvent.create.mock.calls[0]![0].data.type).toBe("pacote_travado_escalado");
  });

  it("IA fora do ar NÃO gasta tentativa — o problema não é da peça", async () => {
    generate.mockResolvedValue({ ok: false, error: "timeout" });
    const r = await destravarPacote("p1");
    expect(r.corrigidas).toHaveLength(0);
    expect(db.deliverable.update, "a peça fica como está para a próxima passada").not.toHaveBeenCalled();
  });
});

describe("o que o destravamento nunca toca", () => {
  it("pacote já apresentado ao cliente → não mexe", async () => {
    db.project.findUnique.mockResolvedValue({ ...projeto, presentedAt: new Date() });
    const r = await destravarPacote("p1");
    expect(r.corrigidas).toHaveLength(0);
    expect(db.deliverable.findMany).not.toHaveBeenCalled();
  });

  it("nenhuma entrega reprovada → sai limpo", async () => {
    db.deliverable.findMany.mockResolvedValue([]);
    const r = await destravarPacote("p1");
    expect(r.escalado).toBe(false);
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("o painel do Diretor sabe quem espera por ele", () => {
  it("separa o que a máquina ainda resolve do que precisa de gente", async () => {
    db.project.findMany.mockResolvedValue([
      { id: "p1", name: "A", clientId: "c1", updatedAt: new Date(), deliverables: [{ id: "d1", name: "X", lastFeedback: "", version: 1 }] },
      { id: "p2", name: "B", clientId: "c2", updatedAt: new Date(), deliverables: [{ id: "d2", name: "Y", lastFeedback: "", version: MAX_TENTATIVAS_DE_REFAZER + 1 }] },
    ]);
    const r = await pacotesTravados("ws1");
    expect(r.find((p) => p.projectId === "p1")!.esperandoDecisao).toBe(false);
    expect(r.find((p) => p.projectId === "p2")!.esperandoDecisao).toBe(true);
  });
});
