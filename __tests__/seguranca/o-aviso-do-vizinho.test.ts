// O AVISO DO VIZINHO — rodada 2, lote A (29/08/2026).
//
// `marcarComoEnviado`/`dispensar` (`lib/agency/esteira/avisos.ts`), chamadas
// por `PATCH /api/avisos`, gravavam por `where: { id }` — SEM `workspaceId`.
// Qualquer sessão master/PM desta casa, sabendo (ou adivinhando) o id de um
// `ClientNotice` pendente de OUTRA agência, marcava-o como "enviado" (ou
// dispensava-o) sem que o dono legítimo tivesse feito nada — silenciando a
// fila que existe exatamente para impedir um cliente parado sem saber que
// precisa fazer algo.
//
// ⚠️ ESTE TESTE EXERCITA A RECUSA. Uma trava só existe se ela recusa.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  clientNotice: { updateMany: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import { marcarComoEnviado, dispensar } from "@/lib/agency/esteira/avisos";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("marcar como enviado o aviso de outro workspace", () => {
  it("🔒 aviso de outra agência não é marcado — zero linhas afetadas dentro do workspace de quem pediu", async () => {
    // O banco responde como responderia de verdade: `updateMany({ where: { id, workspaceId } })`
    // não acha a linha, porque o aviso é da agência B.
    db.clientNotice.updateMany.mockResolvedValue({ count: 0 });

    const ok = await marcarComoEnviado("aviso-da-agencia-B", "ws-agencia-A", "quem@a.com");

    expect(ok, "um aviso de outra agência foi marcado como enviado").toBe(false);
  });

  it("⛔ o workspace vai no WHERE do updateMany — não é lido de volta nem comparado depois", async () => {
    db.clientNotice.updateMany.mockResolvedValue({ count: 0 });
    await marcarComoEnviado("n1", "ws-A", "quem@a.com");

    const chamada = db.clientNotice.updateMany.mock.calls[0][0];
    expect(chamada.where, "a escrita não levou o workspace de quem pediu").toMatchObject({
      id: "n1", workspaceId: "ws-A",
    });
  });

  it("✅ o dono legítimo marca normalmente — a trava não vira parede", async () => {
    db.clientNotice.updateMany.mockResolvedValue({ count: 1 });
    expect(await marcarComoEnviado("n1", "ws-A", "quem@a.com")).toBe(true);
  });
});

describe("dispensar o aviso de outro workspace", () => {
  it("🔒 dispensar aviso alheio não faz nada", async () => {
    db.clientNotice.updateMany.mockResolvedValue({ count: 0 });
    const ok = await dispensar("aviso-da-agencia-B", "ws-agencia-A", "quem@a.com");
    expect(ok, "um aviso de outra agência foi dispensado").toBe(false);
  });

  it("⛔ o workspace vai no WHERE do updateMany", async () => {
    db.clientNotice.updateMany.mockResolvedValue({ count: 0 });
    await dispensar("n1", "ws-A", "quem@a.com");
    const chamada = db.clientNotice.updateMany.mock.calls[0][0];
    expect(chamada.where).toMatchObject({ id: "n1", workspaceId: "ws-A" });
  });

  it("✅ o dono legítimo dispensa normalmente", async () => {
    db.clientNotice.updateMany.mockResolvedValue({ count: 1 });
    expect(await dispensar("n1", "ws-A", "quem@a.com")).toBe(true);
  });
});
