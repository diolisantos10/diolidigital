// W10 (27/09/2026) — parecer do `meta`, executado em `client.ts`:
//
//   1. story NÃO manda `caption` — nem vazio — na criação do contêiner;
//   2. `content_publishing_limit` é conferido ANTES de qualquer contêiner, e
//      falha de consulta é FAIL-CLOSED;
//   3. mídia de story fora de spec (formato, peso, codec, duração) é recusada
//      ANTES do contêiner — nunca descoberta tarde, na Meta.
//
// O carrossel (item 4 da ficha: "um contêiner por vez") já é medido por
// `publicacao-e-descoberta.test.ts`; aqui ele só está fora do escopo destes
// casos porque o que muda com esta ficha é o QUE ACONTECE ANTES do laço.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const graphGet = vi.hoisted(() => vi.fn());
const graphPost = vi.hoisted(() => vi.fn());
const graphPostJson = vi.hoisted(() => vi.fn());
const loadConnectionToken = vi.hoisted(() => vi.fn());
const db = vi.hoisted(() => ({
  metaAtivoAutorizado: { findMany: vi.fn() },
  socialPost: { findUnique: vi.fn() },
  approvalRequest: { findMany: vi.fn() },
  client: { findUnique: vi.fn() },
  mediaAsset: { findUnique: vi.fn() },
}));

const FakeGraphError = vi.hoisted(() => class FakeGraphError extends Error {
  detail?: { message?: string };
  constructor(message: string) { super(message); this.detail = { message }; }
});

vi.mock("@/lib/integrations/meta/graph", () => ({
  graphGet, graphPost, graphPostJson, GraphApiError: FakeGraphError,
}));
vi.mock("@/lib/integrations/meta/connections", () => ({ loadConnectionToken }));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

// A conferência de mídia de story passa por `confereUrlExternaSegura`
// (achado de SSRF, 27/09/2026), que resolve DNS antes de qualquer HEAD. Sem
// mockar `node:dns`, todo teste desta suíte que usa uma URL externa
// (`cdn.cliente.com`) faz consulta de rede de verdade — proibida e instável
// no sandbox — e a conferência recusa por "não sei para onde aponta" ANTES
// do `fetch` mockado ser chamado, trocando a mensagem esperada por "não
// consegui confirmar o formato/tamanho...". Mesmo dublê de
// `__tests__/meta/midia-de-story.test.ts`: resolve para um IP público fixo.
const dnsLookupMock = vi.hoisted(() =>
  vi.fn(async (): Promise<Array<{ address: string; family: number }>> => [
    { address: "8.8.8.8", family: 4 },
  ]),
);
vi.mock("node:dns", () => ({ promises: { lookup: dnsLookupMock } }));

import { publishPost } from "@/lib/integrations/meta/client";

/** O perfil ligado, autorizado e aprovado — o cenário que deixa sobrar, sob
 *  medição, só o que este arquivo prova. */
const CONEXAO = { token: "tk", platform: "instagram" as const, externalId: "ig1", clientId: "cli1" };
const PECA_ID = "sp_story_teto_1";

const decisaoOriginal = process.env.PUBLICACAO_ORGANICA;

/** Roda a promessa deixando os `setTimeout` internos disparar na hora. */
async function semEsperar<T>(p: Promise<T>): Promise<T> {
  const feito = p.then((v) => v, (e) => { throw e; });
  await vi.runAllTimersAsync();
  return feito;
}

function headersFalsos(mapa: Record<string, string>) {
  return { get: (chave: string) => mapa[chave] ?? null };
}

/** O teto sempre longe do limite — cenário, não o que cada teste mede,
 *  exceto nos testes que são justamente sobre o teto. */
