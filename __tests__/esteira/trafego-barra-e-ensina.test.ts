// AS CINCO TRAVAS DA CAMPANHA — e o defeito que era a FRASE, não a trava.
//
// ─── O QUE ESTE ARQUIVO PROVA ───────────────────────────────────────────────
//
// Cinco coisas impedem uma campanha de sair desta casa, e nenhuma delas é a
// Meta: são travas NOSSAS, todas certas e todas fail-closed. O que estava
// errado era a frase que elas devolviam. "o cliente ainda não conectou a conta
// Meta dele" é verdade e é inútil — não diz onde se conecta, e quem lê fica
// esperando. **Barrar sem ensinar o caminho é o que travou a casa por dias.**
//
// Cada trava aqui é medida duas vezes: que ela BARRA (senão não é trava) e que
// a frase NOMEIA O CLIQUE (senão a trava é só um muro).
//
// ─── E A TRAVA DE RITMO, QUE É CONDIÇÃO PARA LIGAR ──────────────────────────
//
// A cota da Marketing API é contada POR CONTA DE ANÚNCIOS, e a conta sai da URL
// (`cota-de-anuncios.ts`, `contaDaUrl`). Ativar e pausar são `POST /{id}`: o
// `act_...` NÃO aparece na URL. Sem declarar a conta, as escritas da ativação
// caíam num balde separado do balde da criação — duas contagens da MESMA conta,
// isto é, teto DOBRADO: 32 escritas onde a Meta bloqueia em 20. É a assinatura
// exata do que restringiu uma conta desta casa em 03/08/2026.

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
  prepararCampanha, ligarCampanha, desligarCampanha, guardarAVerba, esquecerRitmoDaGuarda,
  ONDE_CONECTAR, ONDE_MARCAR_A_CONTA, ONDE_DIZER_A_VERBA, ONDE_LIGAR, POSSE_NAO_CONFERIDA,
} from "@/lib/agency/esteira/trafego";
import { escritasPorJanela, tetoDePontos } from "@/lib/integrations/meta/cota-de-anuncios";
import { PONTOS_DE_ESCRITA } from "@/lib/integrations/meta/travas";

