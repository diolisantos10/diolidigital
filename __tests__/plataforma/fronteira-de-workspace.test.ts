// A FRONTEIRA DO INQUILINO — achado B2 da 7ª auditoria adversarial.
//
// A corrente que existia, inteira: staff autenticada no workspace A mandava um
// PATCH com o `clientId` de um cliente do workspace B. O `clientId` era gravado
// SEM conferência; o `clientRequestId` era resolvido por `findFirst({clientId})`
// também sem workspace; o fail-closed de `visibility` olhava e via "tem dono",
// então aprovava `compartilhado` — e a peça do workspace A aparecia no portal
// do cliente do workspace B.
//
// Ninguém errava na tela. Nenhum erro em log. Um id digitado num campo e o
// trabalho de um cliente aparecia para outro.
//
// AS DUAS METADES, sempre:
//   • cliente de OUTRO workspace → 400 e NADA gravado (nem `create`, nem
//     `update`, nem arquivo em disco);
//   • cliente do PRÓPRIO workspace → grava normal, sem atrito para quem é dono.
//
// E o ramo de PORTAL do GET: `clientRequestId` sozinho é um id global. Filtrar
// só por ele é apostar que nenhum id de outro inquilino jamais encosta ali.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  socialPost: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  clientRequestDb: { findFirst: vi.fn(), findUnique: vi.fn() },
  client: { findFirst: vi.fn(), findUnique: vi.fn() },
  agencyWorkspace: { findFirst: vi.fn() },
}));
const requireSession = vi.hoisted(() => vi.fn());
const validatePortalAccess = vi.hoisted(() => vi.fn());
const getSession = vi.hoisted(() => vi.fn());
const guardarArquivo = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/auth/api-guard", () => ({ requireSession }));
vi.mock("@/lib/auth/session", () => ({ getSession }));
vi.mock("@/lib/agency/persistence/portal-access-service", () => ({
  validatePortalAccess,
  resolvePortalClient: vi.fn(),
}));
vi.mock("@/lib/agency/media/armazenamento", () => ({
  guardarArquivo,
  MAX_BYTES_POR_ARQUIVO: 25 * 1024 * 1024,
}));

import { POST as criarPost, GET as listarPosts } from "@/app/api/social-posts/route";
import { PATCH as editarPost } from "@/app/api/social-posts/[id]/route";
import { POST as enviarMidia } from "@/app/api/media/route";

const POST_EXISTENTE = {
  id: "sp1", workspaceId: "ws-A", clientId: "cli-A", clientRequestId: "cr-A",
  caption: "", networks: "[]", format: "feed", pillar: null,
  mediaUrl: null, mediaUrlsJson: "[]", scenesJson: "[]", scriptJson: null,
  visibility: "interno", scheduledFor: null, status: "scheduled",
  externalPostId: null, permalink: null, publishedAt: null, lastError: null,
  createdAt: new Date(), updatedAt: new Date(),
};

/** O banco de verdade: `cli-A` mora no workspace A, `cli-B` no workspace B.
 *  O `findFirst` com `workspaceId` no where é o que separa um do outro — se a
 *  rota esquecer o filtro, este mock devolve o cliente e o teste passa; por
 *  isso ele HONRA o where, como o Prisma faria. */
