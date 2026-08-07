// O PEDIDO DE AJUSTE DO CLIENTE DIRETO CHEGA A ALGUÉM (05/08/2026).
//
// O bug que `refacao.ts` diz ter consertado sobrevivia pelo OUTRO ramo. Toda a
// refação/escalação/aviso vivia atrás de `if (department !== "proposal" &&
// approval.clientRequestId)` — e card criado por `/api/social-posts/aprovacao`
// nasce SÓ com `clientId`, por design (o caso Foocci).
//
// Cenário real: o cliente escrevia o que queria mudar, a peça virava
// "revision_requested", o comentário ficava gravado — e não rodava refação, não
// escalava, não avisava. O portal mostrava "Ajustes solicitados" para sempre.
// Ele acreditava que tinha pedido; a agência não sabia que fora pedido.
//
// A regra nova é a de `app/api/messages/conversa.ts`: o pedido pertence ao
// CLIENTE, não à solicitação. Leitura pelas duas chaves, escrita carimbando as
// duas — e NENHUMA chave nula em filtro, que seria vazamento entre clientes.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  project: { findFirst: vi.fn() },
  client: { findUnique: vi.fn() },
  clientRequestDb: { findUnique: vi.fn() },
  cycle: { findFirst: vi.fn() },
  deliverable: { findMany: vi.fn(), update: vi.fn() },
  approvalRequest: { updateMany: vi.fn() },
  portalMessage: { create: vi.fn() },
  // A gaveta das PROIBIÇÕES do cliente (`esteira/proibicoes.ts`). Sem ela, a
  // leitura falha e o piso de verdade REPROVA a peça — que é o comportamento
  // certo (fail-closed) e não o que estas suítes estão provando. Vazia aqui
  // significa "este cliente não proibiu nada", que é o caso limpo.
  brainArtifact: { findFirst: vi.fn(() => Promise.resolve(null)), findMany: vi.fn(() => Promise.resolve([])), create: vi.fn(() => Promise.resolve({})) },
  activityEvent: { create: vi.fn() },
}));
const generate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/ai/generate", () => ({ generate }));

import { refazerPorPedidoDoCliente } from "@/lib/agency/esteira/refacao";

beforeEach(() => {
  vi.clearAllMocks();
  // O caso Foocci: cliente criado direto. Não existe projeto nem solicitação.
  db.project.findFirst.mockResolvedValue(null);
  db.client.findUnique.mockResolvedValue({ name: "Foocci", workspaceId: "ws1" });
  db.clientRequestDb.findUnique.mockResolvedValue(null);
  db.cycle.findFirst.mockResolvedValue(null);
  db.deliverable.findMany.mockResolvedValue([]);
  db.deliverable.update.mockResolvedValue({});
  db.approvalRequest.updateMany.mockResolvedValue({});
  db.portalMessage.create.mockResolvedValue({});
  db.activityEvent.create.mockResolvedValue({});
});

