// O HISTÓRICO DA PEÇA DO VIZINHO — o item declarado e não fechado em 28/08.
//
// A ficha de 28/08 (docs/diagnosticos/varredura-de-posse-28-08.md) já tinha
// medido isto e deixou aberto de propósito: `historicoDaPeca(postId)` buscava
// a peça com `findUnique({ where: { id: postId } })` — SEM workspace — e
// depois usava o `workspaceId` LIDO DO PRÓPRIO POST ALHEIO para procurar os
// eventos. Qualquer sessão lia o histórico de reprovação de peça de QUALQUER
// inquilino. É leitura, e leitura entre clientes também é vazamento.
//
// ⚠️ ESTE TESTE EXERCITA A RECUSA. Uma trava só existe se ela recusa.

import { describe, it, expect, beforeEach, vi } from "vitest";

// ⚠️ O ARGUMENTO tambem e anotado, nao so o retorno. `vi.fn(async () => ...)`
// sem parametro faz o TypeScript inferir `[]` para `mock.calls`, e
// `mock.calls[0]?.[0]` vira TS2493 no `tsc --noEmit` do CI mesmo com o vitest
// verde. Este teste ja nasceu vermelho no portao por isso, uma vez.
type Consulta = { where?: Record<string, unknown> } & Record<string, unknown>;

const db = vi.hoisted(() => ({
  socialPost: {
    findFirst: vi.fn(
      async (_args: { where?: Record<string, unknown>; select?: Record<string, unknown> }): Promise<{ workspaceId: string } | null> => null,
    ),
  },
  activityEvent: {
    findMany: vi.fn(
      async (_args: { where?: Record<string, unknown>; orderBy?: unknown; take?: number }): Promise<Array<{ timestamp: Date; message: string }>> => [],
    ),
  },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import { historicoDaPeca } from "@/lib/agency/esteira/reprovacao";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("o histórico da peça de outro inquilino", () => {
  it("🔒 workspace errado não vê nada — o banco filtra por workspace, e a peça da B não existe para a A", async () => {
    // O banco responde como responderia de verdade: filtrando por workspace, a
    // peça da agência B não existe para a agência A.
    db.socialPost.findFirst.mockResolvedValue(null);

    const h = await historicoDaPeca("post-da-agencia-B", "ws-agencia-A");

    expect(h, "a agência A leu o histórico da peça da agência B").toEqual([]);
    expect(db.activityEvent.findMany, "consultou eventos usando o workspace do post alheio").not.toHaveBeenCalled();
  });

  it("⛔ o workspace vai no WHERE da busca da peça — não é lido do post depois de achado", async () => {
    db.socialPost.findFirst.mockResolvedValue(null);
    await historicoDaPeca("p1", "ws-A");

    const chamada: Consulta | undefined = db.socialPost.findFirst.mock.calls[0]?.[0];
    expect(chamada?.where, "a busca da peça não levou o workspace de quem pergunta").toMatchObject({
      id: "p1",
      workspaceId: "ws-A",
    });
  });

  it("✅ o dono legítimo lê o próprio histórico normalmente — a trava não vira parede", async () => {
    db.socialPost.findFirst.mockResolvedValue({ workspaceId: "ws-A" });
    db.activityEvent.findMany.mockResolvedValue([
      { timestamp: new Date("2026-08-01"), message: "p1 — volta 1, reprovada por Dioli: sem foto real" },
    ]);

    const h = await historicoDaPeca("p1", "ws-A");

    expect(h).toHaveLength(1);
    expect(h[0]!.oQueDisseram).toContain("sem foto real");
    // E a busca dos eventos usa o workspace DA PEÇA JÁ CONFERIDA — nunca o
    // que veio de fora sem checagem.
    const chamadaEventos: Consulta | undefined = db.activityEvent.findMany.mock.calls[0]?.[0];
    expect(chamadaEventos?.where).toMatchObject({ workspaceId: "ws-A" });
  });
});