/** Os dados reais da CityJobs, medidos no portal de produção em 14/08/2026. */
const CONTA = "act_1355986106660251";
const BRIEFING = JSON.stringify({
  scope: {
    adsBudget: 900,
    traffic: {
      platforms: ["Meta Ads"],
      serviceArea: { alcance: "local", cidade: "São Paulo", raioKm: 15, comoFoiDito: "São Paulo capital" },
    },
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  // O espaçamento de leitura do guardião (15/08/2026) mora em MEMÓRIA de
  // módulo: sem zerar, o segundo teste que chama `guardarAVerba` acharia a
  // campanha "lida agora há pouco" e não leria nada. Estado real exige reset
  // real — mock não alcança memória de módulo.
  esquecerRitmoDaGuarda();
  db.project.findUnique.mockResolvedValue({
    id: "p1", name: "Tráfego", workspaceId: "ws1", clientId: "cityjobs", clientRequestId: "cr1",
    client: { name: "City Jobs SP", website: "cityjobs.com.br", phone: "(11) 99999-9999" },
  });
  db.clientRequestDb.findUnique.mockResolvedValue({ businessName: "City Jobs SP", briefingJson: BRIEFING });
  db.metaConnection.findFirst.mockResolvedValue({ id: "mc1", externalId: "980144238512557" });
  db.metaConnection.count.mockResolvedValue(0);
  db.adCampaign.findFirst.mockResolvedValue(null);
  db.adCampaign.create.mockResolvedValue({ id: "ac1" });
  db.adCampaign.update.mockResolvedValue({});
  db.portalMessage.create.mockResolvedValue({});
  db.deliverable = { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([{ id: "d1" }]) };
  db.socialPost = { findFirst: vi.fn().mockResolvedValue({ mediaUrl: "/api/media/m1" }) };
  ads.listarContasDeAnuncio.mockResolvedValue({
    ok: true, dados: [{ id: CONTA, nome: "Principal", moeda: "BRL", status: 1 }],
  });
  ads.criarCampanhaPausada.mockResolvedValue({ ok: true, dados: { campaignId: "camp_1" } });
  ads.criarConjuntoPausado.mockResolvedValue({ ok: true, dados: { adSetId: "adset_1", segmentouGeografia: true } });
  ads.criarAnuncioPausado.mockResolvedValue({ ok: true, dados: { adId: "ad_1", creativeId: "cre_1" } });
  ads.buscarInteresses.mockResolvedValue([]);
  ads.ativarFilhos.mockResolvedValue(undefined);
  ads.ativarCampanha.mockResolvedValue({ ok: true, dados: { ativada: true } });
  ads.pausarCampanha.mockResolvedValue({ ok: true, dados: { pausada: true } });
  ads.lerDesempenho.mockResolvedValue({ ok: false, motivo: "erro_da_meta", erro: "x" });
  process.env.PUBLIC_BASE_URL = "https://app.dioli.studio";
  process.env.JWT_SECRET = "test-secret";
});

// ─── AS CINCO TRAVAS, CADA UMA COM O SEU CLIQUE ─────────────────────────────

describe("toda trava que barra também ensina o caminho", () => {
  it("1. sem conexão do CLIENTE, diz onde se conecta — e não aceita a da agência", async () => {
    // A conexão de nível agência não serve aqui de propósito: usar a credencial
    // da agência na conta de um cliente é o dano de 06/08/2026 pela outra ponta.
    db.metaConnection.findFirst.mockResolvedValue(null);
    const r = await prepararCampanha("p1");
    expect(r.ok).toBe(false);
    expect(r.pendencia).toContain(ONDE_CONECTAR);
    expect(r.pendencia).toMatch(/Conectar Facebook\/Instagram/);
  });

  it("1b. conexão antiga (sem acesso de anúncios) manda RECONECTAR, no mesmo lugar", async () => {
    db.metaConnection.findFirst.mockResolvedValue(null);
    db.metaConnection.count.mockResolvedValue(3);
    const r = await prepararCampanha("p1");
    expect(r.pendencia).toMatch(/reconectar/);
    expect(r.pendencia).toContain(ONDE_CONECTAR);
  });

  it("2. conta não marcada pelo cliente diz onde MARCAR — e não parece recusa da Meta", async () => {
    // `sem_autorizacao` é a nossa lista fail-closed (`MetaAtivoAutorizado`).
    // Ela tinha a mesma cara de uma recusa da Meta e pedia gesto oposto.
    ads.listarContasDeAnuncio.mockResolvedValue({
      ok: false, motivo: "sem_autorizacao", erro: "Falta autorizar quais contas a agência pode ler.",
    });
    const r = await prepararCampanha("p1");
    expect(r.ok).toBe(false);
    expect(r.pendencia).toContain(ONDE_MARCAR_A_CONTA);
  });

  it("2b. recusa que NÃO é da nossa lista não ganha o clique errado", async () => {
    ads.listarContasDeAnuncio.mockResolvedValue({
      ok: false, motivo: "conta_restrita", erro: "A Meta BLOQUEOU esta conta de anúncios",
    });
    const r = await prepararCampanha("p1");
    expect(r.pendencia).not.toContain(ONDE_MARCAR_A_CONTA);
    expect(r.pendencia).toMatch(/BLOQUEOU/);
  });

  it("3. sem verba no briefing, diz onde se escreve a verba", async () => {
    db.clientRequestDb.findUnique.mockResolvedValue({
      businessName: "City Jobs SP", briefingJson: JSON.stringify({ scope: {} }),
    });
    const r = await prepararCampanha("p1");
    expect(r.ok).toBe(false);
    expect(r.pendencia).toContain(ONDE_DIZER_A_VERBA);
  });

  it("4. sem cidade, continua sendo pendência — o Brasil inteiro não é padrão", async () => {
    db.clientRequestDb.findUnique.mockResolvedValue({
      businessName: "City Jobs SP", briefingJson: JSON.stringify({ scope: { adsBudget: 900 } }),
    });
    const r = await prepararCampanha("p1");
    expect(r.ok).toBe(false);
    expect(r.pendencia).toMatch(/onde este neg[oó]cio vende/i);
  });

  it("5. campanha COMPLETA não se anuncia como pronta: ela diz onde se LIGA", async () => {
    // "ok: true" já fez esta casa achar que "tráfego pago pronto" significava
    // dinheiro rodando. Não significa: ela nasce PAUSADA e o último passo é
    // humano, com nome.
    const r = await prepararCampanha("p1");
    expect(r.ok).toBe(true);
    expect(r.pendencia).toContain(ONDE_LIGAR);
    expect(r.pendencia).toMatch(/PAUSADA/);
    expect(ads.criarCampanhaPausada).toHaveBeenCalled();
  });

  it("6. sem projeto de dono conhecido, o anúncio não sai — e a frase é a da posse", async () => {
    // A sexta trava (15/08/2026), e a única que não fala de conexão nem de
    // verba: se a casa não consegue dizer DE QUEM é o projeto, ela não escolhe
    // Página nem arte. Campanha e conjunto ficam pausados, o anúncio não nasce.
    db.project.findUnique
      .mockResolvedValueOnce({
        id: "p1", name: "Tráfego", workspaceId: "ws1", clientId: "cityjobs", clientRequestId: "cr1",
        client: { name: "City Jobs SP", website: "cityjobs.com.br", phone: "(11) 99999-9999" },
      })
      .mockResolvedValueOnce(null); // a leitura de dentro do criativo falha
    const r = await prepararCampanha("p1");
    expect(ads.criarAnuncioPausado).not.toHaveBeenCalled();
    expect(r.pendencia).toBe(POSSE_NAO_CONFERIDA);
    expect(r.pendencia).not.toMatch(/a Meta recusou/i);
  });
});

// ─── A TRAVA DE RITMO — CONDIÇÃO PARA DEIXAR O CAMINHO LIGADO ───────────────

describe("o caminho destravado não pode virar rajada", () => {
  const CAMPANHA = {
    id: "ac1", workspaceId: "ws1", clientId: "cityjobs", projectId: "p1",
    connectionId: "mc1", adAccountId: CONTA, externalId: "camp_1",
    adSetId: "adset_1", adId: "ad_1", name: "City Jobs", status: "paused",
    dailyBudgetBRL: 30, approvedCapBRL: 30,
  };

  it("ATIVAR declara a conta — senão as escritas caem num balde paralelo", async () => {
    // Este é o defeito, com nome: `POST /{campaign_id}` não tem `act_...` na
    // URL. Sem `conta`, `cota-de-anuncios` cobra de `sem_conta:<hash do token>`
    // e a MESMA conta passa a ter dois contadores — teto dobrado.
    db.adCampaign.findUnique.mockResolvedValue(CAMPANHA);
    const r = await ligarCampanha("ac1", "agencia:dioli");
    expect(r.ok).toBe(true);
    expect(ads.ativarCampanha).toHaveBeenCalledWith("ws1", "mc1", "camp_1", "agencia:dioli", CONTA);
  });

  it("e os FILHOS também — são mais duas escritas na mesma conta", async () => {
    db.adCampaign.findUnique.mockResolvedValue(CAMPANHA);
    await ligarCampanha("ac1", "agencia:dioli");
    expect(ads.ativarFilhos).toHaveBeenCalledWith("ws1", "mc1", {
      adSetId: "adset_1", adId: "ad_1", contaId: CONTA,
    });
  });

  it("PAUSAR declara a conta: frear é escrita e pontua 3, igual a ligar", async () => {
    db.adCampaign.findUnique.mockResolvedValue({ ...CAMPANHA, status: "active" });
    await desligarCampanha("ac1");
    expect(ads.pausarCampanha).toHaveBeenCalledWith("ws1", "mc1", "camp_1", CONTA);
  });

  it("o GUARDIÃO, que roda no relógio, também conta na conta certa", async () => {
    // É o caminho automático — o único que roda sem gente olhando, e por isso o
    // que mais pode virar rajada.
    db.adCampaign.findMany.mockResolvedValue([{ ...CAMPANHA, status: "active" }]);
    db.activityEvent.create.mockResolvedValue({});
    ads.lerDesempenho.mockResolvedValue({
      ok: true, dados: { gastoBRL: 50, impressoes: 900, cliques: 0, alcance: 700, cpcBRL: null },
    });
    await guardarAVerba(new Date("2026-08-15T12:00:00Z"));
    expect(ads.lerDesempenho.mock.calls[0]![4]).toMatchObject({ contaId: CONTA });
    expect(ads.pausarCampanha).toHaveBeenCalledWith("ws1", "mc1", "camp_1", CONTA);
  });

  it("o teto de escritas por janela é 16, e ele vem da pontuação medida", () => {
    // 60 pontos (nível de desenvolvimento, medido no painel em 14/08/2026),
    // margem da casa 80% = 48, escrita = 3 pontos → 16 escritas por 300s.
    // Preparar uma campanha custa 4 escritas; ligá-la, 3. Duas campanhas
    // inteiras na mesma janela já batem no teto — e é o certo.
    expect(escritasPorJanela(null)).toBe(16);
    expect(escritasPorJanela(null) * PONTOS_DE_ESCRITA).toBeLessThanOrEqual(tetoDePontos(null));
    // E o teto só sobe quando a META declarar o nível, nunca por edição nossa.
    expect(escritasPorJanela("standard_access")).toBeGreaterThan(escritasPorJanela(null));
  });
});
