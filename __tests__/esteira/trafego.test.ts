import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  project: { findUnique: vi.fn() },
  clientRequestDb: { findUnique: vi.fn() },
  metaConnection: { findFirst: vi.fn() },
  adCampaign: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  portalMessage: { create: vi.fn() },
}));
const ads = vi.hoisted(() => ({
  criarCampanhaPausada: vi.fn(),
  ativarCampanha: vi.fn(),
  pausarCampanha: vi.fn(),
  lerDesempenho: vi.fn(),
  listarContasDeAnuncio: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/integrations/meta/ads", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  ...ads,
}));

import { prepararCampanha, ligarCampanha, desligarCampanha, desempenhoPagoDoPeriodo } from "@/lib/agency/esteira/trafego";

const BRIEFING = JSON.stringify({ scope: { adsBudget: 900, objetivo: "quero mais gente na loja" } });

beforeEach(() => {
  vi.clearAllMocks();
  db.project.findUnique.mockResolvedValue({
    id: "p1", name: "Tráfego local", workspaceId: "ws1", clientId: "c1", clientRequestId: "cr1",
    client: { name: "Padaria do João" },
  });
  db.clientRequestDb.findUnique.mockResolvedValue({ businessName: "Padaria do João", briefingJson: BRIEFING });
  db.metaConnection.findFirst.mockResolvedValue({ id: "mc1" });
  db.adCampaign.findFirst.mockResolvedValue(null);
  db.adCampaign.create.mockResolvedValue({ id: "ac1" });
  db.adCampaign.update.mockResolvedValue({});
  db.portalMessage.create.mockResolvedValue({});
  ads.listarContasDeAnuncio.mockResolvedValue({ ok: true, dados: [{ id: "act_1", nome: "Padaria", moeda: "BRL", status: 1 }] });
  ads.criarCampanhaPausada.mockResolvedValue({ ok: true, dados: { campaignId: "camp_1" } });
  ads.ativarCampanha.mockResolvedValue({ ok: true, dados: { ativada: true } });
  ads.pausarCampanha.mockResolvedValue({ ok: true, dados: { pausada: true } });
});

describe("a agência PREPARA a campanha; o cliente é quem liga", () => {
  it("cria pausada e registra o teto aprovado", async () => {
    const r = await prepararCampanha("p1");
    expect(r.ok).toBe(true);
    const dados = db.adCampaign.create.mock.calls[0]![0].data;
    expect(dados.status).toBe("paused");
    expect(dados.dailyBudgetBRL).toBe(30); // 900/30
    expect(dados.approvedCapBRL).toBe(30);
  });

  it("avisa o cliente de que existe campanha esperando o dedo dele", async () => {
    // Campanha pausada que ninguém sabe que existe é trabalho jogado fora.
    await prepararCampanha("p1");
    expect(db.portalMessage.create.mock.calls[0]![0].data.body).toMatch(/PAUSADA/);
  });

  it("sem verba informada no briefing, NENHUMA campanha é criada", async () => {
    // Ausência de informação não é informação: teto ausente não vira teto zero
    // nem teto padrão.
    db.clientRequestDb.findUnique.mockResolvedValue({ businessName: "X", briefingJson: "{}" });
    const r = await prepararCampanha("p1");
    expect(r.ok).toBe(false);
    expect(r.pendencia).toMatch(/não informou a verba/);
    expect(ads.criarCampanhaPausada).not.toHaveBeenCalled();
  });

  it("sem conta Meta conectada, para antes e diz o que falta", async () => {
    db.metaConnection.findFirst.mockResolvedValue(null);
    const r = await prepararCampanha("p1");
    expect(r.pendencia).toMatch(/não conectou/);
  });

  it("não cria duas campanhas para o mesmo projeto — duplicar é duplicar o gasto", async () => {
    db.adCampaign.findFirst.mockResolvedValue({ id: "ac0" });
    const r = await prepararCampanha("p1");
    expect(r.campanhaId).toBe("ac0");
    expect(ads.criarCampanhaPausada).not.toHaveBeenCalled();
  });

  it("verba pequena demais para uma campanha válida não vira campanha torta", async () => {
    db.clientRequestDb.findUnique.mockResolvedValue({ businessName: "X", briefingJson: JSON.stringify({ scope: { adsBudget: 60 } }) });
    const r = await prepararCampanha("p1");
    expect(r.ok).toBe(false);
    expect(ads.criarCampanhaPausada).not.toHaveBeenCalled();
  });
});

