// Chat com o PM (adição do CEO, 03/08/2026): a gaveta do portal usa a infra
// PortalMessage existente. O que estes testes travam:
//   • mensagem do cliente nasce readByTeam=false — é ela que acende o badge
//     na caixa de entrada da agência; se nascesse lida, o PM nunca saberia que
//     o cliente falou;
//   • o cliente autentica por token OU pelo cookie httpOnly (A4);
//   • mensagem vazia não entra (400).
//
// ── Atualizado em 05/08/2026 ─────────────────────────────────────────────────
// A âncora da conversa mudou: a thread pertence ao CLIENTE, não à solicitação
// de briefing (ver `app/api/messages/conversa.ts`). Por isso a resolução passa
// por `clientRequestDb.findUnique` / `findMany` — e a mensagem sai carimbada
// com AS DUAS chaves quando as duas existem.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  portalMessage: { create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  clientRequestDb: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
  client: { findFirst: vi.fn() },
}));
const validatePortalAccess = vi.hoisted(() => vi.fn());
const requireSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/persistence/portal-access-service", () => ({ validatePortalAccess }));
vi.mock("@/lib/auth/api-guard", () => ({ requireSession }));

import { POST, GET } from "@/app/api/portal/messages/route";
import { PORTAL_COOKIE } from "@/lib/agency/persistence/portal-cookie";

const MSG_CRIADA = {
  id: "m1", authorRole: "client", authorName: "Foocci",
  body: "Oi, PM!", createdAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  // Token de uma solicitação que JÁ pertence a um cliente — o caso comum.
  validatePortalAccess.mockResolvedValue({ valid: true, record: { clientRequestId: "cr1", clientId: null } });
  db.clientRequestDb.findUnique.mockResolvedValue({ id: "cr1", clientId: "cli1" });
  db.clientRequestDb.findMany.mockResolvedValue([{ id: "cr1" }]);
  db.portalMessage.create.mockResolvedValue(MSG_CRIADA);
});

function post(body: Record<string, unknown>, cookie?: string): NextRequest {
  return new NextRequest("http://localhost/api/portal/messages", {
    method: "POST",
    body: JSON.stringify(body),
    ...(cookie ? { headers: { cookie } } : {}),
  });
}

describe("envio do cliente pela gaveta do PM", () => {
  it("via token: cria a mensagem com readByTeam=false (o PM precisa VER que chegou)", async () => {
    const res = await POST(post({ token: "tok-1", body: "Oi, PM!", authorName: "Foocci" }));
    expect(res.status).toBe(201);

    const data = db.portalMessage.create.mock.calls[0]![0].data;
    expect(data.authorRole).toBe("client");
    expect(data.readByTeam).toBe(false);
    expect(data.readByClient).toBe(true);
    // As DUAS chaves: a solicitação (compatibilidade) e o dono (a âncora nova).
    expect(data.clientRequestId).toBe("cr1");
    expect(data.clientId).toBe("cli1");
  });

  it("via cookie httpOnly (A4): mesmo resultado, sem token no corpo", async () => {
    const res = await POST(post({ body: "Oi, PM!" }, `${PORTAL_COOKIE}=tok-cookie`));
    expect(res.status).toBe(201);
    expect(validatePortalAccess).toHaveBeenCalledWith("tok-cookie");
    expect(db.portalMessage.create.mock.calls[0]![0].data.readByTeam).toBe(false);
  });

  it("mensagem vazia → 400, nada gravado", async () => {
    const res = await POST(post({ token: "tok-1", body: "   " }));
    expect(res.status).toBe(400);
    expect(db.portalMessage.create).not.toHaveBeenCalled();
  });

  it("token inválido → 403", async () => {
    validatePortalAccess.mockResolvedValue({ valid: false, reason: "revoked" });
    const res = await POST(post({ token: "tok-podre", body: "Oi" }));
    expect(res.status).toBe(403);
  });
});

describe("leitura da conversa pelo cookie", () => {
  it("GET sem query mas com cookie lista o thread do cliente", async () => {
    db.portalMessage.findMany.mockResolvedValue([{ ...MSG_CRIADA, authorRole: "team" }]);
    db.portalMessage.updateMany.mockResolvedValue({ count: 1 });

    const req = new NextRequest("http://localhost/api/portal/messages", {
      headers: { cookie: `${PORTAL_COOKIE}=tok-cookie` },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(validatePortalAccess).toHaveBeenCalledWith("tok-cookie");
    // Ao ver a conversa, as mensagens da equipe ficam lidas PARA O CLIENTE.
    expect(db.portalMessage.updateMany.mock.calls[0]![0].where.authorRole).toBe("team");
  });
});
