// METADE 2 DA MIRA — a refação mexe SÓ na peça apontada.
//
// A metade 1 (`__tests__/portal/a-mira-do-ajuste.test.ts`) prova que a rota
// entrega a peça e o ato. Aqui se prova o que a refação faz com eles — e o
// cenário é o de produção, letra por letra: três peças de Social Media
// (Pauta do mês `a3` · Copy `social-copy` · Roteiro `social-roteiro-video`),
// o cliente pedindo ajuste na PAUTA, e os Roteiros que estavam bons.
//
// A mutação que este arquivo existe para pegar: trocar a mira de volta para o
// departamento faz "só a Pauta foi tocada" quebrar imediatamente.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  pagamentoConfirmado: {
    findUnique: vi.fn(async () => ({
      valorCentavos: 7900, origem: "mercadopago",
      confirmadoEm: new Date("2026-08-25T00:00:00.000Z"),
    })),
  },
  project: { findFirst: vi.fn() },
  client: { findUnique: vi.fn(async () => ({ name: "Farol 27", workspaceId: "ws1" })) },
  clientRequestDb: { findUnique: vi.fn() },
  cycle: { findFirst: vi.fn() },
  deliverable: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  deliverableVersion: { create: vi.fn(async () => ({ id: "ver-nova" })), findFirst: vi.fn(async () => null) },
  approvalRequest: { updateMany: vi.fn() },
  portalMessage: { create: vi.fn() },
  brainArtifact: {
    findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []), create: vi.fn(async () => ({})),
  },
  activityEvent: { create: vi.fn() },
}));
const generate = vi.hoisted(() => vi.fn());
const auditDeliverable = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/ai/generate", () => ({ generate }));

import { refazerPorPedidoDoCliente } from "@/lib/agency/esteira/refacao";
import * as auditor from "@/lib/agency/execution/quality-auditor";

// A PAUTA é a primeira criada do departamento — é ela que o card mostra, e é
// ela que o cliente estava lendo quando apertou o botão.
const PAUTA = {
  id: "pauta-do-mes", name: "Pauta do Mês", ownerAgentId: "a3", version: 1,
  content: "**1. Semana 1**\n- Headline: título antigo",
  clientFeedback: null as string | null, revisionStatus: null as string | null, type: "social",
};
const COPY = { ...PAUTA, id: "copy-dos-posts", name: "Copy dos posts", ownerAgentId: "social-copy" };
const ROTEIROS = { ...PAUTA, id: "roteiros", name: "Roteiros de Vídeo", ownerAgentId: "social-roteiro-video" };

const PAUTA_NOVA = {
  ok: true,
  data: {
    title: "Pauta do Mês",
    summary: "Título da semana 2 trocado, como o cliente pediu.",
    items: [
      { headline: "Pão quentinho", caption: "Saiu do forno agora, passa aqui que a gente te espera." },
      { headline: "A fornada das seis", caption: "Todo dia às seis sai a primeira fornada, e o cheiro toma a rua." },
      { headline: "Quem faz o seu pão", caption: "O time da casa chega às quatro para o pão estar pronto quando você acorda." },
      { headline: "O bolo do fim de semana", caption: "Sábado tem bolo de fubá saindo quente durante toda a manhã." },
    ],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  db.project.findFirst.mockResolvedValue({
    id: "p1", workspaceId: "ws1", clientId: "c1", clientRequestId: "cr1",
    client: { name: "Farol 27", phone: null, email: null },
  });
  db.clientRequestDb.findUnique.mockResolvedValue({ businessName: "Farol 27", clientId: "c1", createdAt: new Date("2026-08-01T00:00:00.000Z") });
  db.cycle.findFirst.mockResolvedValue({ id: "cy1" });
  // As TRÊS peças do departamento, tanto na leitura das candidatas quanto na
  // das compartilhadas (é assim em produção: todas apresentadas).
  db.deliverable.findMany.mockResolvedValue([{ ...PAUTA }, { ...COPY }, { ...ROTEIROS }]);
  db.deliverable.update.mockResolvedValue({});
  db.approvalRequest.updateMany.mockResolvedValue({});
  db.portalMessage.create.mockResolvedValue({});
  db.activityEvent.create.mockResolvedValue({});
  generate.mockResolvedValue(PAUTA_NOVA);
});

