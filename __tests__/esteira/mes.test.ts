import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  project: { findUnique: vi.fn(), update: vi.fn() },
  cycle: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  socialPost: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  metaConnection: { findFirst: vi.fn() },
  adCampaign: { findMany: vi.fn() },
  deliverable: { findMany: vi.fn(), create: vi.fn() },
  approvalRequest: { updateMany: vi.fn() },
  portalMessage: { create: vi.fn() },
  task: { findMany: vi.fn() },
}));
const generate = vi.hoisted(() => vi.fn());
const getInsights = vi.hoisted(() => vi.fn());
const fecharCiclo = vi.hoisted(() => vi.fn());
const falarComOCliente = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/ai/generate", () => ({ generate }));
vi.mock("@/lib/integrations/meta/client", () => ({ getInsights }));
vi.mock("@/lib/agency/esteira/marcos", () => ({ falarComOCliente }));
vi.mock("@/lib/agency/esteira/ciclos", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  fecharCiclo,
}));

import { medirOMes, escreverRelatorio, virarOMes, apresentarCiclo } from "@/lib/agency/esteira/mes";

const CICLO = {
  id: "cy1", referencia: "2026-07", status: "aberto" as const,
  comeca: "2026-07-01", termina: "2026-07-31",
  itens: [{ agentId: "a3", titulo: "Pacote de social" }], resumo: null,
};

const VERDADE = { businessName: "Padaria do João", telefones: [], emails: [], servicos: [], valores: [] };

beforeEach(() => {
  vi.clearAllMocks();
  db.project.findUnique.mockResolvedValue({
    id: "p1", workspaceId: "ws1", clientId: "c1", clientRequestId: "cr1",
    client: { name: "Padaria do João", phone: null, email: null },
  });
  db.project.update.mockResolvedValue({});
  db.socialPost.count.mockResolvedValue(8);
  db.metaConnection.findFirst.mockResolvedValue({ id: "mc1" });
  db.adCampaign.findMany.mockResolvedValue([]);
  db.deliverable.create.mockResolvedValue({ id: "d9" });
  db.cycle.update.mockResolvedValue({});
  getInsights.mockResolvedValue({ ok: true, reach: 4200, impressions: 9100, followers: 812, engagement: 310 });
  fecharCiclo.mockResolvedValue({ fechado: true, proximo: { referencia: "2026-08", id: "cy2" } });
  falarComOCliente.mockResolvedValue(true);
  generate.mockResolvedValue({
    ok: true,
    data: {
      title: "Relatório de julho",
      summary: "Publicamos 8 posts e o alcance foi de 4.200 contas.",
      items: [{ headline: "Alcance", note: "4.200 contas alcançadas no mês." }],
    },
  });
});

describe("medir o mês: null é 'não sei', zero é 'medi e deu zero'", () => {
  it("mede o que foi publicado e o que a Meta devolveu", async () => {
    const m = await medirOMes("p1", CICLO);
    expect(m.postsPublicados).toBe(8);
    expect(m.alcance).toBe(4200);
    expect(m.porQueNaoMediu).toBeNull();
  });

  it("sem Instagram conectado, não mede — e diz por quê", async () => {
    db.metaConnection.findFirst.mockResolvedValue(null);
    const m = await medirOMes("p1", CICLO);
    expect(m.alcance).toBeNull();
    expect(m.porQueNaoMediu).toMatch(/não conectou/);
  });

  it("Meta fora do ar não vira zero — vira 'não medido'", async () => {
    // Confundir os dois é o começo de um relatório que mente: zero alcance é
    // uma notícia terrível, "não medi" é um problema técnico.
    getInsights.mockResolvedValue({ ok: false, error: "token expirado" });
    const m = await medirOMes("p1", CICLO);
    expect(m.alcance).toBeNull();
    expect(m.porQueNaoMediu).toBe("token expirado");
  });
});

