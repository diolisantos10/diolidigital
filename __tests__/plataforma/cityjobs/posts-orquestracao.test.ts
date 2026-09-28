// receberPost — a orquestração inteira: idempotência, mídia fora de spec,
// trava de duplicado, aprovação automática (só com o carimbo certo) e a
// fila "pagas antes de selecionadas" do feed.
//
// `@/lib/agency/esteira/publicacao` é mockado por INTEIRO — só os dois
// helpers PUROS que `posts.ts` usa (`intervaloDoFormato`,
// `inicioDoDiaCivilDeBrasilia`); a régua deles já tem teste próprio
// (`w11-rampa-e-story-derivado.test.ts`). Puxar o módulo real arrastaria uma
// árvore de import pesada (cliente da Meta, mídia de story, pilares
// bloqueados...) só para usar duas funções puras.

import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  postExterno: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  socialPost: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  mediaAsset: { findMany: vi.fn() },
  client: { findUnique: vi.fn() },
  activityEvent: { create: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const OFFSET_BRASILIA_MS = 3 * 60 * 60 * 1000;
function inicioDoDiaCivilDeBrasiliaFake(agora: Date): Date {
  const deslocado = new Date(agora.getTime() - OFFSET_BRASILIA_MS);
  const meiaNoite = Date.UTC(deslocado.getUTCFullYear(), deslocado.getUTCMonth(), deslocado.getUTCDate(), 0, 0, 0, 0);
  return new Date(meiaNoite + OFFSET_BRASILIA_MS);
}
vi.mock("@/lib/agency/esteira/publicacao", () => ({
  intervaloDoFormato: vi.fn(() => 30 * 60_000),
  inicioDoDiaCivilDeBrasilia: inicioDoDiaCivilDeBrasiliaFake,
}));

const baixarEValidarMidiaExterna = vi.hoisted(() =>
  vi.fn(
    async (): Promise<
      | { ok: true; mediaAssetId: string; mime: string; bytes: number }
      | { ok: false; codigo: "campo_invalido"; campo: string; motivo: string }
      | { ok: false; codigo: "midia_fora_de_spec"; motivo: string }
    > => ({ ok: true, mediaAssetId: "med_1", mime: "image/jpeg", bytes: 1000 }),
  ),
);
const dominiosPermitidosDeEnv = vi.hoisted(() => vi.fn(() => ["cdn.cityjobs.example.com"]));
vi.mock("@/lib/integracoes/cityjobs/midia", () => ({ baixarEValidarMidiaExterna, dominiosPermitidosDeEnv }));

const registrarEventoDeWebhook = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
vi.mock("@/lib/integracoes/cityjobs/webhook", () => ({ registrarEventoDeWebhook }));

const clienteEhCityJobsComRegraLigada = vi.hoisted(() => vi.fn(async () => false));
const registrarAprovacaoPorRegra = vi.hoisted(() =>
  vi.fn(async (): Promise<{ ok: true; approvalRequestId: string; agendados: number }> => ({
    ok: true, approvalRequestId: "ar_1", agendados: 1,
  })),
);
vi.mock("@/lib/agency/esteira/modo-de-aprovacao", () => ({
  clienteEhCityJobsComRegraLigada,
  registrarAprovacaoPorRegra,
  carimboDoCityJobsPagaSemRisco: (d: Date) => `regra-da-marca:cityjobs_paga_sem_risco@${d.toISOString().slice(0, 10)}`,
}));

const createApprovalRequest = vi.hoisted(() => vi.fn(async () => ({ id: "approval_1" })));
vi.mock("@/lib/agency/persistence/approval-service", () => ({ createApprovalRequest }));

import { receberPost, corpoDeNegocioSha256, validarEntrada } from "@/lib/integracoes/cityjobs/posts";

const CORPO_STORY_PAGA = {
  idExterno: "vaga-4821-story-1",
  marca: "cityjobs",
  formato: "story" as const,
  midia: { tipo: "url" as const, url: "https://cdn.cityjobs.example.com/vaga.jpg" },
  prioridade: "paga" as const,
  risco: "sem_risco" as const,
  horarioDesejado: "2026-09-28T13:30:00-03:00",
  validadePlano: "2026-10-03",
};

beforeEach(() => {
  vi.clearAllMocks();
  db.postExterno.findUnique.mockResolvedValue(null);
  db.socialPost.findFirst.mockResolvedValue(null);
  db.socialPost.findMany.mockResolvedValue([]);
  db.mediaAsset.findMany.mockResolvedValue([{ id: "med_1", sha256: "abc123" }]);
  db.client.findUnique.mockResolvedValue({ pacoteJson: null });
  db.socialPost.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "sp_novo", ...data }));
  db.postExterno.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "pe_novo", ...data }));
  clienteEhCityJobsComRegraLigada.mockResolvedValue(false);
  baixarEValidarMidiaExterna.mockResolvedValue({ ok: true, mediaAssetId: "med_1", mime: "image/jpeg", bytes: 1000 });
});

