// 1C-C1 (27/09/2026) — collaborators em `client.ts`, parecer do `meta` (PODE
// COM AJUSTE, 27/09):
//
//   1. só em feed de imagem, carrossel e reels — NUNCA em story (ignorado e
//      registrado em `PublishResult.collaboratorsIgnorados`, nunca enviado);
//   2. 1 a 3 usernames, sem "@", `[A-Za-z0-9._]{1,30}` — recusa ANTES de
//      qualquer chamada de rede (nenhum `graphPost`);
//   3. no carrossel, vai no contêiner PAI, e a resposta crua fica em
//      `PublishResult.collabResponse` ("a confirmar no 1º uso real").
//
// Mesmo esqueleto de mocks de `publicacao-story-e-teto.test.ts`: a mesma
// suíte já prova o teto/backoff/story — este arquivo só acrescenta
// collaborators, sem repetir aquela cobertura.

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

import { publishPost } from "@/lib/integrations/meta/client";

const CONEXAO = { token: "tk", platform: "instagram" as const, externalId: "ig1", clientId: "cli1" };
const PECA_ID = "sp_collab_1";

const decisaoOriginal = process.env.PUBLICACAO_ORGANICA;

async function semEsperar<T>(p: Promise<T>): Promise<T> {
  const feito = p.then((v) => v, (e) => { throw e; });
  await vi.runAllTimersAsync();
  return feito;
}

function graphGetPadrao() {
  graphGet.mockImplementation(async (path: string) =>
    path.includes("content_publishing_limit")
      ? { quota_usage: 0, config: { quota_total: 50 } }
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
  let seq = 0;
  graphPost.mockImplementation(async () => ({ id: `c${++seq}` }));
  graphGetPadrao();
});

afterEach(() => {
  vi.useRealTimers();
  if (decisaoOriginal === undefined) delete process.env.PUBLICACAO_ORGANICA;
  else process.env.PUBLICACAO_ORGANICA = decisaoOriginal;
});

// ─── 1. NUNCA em story ───────────────────────────────────────────────────────

describe("collaborators — NUNCA em story", () => {
  // Mídia da PRÓPRIA casa (`/api/media/<id>`): a conferência de story lê o
  // `MediaAsset` do banco, sem HEAD — evita depender de `fetch`/DNS aqui,
  // que já tem suíte própria em `publicacao-story-e-teto.test.ts`.
  beforeEach(() => {
    db.mediaAsset.findUnique.mockResolvedValue({ mimeType: "image/jpeg", sizeBytes: 500_000 });
  });

  it("story com collaborators ignora o pedido (nunca chega ao contêiner) e registra no resultado", async () => {
    const r = await semEsperar(publishPost("w1", {
      connectionId: "mc1", postId: PECA_ID, platform: "instagram", format: "story",
      mediaUrl: "https://app.dioli/api/media/storyok?exp=1&sig=abc",
      collaborators: ["parceiro.oficial"],
    } as never));

    expect(r.ok, r.ok ? "" : r.error).toBe(true);
    expect(r.collaboratorsIgnorados).toEqual(["parceiro.oficial"]);
    const chamada = graphPost.mock.calls.find(([path]) => String(path).endsWith("/media"));
    expect(chamada![2] as Record<string, unknown>).not.toHaveProperty("collaborators");
  });

  it("story SEM collaborators não registra nada (não é um pedido descartado)", async () => {
    const r = await semEsperar(publishPost("w1", {
      connectionId: "mc1", postId: PECA_ID, platform: "instagram", format: "story",
      mediaUrl: "https://app.dioli/api/media/storyok?exp=1&sig=abc",
    } as never));
    expect(r.ok).toBe(true);
    expect(r.collaboratorsIgnorados).toBeUndefined();
  });
});

// ─── 2. Validação ANTES de qualquer chamada de rede ────────────────────────