describe("ligar é a única coisa que faz dinheiro sair — e tem dono", () => {
  beforeEach(() => {
    db.adCampaign.findUnique.mockResolvedValue({
      id: "ac1", workspaceId: "ws1", connectionId: "mc1", externalId: "camp_1",
      dailyBudgetBRL: 30, approvedCapBRL: 30, status: "paused",
    });
  });

  it("grava quem autorizou — um dia essa pergunta vai ser feita", async () => {
    const r = await ligarCampanha("ac1", "cliente:João da Padaria");
    expect(r.ok).toBe(true);
    expect(db.adCampaign.update.mock.calls[0]![0].data.activatedBy).toBe("cliente:João da Padaria");
  });

  it("sem autorizador, não liga", async () => {
    const r = await ligarCampanha("ac1", "");
    expect(r.ok).toBe(false);
    expect(ads.ativarCampanha).not.toHaveBeenCalled();
  });

  it("o teto é reconferido NA ATIVAÇÃO — o registro pode ter mudado desde a criação", async () => {
    db.adCampaign.findUnique.mockResolvedValue({
      id: "ac1", workspaceId: "ws1", connectionId: "mc1", externalId: "camp_1",
      dailyBudgetBRL: 900, approvedCapBRL: 30, status: "paused",
    });
    const r = await ligarCampanha("ac1", "cliente:João");
    expect(r.ok).toBe(false);
    expect(ads.ativarCampanha).not.toHaveBeenCalled();
  });

  it("desligar não exige nada — freio com burocracia não é freio", async () => {
    const r = await desligarCampanha("ac1");
    expect(r.ok).toBe(true);
    expect(db.adCampaign.update.mock.calls[0]![0].data.status).toBe("paused");
  });
});

describe("desempenho pago no relatório: 'não medi' nunca vira zero", () => {
  it("soma as campanhas e calcula o CPC do conjunto", async () => {
    db.adCampaign.findMany.mockResolvedValue([
      { workspaceId: "ws1", connectionId: "mc1", externalId: "camp_1" },
      { workspaceId: "ws1", connectionId: "mc1", externalId: "camp_2" },
    ]);
    ads.lerDesempenho
      .mockResolvedValueOnce({ ok: true, dados: { gastoBRL: 100, impressoes: 1000, cliques: 50, alcance: 800, cpcBRL: 2 } })
      .mockResolvedValueOnce({ ok: true, dados: { gastoBRL: 50, impressoes: 500, cliques: 25, alcance: 400, cpcBRL: 2 } });
    const r = await desempenhoPagoDoPeriodo("p1", { desde: "2026-08-01", ate: "2026-08-31" });
    expect(r!.gastoBRL).toBe(150);
    expect(r!.cpcBRL).toBe(2);
  });

  it("sem campanha nenhuma devolve null — não é 'gastou zero'", async () => {
    db.adCampaign.findMany.mockResolvedValue([]);
    expect(await desempenhoPagoDoPeriodo("p1", { desde: "2026-08-01", ate: "2026-08-31" })).toBeNull();
  });

  it("campanha existe mas a Meta não respondeu → null, nunca uma linha de zeros", async () => {
    // Devolver zeros diria ao cliente que a campanha dele não entregou nada.
    // Pode ser mentira, e é a mentira mais cara que esta casa pode contar.
    db.adCampaign.findMany.mockResolvedValue([{ workspaceId: "ws1", connectionId: "mc1", externalId: "camp_1" }]);
    ads.lerDesempenho.mockResolvedValue({ ok: false, erro: "sem dados" });
    expect(await desempenhoPagoDoPeriodo("p1", { desde: "2026-08-01", ate: "2026-08-31" })).toBeNull();
  });
});
