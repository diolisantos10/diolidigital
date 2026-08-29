// O CLIENTE DO VIZINHO NA ESCADA — rodada 2, lote A (29/08/2026).
//
// `POST /api/agency/escada`, ação `liberar_cliente`, recebia `clientId` do
// CORPO e nunca conferia de quem era aquele cliente antes de gravá-lo na
// allowlist do departamento. Um master do workspace A conseguia incluir o
// `clientId` de um cliente do workspace B na allowlist do PRÓPRIO
// departamento de A — o sistema nunca perguntava de quem era aquele id.
//
// Isto não vaza dado da B (a linha nasce sob o workspace de A), mas é a
// mesma classe de furo que o resto da casa trava: id de recurso vindo da
// requisição, sem verificação de posse, virando escrita.
//
// ⚠️ ESTE TESTE EXERCITA A RECUSA. Uma trava só existe se ela recusa.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ getSession }));

const db = vi.hoisted(() => ({
  client: { findFirst: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const liberarCliente = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agency/escada/registro", () => ({
  estadoDaEscada: vi.fn(),
  subirDegrau: vi.fn(),
  descerDegrau: vi.fn(),
  liberarCliente,
}));

import { POST } from "@/app/api/agency/escada/route";

function pedido(corpo: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/agency/escada", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

const sessao = (workspaceId: string) => ({
  userId: "u1", email: "quem@dioli.studio", role: "master", workspaceId,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("liberar_cliente com um clientId de outro workspace", () => {
  it("🔒 devolve 404 e NUNCA chama liberarCliente — o vizinho não entra na allowlist de A", async () => {
    getSession.mockResolvedValue(sessao("ws-A"));
    // O banco responde como responderia de verdade: `findFirst({ id, workspaceId: "ws-A" })`
    // não acha nada, porque o cliente é da B.
    db.client.findFirst.mockResolvedValue(null);

    const res = await POST(pedido({ departmentId: "design", acao: "liberar_cliente", clientId: "cli-da-B" }));

    expect(res.status, "um clientId de outro workspace foi aceito na escada").toBe(404);
    expect(liberarCliente, "gravou a allowlist antes de conferir de quem é o cliente").not.toHaveBeenCalled();
  });

  it("⚠️ é 404, nunca 403 — 403 confirmaria que o id existe em outra conta", async () => {
    getSession.mockResolvedValue(sessao("ws-A"));
    db.client.findFirst.mockResolvedValue(null);
    const res = await POST(pedido({ departmentId: "design", acao: "liberar_cliente", clientId: "cli-da-B" }));
    expect(res.status).toBe(404);
    expect(res.status).not.toBe(403);
  });

  it("⛔ a checagem vai pelo `where` (id + workspaceId), não por comparação depois da busca", async () => {
    getSession.mockResolvedValue(sessao("ws-A"));
    db.client.findFirst.mockResolvedValue(null);
    await POST(pedido({ departmentId: "design", acao: "liberar_cliente", clientId: "cli-da-B" }));

    const chamada = db.client.findFirst.mock.calls[0][0];
    expect(chamada, "a busca do cliente não levou o workspace de quem pediu").toMatchObject({
      where: { id: "cli-da-B", workspaceId: "ws-A" },
    });
  });

  it("✅ o dono legítimo libera o próprio cliente normalmente — a trava não vira parede", async () => {
    getSession.mockResolvedValue(sessao("ws-A"));
    db.client.findFirst.mockResolvedValue({ id: "cli-de-A" });
    liberarCliente.mockResolvedValue({ ok: true, degrau: "allowlist" });

    const res = await POST(pedido({ departmentId: "design", acao: "liberar_cliente", clientId: "cli-de-A" }));

    expect(res.status).toBe(200);
    expect(liberarCliente).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-A", departmentId: "design", clientId: "cli-de-A" }),
    );
  });
});
