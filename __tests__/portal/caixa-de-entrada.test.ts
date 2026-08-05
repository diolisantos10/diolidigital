// A CAIXA DE ENTRADA DA AGÊNCIA — o defeito mais grave dos três.
//
// `readByTeam` era escrito em 11 lugares e lido para CONTAGEM em zero. Não
// existia lista, badge nem tela: a mensagem do cliente gravava e morria.
//
// O que estes testes travam:
//   • a contagem de não-lidas BATE — e conta só mensagem do cliente ainda não
//     lida pela equipe (mensagem da própria equipe nunca entra no badge);
//   • uma conversa aparece UMA vez: linhas carimbadas só com clientRequestId
//     (as 11 escritas antigas) e linhas com clientId são a MESMA thread;
//   • a ordem é a de quem precisa responder: não-lidas primeiro, depois recente;
//   • o escopo é o workspace da sessão — cliente alheio não entra na lista;
//   • cliente que só tem PEDIDO, sem mensagem nenhuma, também vira linha —
//     senão o pedido dele fica invisível até alguém escrever.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  client: { findMany: vi.fn() },
  clientRequestDb: { findMany: vi.fn() },
  portalMessage: { groupBy: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  contentRequest: { count: vi.fn(), groupBy: vi.fn() },
}));
const requireSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/auth/api-guard", () => ({ requireSession }));

import { GET } from "@/app/api/messages/route";

const T = (h: number) => new Date(`2026-08-05T${String(h).padStart(2, "0")}:00:00Z`);