function bancoDeDoisInquilinos() {
  const clientes: Record<string, string> = { "cli-A": "ws-A", "cli-A2": "ws-A", "cli-B": "ws-B" };
  db.client.findFirst.mockImplementation(({ where }: { where: { id: string; workspaceId?: string } }) => {
    const dono = clientes[where.id];
    if (!dono) return Promise.resolve(null);
    if (where.workspaceId && where.workspaceId !== dono) return Promise.resolve(null);
    return Promise.resolve({ id: where.id });
  });
  const pedidos: Record<string, string> = { "cr-A": "ws-A", "cr-B": "ws-B" };
  db.clientRequestDb.findFirst.mockImplementation(({ where }: { where: { id?: string; clientId?: string; workspaceId?: string } }) => {
    const id = where.id
      ?? (where.clientId === "cli-A" || where.clientId === "cli-A2" ? "cr-A"
        : where.clientId === "cli-B" ? "cr-B" : null);
    if (!id) return Promise.resolve(null);
    const dono = pedidos[id];
    if (where.workspaceId && where.workspaceId !== dono) return Promise.resolve(null);
    return Promise.resolve({ id, workspaceId: dono });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ session: { workspaceId: "ws-A", email: "staff@a.com" }, error: null });
  getSession.mockResolvedValue({ workspaceId: "ws-A", email: "staff@a.com" });
  db.socialPost.findFirst.mockResolvedValue(POST_EXISTENTE);
  db.socialPost.update.mockResolvedValue({ id: "sp1" });
  db.socialPost.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ ...POST_EXISTENTE, ...data }));
  db.socialPost.findMany.mockResolvedValue([]);
  guardarArquivo.mockResolvedValue({ ok: true, arquivo: { id: "m1" } });
  bancoDeDoisInquilinos();
});