function graphGetPadrao(alemDoTeto: Record<string, unknown> = {}) {
  graphGet.mockImplementation(async (path: string) =>
    path.includes("content_publishing_limit")
      ? { quota_usage: 0, config: { quota_total: 50 }, ...alemDoTeto }
      : { status_code: "FINISHED", permalink: "https://ig/p/1" });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  loadConnectionToken.mockResolvedValue(CONEXAO);
  db.metaAtivoAutorizado.findMany.mockResolvedValue([{ externalId: CONEXAO.externalId }]);
  db.socialPost.findUnique.mockResolvedValue({ id: PECA_ID, clientId: CONEXAO.clientId });
  db.approvalRequest.findMany.mockResolvedValue([{
    id: "ap1", clientId: CONEXAO.clientId, reviewedBy: "client:Fulano",
    reviewedAt: new Date("2026-09-27T12:00:00Z"),
    sourcePostIdsJson: JSON.stringify([PECA_ID]),
  }]);
  process.env.PUBLICACAO_ORGANICA = "liberada";
  graphPost.mockImplementation(async () => ({ id: "c1" }));
  graphGetPadrao();
  vi.stubGlobal("fetch", vi.fn(async () => {
    throw new Error("teste não configurou o fetch para este caso");
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (decisaoOriginal === undefined) delete process.env.PUBLICACAO_ORGANICA;
  else process.env.PUBLICACAO_ORGANICA = decisaoOriginal;
});

// ─── 1. Story não manda caption ──────────────────────────────────────────────

describe("story não manda `caption` na criação do contêiner", () => {
  it("feed continua mandando a legenda normalmente", async () => {
    const r = await semEsperar(publishPost("w1", {
      connectionId: "mc1", postId: PECA_ID, platform: "instagram", format: "feed",
      caption: "abertura da loja", mediaUrl: "https://cdn.cliente.com/foto.jpg",
    } as never));

    expect(r.ok).toBe(true);
    const chamada = graphPost.mock.calls.find(([path]) => String(path).endsWith("/media"));
    expect(chamada).toBeTruthy();
    expect((chamada![2] as Record<string, unknown>).caption).toBe("abertura da loja");
  });

  it("story NÃO leva `caption`, nem quando o post tem legenda", async () => {
    db.mediaAsset.findUnique.mockResolvedValue({ mimeType: "image/jpeg", sizeBytes: 500_000 });

    const r = await semEsperar(publishPost("w1", {
      connectionId: "mc1", postId: PECA_ID, platform: "instagram", format: "story",
      caption: "isto não pode ir para o contêiner de story",
      mediaUrl: "https://app.dioli/api/media/storyok?exp=1&sig=abc",
    } as never));

    expect(r.ok, r.ok ? "" : r.error).toBe(true);
    const chamada = graphPost.mock.calls.find(([path]) => String(path).endsWith("/media"));
    expect(chamada).toBeTruthy();
    expect(chamada![2] as Record<string, unknown>).not.toHaveProperty("caption");
  });
});

// ─── 2. content_publishing_limit ────────────────────────────────────────────

describe("content_publishing_limit — conferido antes de QUALQUER contêiner", () => {
  it("teto atingido recusa SEM criar contêiner", async () => {
    graphGet.mockImplementation(async (path: string) =>
      path.includes("content_publishing_limit")
        ? { quota_usage: 50, config: { quota_total: 50 } }
        : { status_code: "FINISHED" });

    const r = await semEsperar(publishPost("w1", {
      connectionId: "mc1", postId: PECA_ID, platform: "instagram", format: "feed",
      caption: "x", mediaUrl: "https://cdn.cliente.com/a.jpg",
    } as never));

    expect(r.ok).toBe(false);
    expect(r.error).toContain("teto diário de publicação da Meta atingido (50 de 50)");
    expect(graphPost).not.toHaveBeenCalled();
  });

  it("teto ainda com folga deixa passar", async () => {
    graphGetPadrao({ quota_usage: 49, config: { quota_total: 50 } });

    const r = await semEsperar(publishPost("w1", {
      connectionId: "mc1", postId: PECA_ID, platform: "instagram", format: "feed",
      caption: "x", mediaUrl: "https://cdn.cliente.com/a.jpg",
    } as never));

    expect(r.ok).toBe(true);
  });

  it("a CONSULTA do teto falhando é fail-closed — nada de publicar às cegas", async () => {
    graphGet.mockImplementation(async (path: string) => {
      if (path.includes("content_publishing_limit")) throw new FakeGraphError("ETIMEDOUT");
      return { status_code: "FINISHED" };
    });

    const r = await semEsperar(publishPost("w1", {
      connectionId: "mc1", postId: PECA_ID, platform: "instagram", format: "feed",
      caption: "x", mediaUrl: "https://cdn.cliente.com/a.jpg",
    } as never));

    expect(r.ok).toBe(false);
    expect(r.error).toContain("não consegui confirmar o teto diário");
    expect(graphPost).not.toHaveBeenCalled();
  });

  it("resposta em formato que não reconhecemos também é fail-closed", async () => {
    graphGet.mockImplementation(async (path: string) =>
      path.includes("content_publishing_limit") ? { algumaOutraCoisa: true } : { status_code: "FINISHED" });

    const r = await semEsperar(publishPost("w1", {
      connectionId: "mc1", postId: PECA_ID, platform: "instagram", format: "feed",
      caption: "x", mediaUrl: "https://cdn.cliente.com/a.jpg",
    } as never));

    expect(r.ok).toBe(false);
    expect(graphPost).not.toHaveBeenCalled();
  });
});

// ─── 3. Conferência da mídia de story ────────────────────────────────────────

describe("mídia de story fora de spec nunca chega a criar contêiner", () => {
  it("imagem com mime errado no MediaAsset barra ANTES do contêiner", async () => {
    db.mediaAsset.findUnique.mockResolvedValue({ mimeType: "image/png", sizeBytes: 200_000 });

    const r = await semEsperar(publishPost("w1", {
      connectionId: "mc1", postId: PECA_ID, platform: "instagram", format: "story",
      mediaUrl: "https://app.dioli/api/media/storypng?exp=1&sig=abc",
    } as never));

    expect(r.ok).toBe(false);
    expect(r.error).toContain("imagem de story fora do que a Meta aceita");
    expect(r.error).toContain("image/png");
    expect(graphPost).not.toHaveBeenCalled();
  });

  it("JPEG dentro do teto de 8 MB (lido do MediaAsset) publica normalmente", async () => {
    db.mediaAsset.findUnique.mockResolvedValue({ mimeType: "image/jpeg", sizeBytes: 500_000 });

    const r = await semEsperar(publishPost("w1", {
      connectionId: "mc1", postId: PECA_ID, platform: "instagram", format: "story",
      mediaUrl: "https://app.dioli/api/media/storyok?exp=1&sig=abc",
    } as never));

    expect(r.ok, r.ok ? "" : r.error).toBe(true);
  });

  it("imagem externa acima de 8 MB (lida pelo HEAD) barra antes do contêiner", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      headers: headersFalsos({ "content-type": "image/jpeg", "content-length": String(9 * 1024 * 1024) }),
    })));

    const r = await semEsperar(publishPost("w1", {
      connectionId: "mc1", postId: PECA_ID, platform: "instagram", format: "story",
      mediaUrl: "https://cdn.cliente.com/story-grande.jpg",
    } as never));

    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/MB/);
    expect(graphPost).not.toHaveBeenCalled();
  });

  it("vídeo MP4 sem codec conhecido é recusado — o registro da casa ainda não guarda codec", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      headers: headersFalsos({ "content-type": "video/mp4", "content-length": String(10 * 1024 * 1024) }),
    })));

    const r = await semEsperar(publishPost("w1", {
      connectionId: "mc1", postId: PECA_ID, platform: "instagram", format: "story",
      mediaUrl: "https://cdn.cliente.com/story.mp4",
    } as never));

    expect(r.ok).toBe(false);
    expect(r.error).toContain("não consegui conferir o codec");
    expect(graphPost).not.toHaveBeenCalled();
  });

  it("formato de vídeo que a Meta não aceita em story é recusado pelo MIME", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      headers: headersFalsos({ "content-type": "video/webm", "content-length": "1024" }),
    })));

    const r = await semEsperar(publishPost("w1", {
      connectionId: "mc1", postId: PECA_ID, platform: "instagram", format: "story",
      mediaUrl: "https://cdn.cliente.com/story.webm",
    } as never));

    expect(r.ok).toBe(false);
    expect(r.error).toContain("MP4 ou MOV");
    expect(graphPost).not.toHaveBeenCalled();
  });

  it("vídeo cujo tamanho não conseguimos confirmar (HEAD sem content-length) também recusa — nunca '0 bytes'", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      headers: headersFalsos({ "content-type": "video/mp4" }),
    })));

    const r = await semEsperar(publishPost("w1", {
      connectionId: "mc1", postId: PECA_ID, platform: "instagram", format: "story",
      mediaUrl: "https://cdn.cliente.com/story-sem-tamanho.mp4",
    } as never));

    expect(r.ok).toBe(false);
    expect(r.error).toContain("não consegui confirmar o tamanho do vídeo");
    expect(graphPost).not.toHaveBeenCalled();
  });
});
