import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  project: { findFirst: vi.fn() },
  clientRequestDb: { findUnique: vi.fn() },
  cycle: { findFirst: vi.fn() },
  deliverable: { findMany: vi.fn(), update: vi.fn() },
  approvalRequest: { updateMany: vi.fn() },
  portalMessage: { create: vi.fn() },
  activityEvent: { create: vi.fn() },
}));
const generate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/ai/generate", () => ({ generate }));

import { refazerPorPedidoDoCliente, MAX_REFACOES_DO_CLIENTE } from "@/lib/agency/esteira/refacao";

const ENTREGA = {
  id: "d1", name: "Calendário de conteúdo", content: "**1. Post**\n- Legenda: texto antigo",
  ownerAgentId: "a3", version: 1, clientFeedback: null as string | null,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.project.findFirst.mockResolvedValue({
    id: "p1", workspaceId: "ws1", clientId: "c1", clientRequestId: "cr1",
    client: { name: "Padaria do João", phone: null, email: null },
  });
  db.clientRequestDb.findUnique.mockResolvedValue({ businessName: "Padaria do João" });
  db.cycle.findFirst.mockResolvedValue({ id: "cy1" });
  db.deliverable.findMany.mockResolvedValue([{ ...ENTREGA }]);
  db.deliverable.update.mockResolvedValue({});
  db.approvalRequest.updateMany.mockResolvedValue({});
  db.portalMessage.create.mockResolvedValue({});
  db.activityEvent.create.mockResolvedValue({});
  generate.mockResolvedValue({
    ok: true,
    data: {
      title: "Calendário de conteúdo",
      summary: "Ajustado para um tom mais próximo do bairro.",
      items: [{ headline: "Pão quentinho", caption: "Saiu do forno agora, passa aqui que a gente te espera." }],
    },
  });
});

describe("pedido de mudança do cliente é refeito na hora", () => {
  it("as palavras DELE vão para o especialista", async () => {
    await refazerPorPedidoDoCliente({
      clientRequestId: "cr1", department: "social-media",
      comentario: "está muito formal, quero mais próximo do jeito do bairro",
    });
    const prompt = generate.mock.calls[0]![0].user as string;
    expect(prompt).toContain("mais próximo do jeito do bairro");
    expect(generate.mock.calls[0]![0].system).toMatch(/O CLIENTE/);
  });

  it("a peça é atualizada e o cliente é avisado do que mudou", async () => {
    const r = await refazerPorPedidoDoCliente({
      clientRequestId: "cr1", department: "social-media", comentario: "muda o tom",
    });
    expect(r.refeitas).toEqual(["Calendário de conteúdo"]);
    expect(r.avisouCliente).toBe(true);
    expect(db.deliverable.update).toHaveBeenCalledOnce();
  });

  it("a aprovação volta a pendente — o 'sim' antigo não vale para a versão nova", async () => {
    await refazerPorPedidoDoCliente({ clientRequestId: "cr1", department: "social-media", comentario: "muda o tom" });
    expect(db.approvalRequest.updateMany.mock.calls[0]![0].data.status).toBe("pending");
  });

  it("mexe só no departamento que o cliente apontou — o resto não se toca", async () => {
    // Reclamou do texto do social; não quer o logo dele redesenhado.
    await refazerPorPedidoDoCliente({ clientRequestId: "cr1", department: "social-media", comentario: "muda o tom" });
    const where = db.deliverable.findMany.mock.calls[0]![0].where;
    expect(where.ownerAgentId.in).toContain("a3");
    expect(where.ownerAgentId.in).not.toContain("a2");
  });

  it("refaz dentro do ciclo corrente — não mexe no que já foi entregue mês passado", async () => {
    await refazerPorPedidoDoCliente({ clientRequestId: "cr1", department: "social-media", comentario: "muda o tom" });
    expect(db.deliverable.findMany.mock.calls[0]![0].where.cycleId).toBe("cy1");
  });
});

describe("o que a máquina NÃO deve tentar adivinhar", () => {
  it("pedido sem palavras: pergunta, em vez de refazer no escuro", async () => {
    // Refazer sem saber o quê produz outra peça errada e queima uma tentativa.
    const r = await refazerPorPedidoDoCliente({ clientRequestId: "cr1", department: "social-media" });
    expect(generate).not.toHaveBeenCalled();
    expect(r.avisouCliente).toBe(true);
    expect(db.portalMessage.create.mock.calls[0]![0].data.body).toMatch(/o que você quer diferente/i);
  });

  it("cliente que já pediu duas vezes vira gente — mais IA só aumenta a frustração", async () => {
    db.deliverable.findMany.mockResolvedValue([{ ...ENTREGA, version: MAX_REFACOES_DO_CLIENTE + 1 }]);
    const r = await refazerPorPedidoDoCliente({ clientRequestId: "cr1", department: "social-media", comentario: "ainda não é isso" });
    expect(r.refeitas).toHaveLength(0);
    expect(r.escalado).toBe(true);
    expect(db.activityEvent.create.mock.calls[0]![0].data.type).toBe("refacao_escalada");
  });

  it("mesmo escalando, o cliente NUNCA fica no silêncio — o silêncio era o bug", async () => {
    db.deliverable.findMany.mockResolvedValue([{ ...ENTREGA, version: 9 }]);
    const r = await refazerPorPedidoDoCliente({ clientRequestId: "cr1", department: "social-media", comentario: "ainda não" });
    expect(r.avisouCliente).toBe(true);
  });

  it("IA fora do ar não gasta tentativa nem finge que refez", async () => {
    generate.mockResolvedValue({ ok: false, error: "sem provedor" });
    const r = await refazerPorPedidoDoCliente({ clientRequestId: "cr1", department: "social-media", comentario: "muda" });
    expect(r.refeitas).toHaveLength(0);
    expect(db.deliverable.update).not.toHaveBeenCalled();
    expect(r.escalado).toBe(true);
  });

  it("refação que inventa telefone não chega ao cliente", async () => {
    generate.mockResolvedValue({
      ok: true,
      data: { title: "X", summary: "Novo texto do calendário do mês para a padaria.", items: [{ headline: "Contato", note: "Ligue (11) 98888-7777 agora mesmo para reservar o seu." }] },
    });
    const r = await refazerPorPedidoDoCliente({ clientRequestId: "cr1", department: "social-media", comentario: "põe contato" });
    expect(r.refeitas).toHaveLength(0);
    expect(r.escalado).toBe(true);
    expect(r.motivo).toMatch(/inventou dado/);
  });
});