describe("o relatório só pode usar o que foi medido", () => {
  const medicao = {
    postsPublicados: 8, postsAgendadosNaoPublicados: 0,
    alcance: 4200, impressoes: 9100, seguidores: 812, engajamento: 310,
    pago: null, porQueNaoMediu: null,
  };

  it("os números entregues à IA são exatamente os medidos", async () => {
    await escreverRelatorio({
      workspaceId: "ws1", nomeDoNegocio: "Padaria do João", referencia: "2026-07",
      medicao, planoDoMes: ["Pacote de social"], verdade: VERDADE,
    });
    const prompt = generate.mock.calls[0]![0].user as string;
    expect(prompt).toContain("Alcance: 4200");
    expect(generate.mock.calls[0]![0].system).toMatch(/PROIBIDO inventar/);
  });

  it("quando não mediu, a IA é mandada dizer isso — e proibida de estimar", async () => {
    await escreverRelatorio({
      workspaceId: "ws1", nomeDoNegocio: "Padaria do João", referencia: "2026-07",
      medicao: { ...medicao, alcance: null, impressoes: null, seguidores: null, engajamento: null, porQueNaoMediu: "token expirado" },
      planoDoMes: [], verdade: VERDADE,
    });
    const prompt = generate.mock.calls[0]![0].user as string;
    expect(prompt).toMatch(/NÃO foram medidas/);
    expect(prompt).toMatch(/NÃO estime/);
  });

  it("relatório que inventa telefone é reprovado pelo piso — nem chega ao cliente", async () => {
    generate.mockResolvedValue({
      ok: true,
      data: {
        title: "Relatório", summary: "Um mês forte para a padaria, com bom volume de publicações no período.",
        items: [{ headline: "Contato", note: "Ligue para (11) 98888-7777 e fale com a gente sobre os resultados." }],
      },
    });
    const r = await escreverRelatorio({
      workspaceId: "ws1", nomeDoNegocio: "Padaria do João", referencia: "2026-07",
      medicao, planoDoMes: [], verdade: VERDADE,
    });
    expect(r).toBeNull();
  });
});

describe("a virada do mês — sem ela o cliente vitalício recebia uma entrega na vida", () => {
  it("mede, grava o relatório, fecha o ciclo e abre o próximo", async () => {
    const r = await virarOMes("p1", CICLO);
    expect(r.relatorioEntregue).toBe(true);
    expect(r.proximaReferencia).toBe("2026-08");
    expect(fecharCiclo).toHaveBeenCalledOnce();
  });

  it("o relatório é gravado NO CICLO que fechou — senão a competência se perde", async () => {
    await virarOMes("p1", CICLO);
    expect(db.deliverable.create.mock.calls[0]![0].data.cycleId).toBe("cy1");
    expect(db.deliverable.create.mock.calls[0]![0].data.type).toBe("report");
  });

  it("mês novo aberto → o projeto volta para a fila de produção (a folha em branco)", async () => {
    await virarOMes("p1", CICLO);
    const dados = db.project.update.mock.calls[0]![0].data;
    expect(dados.executionStatus).toBe("pending");
    expect(dados.executionAttempts).toBe(0);
  });

  it("IA fora do ar NÃO impede o fechamento — a operação não para por uma frase", async () => {
    generate.mockResolvedValue({ ok: false, error: "sem provedor" });
    const r = await virarOMes("p1", CICLO);
    expect(r.relatorioEntregue).toBe(false);
    expect(fecharCiclo).toHaveBeenCalledOnce();
    expect(r.proximaReferencia).toBe("2026-08");
  });

  it("sem relatório, o cliente não recebe mensagem de fechamento vazia", async () => {
    generate.mockResolvedValue({ ok: false, error: "sem provedor" });
    await virarOMes("p1", CICLO);
    expect(falarComOCliente).not.toHaveBeenCalled();
  });
});

describe("apresentar o pacote do mês", () => {
  beforeEach(() => {
    db.cycle.findUnique.mockResolvedValue({ id: "cy2", reference: "2026-08", presentedAt: null });
    db.deliverable.findMany.mockResolvedValue([{ id: "d1", name: "Calendário de agosto", revisionStatus: "quality_ok" }]);
    db.approvalRequest.updateMany.mockResolvedValue({});
    db.socialPost.findMany.mockResolvedValue([]);
    db.socialPost.findFirst.mockResolvedValue(null);
  });

  it("o carimbo é DO CICLO — senão o mês 2 nunca seria apresentado", async () => {
    const r = await apresentarCiclo("p1", "cy2");
    expect(r.ok).toBe(true);
    expect(db.cycle.update.mock.calls[0]![0].data.presentedAt).toBeInstanceOf(Date);
  });

  it("ciclo já apresentado não apresenta de novo", async () => {
    db.cycle.findUnique.mockResolvedValue({ id: "cy2", reference: "2026-08", presentedAt: new Date() });
    const r = await apresentarCiclo("p1", "cy2");
    expect(r.ok).toBe(true);
    expect(db.cycle.update).not.toHaveBeenCalled();
  });

  it("peça com ressalva da Qualidade não vai ao cliente sozinha", async () => {
    db.deliverable.findMany.mockResolvedValue([{ id: "d1", name: "X", revisionStatus: "quality_flag" }]);
    const r = await apresentarCiclo("p1", "cy2");
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/ressalva/);
  });

  it("ciclo sem nenhuma entrega não é apresentado", async () => {
    db.deliverable.findMany.mockResolvedValue([]);
    const r = await apresentarCiclo("p1", "cy2");
    expect(r.ok).toBe(false);
  });
});