/** Os ids que a refação efetivamente REESCREVEU. */
function tocados(): string[] {
  return db.deliverable.update.mock.calls.map((c) => c[0].where.id as string);
}

describe("o ajuste vai para a peça apontada — e só para ela", () => {
  it("o cliente pediu na Pauta: a Pauta volta, os Roteiros não são tocados", async () => {
    const r = await refazerPorPedidoDoCliente({
      clientRequestId: "cr1", department: "social-media",
      deliverableId: "pauta-do-mes",
      comentario: "troca o título da semana 2",
      modo: "ajuste",
    });
    expect(r.refeitas).toEqual(["Pauta do Mês"]);
    expect(tocados()).toEqual(["pauta-do-mes"]);
    expect(tocados(), "os Roteiros estavam bons — refazê-los é o defeito de produção")
      .not.toContain("roteiros");
    // Uma chamada de IA, não três: refação é prejuízo da casa.
    expect(generate).toHaveBeenCalledOnce();
  });

  it("sem id declarado, a mira deriva do card — a MESMA peça que ele leu na tela", async () => {
    // `entregaMostradaPorDepartamento` mostra a primeira compartilhada do
    // departamento: a Pauta. Sem esta derivação, o card genérico (que é a
    // maioria em produção) voltaria a varrer os três especialistas.
    const r = await refazerPorPedidoDoCliente({
      clientRequestId: "cr1", department: "social-media", comentario: "troca o título da semana 2",
    });
    expect(r.refeitas).toEqual(["Pauta do Mês"]);
    expect(tocados()).toEqual(["pauta-do-mes"]);
  });

  it("a peça de OUTRO projeto não é refeita por id: a posse entra no where", async () => {
    db.deliverable.findMany.mockResolvedValue([{ ...PAUTA }]);
    db.deliverable.findFirst.mockResolvedValue(null); // não é deste projeto
    await refazerPorPedidoDoCliente({
      clientRequestId: "cr1", department: "social-media", deliverableId: "peca-de-outro-cliente",
      comentario: "muda",
    });
    const where = db.deliverable.findFirst.mock.calls[0]![0].where;
    expect(where.projectId).toBe("p1");
  });
});

describe("a peça BARRADA pela Qualidade, quando é ELA o alvo, não é pulada", () => {
  const PAUTA_BARRADA = { ...PAUTA, revisionStatus: "quality_flag" };

  beforeEach(() => {
    db.deliverable.findMany.mockResolvedValue([{ ...PAUTA_BARRADA }, { ...ROTEIROS }]);
    vi.spyOn(auditor, "auditDeliverable").mockImplementation(auditDeliverable);
  });

  it("apontada por id, ela volta ao autor — hoje é justamente a que mais precisa", async () => {
    auditDeliverable.mockResolvedValue({ verdict: "aprovado", note: "ok", issues: [] });
    const r = await refazerPorPedidoDoCliente({
      clientRequestId: "cr1", department: "social-media", deliverableId: "pauta-do-mes",
      comentario: "troca o título da semana 2", modo: "ajuste",
    });
    expect(r.refeitas).toEqual(["Pauta do Mês"]);
    expect(tocados()).toEqual(["pauta-do-mes"]);
  });

  it("e ela NÃO é absolvida: sem parecer novo da Qualidade, continua barrada", async () => {
    // A porta dos fundos de 04/08 era gravar "não auditado" por cima da
    // ressalva. Ausência de parecer nunca é absolvição.
    auditDeliverable.mockResolvedValue({ verdict: "nao_auditado", note: "sem árbitro disponível", issues: [] });
    await refazerPorPedidoDoCliente({
      clientRequestId: "cr1", department: "social-media", deliverableId: "pauta-do-mes",
      comentario: "troca o título", modo: "ajuste",
    });
    expect(db.deliverable.update.mock.calls[0]![0].data.revisionStatus).toBe("quality_flag");
  });

  it("de CARONA continua fora: sem alvo declarado, a barrada não entra", async () => {
    db.deliverable.findMany.mockResolvedValue([{ ...ROTEIROS }, { ...PAUTA_BARRADA }]);
    const r = await refazerPorPedidoDoCliente({
      clientRequestId: "cr1", department: "social-media", comentario: "muda o tom",
    });
    expect(tocados()).not.toContain("pauta-do-mes");
    expect(r.refeitas).toEqual(["Roteiros de Vídeo"]);
  });
});