function req(query = ""): NextRequest {
  return new NextRequest(`http://localhost/api/messages${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ session: { name: "PM", workspaceId: "ws1", role: "master" }, error: null });
  db.client.findMany.mockResolvedValue([
    { id: "cli-foocci", name: "Foocci" },
    { id: "cli-salao",  name: "Salão da Ana" },
  ]);
  db.clientRequestDb.findMany.mockResolvedValue([
    { id: "cr-salao", clientId: "cli-salao", businessName: "Salão da Ana" },
  ]);
  db.portalMessage.groupBy.mockResolvedValue([]);
  db.portalMessage.findMany.mockResolvedValue([]);
  db.portalMessage.count.mockResolvedValue(0);
  db.contentRequest.count.mockResolvedValue(0);
  db.contentRequest.groupBy.mockResolvedValue([]);
});

describe("o badge do menu (?resumo=1)", () => {
  it("soma mensagens não-lidas + pedidos novos", async () => {
    db.portalMessage.count.mockResolvedValue(3);
    db.contentRequest.count.mockResolvedValue(2);
    const res = await GET(req("?resumo=1"));
    expect(await res.json()).toEqual({ naoLidas: 3, pedidosNovos: 2, total: 5 });
  });

  it("conta só mensagem DO CLIENTE ainda não lida — a da própria equipe nunca acende badge", async () => {
    await GET(req("?resumo=1"));
    const where = db.portalMessage.count.mock.calls[0]![0].where;
    expect(where.authorRole).toBe("client");
    expect(where.readByTeam).toBe(false);
  });

  it("workspace sem cliente nenhum → zero, sem nem consultar mensagem", async () => {
    db.client.findMany.mockResolvedValue([]);
    db.clientRequestDb.findMany.mockResolvedValue([]);
    const res = await GET(req("?resumo=1"));
    expect(await res.json()).toEqual({ naoLidas: 0, pedidosNovos: 0, total: 0 });
    expect(db.portalMessage.count).not.toHaveBeenCalled();
  });

  it("sem sessão → 401", async () => {
    requireSession.mockResolvedValue({ session: null, error: new Response(null, { status: 401 }) });
    const res = await GET(req("?resumo=1"));
    expect(res.status).toBe(401);
  });
});

describe("a lista de conversas", () => {
  it("a MESMA conversa não aparece duas vezes quando há linha antiga (só clientRequestId) e nova (clientId)", async () => {
    db.portalMessage.groupBy
      // todas
      .mockResolvedValueOnce([
        { clientId: null,        clientRequestId: "cr-salao", _count: { _all: 4 }, _max: { createdAt: T(9) } },
        { clientId: "cli-salao", clientRequestId: null,       _count: { _all: 2 }, _max: { createdAt: T(11) } },
      ])
      // não-lidas
      .mockResolvedValueOnce([
        { clientId: "cli-salao", clientRequestId: null, _count: { _all: 2 } },
      ]);
    db.portalMessage.findMany.mockResolvedValue([
      { clientId: "cli-salao", clientRequestId: null, authorRole: "client", body: "e o post de sexta?", createdAt: T(11) },
    ]);

    const { conversas } = await (await GET(req())).json();
    expect(conversas).toHaveLength(1);
    expect(conversas[0].clientId).toBe("cli-salao");
    expect(conversas[0].nome).toBe("Salão da Ana");
    expect(conversas[0].total).toBe(6);     // 4 antigas + 2 novas
    expect(conversas[0].naoLidas).toBe(2);
    expect(conversas[0].ultimaEm).toBe(T(11).toISOString());
    expect(conversas[0].previa).toBe("e o post de sexta?");
    expect(conversas[0].ultimaPor).toBe("client");
  });

  it("ordena por quem espera resposta: não-lidas primeiro, depois a mais recente", async () => {
    db.portalMessage.groupBy
      .mockResolvedValueOnce([
        { clientId: "cli-foocci", clientRequestId: null, _count: { _all: 9 }, _max: { createdAt: T(18) } },
        { clientId: "cli-salao",  clientRequestId: null, _count: { _all: 1 }, _max: { createdAt: T(8) } },
      ])
      .mockResolvedValueOnce([
        { clientId: "cli-salao", clientRequestId: null, _count: { _all: 1 } },
      ]);

    const { conversas } = await (await GET(req())).json();
    // Foocci é a mais RECENTE, mas quem tem não-lida é o Salão: ele vem antes.
    expect(conversas.map((c: { nome: string }) => c.nome)).toEqual(["Salão da Ana", "Foocci"]);
  });

  it("o escopo é o workspace da sessão — nenhuma chave de cliente alheio entra na busca", async () => {
    await GET(req());
    const escopo = db.portalMessage.groupBy.mock.calls[0]![0].where;
    expect(escopo).toEqual({
      OR: [
        { clientId: { in: ["cli-foocci", "cli-salao"] } },
        { clientRequestId: { in: ["cr-salao"] } },
      ],
    });
  });

  it("cliente com PEDIDO e nenhuma mensagem também é uma linha — pedido não fica invisível", async () => {
    db.contentRequest.groupBy.mockResolvedValue([{ clientId: "cli-foocci", _count: { _all: 1 } }]);
    db.contentRequest.count.mockResolvedValue(1);

    const { conversas, pedidosNovos } = await (await GET(req())).json();
    expect(pedidosNovos).toBe(1);
    expect(conversas).toHaveLength(1);
    expect(conversas[0].nome).toBe("Foocci");
    expect(conversas[0].pedidosNovos).toBe(1);
    expect(conversas[0].total).toBe(0);
  });

  it("prospect sem cliente (só solicitação) vira linha própria, com o nome do negócio", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([
      { id: "cr-lead", clientId: null, businessName: "Padaria do Zé" },
    ]);
    db.portalMessage.groupBy
      .mockResolvedValueOnce([{ clientId: null, clientRequestId: "cr-lead", _count: { _all: 2 }, _max: { createdAt: T(7) } }])
      .mockResolvedValueOnce([{ clientId: null, clientRequestId: "cr-lead", _count: { _all: 2 } }]);

    const { conversas } = await (await GET(req())).json();
    expect(conversas).toHaveLength(1);
    expect(conversas[0].chave).toBe("req:cr-lead");
    expect(conversas[0].clientId).toBeNull();
    expect(conversas[0].clientRequestId).toBe("cr-lead");
    expect(conversas[0].nome).toBe("Padaria do Zé");
    expect(conversas[0].naoLidas).toBe(2);
  });

  it("banco fora do ar → 503 com recado, nunca lista vazia mentindo que não há nada", async () => {
    db.client.findMany.mockRejectedValue(new Error("db off"));
    const res = await GET(req());
    expect(res.status).toBe(503);
  });
});
