// O FREIO DAS AVALIAÇÕES DO GOOGLE — as duas metades, mais os dois defeitos.
//
// ── Por que esta perna precisa de freio próprio ─────────────────────────────
//
// Ela escreve em PERFIL PÚBLICO, embaixo do nome de um cliente, e o que sai não
// sai mais de lá — e notifica quem escreveu a avaliação, na hora. O especialista
// `google` deu **NÃO PODE** formal para ela como estava (15/08/2026).
//
//   ⛔ METADE 1 — fechado SEGURA: não lê o Google, não gasta IA, não grava, não
//      publica. E não perde nada: com o freio puxado nada chega a ser
//      registrado, então a primeira rodada depois da abertura vê a fila inteira.
//   ✅ METADE 2 — aberto DEIXA PASSAR o elogio legítimo.
//   🔴 O REPRESAMENTO: `slice(0, 5)` sobre uma lista `updateTime desc` pega
//      sempre as 5 mais NOVAS. A represada da 6ª posição em diante nunca era
//      alcançada, e a rodada reportava "0 tratadas" sem erro.
//   🔴 O ESPAÇAMENTO: cinco respostas de uma vez, a cada 5 minutos, no perfil
//      público de um negócio de bairro, parece robô para qualquer um que olhe.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  googleConnection: { findMany: vi.fn(), update: vi.fn() },
  googleReview: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  client: { findUnique: vi.fn() },
  clientRequestDb: { findFirst: vi.fn() },
  activityEvent: { create: vi.fn() },
}));
const generate = vi.hoisted(() => vi.fn());
const listarAvaliacoes = vi.hoisted(() => vi.fn());
const responderAvaliacao = vi.hoisted(() => vi.fn());
const buildVerdadeOperacional = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/ai/generate", () => ({ generate }));
vi.mock("@/lib/integrations/google/client", () => ({ listarAvaliacoes, responderAvaliacao }));
vi.mock("@/lib/dioli-brain/client-snapshot", () => ({ buildVerdadeOperacional }));

import { cuidarDasAvaliacoes, INTERVALO_MINIMO_POR_PERFIL_MS } from "@/lib/agency/esteira/avaliacoes";
import {
  CHAVE_DAS_AVALIACOES, VALOR_QUE_LIBERA, avaliacoesLiberadas,
} from "@/lib/agency/freios-de-saida";

const AGORA = new Date("2026-08-15T12:00:00Z");

const CONEXAO = {
  id: "gc1", workspaceId: "ws1", clientId: "c1",
  title: "Padaria do João", locationName: "locations/1", accountName: "accounts/1",
  status: "connected",
  autoReplyConsentAt: new Date("2026-08-01"),
  reviewsSyncedAt: null as Date | null,
};

/** O Google devolve por `updateTime desc`: a mais NOVA primeiro. */
function elogio(id: string) {
  return {
    externalId: id, autor: "Maria", estrelas: 5,
    comentario: "O pão de fermentação natural é o melhor do bairro.",
    quando: new Date("2026-08-01"), jaRespondida: false,
  };
}

const guardado = process.env[CHAVE_DAS_AVALIACOES];

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env[CHAVE_DAS_AVALIACOES];
  db.googleConnection.findMany.mockResolvedValue([{ ...CONEXAO }]);
  db.googleConnection.update.mockResolvedValue({});
  db.googleReview.findMany.mockResolvedValue([]);
  db.googleReview.create.mockResolvedValue({ id: "r1" });
  db.googleReview.update.mockResolvedValue({});
  db.client.findUnique.mockResolvedValue({ name: "Padaria do João", phone: null, email: null, brandBrain: { tone: "acolhedor" } });
  db.clientRequestDb.findFirst.mockResolvedValue({ id: "cr1" });
  db.activityEvent.create.mockResolvedValue({});
  buildVerdadeOperacional.mockResolvedValue(null);
  listarAvaliacoes.mockResolvedValue({ ok: true, dados: [elogio("rev1")] });
  responderAvaliacao.mockResolvedValue({ ok: true, dados: { respondida: true } });
  generate.mockResolvedValue({ ok: true, data: { resposta: "Que alegria ler isso, Maria! A fermentação natural leva 24h e é por isso mesmo. Te esperamos." } });
});

afterEach(() => {
  if (guardado === undefined) delete process.env[CHAVE_DAS_AVALIACOES];
  else process.env[CHAVE_DAS_AVALIACOES] = guardado;
});

describe("a chave nasce FECHADA e só abre no valor exato", () => {
  it("ausente, vazia, `off` e o masculino `liberado` mantêm o freio puxado", () => {
    for (const v of [undefined, "", "off", "liberado", "true"]) {
      if (v === undefined) delete process.env[CHAVE_DAS_AVALIACOES];
      else process.env[CHAVE_DAS_AVALIACOES] = v;
      expect(avaliacoesLiberadas(), String(v)).toBe(false);
    }
    process.env[CHAVE_DAS_AVALIACOES] = VALOR_QUE_LIBERA;
    expect(avaliacoesLiberadas()).toBe(true);
  });
});

