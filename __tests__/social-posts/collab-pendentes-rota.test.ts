// GET /api/social-posts/collab-pendentes (1C-C1, 27/09/2026) — o painel dos
// convites de colaboração ainda `pending`.
//
// Provas:
//   • posse por WORKSPACE — post de outro workspace nunca aparece;
//   • só entra post com pelo menos um convite `invite_status` pendente;
//   • `collabJson` ausente/corrompido nunca derruba a rota;
//   • sem sessão → 401.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const db = vi.hoisted(() => ({
  socialPost: { findMany: vi.fn() },
  client: { findMany: vi.fn() },
}));
const requireSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/auth/api-guard", () => ({ requireSession }));

import { GET } from "@/app/api/social-posts/collab-pendentes/route";

function req(): NextRequest {
  return new NextRequest("https://app.dioli.studio/api/social-posts/collab-pendentes");
}

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ session: { workspaceId: "ws1", role: "master" }, error: null });
  db.client.findMany.mockResolvedValue([{ id: "cli1", name: "Padaria do João" }]);
});

describe("posse por workspace", () => {
  it("a consulta filtra por workspaceId da sessão", async () => {
    db.socialPost.findMany.mockResolvedValue([]);
    await GET(req());
    expect(db.socialPost.findMany.mock.calls[0]![0].where.workspaceId).toBe("ws1");
  });

  it("sem sessão devolve 401 e nem consulta o banco", async () => {
    requireSession.mockResolvedValue({
      session: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(db.socialPost.findMany).not.toHaveBeenCalled();
  });
});

describe("só entra post com invite_status pendente", () => {
  it("post com convite APPROVED (nenhum pending) fica de fora", async () => {
    db.socialPost.findMany.mockResolvedValue([{
      id: "sp1", clientId: "cli1", permalink: "https://ig/p/1", publishedAt: new Date("2026-09-27T12:00:00Z"),
      collabJson: JSON.stringify({ convites: [{ username: "parceiro.oficial", invite_status: "APPROVED" }] }),
    }]);
    const res = await GET(req());
    const body = await res.json();
    expect(body.posts).toEqual([]);
  });

  it("post com pelo menos um convite pending entra, com cliente e contas", async () => {
    db.socialPost.findMany.mockResolvedValue([{
      id: "sp1", clientId: "cli1", permalink: "https://ig/p/1", publishedAt: new Date("2026-09-27T12:00:00Z"),
      collabJson: JSON.stringify({
        convites: [
          { username: "parceiro.oficial", invite_status: "PENDING" },
          { username: "outro", invite_status: "APPROVED" },
        ],
      }),
    }]);
    const res = await GET(req());
    const body = await res.json();
    expect(body.posts).toHaveLength(1);
    expect(body.posts[0]).toMatchObject({
      postId: "sp1", clientId: "cli1", cliente: "Padaria do João", permalink: "https://ig/p/1",
    });
    expect(body.posts[0].contas).toHaveLength(2);
  });

  it("invite_status em minúsculo também conta como pendente", async () => {
    db.socialPost.findMany.mockResolvedValue([{
      id: "sp1", clientId: "cli1", permalink: null, publishedAt: null,
      collabJson: JSON.stringify({ convites: [{ username: "a", invite_status: "pending" }] }),
    }]);
    const res = await GET(req());
    const body = await res.json();
    expect(body.posts).toHaveLength(1);
  });

  it("collabJson corrompido não derruba a rota — só não entra na lista", async () => {
    db.socialPost.findMany.mockResolvedValue([{
      id: "sp1", clientId: "cli1", permalink: null, publishedAt: null,
      collabJson: "{ isto não é json",
    }]);
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.posts).toEqual([]);
  });

  it("banco fora do ar devolve 503, não quebra", async () => {
    db.socialPost.findMany.mockRejectedValue(new Error("db down"));
    const res = await GET(req());
    expect(res.status).toBe(503);
  });
});
