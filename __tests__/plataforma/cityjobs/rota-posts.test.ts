// A fiação da rota POST /api/integracoes/cityjobs/posts: HMAC antes de tudo,
// content-type, CITYJOBS_CLIENT_ID do AMBIENTE (nunca do corpo), rate limit.
// A lógica de negócio (`receberPost`) já tem teste próprio
// (`posts-orquestracao.test.ts`) — aqui só se prova a porta.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({ client: { findUnique: vi.fn() } }));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const rateLimit = vi.hoisted(() => vi.fn(() => ({ allowed: true, retryAfter: 0 })));
vi.mock("@/lib/security/rate-limit", () => ({ rateLimit }));

const receberPost = vi.hoisted(() =>
  vi.fn(async (): Promise<{ http: number; corpo: Record<string, unknown> }> => ({
    http: 202,
    corpo: { idExterno: "vaga-1", estado: "recebido", agendadoPara: null },
  })),
);
vi.mock("@/lib/integracoes/cityjobs/posts", () => ({ receberPost }));

import { cabecalhoDaAssinatura } from "@/lib/integracoes/cityjobs/assinatura";
import { POST } from "@/app/api/integracoes/cityjobs/posts/route";

const SEGREDO = "segredo-de-teste";

function request(corpo: string, headers: Record<string, string> = {}, comAssinatura = true): NextRequest {
  const ts = String(Math.floor(Date.now() / 1000));
  const h: Record<string, string> = { "content-type": "application/json", ...headers };
  if (comAssinatura && !("x-dioli-timestamp" in headers)) {
    h["x-dioli-timestamp"] = ts;
    h["x-dioli-assinatura"] = cabecalhoDaAssinatura(ts, corpo, SEGREDO);
  }
  return new NextRequest("https://app.dioli.digital/api/integracoes/cityjobs/posts", {
    method: "POST",
    headers: h,
    body: corpo,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimit.mockReturnValue({ allowed: true, retryAfter: 0 });
  process.env.CITYJOBS_HMAC_SEGREDO = SEGREDO;
  process.env.CITYJOBS_CLIENT_ID = "client_cityjobs";
  db.client.findUnique.mockResolvedValue({ id: "client_cityjobs", workspaceId: "ws1" });
});
afterEach(() => {
  delete process.env.CITYJOBS_HMAC_SEGREDO;
  delete process.env.CITYJOBS_CLIENT_ID;
});

describe("corpo grande demais → 413, ANTES de rate limit/HMAC/receberPost", () => {
  it("recusa pelo Content-Length declarado, sem sequer chamar rateLimit", async () => {
    const corpoPequeno = "{}"; // o corpo REAL é pequeno — só o cabeçalho mente
    const ts = String(Math.floor(Date.now() / 1000));
    const req = new NextRequest("https://app.dioli.digital/api/integracoes/cityjobs/posts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(1_000_000),
        "x-dioli-timestamp": ts,
        "x-dioli-assinatura": cabecalhoDaAssinatura(ts, corpoPequeno, SEGREDO),
      },
      body: corpoPequeno,
    });
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect((await res.json()).erro).toBe("corpo_grande_demais");
    expect(rateLimit).not.toHaveBeenCalled();
    expect(receberPost).not.toHaveBeenCalled();
  });

  it("recusa pelo acumulado real quando não há Content-Length confiável", async () => {
    const corpoGrande = JSON.stringify({ idExterno: "vaga-1", legenda: "x".repeat(300 * 1024) });
    const res = await POST(request(corpoGrande));
    expect(res.status).toBe(413);
    expect((await res.json()).erro).toBe("corpo_grande_demais");
    expect(receberPost).not.toHaveBeenCalled();
  });
});

describe("corpo dentro do teto — caminho feliz não é incomodado", () => {
  it("um corpo comum, bem abaixo de 256 KB, chega normalmente a receberPost", async () => {
    const corpo = JSON.stringify({ idExterno: "vaga-1", marca: "cityjobs" });
    const res = await POST(request(corpo));
    expect(res.status).toBe(202);
    expect(receberPost).toHaveBeenCalled();
  });
});

describe("sem segredo configurado → 503, nunca 401", () => {
  it("mesmo com uma assinatura 'válida' calculada localmente", async () => {
    delete process.env.CITYJOBS_HMAC_SEGREDO;
    const corpo = "{}";
    const res = await POST(request(corpo));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.erro).toBe("hmac_nao_configurado");
    expect(receberPost).not.toHaveBeenCalled();
  });
});

describe("assinatura inválida → 401, antes de tocar o corpo", () => {
  it("recusa e não chama receberPost", async () => {
    const res = await POST(request("{}", { "x-dioli-timestamp": String(Math.floor(Date.now() / 1000)), "x-dioli-assinatura": "v1=" + "0".repeat(64) }));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.erro).toBe("assinatura_invalida");
    expect(receberPost).not.toHaveBeenCalled();
  });
});

describe("rate limit — 429 com Retry-After", () => {
  it("recusa antes até de conferir assinatura", async () => {
    rateLimit.mockReturnValue({ allowed: false, retryAfter: 42 });
    const res = await POST(request("{}"));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
  });
});

describe("Content-Type diferente de application/json → 415", () => {
  it("multipart tem mensagem própria (gap declarado)", async () => {
    const corpo = "{}";
    const ts = String(Math.floor(Date.now() / 1000));
    const req = new NextRequest("https://app.dioli.digital/api/integracoes/cityjobs/posts", {
      method: "POST",
      headers: {
        "content-type": "multipart/form-data; boundary=x",
        "x-dioli-timestamp": ts,
        "x-dioli-assinatura": cabecalhoDaAssinatura(ts, corpo, SEGREDO),
      },
      body: corpo,
    });
    const res = await POST(req);
    expect(res.status).toBe(415);
    const json = await res.json();
    expect(json.motivo).toMatch(/multipart/i);
  });
});

describe("CITYJOBS_CLIENT_ID ausente ou sem cliente correspondente → 503", () => {
  it("env ausente", async () => {
    delete process.env.CITYJOBS_CLIENT_ID;
    const res = await POST(request("{}"));
    expect(res.status).toBe(503);
    expect((await res.json()).erro).toBe("cityjobs_client_id_nao_configurado");
  });

  it("env aponta para cliente que não existe", async () => {
    db.client.findUnique.mockResolvedValue(null);
    const res = await POST(request("{}"));
    expect(res.status).toBe(503);
  });
});

describe("caminho feliz: chama receberPost com workspaceId/clientId do BANCO, nunca do corpo", () => {
  it("ignora um 'marca' malicioso apontando para outro cliente", async () => {
    const corpo = JSON.stringify({ idExterno: "vaga-1", marca: "outro-cliente-qualquer" });
    const res = await POST(request(corpo));
    expect(res.status).toBe(202);
    expect(receberPost).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws1", clientId: "client_cityjobs" }),
    );
  });
});