describe("collaborators — validação recusa ANTES da Meta", () => {
  it("mais de 3 contas recusa sem criar nenhum contêiner", async () => {
    const r = await semEsperar(publishPost("w1", {
      connectionId: "mc1", postId: PECA_ID, platform: "instagram", format: "feed",
      caption: "x", mediaUrl: "https://cdn.cliente.com/a.jpg",
      collaborators: ["a", "b", "c", "d"],
    } as never));

    expect(r.ok).toBe(false);
    expect(r.error).toContain("no máximo 3 contas");
    expect(graphGet).not.toHaveBeenCalled();
    expect(graphPost).not.toHaveBeenCalled();
  });

  it("username com @ recusa antes da Meta", async () => {
    const r = await semEsperar(publishPost("w1", {
      connectionId: "mc1", postId: PECA_ID, platform: "instagram", format: "feed",
      caption: "x", mediaUrl: "https://cdn.cliente.com/a.jpg",
      collaborators: ["@parceiro"],
    } as never));

    expect(r.ok).toBe(false);
    expect(r.error).toContain("username inválido");
    expect(graphPost).not.toHaveBeenCalled();
  });

  it("username com caractere fora de [A-Za-z0-9._] recusa", async () => {
    const r = await semEsperar(publishPost("w1", {
      connectionId: "mc1", postId: PECA_ID, platform: "instagram", format: "feed",
      caption: "x", mediaUrl: "https://cdn.cliente.com/a.jpg",
      collaborators: ["parceiro oficial"],
    } as never));

    expect(r.ok).toBe(false);
    expect(r.error).toContain("username inválido");
  });

  it("username com mais de 30 caracteres recusa", async () => {
    const r = await semEsperar(publishPost("w1", {
      connectionId: "mc1", postId: PECA_ID, platform: "instagram", format: "feed",
      caption: "x", mediaUrl: "https://cdn.cliente.com/a.jpg",
      collaborators: ["a".repeat(31)],
    } as never));

    expect(r.ok).toBe(false);
    expect(r.error).toContain("username inválido");
  });

  it("1 a 3 usernames válidos passam", async () => {
    const r = await semEsperar(publishPost("w1", {
      connectionId: "mc1", postId: PECA_ID, platform: "instagram", format: "feed",
      caption: "x", mediaUrl: "https://cdn.cliente.com/a.jpg",
      collaborators: ["parceiro.oficial", "outro_parceiro", "terceiro123"],
    } as never));

    expect(r.ok, r.ok ? "" : r.error).toBe(true);
  });
});

// ─── 3. Feed / reel: vai no único contêiner ─────────────────────────────────

describe("collaborators — feed e reels vão no contêiner (único)", () => {
  it("feed manda collaborators no contêiner de mídia", async () => {
    const r = await semEsperar(publishPost("w1", {
      connectionId: "mc1", postId: PECA_ID, platform: "instagram", format: "feed",
      caption: "x", mediaUrl: "https://cdn.cliente.com/a.jpg",
      collaborators: ["parceiro.oficial"],
    } as never));

    expect(r.ok, r.ok ? "" : r.error).toBe(true);
    const chamada = graphPost.mock.calls.find(([path]) => String(path).endsWith("/media"));
    expect(JSON.parse((chamada![2] as Record<string, string>).collaborators)).toEqual(["parceiro.oficial"]);
    // A resposta crua da criação do contêiner fica disponível para conferência.
    expect(r.collabResponse).toBeTruthy();
  });

  it("reel manda collaborators no contêiner de mídia", async () => {
    const r = await semEsperar(publishPost("w1", {
      connectionId: "mc1", postId: PECA_ID, platform: "instagram", format: "reel",
      caption: "x", mediaUrl: "https://cdn.cliente.com/video.mp4",
      collaborators: ["parceiro.oficial"],
    } as never));

    expect(r.ok, r.ok ? "" : r.error).toBe(true);
    const chamada = graphPost.mock.calls.find(([path]) => String(path).endsWith("/media"));
    expect(JSON.parse((chamada![2] as Record<string, string>).collaborators)).toEqual(["parceiro.oficial"]);
  });

  it("sem collaborators, o contêiner não leva o parâmetro", async () => {
    const r = await semEsperar(publishPost("w1", {
      connectionId: "mc1", postId: PECA_ID, platform: "instagram", format: "feed",
      caption: "x", mediaUrl: "https://cdn.cliente.com/a.jpg",
    } as never));
    expect(r.ok, r.ok ? "" : r.error).toBe(true);
    const chamada = graphPost.mock.calls.find(([path]) => String(path).endsWith("/media"));
    expect(chamada![2] as Record<string, unknown>).not.toHaveProperty("collaborators");
    expect(r.collabResponse).toBeUndefined();
  });
});

// ─── 4. Carrossel: no contêiner PAI ─────────────────────────────────────────

describe("collaborators — carrossel vai no contêiner PAI", () => {
  it("os filhos do carrossel NÃO levam collaborators; o pai leva", async () => {
    const r = await semEsperar(publishPost("w1", {
      connectionId: "mc1", postId: PECA_ID, platform: "instagram", format: "carousel",
      caption: "x", mediaUrls: ["https://cdn.cliente.com/1.jpg", "https://cdn.cliente.com/2.jpg"],
      collaborators: ["parceiro.oficial"],
    } as never));

    expect(r.ok, r.ok ? "" : r.error).toBe(true);
    const chamadasDeMidia = graphPost.mock.calls.filter(([path]) => String(path).endsWith("/media"));
    // filho 1, filho 2, pai — nesta ordem.
    expect(chamadasDeMidia).toHaveLength(3);
    expect(chamadasDeMidia[0]![2] as Record<string, unknown>).not.toHaveProperty("collaborators");
    expect(chamadasDeMidia[1]![2] as Record<string, unknown>).not.toHaveProperty("collaborators");
    expect(JSON.parse((chamadasDeMidia[2]![2] as Record<string, string>).collaborators)).toEqual(["parceiro.oficial"]);
    // A resposta crua do PAI fica disponível — "a confirmar no 1º uso real".
    expect(r.collabResponse).toBeTruthy();
  });
});
