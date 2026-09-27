// W11 (27/09/2026) — RAMPA DA PRIMEIRA SEMANA, VARIAÇÃO DE RITMO E STORY
// DERIVADO ("capa do post do dia") NA RODADA DE PUBLICAÇÃO.
//
// Parecer do `meta` / ordem do CEO, três frentes:
//   1. VARIAÇÃO — `intervaloDoFormato` ganha alguns minutos de folga
//      DETERMINÍSTICA por post (hash do `postId`), nunca abaixo do mínimo.
//   2. RAMPA — nos primeiros 7 dias de story de uma marca, no máximo
//      `TETO_DA_RAMPA` (3) publicados por dia civil de Brasília, qualquer
//      que seja o teto do pacote. Depois da semana, vale o teto do pacote.
//   3. STORY DERIVADO — um story com `scriptJson.dependeDe` só nasce quando o
//      post-pai já publicou; a capa do pai é baixada, convertida para 9:16
//      (dublê de `prepararImagemDeStory`, W10) e gravada como `MediaAsset`
//      novo antes de a peça seguir para as travas de sempre.
//
// Arquivo PRÓPRIO: `publicacao.test.ts` e `rajada-de-publicacao.test.ts` já
// são grandes e cobrem o resto da rodada — aqui o foco é só o que o W11
// acrescentou.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  socialPost: {
    findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(),
    update: vi.fn(), updateMany: vi.fn(), count: vi.fn(),
  },
  client: { findUnique: vi.fn() },
  mediaAsset: { findMany: vi.fn(), findUnique: vi.fn() },
  activityEvent: { create: vi.fn() },
}));

const publishPost = vi.hoisted(() => vi.fn());
const conexaoDoCliente = vi.hoisted(() => vi.fn());
const contratoDeMarca = vi.hoisted(() => vi.fn());
const conferirPromocaoNoFormato = vi.hoisted(() => vi.fn(
  (): { passa: true } | { passa: false; motivo: string } => ({ passa: true }),
));
const lerPacote = vi.hoisted(() => vi.fn(
  (pacoteJson: string | null | undefined):
    | { ok: true; pacote: { stories?: { intervaloMinimoMin?: number; porDiaMax?: number } } }
    | { ok: false; motivo: string } => {
    if (!pacoteJson) return { ok: false, motivo: "preciso do pacote da marca — ausente" };
    try {
      return { ok: true, pacote: JSON.parse(pacoteJson) };
    } catch {
      return { ok: false, motivo: "preciso do pacote da marca — JSON inválido" };
    }
  },
));
// O DUBLÊ do W10 — a ficha pede "teste com dublê", não a conversão de verdade.
const prepararImagemDeStory = vi.hoisted(() => vi.fn());
const guardarArquivo = vi.hoisted(() => vi.fn());
const lerArquivo = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/integrations/meta/client", () => ({ publishPost }));
vi.mock("@/lib/integrations/meta/connections", () => ({ conexaoDoCliente }));
vi.mock("@/lib/agency/esteira/contrato-de-marca", () => ({ contratoDeMarca }));
vi.mock("@/lib/agency/esteira/promocao-so-em-stories", () => ({ conferirPromocaoNoFormato }));
vi.mock("@/lib/agency/esteira/pacote-da-marca", () => ({ lerPacote }));
vi.mock("@/lib/integrations/meta/midia-de-story", () => ({ prepararImagemDeStory }));
vi.mock("@/lib/agency/media/armazenamento", () => ({
  caminhoPublicoAssinado: (id: string) => `/api/media/${id}?exp=1&sig=abc`,
  guardarArquivo,
  lerArquivo,
}));

import {
  publicarAgendados,
  intervaloDoFormato,
  variacaoDeMinutos,
  tetoDeStoriesDoDia,
  TETO_DA_RAMPA,
  lerDependenciaDoStory,
} from "@/lib/agency/esteira/publicacao";

const DIA_MS = 24 * 60 * 60_000;

