// /api/operacao/gerar-mes — o calendário do mês gerado pela rotina (04/10/2026).
// Segredo obrigatório; cliente por id ou nome exato (nome repetido não se
// adivinha); a resposta traz só contagens, nunca legenda.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  clientes: [] as Array<{ id: string; workspaceId: string; name: string }>,
}));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    client: {
      findMany: vi.fn(async (q: { where: { id?: string; name?: string } }): Promise<Array<{ id: string; workspaceId: string }>> =>
        db.clientes
          .filter((c) => (q.where.id ? c.id === q.where.id : c.name === q.where.name))
          .map(({ id, workspaceId }) => ({ id, workspaceId }))),
    },
  },
}));
const gerar = vi.hoisted(() => vi.fn(async (): Promise<Record<string, unknown>> => ({
  ok: true, criados: 31, jaExistiam: 0,
  posts: [{ id: "p1", caption: "LEGENDA QUE NÃO PODE SAIR" }],
  barradas: [],
  pendentes: [{ dia: "2026-10-05", motivo: "preciso de material do cliente para reciclar" }, { dia: "2026-10-06", motivo: "preciso de material do cliente para reciclar" }],
})));
vi.mock("@/lib/agency/esteira/calendario-editorial", () => ({ gerarCalendarioEditorial: gerar }));

import { POST } from "@/app/api/operacao/gerar-mes/route";

const pedir = (corpo: unknown, token = "segredo-de-teste") =>
  POST(new NextRequest("http://x/", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(corpo) }));

beforeEach(() => {
  process.env.CRON_SECRET = "segredo-de-teste";
  db.clientes = [
    { id: "sushi", workspaceId: "w1", name: "Sushi Cazza" },
    { id: "a", workspaceId: "w1", name: "Repetido" },
    { id: "b", workspaceId: "w1", name: "Repetido" },
  ];
  gerar.mockClear();
});

describe("/api/operacao/gerar-mes", () => {
  it("segredo errado → 401, e nada é gerado", async () => {
    expect((await pedir({ mes: "2026-10", cliente: "Sushi Cazza" }, "errado")).status).toBe(401);
    expect(gerar).not.toHaveBeenCalled();
  });

  it("sem CRON_SECRET no servidor → 503", async () => {
    delete process.env.CRON_SECRET;
    expect((await pedir({ mes: "2026-10", cliente: "Sushi Cazza" })).status).toBe(503);
  });

  it("pelo nome exato: gera no workspace do cliente e devolve só contagens", async () => {
    const r = await pedir({ mes: "2026-10", cliente: "Sushi Cazza" });
    expect(r.status).toBe(200);
    expect(gerar).toHaveBeenCalledWith({ workspaceId: "w1", clientId: "sushi", mes: "2026-10" });
    const j = (await r.json()) as Record<string, unknown>;
    expect(j).toMatchObject({ ok: true, criados: 31, pendentes: { "preciso de material do cliente para reciclar": 2 } });
    expect(JSON.stringify(j)).not.toContain("LEGENDA QUE NÃO PODE SAIR");
  });

  it("nome repetido → 409, pede o id; mês inválido → 400; cliente inexistente → 404", async () => {
    expect((await pedir({ mes: "2026-10", cliente: "Repetido" })).status).toBe(409);
    expect((await pedir({ mes: "10/2026", cliente: "Sushi Cazza" })).status).toBe(400);
    expect((await pedir({ mes: "2026-10", cliente: "Ninguém" })).status).toBe(404);
    expect(gerar).not.toHaveBeenCalled();
  });

  it("pelo id também", async () => {
    await pedir({ mes: "2026-10", clientId: "sushi" });
    expect(gerar).toHaveBeenCalledWith({ workspaceId: "w1", clientId: "sushi", mes: "2026-10" });
  });
});
