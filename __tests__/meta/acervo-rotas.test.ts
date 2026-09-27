// acervo-rotas.test.ts — a guarda das três rotas do acervo (ficha 1B-B1/B1c,
// 27/09/2026): POST .../acervo/importar, GET .../acervo, PATCH .../acervo/[postId].
//
// Teste CURTO de guarda, como pedido: portal (sessão com `clientId`) recusado,
// e cliente de OUTRO workspace devolve 404 — nunca 403 (403 confirmaria que o
// id existe em outra conta; ver `posse-do-cliente.ts`). `importarAcervo` e
// `marcarReferencia` são mockados: o que se prova aqui é a GUARDA, não a
// importação de verdade (essa já tem `acervo.test.ts`).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const requireSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/api-guard", () => ({ requireSession }));

vi.mock("@/lib/security/navegacao-cross-site", () => ({
  deveBloquearMutacaoCrossSite: () => false,
}));

const db = vi.hoisted(() => ({
  client: { findFirst: vi.fn(), findUnique: vi.fn() },
  acervoPost: { findMany: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const importarAcervo = vi.hoisted(() => vi.fn());
const marcarReferencia = vi.hoisted(() => vi.fn());
vi.mock("@/lib/integrations/meta/acervo", () => ({ importarAcervo, marcarReferencia }));

import { POST as importar } from "@/app/api/agency/clients/[id]/acervo/importar/route";
import { GET as listarAcervo } from "@/app/api/agency/clients/[id]/acervo/route";
import { PATCH as marcarPost } from "@/app/api/agency/clients/[id]/acervo/[postId]/route";

/** `cli-A` mora no workspace A, `cli-B` no workspace B — o mesmo desenho de
 *  `fronteira-de-workspace.test.ts`: o mock HONRA o `where.workspaceId`, como
 *  o Prisma faria, então uma rota que "esquecesse" o filtro passaria aqui. */
function bancoDeDoisInquilinos(): void {
  const donos: Record<string, string> = { "cli-A": "ws-A", "cli-B": "ws-B" };
  db.client.findFirst.mockImplementation(
    async ({ where }: { where: { id: string; workspaceId?: string } }) => {
      const dono = donos[where.id];
      if (!dono) return null;
      if (where.workspaceId && where.workspaceId !== dono) return null;
      return { id: where.id };
    },
  );
  db.client.findUnique.mockResolvedValue({ acervoImportadoEm: null });
}

function sessaoDe(workspaceId: string, role = "master", clientId?: string) {
  return { userId: "u1", email: "quem@dioli.studio", name: "Quem", role, workspaceId, clientId };
}

const ctxCliente = (id: string) => ({ params: Promise.resolve({ id }) });
const ctxPost = (id: string, postId: string) => ({ params: Promise.resolve({ id, postId }) });

function postJson(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
function patchJson(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  bancoDeDoisInquilinos();
  db.acervoPost.findMany.mockResolvedValue([]);
  importarAcervo.mockResolvedValue({
    ok: true, importados: 0, jaExistiam: 0, semInsights: 0, midiasBaixadas: 0, falhasDeMidia: [],
  });
  marcarReferencia.mockResolvedValue({ ok: true });
});

describe("GET /acervo", () => {
  it("🔒 sessão de PORTAL (com clientId) é recusada — esta ferramenta é interna, não de entrega", async () => {
    requireSession.mockResolvedValue({ session: sessaoDe("ws-A", "client", "cli-A"), error: null });
    const res = await listarAcervo(new NextRequest("http://localhost/x"), ctxCliente("cli-A"));
    expect(res.status).toBe(403);
  });

  it("🔒 cliente de OUTRO workspace devolve 404, nunca 403", async () => {
    requireSession.mockResolvedValue({ session: sessaoDe("ws-A"), error: null });
    const res = await listarAcervo(new NextRequest("http://localhost/x"), ctxCliente("cli-B"));
    expect(res.status).toBe(404);
  });

  it("✅ o dono legítimo lê a grade normalmente", async () => {
    requireSession.mockResolvedValue({ session: sessaoDe("ws-A"), error: null });
    const res = await listarAcervo(new NextRequest("http://localhost/x"), ctxCliente("cli-A"));
    expect(res.status).toBe(200);
    expect((await res.json()).posts).toEqual([]);
  });
});

describe("POST /acervo/importar", () => {
  it("🔒 sessão de PORTAL é recusada", async () => {
    requireSession.mockResolvedValue({ session: sessaoDe("ws-A", "client", "cli-A"), error: null });
    const res = await importar(postJson("http://localhost/x", {}), ctxCliente("cli-A"));
    expect(res.status).toBe(403);
    expect(importarAcervo).not.toHaveBeenCalled();
  });

  it("🔒 cliente de OUTRO workspace devolve 404, e NÃO chama importarAcervo", async () => {
    requireSession.mockResolvedValue({ session: sessaoDe("ws-A"), error: null });
    const res = await importar(postJson("http://localhost/x", {}), ctxCliente("cli-B"));
    expect(res.status).toBe(404);
    expect(importarAcervo).not.toHaveBeenCalled();
  });

  it("🔒 papel que não é master é recusado (403), antes de tocar no cliente", async () => {
    requireSession.mockResolvedValue({
      session: null,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });
    const res = await importar(postJson("http://localhost/x", {}), ctxCliente("cli-A"));
    expect(res.status).toBe(403);
  });

  it("✅ master do próprio workspace importa normalmente", async () => {
    requireSession.mockResolvedValue({ session: sessaoDe("ws-A"), error: null });
    const res = await importar(postJson("http://localhost/x", { forcar: true }), ctxCliente("cli-A"));
    expect(res.status).toBe(200);
    expect(importarAcervo).toHaveBeenCalledWith({ workspaceId: "ws-A", clientId: "cli-A", forcar: true });
  });
});

describe("PATCH /acervo/[postId]", () => {
  it("🔒 sessão de PORTAL é recusada", async () => {
    requireSession.mockResolvedValue({ session: sessaoDe("ws-A", "client", "cli-A"), error: null });
    const res = await marcarPost(
      patchJson("http://localhost/x", { referencia: true }),
      ctxPost("cli-A", "ap1"),
    );
    expect(res.status).toBe(403);
    expect(marcarReferencia).not.toHaveBeenCalled();
  });

  it("🔒 cliente de OUTRO workspace devolve 404, e NÃO chama marcarReferencia", async () => {
    requireSession.mockResolvedValue({ session: sessaoDe("ws-A"), error: null });
    const res = await marcarPost(
      patchJson("http://localhost/x", { referencia: true }),
      ctxPost("cli-B", "ap1"),
    );
    expect(res.status).toBe(404);
    expect(marcarReferencia).not.toHaveBeenCalled();
  });

  it("✅ master do próprio workspace marca normalmente", async () => {
    requireSession.mockResolvedValue({ session: sessaoDe("ws-A"), error: null });
    const res = await marcarPost(
      patchJson("http://localhost/x", { referencia: true, familiaLayout: "radar" }),
      ctxPost("cli-A", "ap1"),
    );
    expect(res.status).toBe(200);
    expect(marcarReferencia).toHaveBeenCalledWith({
      workspaceId: "ws-A", clientId: "cli-A", acervoPostId: "ap1", referencia: true, familiaLayout: "radar",
    });
  });
});