function storyPendente(overrides: Record<string, unknown> = {}) {
  return {
    id: "st1", workspaceId: "ws1", clientId: "sushicazza",
    caption: "Bastidor de hoje na cozinha.", format: "story", pillar: null,
    mediaUrl: "/api/media/m1", mediaUrlsJson: "[]", scriptJson: null,
    scheduledFor: new Date(Date.now() - 5 * 60_000), status: "scheduled", lastError: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PUBLIC_BASE_URL = "https://app.dioli.studio";
  contratoDeMarca.mockResolvedValue({ texto: "x", marcaVersao: "mv1", lacunas: [], cortado: [], naoConstituida: false });
  conexaoDoCliente.mockResolvedValue({ id: "mc1", status: "connected" });
  db.mediaAsset.findMany.mockImplementation(async (args?: { where?: { id?: { in?: string[] } } }) =>
    (args?.where?.id?.in ?? []).map((id) => ({ id, mimeType: "image/jpeg" })));
  db.mediaAsset.findUnique.mockResolvedValue(null);
  db.socialPost.findMany.mockResolvedValue([storyPendente()]);
  // Nunca publicou story antes (semana começa agora) e nunca publicou nada na
  // família por padrão — o caso limpo é "primeira peça deste perfil".
  db.socialPost.findFirst.mockResolvedValue(null);
  db.socialPost.findUnique.mockResolvedValue(null);
  db.socialPost.count.mockResolvedValue(0);
  db.socialPost.update.mockResolvedValue({});
  db.socialPost.updateMany.mockResolvedValue({ count: 1 });
  db.activityEvent.create.mockResolvedValue({});
  db.client.findUnique.mockResolvedValue(null);
  publishPost.mockResolvedValue({ ok: true, externalPostId: "ig1", permalink: "https://i/p/1" });
  guardarArquivo.mockResolvedValue({
    ok: true,
    arquivo: { id: "med_derivado1", fileName: "story-derivado.jpg", mimeType: "image/jpeg", sizeBytes: 123, url: "/api/media/med_derivado1" },
  });
  lerArquivo.mockResolvedValue(Buffer.from("bytes-da-capa"));
  prepararImagemDeStory.mockResolvedValue({
    ok: true, buffer: Buffer.from("story-9x16"), mime: "image/jpeg", largura: 1080, altura: 1920, bytes: 10,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. VARIAÇÃO DETERMINÍSTICA
// ─────────────────────────────────────────────────────────────────────────────

describe("variacaoDeMinutos — determinística e nunca negativa", () => {
  it("o MESMO post dá SEMPRE o mesmo número", () => {
    const a = variacaoDeMinutos("sp_abc123");
    const b = variacaoDeMinutos("sp_abc123");
    expect(a).toBe(b);
  });

  it("nunca sai da faixa [0, max]", () => {
    for (const id of ["a", "st1", "sp_qualquer", "um-post-bem-mais-comprido-do-que-isso"]) {
      const v = variacaoDeMinutos(id, 5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(5);
    }
  });

  it("posts diferentes PODEM dar variação diferente — não é uma constante disfarçada", () => {
    const valores = new Set(["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"].map((id) => variacaoDeMinutos(id)));
    expect(valores.size).toBeGreaterThan(1);
  });
});

describe("intervaloDoFormato com postId — nunca abaixo do mínimo do pacote", () => {
  it("sem postId, o comportamento de sempre não muda (régua antiga continua valendo)", () => {
    expect(intervaloDoFormato("story", null)).toBe(30 * 60_000);
    expect(intervaloDoFormato("story", { stories: { intervaloMinimoMin: 45 } } as never)).toBe(45 * 60_000);
  });

  it("com postId, o resultado é o mínimo mais até 5 min — nunca menos que o mínimo", () => {
    const minimo = 30 * 60_000;
    const comVariacao = intervaloDoFormato("story", null, "algum-post-id");
    expect(comVariacao).toBeGreaterThanOrEqual(minimo);
    expect(comVariacao).toBeLessThanOrEqual(minimo + 5 * 60_000);
  });

  it("feed nunca ganha variação — a régua é só de story", () => {
    expect(intervaloDoFormato("feed", null, "qualquer-post")).toBe(intervaloDoFormato("feed", null));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. A RAMPA — a régua pura
// ─────────────────────────────────────────────────────────────────────────────

describe("tetoDeStoriesDoDia — a régua pura", () => {
  const agora = new Date("2026-09-27T12:00:00Z");

  it("marca que NUNCA publicou story: a semana começa agora, teto é o da rampa", () => {
    expect(tetoDeStoriesDoDia({ primeiroStoryEm: null, agora, porDiaMax: 8 })).toBe(TETO_DA_RAMPA);
  });

  it("dentro dos 7 dias: teto é o da rampa, mesmo com porDiaMax maior", () => {
    const primeiro = new Date(agora.getTime() - 3 * DIA_MS);
    expect(tetoDeStoriesDoDia({ primeiroStoryEm: primeiro, agora, porDiaMax: 8 })).toBe(TETO_DA_RAMPA);
  });

  it("depois dos 7 dias: teto é o do pacote", () => {
    const primeiro = new Date(agora.getTime() - 8 * DIA_MS);
    expect(tetoDeStoriesDoDia({ primeiroStoryEm: primeiro, agora, porDiaMax: 8 })).toBe(8);
  });

  it("depois dos 7 dias SEM porDiaMax declarado: fail-closed, cai no teto da rampa", () => {
    const primeiro = new Date(agora.getTime() - 8 * DIA_MS);
    expect(tetoDeStoriesDoDia({ primeiroStoryEm: primeiro, agora, porDiaMax: null })).toBe(TETO_DA_RAMPA);
  });
});

describe("lerDependenciaDoStory — o marcador do gerador (W12b)", () => {
  it("lê o marcador válido", () => {
    expect(lerDependenciaDoStory(JSON.stringify({ dependeDe: "sp_pai1", tipo: "capa_derivada" })))
      .toEqual({ dependeDe: "sp_pai1" });
  });

  it("sem `tipo: capa_derivada`, não é dependência (é outro uso do scriptJson)", () => {
    expect(lerDependenciaDoStory(JSON.stringify({ dependeDe: "sp_pai1", tipo: "roteiro_reel" }))).toBeNull();
  });

  it("JSON quebrado, nulo ou vazio → null, nunca exceção", () => {
    expect(lerDependenciaDoStory("{ isto não é json")).toBeNull();
    expect(lerDependenciaDoStory(null)).toBeNull();
    expect(lerDependenciaDoStory(undefined)).toBeNull();
    expect(lerDependenciaDoStory("")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. A RAMPA NA RODADA
// ─────────────────────────────────────────────────────────────────────────────

describe("a rampa da primeira semana, na rodada de verdade", () => {
  it("4º story do dia na 1ª semana é ADIADO — não é falha", async () => {
    db.socialPost.count.mockResolvedValue(3); // já saíram 3 hoje
    const r = await publicarAgendados();
    expect(r.publicados).toBe(0);
    expect(publishPost).not.toHaveBeenCalled();
    expect(r.falhas).toHaveLength(0);
    expect(r.adiados[0]!.motivo).toBe("rampa da primeira semana: 3 stories por dia");
  });

  it("1º, 2º e 3º do dia na 1ª semana passam", async () => {
    db.socialPost.count.mockResolvedValue(2); // este seria o 3º
    const r = await publicarAgendados();
    expect(r.publicados).toBe(1);
    expect(publishPost).toHaveBeenCalledTimes(1);
  });

  it("8º na 2ª semana, com porDiaMax 8 do pacote, PASSA", async () => {
    db.client.findUnique.mockResolvedValue({
      pacoteJson: JSON.stringify({ stories: { porDiaMax: 8 } }),
    });
    db.socialPost.findFirst.mockImplementation(
      async (args: { orderBy?: { publishedAt?: string } }) =>
        args.orderBy?.publishedAt === "asc"
          ? { publishedAt: new Date(Date.now() - 8 * DIA_MS) } // 1º story há 8 dias — fora da rampa
          : null, // nenhuma medida de "última publicação" — não segura o espaçamento
    );
    db.socialPost.count.mockResolvedValue(7); // este seria o 8º
    const r = await publicarAgendados();
    expect(r.publicados).toBe(1);
    expect(publishPost).toHaveBeenCalledTimes(1);
  });

  it("9º na 2ª semana, com porDiaMax 8 do pacote, é ADIADO", async () => {
    db.client.findUnique.mockResolvedValue({
      pacoteJson: JSON.stringify({ stories: { porDiaMax: 8 } }),
    });
    db.socialPost.findFirst.mockImplementation(
      async (args: { orderBy?: { publishedAt?: string } }) =>
        args.orderBy?.publishedAt === "asc"
          ? { publishedAt: new Date(Date.now() - 8 * DIA_MS) }
          : null,
    );
    db.socialPost.count.mockResolvedValue(8); // este seria o 9º
    const r = await publicarAgendados();
    expect(r.publicados).toBe(0);
    expect(publishPost).not.toHaveBeenCalled();
    expect(r.adiados[0]!.motivo).not.toBe("rampa da primeira semana: 3 stories por dia");
    expect(r.adiados[0]!.motivo).toMatch(/8/);
  });

  it("não conseguir medir a rampa não vira permissão — fail-closed", async () => {
    db.socialPost.count.mockRejectedValue(new Error("db down"));
    const r = await publicarAgendados();
    expect(r.publicados).toBe(0);
    expect(publishPost).not.toHaveBeenCalled();
    expect(r.adiados[0]!.motivo).toContain("não consegui medir");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. STORY DERIVADO — "capa do post do dia"
// ─────────────────────────────────────────────────────────────────────────────

describe("story derivado — dependeDe / tipo capa_derivada", () => {
  function storyDerivado(overrides: Record<string, unknown> = {}) {
    return storyPendente({
      id: "sd1",
      mediaUrl: null,
      scriptJson: JSON.stringify({ dependeDe: "pai1", tipo: "capa_derivada" }),
      ...overrides,
    });
  }

  it("pai não existe mais → FALHA, não adia para sempre", async () => {
    db.socialPost.findMany.mockResolvedValue([storyDerivado()]);
    db.socialPost.findUnique.mockResolvedValue(null);
    const r = await publicarAgendados();
    expect(r.publicados).toBe(0);
    expect(r.falhas[0]!.erro).toMatch(/não existe mais/);
  });

  it("pai ainda em draft/scheduled → ADIADO, esperando o post do dia", async () => {
    db.socialPost.findMany.mockResolvedValue([storyDerivado()]);
    db.socialPost.findUnique.mockResolvedValue({ status: "scheduled", externalPostId: null, mediaUrl: "/api/media/capa1", mediaUrlsJson: "[]" });
    const r = await publicarAgendados();
    expect(r.publicados).toBe(0);
    expect(r.falhas).toHaveLength(0);
    expect(r.adiados[0]!.motivo).toBe("esperando o post do dia publicar");
  });

  it("pai published SEM externalPostId → ainda ADIADO (não é prova suficiente)", async () => {
    db.socialPost.findMany.mockResolvedValue([storyDerivado()]);
    db.socialPost.findUnique.mockResolvedValue({ status: "published", externalPostId: null, mediaUrl: "/api/media/capa1", mediaUrlsJson: "[]" });
    const r = await publicarAgendados();
    expect(r.publicados).toBe(0);
    expect(r.adiados[0]!.motivo).toBe("esperando o post do dia publicar");
  });

  it.each(["failed", "publish_unknown", "cancelado"])(
    "pai em %s → FALHA — o story derivado não sai",
    async (status) => {
      db.socialPost.findMany.mockResolvedValue([storyDerivado()]);
      db.socialPost.findUnique.mockResolvedValue({ status, externalPostId: null, mediaUrl: "/api/media/capa1", mediaUrlsJson: "[]" });
      const r = await publicarAgendados();
      expect(r.publicados).toBe(0);
      expect(r.falhas[0]!.erro).toBe("o post do dia não publicou — o story derivado não sai");
    },
  );

  it("pai publicado e a peça sem mediaUrl: baixa a capa, converte e publica", async () => {
    db.socialPost.findMany.mockResolvedValue([storyDerivado()]);
    db.socialPost.findUnique.mockResolvedValue({
      status: "published", externalPostId: "ig_pai", mediaUrl: "/api/media/capa1", mediaUrlsJson: "[]",
    });
    db.mediaAsset.findUnique.mockResolvedValue({ id: "capa1", storagePath: "ws1/capa1.jpg", mimeType: "image/jpeg" });

    const r = await publicarAgendados();

    expect(lerArquivo).toHaveBeenCalledWith("ws1/capa1.jpg");
    expect(prepararImagemDeStory).toHaveBeenCalledWith(expect.any(Buffer), "image/jpeg");
    expect(guardarArquivo).toHaveBeenCalledTimes(1);
    // A mídia derivada foi GRAVADA no post antes de publicar — não só usada em memória.
    const escritaDeMedia = db.socialPost.update.mock.calls.find(
      (c) => c[0].where.id === "sd1" && c[0].data.mediaUrl === "/api/media/med_derivado1",
    );
    expect(escritaDeMedia).toBeTruthy();
    expect(r.publicados).toBe(1);
    expect(publishPost).toHaveBeenCalledTimes(1);
  });

  it("pai publicado e a peça JÁ TEM mediaUrl: não reconverte", async () => {
    db.socialPost.findMany.mockResolvedValue([storyDerivado({ mediaUrl: "/api/media/ja-convertido" })]);
    db.socialPost.findUnique.mockResolvedValue({
      status: "published", externalPostId: "ig_pai", mediaUrl: "/api/media/capa1", mediaUrlsJson: "[]",
    });

    const r = await publicarAgendados();

    expect(prepararImagemDeStory).not.toHaveBeenCalled();
    expect(guardarArquivo).not.toHaveBeenCalled();
    expect(r.publicados).toBe(1);
  });

  it("pai publicado, capa é a PRIMEIRA TELA do carrossel (sem mediaUrl próprio)", async () => {
    db.socialPost.findMany.mockResolvedValue([storyDerivado()]);
    db.socialPost.findUnique.mockResolvedValue({
      status: "published", externalPostId: "ig_pai", mediaUrl: null,
      mediaUrlsJson: JSON.stringify(["/api/media/tela1", "/api/media/tela2"]),
    });
    db.mediaAsset.findUnique.mockResolvedValue({ id: "tela1", storagePath: "ws1/tela1.jpg", mimeType: "image/jpeg" });

    const r = await publicarAgendados();

    expect(lerArquivo).toHaveBeenCalledWith("ws1/tela1.jpg");
    expect(r.publicados).toBe(1);
  });

  it("falha na conversão (dublê recusa) → FALHA com o motivo, peça não perdida", async () => {
    db.socialPost.findMany.mockResolvedValue([storyDerivado()]);
    db.socialPost.findUnique.mockResolvedValue({
      status: "published", externalPostId: "ig_pai", mediaUrl: "/api/media/capa1", mediaUrlsJson: "[]",
    });
    db.mediaAsset.findUnique.mockResolvedValue({ id: "capa1", storagePath: "ws1/capa1.jpg", mimeType: "image/jpeg" });
    prepararImagemDeStory.mockResolvedValue({ ok: false, motivo: "imagem corrompida" });

    const r = await publicarAgendados();

    expect(r.publicados).toBe(0);
    expect(publishPost).not.toHaveBeenCalled();
    expect(r.falhas[0]!.erro).toMatch(/imagem corrompida/);
  });

  it("pai publicado mas sem capa nenhuma (mediaUrl e mediaUrlsJson vazios) → FALHA", async () => {
    db.socialPost.findMany.mockResolvedValue([storyDerivado()]);
    db.socialPost.findUnique.mockResolvedValue({
      status: "published", externalPostId: "ig_pai", mediaUrl: null, mediaUrlsJson: "[]",
    });

    const r = await publicarAgendados();

    expect(r.publicados).toBe(0);
    expect(r.falhas[0]!.erro).toMatch(/não tem capa/);
  });

  it("story SEM dependeDe é publicado normalmente — a régua nova não pega quem não é derivado", async () => {
    db.socialPost.findMany.mockResolvedValue([storyPendente()]); // scriptJson: null
    const r = await publicarAgendados();
    expect(r.publicados).toBe(1);
    expect(db.socialPost.findUnique).not.toHaveBeenCalled();
  });
});
