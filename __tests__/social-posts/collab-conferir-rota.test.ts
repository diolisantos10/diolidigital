// POST /api/social-posts/{id}/collab/conferir (1C-C1, 27/09/2026) — só
// `master` reconsulta; posse por workspace no PRÓPRIO `where`; falha na
// conferência devolve erro claro mas NUNCA apaga o que já estava gravado.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({ socialPost: { findFirst: vi.fn(), update: vi.fn() } }));
const requireSession = vi.hoisted(() => vi.fn());
const conexaoDoCliente = vi.hoisted(() => vi.fn());
const conferirCollaborators = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/auth/api-guard", () => ({ requireSession }));
vi.mock("@/lib/integrations/meta/connections", () => ({ conexaoDoCliente }));
vi.mock("@/lib/integrations/meta/collab", () => ({ conferirCollaborators }));

import { POST } from "@/app/api/social-posts/[id]/collab/conferir/route";

function req(): NextRequest {
  return new NextRequest("https://app.dioli.studio/api/social-posts/sp1/collab/conferir", { method: "POST" });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ session: { workspaceId: "ws1", role: "master" }, error: null });
  db.socialPost.findFirst.mockResolvedValue({
    id: "sp1", clientId: "cli1", externalPostId: "ig1",
    collabJson: JSON.stringify({ pedidos: ["parceiro.oficial"], enviadoEm: "2026-09-27T12:00:00Z" }),
  });
  conexaoDoCliente.mockResolvedValue({ token: "tk-cli1" });
  db.socialPost.update.mockResolvedValue({});
  // Default para os testes que não são SOBRE o resultado da conferência (ex.:
  // o de posse, abaixo) — sem isto, `vi.fn()` devolve `undefined` e a rota
  // quebra em `conferencia.ok` antes mesmo de chegar no que o teste mede.
  // Os testes de sucesso/falha sobrescrevem com o seu próprio `mockResolvedValue`.
  conferirCollaborators.mockResolvedValue({ ok: true, convites: [] });
});

it("posse por workspace no PRÓPRIO where — nunca numa comparação depois", async () => {
  await POST(req(), { params: Promise.resolve({ id: "sp1" }) });
  expect(db.socialPost.findFirst.mock.calls[0]![0].where).toMatchObject({ id: "sp1", workspaceId: "ws1" });
});

it("post de outro workspace: 404 (o where já não encontra a linha)", async () => {
  db.socialPost.findFirst.mockResolvedValue(null);
  const res = await POST(req(), { params: Promise.resolve({ id: "sp1" }) });
  expect(res.status).toBe(404);
});

it("sucesso: grava convites e conferidoEm, preservando pedidos/enviadoEm anteriores", async () => {
  conferirCollaborators.mockResolvedValue({
    ok: true, convites: [{ username: "parceiro.oficial", invite_status: "APPROVED" }],
  });
  const res = await POST(req(), { params: Promise.resolve({ id: "sp1" }) });
  expect(res.status).toBe(200);
  const gravado = JSON.parse(db.socialPost.update.mock.calls[0]![0].data.collabJson);
  expect(gravado.pedidos).toEqual(["parceiro.oficial"]); // preservado
  expect(gravado.convites).toEqual([{ username: "parceiro.oficial", invite_status: "APPROVED" }]);
  expect(typeof gravado.conferidoEm).toBe("string");
});

it("falha na conferência devolve erro (502) mas NÃO apaga pedidos/enviadoEm anteriores", async () => {
  conferirCollaborators.mockResolvedValue({ ok: false, error: "ETIMEDOUT" });
  const res = await POST(req(), { params: Promise.resolve({ id: "sp1" }) });
  expect(res.status).toBe(502);
  const gravado = JSON.parse(db.socialPost.update.mock.calls[0]![0].data.collabJson);
  expect(gravado.pedidos).toEqual(["parceiro.oficial"]);
  expect(gravado.erroDaConferencia).toBe("ETIMEDOUT");
});

it("sem externalPostId: 422, nunca chama a Meta", async () => {
  db.socialPost.findFirst.mockResolvedValue({ id: "sp1", clientId: "cli1", externalPostId: null, collabJson: null });
  const res = await POST(req(), { params: Promise.resolve({ id: "sp1" }) });
  expect(res.status).toBe(422);
  expect(conferirCollaborators).not.toHaveBeenCalled();
});

it("sem conexão Instagram com token: 422", async () => {
  conexaoDoCliente.mockResolvedValue(null);
  const res = await POST(req(), { params: Promise.resolve({ id: "sp1" }) });
  expect(res.status).toBe(422);
  expect(conferirCollaborators).not.toHaveBeenCalled();
});

// ── SEGURANÇA, 28/09/2026 — as duas metades do achado pequeno ─────────────

it("caso plantado: sessão com clientId (portal / User legado) — 403, nunca chama a Meta", async () => {
  requireSession.mockResolvedValue({
    session: { workspaceId: "ws1", role: "master", userId: "u1", clientId: "cli-outro" },
    error: null,
  });
  const res = await POST(req(), { params: Promise.resolve({ id: "sp1" }) });
  expect(res.status).toBe(403);
  expect(db.socialPost.findFirst).not.toHaveBeenCalled();
  expect(conferirCollaborators).not.toHaveBeenCalled();
});

it("caso plantado: 13ª chamada no mesmo minuto — 429, NÃO chama a Meta de novo", async () => {
  requireSession.mockResolvedValue({
    session: { workspaceId: "ws1", role: "master", userId: "rate-teto" },
    error: null,
  });
  for (let i = 0; i < 12; i++) {
    const ok = await POST(req(), { params: Promise.resolve({ id: "sp1" }) });
    expect(ok.status).toBe(200);
  }
  conferirCollaborators.mockClear();
  const estourou = await POST(req(), { params: Promise.resolve({ id: "sp1" }) });
  expect(estourou.status).toBe(429);
  expect(conferirCollaborators).not.toHaveBeenCalled();
});

it("caso limpo: sessão normal de master, dentro do teto — continua 200 (a trava não inventa problema)", async () => {
  requireSession.mockResolvedValue({
    session: { workspaceId: "ws1", role: "master", userId: "u-limpo" },
    error: null,
  });
  const res = await POST(req(), { params: Promise.resolve({ id: "sp1" }) });
  expect(res.status).toBe(200);
  expect(conferirCollaborators).toHaveBeenCalledOnce();
});
