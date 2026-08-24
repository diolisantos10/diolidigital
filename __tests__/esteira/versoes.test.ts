// A promessa do Hub (Fase 1, 1.9): nova versão SEM apagar a anterior.
//
// O buraco que estes testes travam: a refação regravava `Deliverable.content`
// por cima e o corpo da v1 sumia do mundo — o cliente pedia ajuste e perdia a
// única referência do que tinha visto. Agora a versão N vira registro imutável
// ANTES da sobrescrita, e a rodada nova de aprovação aponta para a N+1.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  // O PORTÃO DE PAGAMENTO (lib/agency/financeiro/portao-de-pagamento.ts) roda
  // antes de qualquer produção. Estes testes são sobre o que acontece DEPOIS de
  // o cliente pagar, então a testemunha diz "pago". Quem testa a trava em si é
  // __tests__/financeiro/portao-de-pagamento.test.ts.
  pagamentoConfirmado: {
    findUnique: vi.fn(async () => ({
      valorCentavos: 7900,
      origem: "mercadopago",
      confirmadoEm: new Date("2026-08-25T00:00:00.000Z"),
    })),
  },
  project: { findFirst: vi.fn() },
  clientRequestDb: { findUnique: vi.fn() },
  cycle: { findFirst: vi.fn() },
  deliverable: { findMany: vi.fn(), update: vi.fn() },
  deliverableVersion: { create: vi.fn() },
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

const ENTREGA = {
  id: "d1", name: "Calendário de conteúdo", content: "**1. Post**\n- Legenda: texto ANTIGO da v1",
  ownerAgentId: "a3", version: 1, clientFeedback: null as string | null,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.project.findFirst.mockResolvedValue({
    id: "p1", workspaceId: "ws1", clientId: "c1", clientRequestId: "cr1",
    client: { name: "Padaria do João", phone: null, email: null },
  });
  db.clientRequestDb.findUnique.mockResolvedValue({ businessName: "Padaria do João" });
  db.cycle.findFirst.mockResolvedValue({ id: "cy1" });
  db.deliverable.findMany.mockResolvedValue([{ ...ENTREGA }]);
  db.deliverable.update.mockResolvedValue({});
  db.deliverableVersion.create.mockResolvedValue({ id: "ver-nova" });
  db.approvalRequest.updateMany.mockResolvedValue({});
  db.portalMessage.create.mockResolvedValue({});
  db.activityEvent.create.mockResolvedValue({});
  generate.mockResolvedValue({
    ok: true,
    data: {
      title: "Calendário de conteúdo",
      summary: "Tom mais próximo do bairro.",
      // O calendário INTEIRO (4 a 8 semanas, `contratoDaPauta`). O fixture
      // tinha UMA e passava porque a refação não conferia o contrato de
      // saída: ela podia devolver um terço do que o cliente comprou.
      items: [
        { headline: "Pão quentinho", caption: "Saiu do forno agora." },
        { headline: "A fornada das seis", caption: "Todo dia às seis sai a primeira." },
        { headline: "Quem faz o seu pão", caption: "O time chega às quatro da manhã." },
        { headline: "O bolo do fim de semana", caption: "Sábado tem bolo de fubá quente." },
      ],
    },
  });
});

describe("refação preserva a versão anterior — o cliente nunca perde o que viu", () => {
  it("a v1 vira registro imutável ANTES de o content ser sobrescrito", async () => {
    await refazerPorPedidoDoCliente({ clientRequestId: "cr1", department: "social-media", comentario: "muda o tom" });

    const criadas = db.deliverableVersion.create.mock.calls.map((c) => c[0].data);
    // Retrofit da versão apresentada: número atual + conteúdo ATUAL (o antigo).
    expect(criadas[0]).toMatchObject({ deliverableId: "d1", number: 1, content: ENTREGA.content });
    // A ordem importa: preservar depois de sobrescrever preservaria a v2.
    expect(db.deliverableVersion.create.mock.invocationCallOrder[0]!)
      .toBeLessThan(db.deliverable.update.mock.invocationCallOrder[0]!);
  });

  it("a versão nova (N+1) nasce com o conteúdo refeito e a memória do pedido", async () => {
    await refazerPorPedidoDoCliente({ clientRequestId: "cr1", department: "social-media", comentario: "muda o tom" });

    const criadas = db.deliverableVersion.create.mock.calls.map((c) => c[0].data);
    expect(criadas[1]!.number).toBe(2);
    expect(criadas[1]!.content).toContain("Pão quentinho");
    expect(criadas[1]!.note).toContain("muda o tom");
  });

  it("a rodada nova de aprovação registra QUAL versão será decidida", async () => {
    await refazerPorPedidoDoCliente({ clientRequestId: "cr1", department: "social-media", comentario: "muda o tom" });

    const data = db.approvalRequest.updateMany.mock.calls[0]![0].data;
    expect(data.deliverableVersionId).toBe("ver-nova");
    // Dúvida aberta era sobre a versão anterior — a rodada nova zera o relógio.
    expect(data.questionOpenedAt).toBeNull();
  });

  it("preservação é idempotente: unique violado não derruba a refação", async () => {
    // Primeira chamada (retrofit) rejeita = versão já preservada. Não é erro.
    db.deliverableVersion.create
      .mockRejectedValueOnce(new Error("UNIQUE constraint failed"))
      .mockResolvedValue({ id: "ver-nova" });

    const r = await refazerPorPedidoDoCliente({ clientRequestId: "cr1", department: "social-media", comentario: "muda" });
    expect(r.refeitas).toEqual(["Calendário de conteúdo"]);
    expect(db.deliverable.update).toHaveBeenCalledOnce();
  });

  it("com VÁRIAS entregas refeitas o vínculo 1:1 não é chutado — fica nulo", async () => {
    // Card de aprovação é por departamento; apontar a versão de UMA entrega
    // quando duas mudaram seria mentir sobre o que está sendo decidido.
    db.deliverable.findMany.mockResolvedValue([
      { ...ENTREGA },
      { ...ENTREGA, id: "d2", name: "Carrossel institucional" },
    ]);
    await refazerPorPedidoDoCliente({ clientRequestId: "cr1", department: "social-media", comentario: "muda" });
    expect(db.approvalRequest.updateMany.mock.calls[0]![0].data.deliverableVersionId).toBeNull();
  });
});