describe("cliente DIRETO pede ajuste — e o pedido não morre em silêncio", () => {
  it("sem projeto, o pedido VIRA REGISTRO para a equipe, com as palavras dele", async () => {
    const r = await refazerPorPedidoDoCliente({
      clientId: "cli-foocci", department: "social-media",
      comentario: "a capa do carrossel 2 está escura demais",
    });

    expect(r.escalado).toBe(true);
    expect(db.activityEvent.create).toHaveBeenCalledTimes(1);
    const evento = db.activityEvent.create.mock.calls[0]![0].data;
    expect(evento.workspaceId).toBe("ws1");
    expect(evento.clientId).toBe("cli-foocci");
    expect(evento.type).toBe("refacao_escalada");
    expect(evento.message).toContain("a capa do carrossel 2 está escura demais");
    expect(evento.message).toContain("Foocci");
  });

  it("e o CLIENTE recebe resposta no portal — não fica olhando 'Ajustes solicitados'", async () => {
    const r = await refazerPorPedidoDoCliente({
      clientId: "cli-foocci", department: "social-media", comentario: "muda a capa",
    });

    expect(r.avisouCliente).toBe(true);
    const msg = db.portalMessage.create.mock.calls[0]![0].data;
    expect(msg.clientId).toBe("cli-foocci");
    expect(msg.authorRole).toBe("team");
    expect(msg.body).toMatch(/Recebi seu pedido/);
  });

  it("a mensagem NÃO carrega clientRequestId nulo — chave nula não entra em lugar nenhum", async () => {
    await refazerPorPedidoDoCliente({ clientId: "cli-foocci", department: "social-media", comentario: "x" });
    expect(db.portalMessage.create.mock.calls[0]![0].data).not.toHaveProperty("clientRequestId");
  });

  it("sem workspace legível o pedido GRITA no log em vez de sumir", async () => {
    db.client.findUnique.mockResolvedValue(null);
    const grito = vi.spyOn(console, "error").mockImplementation(() => {});
    await refazerPorPedidoDoCliente({ clientId: "cli-orfao", department: "social-media", comentario: "muda" });
    expect(grito).toHaveBeenCalledWith(expect.stringContaining("SEM DESTINATÁRIO"), expect.any(String));
    grito.mockRestore();
  });

  it("pedido sem NENHUMA chave de dono não escreve em lugar nenhum", async () => {
    const r = await refazerPorPedidoDoCliente({ department: "social-media", comentario: "muda" });
    expect(r.escalado).toBe(true);
    expect(db.portalMessage.create).not.toHaveBeenCalled();
    expect(db.activityEvent.create).not.toHaveBeenCalled();
  });
});

describe("cliente direto COM projeto — a refação de verdade roda por clientId", () => {
  beforeEach(() => {
    db.project.findFirst.mockResolvedValue({
      id: "p1", workspaceId: "ws1", clientId: "cli-foocci", clientRequestId: null,
      client: { name: "Foocci", phone: null, email: null },
    });
    db.deliverable.findMany.mockResolvedValue([{
      id: "d1", name: "Pauta do mês", content: "**1. Post**\n- Legenda: texto antigo",
      ownerAgentId: "a3", version: 1, clientFeedback: null, revisionStatus: "quality_ok",
    }]);
    generate.mockResolvedValue({
      ok: true,
      data: { title: "Pauta do mês", summary: "Ajustada.", items: [{ headline: "Novo", caption: "Legenda nova, mais curta e direta para o feed." }] },
    });
  });

  it("o projeto é procurado pelas DUAS chaves — antes, cliente direto caía fora", async () => {
    await refazerPorPedidoDoCliente({ clientId: "cli-foocci", department: "social-media", comentario: "encurta o texto" });
    expect(db.project.findFirst.mock.calls[0]![0].where).toEqual({ OR: [{ clientId: "cli-foocci" }] });
  });

  it("a peça é refeita e a aprovação volta a PENDER — pelo clientId, sem chave nula", async () => {
    const r = await refazerPorPedidoDoCliente({
      clientId: "cli-foocci", department: "social-media", comentario: "encurta o texto",
    });
    expect(r.refeitas).toEqual(["Pauta do mês"]);

    const where = db.approvalRequest.updateMany.mock.calls[0]![0].where;
    expect(where).toEqual({ OR: [{ clientId: "cli-foocci" }], department: "social-media" });
    expect(JSON.stringify(where)).not.toContain("null");
  });

  it("com as DUAS chaves, as duas entram no filtro e as duas são carimbadas", async () => {
    db.project.findFirst.mockResolvedValue({
      id: "p1", workspaceId: "ws1", clientId: "c1", clientRequestId: "cr1",
      client: { name: "Padaria", phone: null, email: null },
    });
    db.clientRequestDb.findUnique.mockResolvedValue({ businessName: "Padaria", clientId: "c1" });

    await refazerPorPedidoDoCliente({ clientRequestId: "cr1", department: "social-media", comentario: "muda o tom" });

    expect(db.approvalRequest.updateMany.mock.calls[0]![0].where).toEqual({
      OR: [{ clientRequestId: "cr1" }, { clientId: "c1" }],
      department: "social-media",
    });
    const msg = db.portalMessage.create.mock.calls[0]![0].data;
    expect(msg.clientRequestId).toBe("cr1");
    expect(msg.clientId).toBe("c1");
  });
});
