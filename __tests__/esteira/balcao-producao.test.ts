// O BALCÃO PRODUZ SOZINHO — as duas metades da prova.
//
// A linha só fecha a conta com zero hora humana. Estes testes existem para
// impedir a regressão que estava viva até 05/08/2026: pagamento aprovado
// carimbava o pedido e ninguém produzia nada.

import { describe, it, expect, vi, beforeEach } from "vitest";

const db = {
  clientRequestDb: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  project: { findFirst: vi.fn(), create: vi.fn() },
  client: { findFirst: vi.fn(), create: vi.fn() },
  agencyWorkspace: { findMany: vi.fn() },
  portalAccess: { findFirst: vi.fn(), create: vi.fn() },
};
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const { produzirPedidoDeBalcao } = await import("@/lib/agency/balcao/producao");

function pedido(over: Record<string, unknown> = {}) {
  return {
    id: "req-1",
    workspaceId: "ws-1",
    businessName: "Padaria do Zé",
    briefingJson: JSON.stringify({
      serviceId: "balcao-carrossel-5",
      prospectName: "José",
      prospectEmail: "ze@padaria.com",
      prospectPhone: "11999999999",
    }),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.project.findFirst.mockResolvedValue(null);
  db.client.findFirst.mockResolvedValue(null);
  db.client.create.mockResolvedValue({ id: "cli-1" });
  db.project.create.mockResolvedValue({ id: "prj-1" });
  db.clientRequestDb.update.mockResolvedValue({});
  db.clientRequestDb.updateMany.mockResolvedValue({ count: 1 });
  db.portalAccess.findFirst.mockResolvedValue(null);
  db.portalAccess.create.mockResolvedValue({ id: "pa-1" });
});

describe("pagou, produz", () => {
  it("abre cliente, projeto marcado para EXECUÇÃO e acesso ao portal", async () => {
    db.clientRequestDb.findUnique.mockResolvedValue(pedido());
    const r = await produzirPedidoDeBalcao("req-1");
    expect(r.ok).toBe(true);

    // O cliente entra na carteira — quem gastou R$ 129 vira cadastro.
    expect(db.client.create).toHaveBeenCalled();
    expect(db.client.create.mock.calls[0]![0].data.email).toBe("ze@padaria.com");

    // E o projeto nasce PEDINDO execução: é isso que dispensa a hora humana.
    const criado = db.project.create.mock.calls[0]![0].data;
    expect(criado.executionStatus).toBe("pending");
    expect(criado.executionRequestedAt).toBeInstanceOf(Date);
    expect(criado.clientRequestId).toBe("req-1");

    // Sem acesso ao portal, a peça fica pronta e ninguém vê.
    expect(db.portalAccess.create).toHaveBeenCalled();
  });

  it("webhook repetido NÃO cria segundo projeto — a trava está no banco", async () => {
    db.clientRequestDb.findUnique.mockResolvedValue(pedido());
    db.project.findFirst.mockResolvedValue({ id: "prj-ja", clientId: "cli-ja" });
    const r = await produzirPedidoDeBalcao("req-1");
    expect(r).toEqual({ ok: true, projectId: "prj-ja", clientId: "cli-ja", jaExistia: true });
    expect(db.project.create).not.toHaveBeenCalled();
  });

  it("item que NÃO é de balcão não entra na produção automática", async () => {
    db.clientRequestDb.findUnique.mockResolvedValue(
      pedido({ briefingJson: JSON.stringify({ serviceId: "pack-8-stories" }) }),
    );
    const r = await produzirPedidoDeBalcao("req-1");
    expect(r.ok).toBe(false);
    expect(db.project.create).not.toHaveBeenCalled();
  });

  it("pedido órfão com dois workspaces NÃO produz — adivinhar dono é vazar", async () => {
    db.clientRequestDb.findUnique.mockResolvedValue(pedido({ workspaceId: null }));
    db.agencyWorkspace.findMany.mockResolvedValue([{ id: "ws-1" }, { id: "ws-2" }]);
    const r = await produzirPedidoDeBalcao("req-1");
    expect(r.ok).toBe(false);
    expect(db.project.create).not.toHaveBeenCalled();
  });

  // ⚠️ 15/08/2026 — ESTE TESTE FOI INVERTIDO, E A INVERSÃO É O CONSERTO.
  //
  // Ele se chamava "cliente que já existe é REUSADO — a carteira não duplica
  // pessoa" e travava exatamente o comportamento que virou P0: o balcão achava
  // `Client` por `{ workspaceId, email }` com o e-mail vindo do FORMULÁRIO DE
  // COMPRA, sem verificação nenhuma. Com um cartão e R$ 79 eu digitava o
  // e-mail de um cliente existente e a minha compra entrava na ficha dele.
  //
  // É o mesmo padrão que esta casa já registrou duas vezes: **o defeito virando
  // invariante**. "Não duplicar pessoa" é desejo de cadastro; fundir ficha por
  // e-mail não verificado é vazamento. Ficha duplicada um humano funde depois
  // (precedente da Camila, 08/08); ficha fundida indevidamente ninguém desfaz.
  it("⛔ e-mail digitado NÃO funde ficha — a carteira prefere duplicar a vazar", async () => {
    db.clientRequestDb.findUnique.mockResolvedValue(pedido());
    // Existe um cliente com este e-mail. Não importa: e-mail não é identidade.
    db.client.findFirst.mockResolvedValue({ id: "cli-antigo" });

    const r = await produzirPedidoDeBalcao("req-1");

    expect(r.ok).toBe(true);
    expect(db.client.create).toHaveBeenCalled();
    expect(db.project.create.mock.calls[0]![0].data.clientId).toBe("cli-1");
    expect(db.project.create.mock.calls[0]![0].data.clientId).not.toBe("cli-antigo");
  });

  it("⛔ solicitação que já tem dono nunca é re-apontada — a guarda está no WHERE", async () => {
    db.clientRequestDb.findUnique.mockResolvedValue(pedido({ clientId: "dono-legitimo" }));

    await produzirPedidoDeBalcao("req-1");

    // Decidir no código perde a corrida entre duas compras simultâneas; quem
    // garante é o banco.
    const where = db.clientRequestDb.updateMany.mock.calls[0]![0].where;
    expect(where.clientId).toBeNull();
    expect(db.client.create).not.toHaveBeenCalled();
    expect(db.project.create.mock.calls[0]![0].data.clientId).toBe("dono-legitimo");
  });
});
