import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  project: { findUnique: vi.fn() },
  clientRequestDb: { findUnique: vi.fn() },
  metaConnection: { findFirst: vi.fn(), count: vi.fn() },
  deliverable: { findFirst: vi.fn() },
  socialPost: { findFirst: vi.fn() },
  activityEvent: { create: vi.fn() },
  adCampaign: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  portalMessage: { create: vi.fn() },
}));
const ads = vi.hoisted(() => ({
  criarCampanhaPausada: vi.fn(),
  criarConjuntoPausado: vi.fn(),
  criarAnuncioPausado: vi.fn(),
  ativarFilhos: vi.fn(),
  buscarInteresses: vi.fn(),
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

import {
  prepararCampanha, ligarCampanha, desligarCampanha, desempenhoPagoDoPeriodo,
  guardarAVerba, GASTO_MINIMO_PARA_JULGAR_BRL, CPC_ABSURDO_BRL,
} from "@/lib/agency/esteira/trafego";

// A padaria vende no bairro dela, e o briefing agora DIZ isso. Antes de
// 10/08/2026 este fixture não tinha área nenhuma e a campanha era criada para o
// Brasil inteiro sem que nenhum teste reclamasse — foi assim que o buraco passou
// despercebido por toda a construção do departamento.
const AREA_DECLARADA = {
  alcance: "local" as const, cidade: "Campinas", raioKm: 8, comoFoiDito: "aqui em Campinas, uns 8 km",
};
const BRIEFING = JSON.stringify({
  scope: {
    adsBudget: 900,
    objetivo: "quero mais gente na loja",
    traffic: { platforms: ["Meta Ads"], serviceArea: AREA_DECLARADA },
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  db.project.findUnique.mockResolvedValue({
    id: "p1", name: "Tráfego local", workspaceId: "ws1", clientId: "c1", clientRequestId: "cr1",
    client: { name: "Padaria do João", website: null, phone: "(19) 99999-9999" },
  });
  db.clientRequestDb.findUnique.mockResolvedValue({ businessName: "Padaria do João", briefingJson: BRIEFING });
  db.metaConnection.findFirst.mockResolvedValue({ id: "mc1", externalId: "page_1" });
  db.metaConnection.count.mockResolvedValue(0);
  db.adCampaign.findFirst.mockResolvedValue(null);
  db.adCampaign.create.mockResolvedValue({ id: "ac1" });
  db.adCampaign.update.mockResolvedValue({});
  db.portalMessage.create.mockResolvedValue({});
  ads.listarContasDeAnuncio.mockResolvedValue({ ok: true, dados: [{ id: "act_1", nome: "Padaria", moeda: "BRL", status: 1 }] });
  ads.criarCampanhaPausada.mockResolvedValue({ ok: true, dados: { campaignId: "camp_1" } });
  ads.criarConjuntoPausado.mockResolvedValue({ ok: true, dados: { adSetId: "adset_1", segmentouGeografia: true } });
  ads.criarAnuncioPausado.mockResolvedValue({ ok: true, dados: { adId: "ad_1", creativeId: "cre_1" } });
  ads.buscarInteresses.mockResolvedValue([]);
  ads.ativarFilhos.mockResolvedValue(undefined);
  db.deliverable = { findFirst: vi.fn().mockResolvedValue(null) };
  db.socialPost = { findFirst: vi.fn().mockResolvedValue({ mediaUrl: "/api/media/m1" }) };
  process.env.PUBLIC_BASE_URL = "https://app.dioli.studio";
  process.env.JWT_SECRET = "test-secret";
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
    db.metaConnection.count.mockResolvedValue(0);
    const r = await prepararCampanha("p1");
    expect(r.pendencia).toMatch(/não conectou/);
  });

  it("usa a conexão de USUÁRIO — token de Página não serve para anúncio", async () => {
    // `me/adaccounts` responde "(#102) A user access token is required".
    // Pegar "qualquer conexão conectada" parecia certo e falharia sempre, com
    // um erro da Meta que não diz que o problema é o tipo do token.
    await prepararCampanha("p1");
    expect(db.metaConnection.findFirst.mock.calls[0]![0].where.platform).toBe("user");
  });

  it("cliente que conectou ANTES do acesso de anúncios é mandado reconectar", async () => {
    db.metaConnection.findFirst.mockResolvedValue(null);
    db.metaConnection.count.mockResolvedValue(2);
    const r = await prepararCampanha("p1");
    expect(r.pendencia).toMatch(/reconectar/);
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
      adSetId: "adset_1", adId: "ad_1",
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
      adSetId: "adset_1", adId: "ad_1",
      dailyBudgetBRL: 900, approvedCapBRL: 30, status: "paused",
    });
    const r = await ligarCampanha("ac1", "cliente:João");
    expect(r.ok).toBe(false);
    expect(ads.ativarCampanha).not.toHaveBeenCalled();
  });

  it("campanha SEM conjunto ou SEM anúncio não liga — ligaria e não entregaria nada", async () => {
    // O cliente veria a conta 'ativa', zero resultado, e concluiria que anúncio
    // não funciona para o negócio dele. Recusar é mais honesto.
    db.adCampaign.findUnique.mockResolvedValue({
      id: "ac1", workspaceId: "ws1", connectionId: "mc1", externalId: "camp_1",
      adSetId: null, adId: null, dailyBudgetBRL: 30, approvedCapBRL: 30, status: "paused",
    });
    const r = await ligarCampanha("ac1", "cliente:João");
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/sem conjunto/);
    expect(ads.ativarCampanha).not.toHaveBeenCalled();
  });

  it("ligar sobe o conjunto e o anúncio junto — campanha ativa com filho pausado entrega zero", async () => {
    await ligarCampanha("ac1", "cliente:João");
    expect(ads.ativarFilhos).toHaveBeenCalledWith("ws1", "mc1", { adSetId: "adset_1", adId: "ad_1" });
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

describe("a campanha só é anunciada ao cliente quando está COMPLETA", () => {
  it("conjunto e anúncio criados são gravados junto da campanha", async () => {
    await prepararCampanha("p1");
    const d = db.adCampaign.create.mock.calls[0]![0].data;
    expect(d.adSetId).toBe("adset_1");
    expect(d.adId).toBe("ad_1");
    expect(d.lastError).toBeNull();
  });

  it("conjunto que a Meta recusou vira pendência visível, não campanha 'pronta'", async () => {
    ads.criarConjuntoPausado.mockResolvedValue({ ok: false, erro: "targeting inválido" });
    const r = await prepararCampanha("p1");
    expect(r.pendencia).toMatch(/conjunto não criado/);
    expect(db.portalMessage.create).not.toHaveBeenCalled();
  });

  it("sem página do Facebook conectada não há anúncio — e o cliente não é avisado à toa", async () => {
    db.metaConnection.findFirst.mockImplementation(async (q: Record<string, unknown>) => {
      const w = q.where as Record<string, unknown>;
      return w.platform === "facebook" ? null : { id: "mc1", externalId: "page_1" };
    });
    const r = await prepararCampanha("p1");
    expect(r.pendencia).toMatch(/anúncio não criado/);
  });
});

describe("o guardião de verba — o que separa gestão de 'criei e esqueci'", () => {
  const ATIVA = {
    id: "ac1", workspaceId: "ws1", clientId: "c1", projectId: "p1",
    connectionId: "mc1", externalId: "camp_1", name: "Padaria", status: "active",
  };

  beforeEach(() => {
    db.adCampaign.findMany.mockResolvedValue([{ ...ATIVA }]);
    db.activityEvent.create.mockResolvedValue({});
  });

  it("gastou e não teve um clique → freia sozinho", async () => {
    ads.lerDesempenho.mockResolvedValue({ ok: true, dados: { gastoBRL: 120, impressoes: 5000, cliques: 0, alcance: 4000, cpcBRL: null } });
    const r = await guardarAVerba();
    expect(r.pausadas[0]!.motivo).toMatch(/não teve UM clique/);
    expect(ads.pausarCampanha).toHaveBeenCalled();
  });

  it("CPC absurdo → freia", async () => {
    ads.lerDesempenho.mockResolvedValue({ ok: true, dados: { gastoBRL: 200, impressoes: 5000, cliques: 10, alcance: 4000, cpcBRL: CPC_ABSURDO_BRL + 1 } });
    expect((await guardarAVerba()).pausadas).toHaveLength(1);
  });

  it("número pequeno demais para julgar NÃO freia — R$ 8 gastos é ruído, não diagnóstico", async () => {
    ads.lerDesempenho.mockResolvedValue({ ok: true, dados: { gastoBRL: GASTO_MINIMO_PARA_JULGAR_BRL - 1, impressoes: 100, cliques: 0, alcance: 90, cpcBRL: null } });
    expect((await guardarAVerba()).pausadas).toHaveLength(0);
  });

  it("não consegui medir NÃO é motivo para frear — cegueira própria não tira campanha do ar", async () => {
    ads.lerDesempenho.mockResolvedValue({ ok: false, erro: "token expirado" });
    const r = await guardarAVerba();
    expect(r.pausadas).toHaveLength(0);
    expect(r.avaliadas).toBe(0);
  });

  it("campanha saudável continua rodando", async () => {
    ads.lerDesempenho.mockResolvedValue({ ok: true, dados: { gastoBRL: 200, impressoes: 9000, cliques: 300, alcance: 6000, cpcBRL: 0.67 } });
    expect((await guardarAVerba()).pausadas).toHaveLength(0);
  });

  it("freou → o time fica sabendo. Campanha que se pausa em silêncio é o mesmo bug com outra cara", async () => {
    ads.lerDesempenho.mockResolvedValue({ ok: true, dados: { gastoBRL: 120, impressoes: 5000, cliques: 0, alcance: 4000, cpcBRL: null } });
    await guardarAVerba();
    expect(db.activityEvent.create.mock.calls[0]![0].data.type).toBe("campanha_pausada_pelo_guardiao");
    expect(db.adCampaign.update.mock.calls[0]![0].data.pausedByGuardAt).toBeInstanceOf(Date);
  });
});

// ── ONDE O ANÚNCIO APARECE ──────────────────────────────────────────────────
//
// Este bloco existe porque o conserto de 10/08/2026 é caro de errar e barato de
// perder: se um dia alguém "simplificar" o portão geográfico, a casa volta a
// gastar a verba do cliente no país inteiro sem uma linha de aviso. Os testes
// abaixo são comportamentais de propósito — eles chamam `prepararCampanha` e
// olham o que foi (ou não foi) criado na Meta.

describe("a campanha não sai sem saber ONDE o negócio vende", () => {
  function briefingSem(area: unknown) {
    return JSON.stringify({
      scope: { adsBudget: 900, objetivo: "quero mais gente na loja", traffic: { platforms: ["Meta Ads"], ...(area ? { serviceArea: area } : {}) } },
    });
  }

  it("briefing sem área NÃO cria campanha — e nada é tocado na conta do cliente", async () => {
    db.clientRequestDb.findUnique.mockResolvedValue({ businessName: "Padaria do João", briefingJson: briefingSem(null) });
    const r = await prepararCampanha("p1");
    expect(r.ok).toBe(false);
    expect(r.pendencia).toMatch(/onde este negócio vende/i);
    // O portão vem ANTES da Meta: campanha abandonada por falta de dado deixaria
    // lixo numa conta de anúncio que não é nossa.
    expect(ads.criarCampanhaPausada).not.toHaveBeenCalled();
    expect(db.adCampaign.create).not.toHaveBeenCalled();
  });

  it("o padeiro que disse 'meu bairro' sem dizer a cidade também para — e o aviso traz a frase dele", async () => {
    db.clientRequestDb.findUnique.mockResolvedValue({
      businessName: "Padaria do João",
      briefingJson: briefingSem({ alcance: "local", cidade: null, raioKm: null, comoFoiDito: "só aqui no meu bairro" }),
    });
    const r = await prepararCampanha("p1");
    expect(r.ok).toBe(false);
    expect(r.pendencia).toMatch(/não disse qual cidade/i);
    expect(r.pendencia).toContain("meu bairro");
    expect(ads.criarCampanhaPausada).not.toHaveBeenCalled();
  });

  it("A METADE OPOSTA: quem declarou Brasil inteiro é atendido, e o país é o alvo PEDIDO", async () => {
    // Sem esta metade o portão viraria "tráfego local só" e quebraria o
    // e-commerce, que legitimamente vende para o país todo.
    db.clientRequestDb.findUnique.mockResolvedValue({
      businessName: "Loja Online", briefingJson: briefingSem({ alcance: "nacional", cidade: null, raioKm: null, comoFoiDito: "vendo pro Brasil inteiro" }),
    });
    const r = await prepararCampanha("p1");
    expect(r.ok).toBe(true);
    expect(ads.criarConjuntoPausado).toHaveBeenCalled();
    expect(ads.criarConjuntoPausado.mock.calls[0]![2].publico.cidade).toBeNull();
  });

  it("a cidade do briefing chega no conjunto — não fica só guardada", async () => {
    const r = await prepararCampanha("p1");
    expect(r.ok).toBe(true);
    const publico = ads.criarConjuntoPausado.mock.calls[0]![2].publico;
    expect(publico.cidade).toBe("Campinas");
    expect(publico.raioKm).toBe(8);
    expect(db.adCampaign.create.mock.calls[0]![0].data.audience).toContain("Campinas");
  });

  it("a entrega do especialista de segmentação também basta — briefing mudo não trava quem já tem cidade", async () => {
    db.clientRequestDb.findUnique.mockResolvedValue({ businessName: "Padaria do João", briefingJson: briefingSem(null) });
    db.deliverable.findFirst.mockResolvedValue({ content: "Cidade: Sorocaba\nRaio: 12 km\nIdade: 25 a 45" });
    const r = await prepararCampanha("p1");
    expect(r.ok).toBe(true);
    expect(ads.criarConjuntoPausado.mock.calls[0]![2].publico.cidade).toBe("Sorocaba");
  });
});