describe("validação do corpo (contrato §4)", () => {
  it("aceita o corpo mínimo válido de story paga", () => {
    expect(validarEntrada(CORPO_STORY_PAGA).ok).toBe(true);
  });
  it("recusa carrossel com 1 item de mídia só", () => {
    const r = validarEntrada({ ...CORPO_STORY_PAGA, formato: "carrossel", midia: [CORPO_STORY_PAGA.midia] });
    expect(r.ok).toBe(false);
  });
  it("recusa feed sem legenda", () => {
    const r = validarEntrada({ ...CORPO_STORY_PAGA, formato: "feed_imagem", legenda: "" });
    expect(r.ok).toBe(false);
  });
  it("recusa paga sem validadePlano", () => {
    const { validadePlano, ...semValidade } = CORPO_STORY_PAGA;
    expect(validarEntrada(semValidade).ok).toBe(false);
  });
});

describe("idempotência (contrato §2)", () => {
  it("mesma idExterno, mesmo corpo → 200 idempotente, sem criar nada de novo", async () => {
    const validado = validarEntrada(CORPO_STORY_PAGA);
    if (!validado.ok) throw new Error("setup do teste está inválido");
    const hash = corpoDeNegocioSha256(validado.corpo);
    db.postExterno.findUnique.mockResolvedValue({
      idExterno: CORPO_STORY_PAGA.idExterno,
      corpoSha256: hash,
      estado: "agendado",
      motivo: null,
      socialPostIdsJson: JSON.stringify(["sp_existente"]),
    });
    db.socialPost.findUnique.mockResolvedValue({ scheduledFor: new Date(), publishedAt: null, permalink: null, externalPostId: null, lastError: null });

    const r = await receberPost({ corpoBruto: CORPO_STORY_PAGA, workspaceId: "ws1", clientId: "c1" });
    expect(r.http).toBe(200);
    expect(db.socialPost.create).not.toHaveBeenCalled();
    expect(db.postExterno.create).not.toHaveBeenCalled();
  });

  it("mesma idExterno, corpo DIFERENTE → 409 idexterno_conflitante", async () => {
    db.postExterno.findUnique.mockResolvedValue({
      idExterno: CORPO_STORY_PAGA.idExterno,
      corpoSha256: "hash-completamente-diferente",
      estado: "agendado",
      motivo: null,
      socialPostIdsJson: "[]",
    });
    const r = await receberPost({ corpoBruto: CORPO_STORY_PAGA, workspaceId: "ws1", clientId: "c1" });
    expect(r.http).toBe(409);
    expect((r.corpo as { erro: string }).erro).toBe("idexterno_conflitante");
  });
});

describe("mídia fora de spec — 422 sem criar SocialPost", () => {
  it("propaga a recusa do validador de mídia", async () => {
    baixarEValidarMidiaExterna.mockResolvedValue({ ok: false, codigo: "midia_fora_de_spec", motivo: "PNG não é aceito" });
    const r = await receberPost({ corpoBruto: CORPO_STORY_PAGA, workspaceId: "ws1", clientId: "c1" });
    expect(r.http).toBe(422);
    expect(db.socialPost.create).not.toHaveBeenCalled();
  });

  it("domínio fora da allowlist vira 400 campo_invalido", async () => {
    baixarEValidarMidiaExterna.mockResolvedValue({ ok: false, codigo: "campo_invalido", campo: "midia.url", motivo: "domínio não permitido" });
    const r = await receberPost({ corpoBruto: CORPO_STORY_PAGA, workspaceId: "ws1", clientId: "c1" });
    expect(r.http).toBe(400);
  });
});

describe("trava de duplicado (contrato §6.3)", () => {
  it("mesma mídia + mesma legenda dentro da janela → 409 duplicado", async () => {
    const corpoFeed = {
      ...CORPO_STORY_PAGA,
      formato: "feed_imagem" as const,
      legenda: "Vaga aberta: Analista.",
      idExterno: "vaga-4821-feed-1",
      prioridade: "selecionada" as const,
      risco: "sem_risco" as const,
      validadePlano: undefined,
    };
    db.socialPost.findMany.mockImplementation(async (args: { where?: { mediaUrl?: unknown; caption?: unknown } }) => {
      // A trava de duplicado consulta por caption+mediaUrl; a busca de slot de
      // feed consulta por scheduledFor — distingue pelo shape do `where`.
      if (args.where && "caption" in args.where) {
        return [{ publishedAt: new Date(), scheduledFor: null, createdAt: new Date() }];
      }
      return [];
    });
    const r = await receberPost({ corpoBruto: corpoFeed, workspaceId: "ws1", clientId: "c1" });
    expect(r.http).toBe(409);
    expect((r.corpo as { erro: string }).erro).toBe("duplicado");
  });
});

