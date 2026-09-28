// GET /api/integracoes/cityjobs/posts/{idExterno} — auth HMAC do corpo VAZIO.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({ client: { findUnique: vi.fn() } }));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const rateLimit = vi.hoisted(() => vi.fn(() => ({ allowed: true, retryAfter: 0 })));
vi.mock("@/lib/security/rate-limit", () => ({ rateLimit }));

const consultarPost = vi.hoisted(() => vi.fn());
vi.mock("@/lib/integracoes/cityjobs/posts", () => ({ consultarPost }));

import { cabecalhoDaAssinatura } from "@/lib/integracoes/cityjobs/assinatura";
import { GET } from "@/app/api/integracoes/cityjobs/posts/[idExterno]/route";

const SEGREDO = "segredo-de-teste";

function assinaturaDoCorpoVazio(): { ts: string; assinatura: string } {
  const ts = String(Math.floor(Date.now() / 1000));
  return { ts, assinatura: cabecalhoDaAssinatura(ts, "", SEGREDO) };
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimit.mockReturnValue({ allowed: true, retryAfter: 0 });
  process.env.CITYJOBS_HMAC_SEGREDO = SEGREDO;
  process.env.CITYJOBS_CLIENT_ID = "client_cityjobs";
  db.client.findUnique.mockResolvedValue({ id: "client_cityjobs" });
});
afterEach(() => {
  delete process.env.CITYJOBS_HMAC_SEGREDO;
  delete process.env.CITYJOBS_CLIENT_ID;
});

describe("GET assina o corpo vazio — assinatura sobre o corpo JSON não bate", () => {
  it("recusa uma assinatura calculada como se o corpo não fosse vazio", async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const assinaturaErrada = cabecalhoDaAssinatura(ts, '{"algo":1}', SEGREDO);
    const req = new NextRequest("https://app.dioli.digital/api/integracoes/cityjobs/posts/vaga-1", {
      headers: { "x-dioli-timestamp": ts, "x-dioli-assinatura": assinaturaErrada },
    });
    const res = await GET(req, { params: Promise.resolve({ idExterno: "vaga-1" }) });
    expect(res.status).toBe(401);
  });

  it("aceita a assinatura correta do corpo vazio", async () => {
    consultarPost.mockResolvedValue({ idExterno: "vaga-1", estado: "publicado", agendadoPara: null });
    const { ts, assinatura } = assinaturaDoCorpoVazio();
    const req = new NextRequest("https://app.dioli.digital/api/integracoes/cityjobs/posts/vaga-1", {
      headers: { "x-dioli-timestamp": ts, "x-dioli-assinatura": assinatura },
    });
    const res = await GET(req, { params: Promise.resolve({ idExterno: "vaga-1" }) });
    expect(res.status).toBe(200);
    expect(consultarPost).toHaveBeenCalledWith("client_cityjobs", "vaga-1");
  });
});

describe("post inexistente → 404", () => {
  it("nunca 500 por ausência", async () => {
    consultarPost.mockResolvedValue(null);
    const { ts, assinatura } = assinaturaDoCorpoVazio();
    const req = new NextRequest("https://app.dioli.digital/api/integracoes/cityjobs/posts/nao-existe", {
      headers: { "x-dioli-timestamp": ts, "x-dioli-assinatura": assinatura },
    });
    const res = await GET(req, { params: Promise.resolve({ idExterno: "nao-existe" }) });
    expect(res.status).toBe(404);
  });
});
