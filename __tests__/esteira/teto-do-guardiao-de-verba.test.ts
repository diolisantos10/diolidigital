// O GUARDIÃO DE VERBA GANHA TETO E RITMO.
//
// ── O que ele era até 15/08/2026 ────────────────────────────────────────────
//
// `guardarAVerba` varria TODA campanha ativa, a cada 5 minutos, sem teto de
// leitura e sem teto de pausa. Duas consequências, e as duas são de plataforma:
//
//   🔴 **Podia pausar TODAS numa rodada.** Pausar é escrita e custa 3 pontos na
//      cota da Meta, contada POR CONTA DE ANÚNCIOS. Pior que a cota: "todas as
//      campanhas do cliente pausadas de uma vez" nunca é leitura de desempenho —
//      é sintoma de erro NOSSO, e erro nosso não pode desligar a operação
//      inteira de um cliente numa passada.
//
//   🔴 **Lia insights de 5 em 5 minutos** = 288 leituras por campanha por dia,
//      contra uma API que atualiza esse número a cada ~15 min. Dois terços das
//      chamadas perguntavam algo que não podia ter mudado — ritmo de máquina sem
//      ganho, contra uma conta que esta casa já viu ser restringida por isso.
//
// As duas metades de cada trava: ela BARRA o excesso, e NÃO barra o caso limpo.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  project: { findUnique: vi.fn() },
  clientRequestDb: { findUnique: vi.fn() },
  metaConnection: { findFirst: vi.fn(), count: vi.fn() },
  deliverable: { findFirst: vi.fn(), findMany: vi.fn() },
  socialPost: { findFirst: vi.fn() },
  activityEvent: { create: vi.fn() },
  adCampaign: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  portalMessage: { create: vi.fn() },
}));
const ads = vi.hoisted(() => ({
  criarCampanhaPausada: vi.fn(), criarConjuntoPausado: vi.fn(), criarAnuncioPausado: vi.fn(),
  ativarFilhos: vi.fn(), buscarInteresses: vi.fn(), ativarCampanha: vi.fn(),
  pausarCampanha: vi.fn(), lerDesempenho: vi.fn(), listarContasDeAnuncio: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/integrations/meta/ads", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  ...ads,
}));

import {
  guardarAVerba, esquecerRitmoDaGuarda,
  MAX_PAUSAS_POR_CONTA_POR_RODADA, MAX_PAUSAS_POR_RODADA,
  INTERVALO_MINIMO_DE_LEITURA_MS, MAX_LEITURAS_POR_RODADA,
} from "@/lib/agency/esteira/trafego";

const AGORA = new Date("2026-08-15T12:00:00Z");

/** Uma campanha ativa. `conta` é o que os tetos por conta agrupam. */
function campanha(id: string, conta = "act_1") {
  return {
    id, workspaceId: "ws1", clientId: "c1", projectId: "p1",
    connectionId: "mc1", adAccountId: conta, externalId: `ext_${id}`,
    adSetId: "as1", adId: "ad1", name: `Campanha ${id}`,
    status: "active", dailyBudgetBRL: 30, approvedCapBRL: 30,
    createdAt: new Date("2026-08-01"),
  };
}

/** Gastou e não teve um clique: motivo de pausa em qualquer cenário. */
const RUIM = { ok: true, dados: { gastoBRL: 120, impressoes: 5000, cliques: 0, alcance: 4000, cpcBRL: null } };
const SAUDAVEL = { ok: true, dados: { gastoBRL: 200, impressoes: 9000, cliques: 300, alcance: 6000, cpcBRL: 0.67 } };

beforeEach(() => {
  vi.clearAllMocks();
  esquecerRitmoDaGuarda();
  db.adCampaign.update.mockResolvedValue({});
  db.activityEvent.create.mockResolvedValue({});
  ads.pausarCampanha.mockResolvedValue({ ok: true, dados: { pausada: true } });
  ads.lerDesempenho.mockResolvedValue(RUIM);
});

// ─── O TETO DE PAUSAS ───────────────────────────────────────────────────────

describe("⛔ METADE 1 — o guardião NÃO pausa a operação inteira numa passada", () => {
  it(`no máximo ${MAX_PAUSAS_POR_CONTA_POR_RODADA} pausas por conta de anúncios`, async () => {
    db.adCampaign.findMany.mockResolvedValue(
      Array.from({ length: 8 }, (_, i) => campanha(`c${i}`, "act_1")),
    );
    const r = await guardarAVerba(AGORA);
    expect(r.pausadas).toHaveLength(MAX_PAUSAS_POR_CONTA_POR_RODADA);
    expect(ads.pausarCampanha).toHaveBeenCalledTimes(MAX_PAUSAS_POR_CONTA_POR_RODADA);
  });

  it(`e no máximo ${MAX_PAUSAS_POR_RODADA} na casa toda, mesmo com contas diferentes`, async () => {
    // 8 contas × 3 = 24 candidatas; o teto da casa corta em 10.
    db.adCampaign.findMany.mockResolvedValue(
      Array.from({ length: 24 }, (_, i) => campanha(`c${i}`, `act_${Math.floor(i / 3)}`)),
    );
    const r = await guardarAVerba(AGORA);
    expect(r.pausadas.length).toBeLessThanOrEqual(MAX_PAUSAS_POR_RODADA);
  });

  it("a pausa adiada NÃO some: fica declarada, com motivo, e a campanha segue ativa", async () => {
    db.adCampaign.findMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => campanha(`c${i}`, "act_1")),
    );
    const r = await guardarAVerba(AGORA);
    expect(r.pausasAdiadas).toHaveLength(2);
    expect(r.pausasAdiadas[0]!.motivo).toMatch(/não teve UM clique/);
    expect(r.pausasAdiadas[0]!.motivo).toMatch(/teto de/);
  });

  it("a pausa recusada pelo teto não custa a ESCRITA — o teto é conferido antes da Meta", async () => {
    db.adCampaign.findMany.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => campanha(`c${i}`, "act_1")),
    );
    await guardarAVerba(AGORA);
    // Se o teto fosse conferido depois, a cota seria gasta do mesmo jeito — que
    // é exatamente o dano que ele veio evitar.
    expect(ads.pausarCampanha).toHaveBeenCalledTimes(MAX_PAUSAS_POR_CONTA_POR_RODADA);
  });
});

