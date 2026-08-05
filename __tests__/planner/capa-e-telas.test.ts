// "A CAPA É A TELA 1" — o invariante que subiu para produção em 05/08/2026 de
// manhã (commit 5247350) e que a edição pela tela ainda conseguia quebrar.
// Achado B3 da 7ª auditoria adversarial.
//
// Por que isto vira dano de verdade, e não só inconsistência de banco:
//   • `lib/agency/esteira/publicacao.ts:232` publica na Meta a partir de
//     `mediaUrlsJson` (as telas);
//   • o card do portal mostra `mediaUrl` (a capa).
// O Composer manda os dois como campos INDEPENDENTES. Gravados sem reconciliar,
// trocar ou apagar a tela 1 no editor deixa a capa apontando para uma arte que
// NÃO é a primeira do carrossel publicado: o cliente aprova uma imagem e sai
// outra, em nome dele. Hoje o único lugar da casa que percebe é
// `pecasIncompletas` (`reabrir-aprovacao.ts:601`) — reprovando o carrossel.
//
// O conserto é NO DADO, no servidor: consertar no Composer deixaria a rota
// aberta para qualquer outro chamador (esteira, backfill, script, curl).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  socialPost: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  clientRequestDb: { findFirst: vi.fn(), findUnique: vi.fn() },
  client: { findFirst: vi.fn(), findUnique: vi.fn() },
}));
const requireSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/auth/api-guard", () => ({ requireSession }));
vi.mock("@/lib/agency/persistence/portal-access-service", () => ({
  validatePortalAccess: vi.fn(),
  resolvePortalClient: vi.fn(),
}));

import { POST as criarPost } from "@/app/api/social-posts/route";
import { PATCH as editarPost } from "@/app/api/social-posts/[id]/route";

const EXISTENTE = {
  id: "sp1", workspaceId: "ws1", clientId: "cli1", clientRequestId: null,
  caption: "", networks: '["instagram"]', format: "carousel", pillar: null,
  mediaUrl: "/api/media/velha", mediaUrlsJson: JSON.stringify(["/api/media/velha", "/api/media/b"]),
  scenesJson: "[]", scriptJson: null, visibility: "compartilhado",
  scheduledFor: null, status: "scheduled",
  externalPostId: null, permalink: null, publishedAt: null, lastError: null,
  createdAt: new Date(), updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ session: { workspaceId: "ws1", email: "s@a.com" }, error: null });
  db.socialPost.findFirst.mockResolvedValue(EXISTENTE);
  db.socialPost.update.mockResolvedValue({ id: "sp1" });
  db.socialPost.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ ...EXISTENTE, ...data }));
  db.client.findFirst.mockResolvedValue({ id: "cli1" });
  db.clientRequestDb.findFirst.mockResolvedValue(null);
});

const ctx = { params: Promise.resolve({ id: "sp1" }) };
function patch(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/social-posts/sp1", {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}
function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/social-posts", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("PATCH /api/social-posts/[id] — a capa é reconciliada com a tela 1", () => {
  it("o chamador manda os dois TROCADOS: quem vence é a tela 1, não o mediaUrl do corpo", async () => {
    // Este é o caso exato do defeito: `mediaUrl` apontando para uma arte que
    // não é a primeira do carrossel. Antes, os dois eram gravados como vieram.
    await editarPost(patch({
      mediaUrl: "/api/media/tela-3",
      telas: ["/api/media/tela-1", "/api/media/tela-2", "/api/media/tela-3"],
    }), ctx);
    const data = db.socialPost.update.mock.calls[0]![0].data;
    expect(data.mediaUrl).toBe("/api/media/tela-1");
    expect(JSON.parse(data.mediaUrlsJson as string)[0]).toBe("/api/media/tela-1");
    expect(data.mediaUrl).toBe(JSON.parse(data.mediaUrlsJson as string)[0]);
  });

  it("APAGAR a tela 1 move a capa junto — o cliente não fica vendo uma arte que saiu do carrossel", async () => {
    await editarPost(patch({ telas: ["/api/media/b", "/api/media/c"] }), ctx);
    const data = db.socialPost.update.mock.calls[0]![0].data;
    expect(data.mediaUrl).toBe("/api/media/b");
  });

  it("REORDENAR as telas move a capa junto", async () => {
    await editarPost(patch({ telas: ["/api/media/b", "/api/media/velha"] }), ctx);
    expect(db.socialPost.update.mock.calls[0]![0].data.mediaUrl).toBe("/api/media/b");
  });

  it("`mediaUrlsJson` (o nome alternativo do mesmo campo) tem o mesmo tratamento", async () => {
    await editarPost(patch({ mediaUrl: "/api/media/x", mediaUrlsJson: ["/api/media/y", "/api/media/z"] }), ctx);
    expect(db.socialPost.update.mock.calls[0]![0].data.mediaUrl).toBe("/api/media/y");
  });

  it("lixo dentro da lista não vira capa — a tela 1 é a primeira STRING válida", async () => {
    await editarPost(patch({ telas: ["   ", "/api/media/real", "/api/media/outra"] }), ctx);
    expect(db.socialPost.update.mock.calls[0]![0].data.mediaUrl).toBe("/api/media/real");
  });

  // ── A OUTRA METADE: o que a trava NÃO pode atrapalhar ──────────────────────

  it("post SEM telas (feed simples): o mediaUrl do corpo continua mandando", async () => {
    await editarPost(patch({ mediaUrl: "/api/media/foto-unica" }), ctx);
    const data = db.socialPost.update.mock.calls[0]![0].data;
    expect(data.mediaUrl).toBe("/api/media/foto-unica");
    expect(data.mediaUrlsJson).toBeUndefined();
  });

  it("esvaziar as telas de propósito ([]) não força capa nenhuma", async () => {
    await editarPost(patch({ mediaUrl: "/api/media/capa-avulsa", telas: [] }), ctx);
    const data = db.socialPost.update.mock.calls[0]![0].data;
    expect(data.mediaUrlsJson).toBe("[]");
    expect(data.mediaUrl).toBe("/api/media/capa-avulsa");
  });

  it("limpar a capa (null) sem mexer nas telas continua permitido", async () => {
    await editarPost(patch({ mediaUrl: null }), ctx);
    expect(db.socialPost.update.mock.calls[0]![0].data.mediaUrl).toBeNull();
  });
});

describe("POST /api/social-posts — a peça já NASCE com a capa igual à tela 1", () => {
  it("criar carrossel com mediaUrl discordante: a tela 1 vence", async () => {
    await criarPost(post({
      clientId: "cli1", networks: ["instagram"], format: "carousel",
      mediaUrl: "/api/media/errada",
      telas: ["/api/media/t1", "/api/media/t2"],
    }));
    const data = db.socialPost.create.mock.calls[0]![0].data;
    expect(data.mediaUrl).toBe("/api/media/t1");
    expect(JSON.parse(data.mediaUrlsJson as string)[0]).toBe("/api/media/t1");
  });

  it("criar post simples (sem telas): o mediaUrl do corpo é respeitado", async () => {
    await criarPost(post({ clientId: "cli1", networks: ["instagram"], mediaUrl: "/api/media/foto" }));
    expect(db.socialPost.create.mock.calls[0]![0].data.mediaUrl).toBe("/api/media/foto");
  });

  it("sem telas e sem mediaUrl: null, não string vazia", async () => {
    await criarPost(post({ clientId: "cli1", networks: ["instagram"] }));
    expect(db.socialPost.create.mock.calls[0]![0].data.mediaUrl).toBeNull();
  });
});
