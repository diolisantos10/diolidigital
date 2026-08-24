// 6a auditoria — A PORTA LATERAL: refação a pedido do cliente APAGAVA a reprovação.
//
// Este arquivo nasceu como PROVA DA FALHA (as asserções afirmavam que o exploit
// funcionava). Fechada a porta em 04/08/2026, ele foi INVERTIDO no lugar: as
// mesmas três montagens, agora afirmando o comportamento correto. Vale mais
// invertido do que apagado — é o único teste que percorre `refacao` e
// `apresentar` de verdade, que é onde a falha morava (nas juntas, não nas peças).
import { describe, it, expect, beforeEach, vi } from "vitest";

const estado = vi.hoisted(() => ({ entregas: [] as Array<Record<string, unknown>> }));
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
  project: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(async () => ({})),
  },
  clientRequestDb: { findUnique: vi.fn() },
  cycle: { findFirst: vi.fn() },
  deliverable: {
    findMany: vi.fn(async ({ where }: { where?: { revisionStatus?: string } } = {}) =>
      estado.entregas.filter((d) => !where?.revisionStatus || d.revisionStatus === where.revisionStatus)),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const alvo = estado.entregas.find((d) => d.id === where.id)!;
      for (const [k, v] of Object.entries(data)) {
        if (v && typeof v === "object" && "increment" in (v as object)) alvo[k] = (alvo[k] as number) + (v as { increment: number }).increment;
        else alvo[k] = v;
      }
      return alvo;
    }),
    updateMany: vi.fn(async () => ({ count: 0 })),
  },
  deliverableVersion: { create: vi.fn(async () => ({ id: "v9" })), findFirst: vi.fn(async () => null) },
  approvalRequest: { updateMany: vi.fn(async () => ({})) },
  portalMessage: { create: vi.fn(async (_args: { data: { body: string } }) => ({})) },
  activityEvent: { create: vi.fn(async () => ({})) },
  materialRequest: { count: vi.fn(async () => 0) },
}));
const generate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/ai/generate", () => ({ generate }));
vi.mock("@/lib/agency/esteira/avisos", () => ({ avisarCliente: vi.fn(async () => true) }));
vi.mock("@/lib/agency/esteira/publicacao", () => ({ agendarPostsDaEntrega: vi.fn(async () => {}), aprovarCalendario: vi.fn(async () => {}) }));

import { refazerPorPedidoDoCliente } from "@/lib/agency/esteira/refacao";
import { apresentar } from "@/lib/agency/esteira/marcos";

beforeEach(() => {
  vi.clearAllMocks();
  estado.entregas = [{
    id: "d1", name: "Calendário de conteúdo", content: "**1. Post**\n- Legenda: texto reprovado",
    ownerAgentId: "a3", version: 1, clientFeedback: null,
    // A Qualidade OLHOU e REPROVOU esta peça.
    revisionStatus: "quality_flag", lastFeedback: "promessa que o cliente não sustenta",
  }];
  db.project.findFirst.mockResolvedValue({ id: "p1", workspaceId: "ws1", clientId: "c1", clientRequestId: "cr1", client: { name: "Padaria do João", phone: null, email: null } });
  db.project.findUnique.mockResolvedValue({ id: "p1", name: "Projeto", clientRequestId: "cr1", workspaceId: "ws1", clientId: "c1", directionApprovedAt: new Date(), presentedAt: null, clientApprovedAt: null });
  db.clientRequestDb.findUnique.mockResolvedValue({ businessName: "Padaria do João", segment: "alimentação", services: "[]", objectives: "[]" });
  db.cycle.findFirst.mockResolvedValue({ id: "cy1" });
  generate.mockResolvedValue({ ok: true, data: { title: "Calendário de conteúdo", summary: "Ajustado para um tom mais próximo do bairro, como você pediu.", items: [{ headline: "Pão quentinho", caption: "Saiu do forno agora, passa aqui que a gente te espera." }] } });
});

describe("PORTA LATERAL FECHADA — o pedido do cliente não absolve a peça reprovada", () => {
  it("quality_flag continua quality_flag: a refação do cliente não passa por ela", async () => {
    await refazerPorPedidoDoCliente({ clientRequestId: "cr1", department: "social-media", comentario: "deixa mais simpático" });
    expect(estado.entregas[0]!.revisionStatus).toBe("quality_flag");
    expect(estado.entregas[0]!.version, "nem versão nova, nem tentativa gasta").toBe(1);
  });

  it("e a apresentação segue recusando — mesmo resultado do controle", async () => {
    await refazerPorPedidoDoCliente({ clientRequestId: "cr1", department: "social-media", comentario: "deixa mais simpático" });
    const r = await apresentar("p1");
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/ressalva da Qualidade/);
  });

  it("controle: sem a refação, a apresentação é recusada", async () => {
    const r = await apresentar("p1");
    expect(r.ok).toBe(false);
  });

  it("e o cliente não fica no escuro: recebe que a entrega está em revisão", async () => {
    await refazerPorPedidoDoCliente({ clientRequestId: "cr1", department: "social-media", comentario: "deixa mais simpático" });
    const corpo = db.portalMessage.create.mock.calls[0]![0].data.body as string;
    expect(corpo).toMatch(/em revisão aqui com a equipe/);
  });
});