describe("aprovação automática (contrato §6.1) — só com o carimbo certo", () => {
  it("paga + sem_risco + regra LIGADA → auto-aprova (agendado)", async () => {
    clienteEhCityJobsComRegraLigada.mockResolvedValue(true);
    const r = await receberPost({ corpoBruto: CORPO_STORY_PAGA, workspaceId: "ws1", clientId: "c1" });
    expect(r.http).toBe(202);
    expect((r.corpo as { estado: string }).estado).toBe("agendado");
    expect(registrarAprovacaoPorRegra).toHaveBeenCalledTimes(1);
    expect(createApprovalRequest).not.toHaveBeenCalled();
  });

  it("paga + sem_risco + regra DESLIGADA → aguardando_revisao, NUNCA auto-aprova", async () => {
    clienteEhCityJobsComRegraLigada.mockResolvedValue(false);
    const r = await receberPost({ corpoBruto: CORPO_STORY_PAGA, workspaceId: "ws1", clientId: "c1" });
    expect((r.corpo as { estado: string }).estado).toBe("aguardando_revisao");
    expect(registrarAprovacaoPorRegra).not.toHaveBeenCalled();
    expect(createApprovalRequest).toHaveBeenCalledTimes(1);
  });

  it("com_risco → SEMPRE aguardando_revisao, mesmo com a regra ligada", async () => {
    clienteEhCityJobsComRegraLigada.mockResolvedValue(true);
    const r = await receberPost({ corpoBruto: { ...CORPO_STORY_PAGA, risco: "com_risco" }, workspaceId: "ws1", clientId: "c1" });
    expect((r.corpo as { estado: string }).estado).toBe("aguardando_revisao");
    expect(registrarAprovacaoPorRegra).not.toHaveBeenCalled();
  });

  it("selecionada nunca auto-aprova, mesmo sem_risco e regra ligada", async () => {
    clienteEhCityJobsComRegraLigada.mockResolvedValue(true);
    const corpo = { ...CORPO_STORY_PAGA, prioridade: "selecionada" as const, validadePlano: undefined };
    const r = await receberPost({ corpoBruto: corpo, workspaceId: "ws1", clientId: "c1" });
    expect((r.corpo as { estado: string }).estado).toBe("aguardando_revisao");
  });
});

describe("marca de FONTE EXTERNA no SocialPost (Achado 1, J4, 28/09/2026)", () => {
  it("grava scriptJson com origem/idExterno/risco/prioridade — é o que a trava de silêncio/piloto lê", async () => {
    await receberPost({ corpoBruto: CORPO_STORY_PAGA, workspaceId: "ws1", clientId: "c1" });

    expect(db.socialPost.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scriptJson: JSON.stringify({
            origem: "cityjobs",
            idExterno: CORPO_STORY_PAGA.idExterno,
            risco: CORPO_STORY_PAGA.risco,
            prioridade: CORPO_STORY_PAGA.prioridade,
          }),
        }),
      }),
    );
  });

  it('o marcador nunca tem "fase":"pauta" — a peça chega pronta, nunca passa pela rotina editorial', async () => {
    await receberPost({ corpoBruto: { ...CORPO_STORY_PAGA, risco: "com_risco" }, workspaceId: "ws1", clientId: "c1" });

    expect(db.socialPost.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ scriptJson: expect.not.stringContaining("fase") }),
      }),
    );
    expect(db.socialPost.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scriptJson: JSON.stringify({
            origem: "cityjobs",
            idExterno: CORPO_STORY_PAGA.idExterno,
            risco: "com_risco",
            prioridade: CORPO_STORY_PAGA.prioridade,
          }),
        }),
      }),
    );
  });
});

describe("webhook 'agendado' registrado após o agendamento", () => {
  it("chama registrarEventoDeWebhook com o idExterno certo", async () => {
    await receberPost({ corpoBruto: CORPO_STORY_PAGA, workspaceId: "ws1", clientId: "c1" });
    expect(registrarEventoDeWebhook).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ idExterno: CORPO_STORY_PAGA.idExterno, evento: "agendado" }),
    );
  });
});