describe("afirmação medida tem prazo de validade", () => {
  beforeEach(() => {
    vi.spyOn(auditor, "auditDeliverable").mockImplementation(auditDeliverable);
  });

  it("peça VERDE reescrita volta a ser auditada — não herda o verde antigo", async () => {
    db.deliverable.findMany.mockResolvedValue([{ ...PAUTA, revisionStatus: "quality_ok" }]);
    auditDeliverable.mockResolvedValue({ verdict: "nao_auditado", note: "sem árbitro", issues: [] });
    await refazerPorPedidoDoCliente({
      clientRequestId: "cr1", department: "social-media", deliverableId: "pauta-do-mes",
      comentario: "troca o título", modo: "ajuste",
    });
    expect(auditDeliverable, "o verde foi medido na versão anterior, não nesta").toHaveBeenCalled();
    expect(db.deliverable.update.mock.calls[0]![0].data.revisionStatus).not.toBe("quality_ok");
  });

  it("reauditada e reprovada: a versão nova sai barrada, não 'não auditada'", async () => {
    db.deliverable.findMany.mockResolvedValue([{ ...PAUTA, revisionStatus: "quality_ok" }]);
    auditDeliverable.mockResolvedValue({ verdict: "reprovado", note: "", issues: ["promessa sem lastro"] });
    await refazerPorPedidoDoCliente({
      clientRequestId: "cr1", department: "social-media", deliverableId: "pauta-do-mes",
      comentario: "troca o título", modo: "ajuste",
    });
    expect(db.deliverable.update.mock.calls[0]![0].data.revisionStatus).toBe("quality_flag");
  });

  it("peça que NUNCA teve juiz não paga uma chamada de IA à toa — aqui o árbitro é o cliente", async () => {
    db.deliverable.findMany.mockResolvedValue([{ ...PAUTA, revisionStatus: null }]);
    await refazerPorPedidoDoCliente({
      clientRequestId: "cr1", department: "social-media", deliverableId: "pauta-do-mes",
      comentario: "troca o título", modo: "ajuste",
    });
    expect(auditDeliverable).not.toHaveBeenCalled();
    expect(db.deliverable.update.mock.calls[0]![0].data.revisionStatus).toBe("quality_nao_auditado");
  });
});

describe("recusar e pedir ajuste são dois atos, e o especialista sabe qual foi", () => {
  it("ajuste manda PRESERVAR o resto", async () => {
    await refazerPorPedidoDoCliente({
      clientRequestId: "cr1", department: "social-media", deliverableId: "pauta-do-mes",
      comentario: "troca só o título da semana 2", modo: "ajuste",
    });
    expect(generate.mock.calls[0]![0].system).toMatch(/preserve o resto/i);
    expect(generate.mock.calls[0]![0].system).not.toMatch(/RECUSOU/);
  });

  it("recusa manda REFAZER por completo — e leva o motivo dele", async () => {
    await refazerPorPedidoDoCliente({
      clientRequestId: "cr1", department: "social-media", deliverableId: "pauta-do-mes",
      comentario: "vocês mexeram na peça errada", modo: "recusa",
    });
    const { system, user } = generate.mock.calls[0]![0];
    expect(system).toMatch(/RECUSOU/);
    expect(system).toMatch(/entrega INTEIRA|por completo/i);
    // O motivo CHEGA a quem refaz — e agora chega a quem devia estar refazendo.
    expect(user).toContain("vocês mexeram na peça errada");
    expect(user).toMatch(/POR QUE ELE RECUSOU/);
  });

  it("chamador que não declara o ato cai no conservador: ajuste", async () => {
    await refazerPorPedidoDoCliente({
      clientRequestId: "cr1", department: "social-media", deliverableId: "pauta-do-mes", comentario: "muda",
    });
    expect(generate.mock.calls[0]![0].system).toMatch(/preserve o resto/i);
  });
});