describe("✅ METADE 2 — o teto não atrapalha o trabalho normal", () => {
  it("uma campanha ruim continua sendo freada na hora", async () => {
    db.adCampaign.findMany.mockResolvedValue([campanha("c1")]);
    const r = await guardarAVerba(AGORA);
    expect(r.pausadas).toHaveLength(1);
    expect(r.pausasAdiadas).toHaveLength(0);
  });

  it("campanha saudável não é tocada, e o teto não a conta", async () => {
    ads.lerDesempenho.mockResolvedValue(SAUDAVEL);
    db.adCampaign.findMany.mockResolvedValue(Array.from({ length: 6 }, (_, i) => campanha(`c${i}`)));
    const r = await guardarAVerba(AGORA);
    expect(ads.pausarCampanha).not.toHaveBeenCalled();
    expect(r.pausasAdiadas).toHaveLength(0);
    expect(r.avaliadas).toBe(6);
  });

  it("a conta continua declarada em toda leitura e em toda pausa — é o que faz a cota contar certo", async () => {
    db.adCampaign.findMany.mockResolvedValue([campanha("c1", "act_9")]);
    await guardarAVerba(AGORA);
    expect(ads.lerDesempenho.mock.calls[0]![4]).toMatchObject({ contaId: "act_9" });
    expect(ads.pausarCampanha).toHaveBeenCalledWith("ws1", "mc1", "ext_c1", "act_9");
  });
});

// ─── O ESPAÇAMENTO DA LEITURA ───────────────────────────────────────────────

describe("⛔ METADE 1 — a MESMA campanha não é lida de 5 em 5 minutos", () => {
  it("relida antes do intervalo: não sai chamada nenhuma", async () => {
    db.adCampaign.findMany.mockResolvedValue([campanha("c1")]);
    await guardarAVerba(AGORA);
    expect(ads.lerDesempenho).toHaveBeenCalledTimes(1);

    ads.lerDesempenho.mockClear();
    const r = await guardarAVerba(new Date(AGORA.getTime() + 5 * 60_000));
    expect(ads.lerDesempenho, "288 leituras/dia de volta").not.toHaveBeenCalled();
    expect(r.adiadasPorRitmo).toBe(1);
  });

  it("a leitura que FALHOU também consome o ritmo — a cota é gasta na tentativa", async () => {
    ads.lerDesempenho.mockResolvedValue({ ok: false, erro: "token expirado" });
    db.adCampaign.findMany.mockResolvedValue([campanha("c1")]);
    await guardarAVerba(AGORA);
    ads.lerDesempenho.mockClear();
    await guardarAVerba(new Date(AGORA.getTime() + 60_000));
    expect(ads.lerDesempenho).not.toHaveBeenCalled();
  });
});

describe("✅ METADE 2 — o espaçamento não cega o guardião", () => {
  it("passado o intervalo, a mesma campanha volta a ser lida", async () => {
    db.adCampaign.findMany.mockResolvedValue([campanha("c1")]);
    await guardarAVerba(AGORA);
    ads.lerDesempenho.mockClear();
    const r = await guardarAVerba(new Date(AGORA.getTime() + INTERVALO_MINIMO_DE_LEITURA_MS + 1));
    expect(ads.lerDesempenho).toHaveBeenCalledTimes(1);
    expect(r.adiadasPorRitmo).toBe(0);
  });

  it("campanhas DIFERENTES não se atrapalham — o ritmo é por campanha", async () => {
    db.adCampaign.findMany.mockResolvedValue([campanha("c1"), campanha("c2")]);
    const r = await guardarAVerba(AGORA);
    expect(r.avaliadas).toBe(2);
  });

  it("quem ficou fora do teto de leituras é CONTADO, e entra na rodada seguinte", async () => {
    const muitas = Array.from({ length: MAX_LEITURAS_POR_RODADA + 4 }, (_, i) => campanha(`c${i}`));
    ads.lerDesempenho.mockResolvedValue(SAUDAVEL);
    db.adCampaign.findMany.mockResolvedValue(muitas);

    const primeira = await guardarAVerba(AGORA);
    expect(primeira.avaliadas).toBe(MAX_LEITURAS_POR_RODADA);
    expect(primeira.foraDaRodada).toBe(4);

    // A rodada seguinte pega justamente as que sobraram: as já lidas estão em
    // ritmo, então ninguém fica preso atrás das mesmas 20 para sempre.
    ads.lerDesempenho.mockClear();
    const segunda = await guardarAVerba(new Date(AGORA.getTime() + 60_000));
    expect(segunda.avaliadas).toBe(4);
    expect(segunda.foraDaRodada).toBe(0);
  });
});