function json(url: string, method: string, body: unknown): NextRequest {
  return new NextRequest(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

// ── PATCH /api/social-posts/[id] ─────────────────────────────────────────────

describe("PATCH /api/social-posts/[id] — o clientId do corpo é conferido contra o workspace", () => {
  const ctx = { params: Promise.resolve({ id: "sp1" }) };

  it("cliente de OUTRO workspace: 400 e NADA gravado", async () => {
    const res = await editarPost(json("http://localhost/api/social-posts/sp1", "PATCH", { clientId: "cli-B" }), ctx);
    expect(res.status).toBe(400);
    expect(db.socialPost.update).not.toHaveBeenCalled();
  });

  it("a peça NÃO chega a virar 'compartilhado' pelo cliente do vizinho — a corrente inteira quebra no primeiro elo", async () => {
    const res = await editarPost(
      json("http://localhost/api/social-posts/sp1", "PATCH", { clientId: "cli-B", visibility: "compartilhado" }),
      ctx,
    );
    expect(res.status).toBe(400);
    expect(db.socialPost.update).not.toHaveBeenCalled();
  });

  it("TROCAR para outro cliente do PRÓPRIO workspace: grava normal, e a solicitação vinculada também é do workspace", async () => {
    const res = await editarPost(json("http://localhost/api/social-posts/sp1", "PATCH", { clientId: "cli-A2" }), ctx);
    expect(res.status).toBe(200);
    expect(db.socialPost.update).toHaveBeenCalledOnce();
    expect(db.socialPost.update.mock.calls[0]![0].data.clientId).toBe("cli-A2");
    // A resolução da solicitação leva o workspace no where — id global não basta.
    const buscaDoPedido = db.clientRequestDb.findFirst.mock.calls.at(-1)?.[0];
    expect(buscaDoPedido?.where?.workspaceId).toBe("ws-A");
  });

  it("limpar o cliente (null) continua permitido — a trava é sobre id de outro, não sobre esvaziar", async () => {
    db.socialPost.findFirst.mockResolvedValue({ ...POST_EXISTENTE, visibility: "interno" });
    const res = await editarPost(json("http://localhost/api/social-posts/sp1", "PATCH", { clientId: null }), ctx);
    expect(res.status).toBe(200);
    expect(db.socialPost.update.mock.calls[0]![0].data.clientId).toBeNull();
  });
});

// ── POST /api/social-posts ───────────────────────────────────────────────────

describe("POST /api/social-posts — criar peça para cliente do vizinho é recusado", () => {
  it("clientId de outro workspace: 400 e nenhuma peça criada", async () => {
    const res = await criarPost(json("http://localhost/api/social-posts", "POST", {
      clientId: "cli-B", networks: ["instagram"], visibility: "compartilhado",
    }));
    expect(res.status).toBe(400);
    expect(db.socialPost.create).not.toHaveBeenCalled();
  });

  it("clientRequestId de outro workspace também é recusado — a outra porta do mesmo cômodo", async () => {
    const res = await criarPost(json("http://localhost/api/social-posts", "POST", {
      clientRequestId: "cr-B", networks: ["instagram"],
    }));
    expect(res.status).toBe(400);
    expect(db.socialPost.create).not.toHaveBeenCalled();
  });

  it("cliente do PRÓPRIO workspace: cria normal", async () => {
    const res = await criarPost(json("http://localhost/api/social-posts", "POST", {
      clientId: "cli-A", networks: ["instagram"], visibility: "compartilhado",
    }));
    expect(res.status).toBe(201);
    expect(db.socialPost.create).toHaveBeenCalledOnce();
    expect(db.socialPost.create.mock.calls[0]![0].data.clientId).toBe("cli-A");
    expect(db.socialPost.create.mock.calls[0]![0].data.workspaceId).toBe("ws-A");
  });
});

// ── GET /api/social-posts (ramo de portal) ───────────────────────────────────

describe("GET /api/social-posts com token — o workspace entra no filtro", () => {
  it("a consulta do portal filtra por workspaceId, não só por clientRequestId", async () => {
    validatePortalAccess.mockResolvedValue({ valid: true, record: { clientRequestId: "cr-A", clientId: null } });
    db.clientRequestDb.findUnique.mockResolvedValue({ id: "cr-A", workspaceId: "ws-A" });
    const res = await listarPosts(new NextRequest("http://localhost/api/social-posts?token=tok"));
    expect(res.status).toBe(200);
    const where = db.socialPost.findMany.mock.calls[0]![0].where;
    expect(where).toMatchObject({ workspaceId: "ws-A", clientRequestId: "cr-A", visibility: "compartilhado" });
  });

  it("workspace não resolvido: lista vazia, nunca consulta larga (fail-closed)", async () => {
    validatePortalAccess.mockResolvedValue({ valid: true, record: { clientRequestId: "cr-orfa", clientId: null } });
    db.clientRequestDb.findUnique.mockResolvedValue(null);
    const res = await listarPosts(new NextRequest("http://localhost/api/social-posts?token=tok"));
    expect((await res.json()).posts).toEqual([]);
    expect(db.socialPost.findMany).not.toHaveBeenCalled();
  });
});

// ── POST /api/media ──────────────────────────────────────────────────────────

describe("POST /api/media — 'equipe autenticada' não é 'dona de qualquer id'", () => {
  function form(campos: Record<string, string>): NextRequest {
    const fd = new FormData();
    fd.append("file", new Blob(["conteudo do arquivo"], { type: "image/png" }), "arte.png");
    for (const [k, v] of Object.entries(campos)) fd.append(k, v);
    return new NextRequest("http://localhost/api/media", { method: "POST", body: fd });
  }

  it("anexar em cliente de OUTRO workspace: 400 e nada guardado em disco", async () => {
    const res = await enviarMidia(form({ clientId: "cli-B" }));
    expect(res.status).toBe(400);
    expect(guardarArquivo).not.toHaveBeenCalled();
  });

  it("anexar em solicitação de OUTRO workspace: 400 e nada guardado", async () => {
    const res = await enviarMidia(form({ clientRequestId: "cr-B" }));
    expect(res.status).toBe(400);
    expect(guardarArquivo).not.toHaveBeenCalled();
  });

  it("cliente do PRÓPRIO workspace: guarda normal", async () => {
    const res = await enviarMidia(form({ clientId: "cli-A" }));
    expect(res.status).toBe(201);
    expect(guardarArquivo).toHaveBeenCalledOnce();
    expect(guardarArquivo.mock.calls[0]![0]).toMatchObject({ clientId: "cli-A", workspaceId: "ws-A" });
  });

  it("sem clientId nenhum continua funcionando — a trava é sobre id alheio", async () => {
    const res = await enviarMidia(form({}));
    expect(res.status).toBe(201);
    expect(guardarArquivo.mock.calls[0]![0]).toMatchObject({ workspaceId: "ws-A", clientId: null });
  });
});
