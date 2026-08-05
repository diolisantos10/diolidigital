// O defeito silencioso do Planner: post criado para CLIENTE DIRETO nascia
// invisível ao cliente.
//
// A regra antiga era `clientRequestId ? "compartilhado" : "interno"`. Cliente
// criado direto (sem briefing — o caso da Foocci) não tem ClientRequestDb, logo
// todo post programado pela agência nascia "interno" e o portal dele ficava
// vazio. Ninguém errava, ninguém era avisado: o mês inteiro sumia.
//
// Estes testes travam o contrato novo: a visibilidade é DECLARADA pela tela,
// com duas guardas (sem dono nunca vira "compartilhado"; valor fora do contrato
// cai no comportamento antigo).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  socialPost: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  clientRequestDb: { findFirst: vi.fn() },
}));
const requireSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/auth/api-guard", () => ({ requireSession }));
vi.mock("@/lib/agency/persistence/portal-access-service", () => ({ validatePortalAccess: vi.fn() }));

import { POST } from "@/app/api/social-posts/route";
import { PATCH } from "@/app/api/social-posts/[id]/route";

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/social-posts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const CRIADO = {
  id: "sp1", clientId: "c1", clientRequestId: null, caption: "", networks: "[]",
  format: "feed", pillar: null, mediaUrl: null, mediaUrlsJson: "[]", scenesJson: "[]",
  scriptJson: null, visibility: "compartilhado", scheduledFor: null, status: "scheduled",
  externalPostId: null, permalink: null, publishedAt: null, lastError: null,
  createdAt: new Date(), updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ session: { workspaceId: "ws1", email: "a@b.c" }, error: null });
  db.clientRequestDb.findFirst.mockResolvedValue(null); // cliente DIRETO: sem solicitação
  db.socialPost.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ ...CRIADO, ...data }));
});

describe("POST /api/social-posts — quem vê a peça", () => {
  it("cliente DIRETO com 'compartilhado' pedido pela tela: a peça aparece no portal", async () => {
    await POST(req({ clientId: "c1", networks: ["instagram"], visibility: "compartilhado" }));
    expect(db.socialPost.create.mock.calls[0]![0].data.visibility).toBe("compartilhado");
  });

  it("SEM cliente, 'compartilhado' não é obedecido — não existe portal onde a peça apareça", async () => {
    await POST(req({ networks: ["instagram"], visibility: "compartilhado" }));
    expect(db.socialPost.create.mock.calls[0]![0].data.visibility).toBe("interno");
  });

  it("'interno' pedido explicitamente é respeitado mesmo com cliente", async () => {
    await POST(req({ clientId: "c1", networks: ["instagram"], visibility: "interno" }));
    expect(db.socialPost.create.mock.calls[0]![0].data.visibility).toBe("interno");
  });

  it("sem pedido explícito, a regra antiga vale (compatibilidade da esteira)", async () => {
    db.clientRequestDb.findFirst.mockResolvedValue({ id: "cr1" });
    await POST(req({ clientId: "c1", networks: ["instagram"] }));
    expect(db.socialPost.create.mock.calls[0]![0].data.visibility).toBe("compartilhado");
    db.socialPost.create.mockClear();
    db.clientRequestDb.findFirst.mockResolvedValue(null);
    await POST(req({ networks: ["instagram"] }));
    expect(db.socialPost.create.mock.calls[0]![0].data.visibility).toBe("interno");
  });

  it("status fora do contrato do schema não é gravado", async () => {
    await POST(req({ networks: ["instagram"], status: "no-ar" }));
    expect(db.socialPost.create.mock.calls[0]![0].data.status).toBe("scheduled");
  });

  it("as telas e as cenas do carrossel chegam ao banco pela criação", async () => {
    await POST(req({
      networks: ["instagram"], format: "carousel",
      telas: ["/api/media/a", "", "/api/media/b"], cenas: ["capa", "miolo"],
    }));
    const data = db.socialPost.create.mock.calls[0]![0].data;
    expect(JSON.parse(data.mediaUrlsJson)).toEqual(["/api/media/a", "/api/media/b"]);
    expect(JSON.parse(data.scenesJson)).toEqual(["capa", "miolo"]);
  });
});

describe("PATCH /api/social-posts/[id] — corrigir pela interface", () => {
  const ctx = { params: Promise.resolve({ id: "sp1" }) };
  function patch(body: unknown): NextRequest {
    return new NextRequest("http://localhost/api/social-posts/sp1", {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
  }

  it("compartilhar uma peça de cliente direto funciona (é a correção em lote da tela)", async () => {
    db.socialPost.findFirst.mockResolvedValue({ ...CRIADO, visibility: "interno" });
    db.socialPost.update.mockResolvedValue({ id: "sp1" });
    const res = await PATCH(patch({ visibility: "compartilhado" }), ctx);
    expect(res.status).toBe(200);
    expect(db.socialPost.update.mock.calls[0]![0].data.visibility).toBe("compartilhado");
  });

  it("compartilhar peça SEM dono é recusado com motivo em português", async () => {
    db.socialPost.findFirst.mockResolvedValue({ ...CRIADO, clientId: null, clientRequestId: null, visibility: "interno" });
    const res = await PATCH(patch({ visibility: "compartilhado" }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/cliente/i);
    expect(db.socialPost.update).not.toHaveBeenCalled();
  });

  it("trocar o cliente no editor não é mais ignorado em silêncio", async () => {
    db.socialPost.findFirst.mockResolvedValue({ ...CRIADO, clientId: "c1" });
    db.clientRequestDb.findFirst.mockResolvedValue({ id: "cr9" });
    db.socialPost.update.mockResolvedValue({ id: "sp1" });
    await PATCH(patch({ clientId: "c2" }), ctx);
    const data = db.socialPost.update.mock.calls[0]![0].data;
    expect(data.clientId).toBe("c2");
    expect(data.clientRequestId).toBe("cr9");
  });

  it("status inválido é recusado em vez de virar um estado que nenhuma tela desenha", async () => {
    db.socialPost.findFirst.mockResolvedValue(CRIADO);
    const res = await PATCH(patch({ status: "publicadoo" }), ctx);
    expect(res.status).toBe(400);
    expect(db.socialPost.update).not.toHaveBeenCalled();
  });
});