describe("⛔ METADE 1 — fechado SEGURA, e segura antes de custar", () => {
  it("não chama o Google, não chama a IA, não grava e não responde", async () => {
    const r = await cuidarDasAvaliacoes(AGORA);
    expect(listarAvaliacoes).not.toHaveBeenCalled();
    expect(generate, "gastou IA com o freio puxado").not.toHaveBeenCalled();
    expect(db.googleReview.create).not.toHaveBeenCalled();
    expect(responderAvaliacao).not.toHaveBeenCalled();
    expect(r.respondidas).toBe(0);
  });

  it("nada é marcado — a fila fica intacta para quando a torneira abrir", async () => {
    await cuidarDasAvaliacoes(AGORA);
    expect(db.googleReview.update).not.toHaveBeenCalled();
    expect(db.googleConnection.update, "carimbou sincronia sem ter sincronizado").not.toHaveBeenCalled();
  });

  it("conta os perfis retidos e nomeia a chave — freio silencioso vira fila morta", async () => {
    db.googleConnection.findMany.mockResolvedValue([{ ...CONEXAO }, { ...CONEXAO, id: "gc2" }]);
    const r = await cuidarDasAvaliacoes(AGORA);
    expect(r.retidas).toBe(2);
    expect(r.freio?.nome).toBe(CHAVE_DAS_AVALIACOES);
    expect(r.freio?.motivo).toMatch(/AVALIACOES_GOOGLE=liberada/);
  });
});

describe("✅ METADE 2 — aberto DEIXA PASSAR", () => {
  beforeEach(() => { process.env[CHAVE_DAS_AVALIACOES] = VALOR_QUE_LIBERA; });

  it("o elogio legítimo volta a ser respondido sozinho", async () => {
    const r = await cuidarDasAvaliacoes(AGORA);
    expect(r.respondidas).toBe(1);
    expect(responderAvaliacao).toHaveBeenCalledWith("gc1", "rev1", expect.stringContaining("Maria"));
    expect(r.freio).toBeNull();
  });
});

// ─── 🔴 O REPRESAMENTO ──────────────────────────────────────────────────────

describe("🔴 a avaliação represada é ALCANÇADA", () => {
  beforeEach(() => { process.env[CHAVE_DAS_AVALIACOES] = VALOR_QUE_LIBERA; });

  it("as já registradas saem da conta ANTES do corte da rodada", async () => {
    // 8 avaliações, as 5 mais novas já tratadas. No desenho antigo, `slice(0,5)`
    // pegava exatamente essas 5, todas caíam no `continue`, e a rodada dizia
    // "0 tratadas" — sem erro, para sempre. Aqui as 3 de baixo TÊM de andar.
    const oito = ["n1", "n2", "n3", "n4", "n5", "velha1", "velha2", "velha3"].map(elogio);
    listarAvaliacoes.mockResolvedValue({ ok: true, dados: oito });
    db.googleReview.findMany.mockResolvedValue(
      ["n1", "n2", "n3", "n4", "n5"].map((externalId) => ({ externalId })),
    );

    const r = await cuidarDasAvaliacoes(AGORA);
    expect(r.novas, "a fila continuou represada").toBe(3);
    const tratadas = db.googleReview.create.mock.calls.map((c) => c[0].data.externalId);
    expect(tratadas).toEqual(["velha1", "velha2", "velha3"]);
  });

  it("o que não coube na rodada é DITO — 0 tratadas e fila cheia são fatos diferentes", async () => {
    listarAvaliacoes.mockResolvedValue({
      ok: true,
      dados: Array.from({ length: 12 }, (_, i) => elogio(`rev${i}`)),
    });
    const r = await cuidarDasAvaliacoes(AGORA);
    expect(r.novas).toBe(5);
    expect(r.represadas).toBe(7);
  });
});

// ─── 🔴 O ESPAÇAMENTO POR PERFIL ────────────────────────────────────────────

describe("🔴 o mesmo perfil não é tocado duas vezes seguidas", () => {
  beforeEach(() => { process.env[CHAVE_DAS_AVALIACOES] = VALOR_QUE_LIBERA; });

  it("⛔ perfil tocado agora há pouco é ADIADO, sem chamar o Google", async () => {
    db.googleConnection.findMany.mockResolvedValue([
      { ...CONEXAO, reviewsSyncedAt: new Date(AGORA.getTime() - 60_000) },
    ]);
    const r = await cuidarDasAvaliacoes(AGORA);
    expect(listarAvaliacoes).not.toHaveBeenCalled();
    expect(r.adiadasPorRitmo).toBe(1);
  });

  it("✅ passado o intervalo, ele volta a ser atendido", async () => {
    db.googleConnection.findMany.mockResolvedValue([
      { ...CONEXAO, reviewsSyncedAt: new Date(AGORA.getTime() - INTERVALO_MINIMO_POR_PERFIL_MS - 1) },
    ]);
    const r = await cuidarDasAvaliacoes(AGORA);
    expect(listarAvaliacoes).toHaveBeenCalled();
    expect(r.respondidas).toBe(1);
  });

  it("✅ perfil que NUNCA foi lido não espera nada — o freio não pode ser a estreia", async () => {
    db.googleConnection.findMany.mockResolvedValue([{ ...CONEXAO, reviewsSyncedAt: null }]);
    expect((await cuidarDasAvaliacoes(AGORA)).respondidas).toBe(1);
  });

  it("perfis DIFERENTES não se atrapalham — o espaçamento é por perfil", async () => {
    db.googleConnection.findMany.mockResolvedValue([
      { ...CONEXAO, id: "gc1", reviewsSyncedAt: null },
      { ...CONEXAO, id: "gc2", reviewsSyncedAt: null },
    ]);
    expect((await cuidarDasAvaliacoes(AGORA)).respondidas).toBe(2);
  });
});
