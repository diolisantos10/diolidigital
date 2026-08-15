// A CORRENTE INTEIRA, não a peça: reprovada → refeita → apresentada?
//
// Cada peça desta esteira tem teste próprio e todos passavam. A quebra estava
// na JUNTA. A 5ª auditoria adversarial (04/08/2026) andou a corrente e achou o
// caminho real:
//
//   Qualidade REPROVA  →  `quality_flag`
//   pacote-travado refaz  →  gravava `quality_ok` À MÃO, sem árbitro nenhum
//   marcos.apresentar só barra `quality_flag`  →  VAI AO CLIENTE
//
// O freio da casa tinha uma porta dos fundos, e era justamente o caminho de
// conserto. Este arquivo é o teste que os testes por peça não conseguiam dar:
// ele roda os DOIS módulos contra o MESMO banco de mentira, na ordem em que a
// operação roda.

import { describe, it, expect, beforeEach, vi } from "vitest";

interface Entrega {
  id: string; name: string; content: string; ownerAgentId: string;
  lastFeedback: string; version: number; revisionStatus: string;
}

const estado = vi.hoisted(() => ({
  entregas: [] as Array<Record<string, unknown>>,
  projeto: {} as Record<string, unknown>,
}));

const db = vi.hoisted(() => ({
  project: {
    findUnique: vi.fn(async () => estado.projeto),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      Object.assign(estado.projeto, data);
      return estado.projeto;
    }),
  },
  deliverable: {
    // O filtro por `revisionStatus` é honrado: é exatamente ele que decide
    // quem o destravamento vê e quem a apresentação barra.
    findMany: vi.fn(async ({ where }: { where?: { revisionStatus?: string } } = {}) =>
      estado.entregas.filter((d) => !where?.revisionStatus || d.revisionStatus === where.revisionStatus)),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const alvo = estado.entregas.find((d) => d.id === where.id)!;
      for (const [k, v] of Object.entries(data)) {
        if (v && typeof v === "object" && "increment" in (v as object)) {
          alvo[k] = (alvo[k] as number) + (v as { increment: number }).increment;
        } else {
          alvo[k] = v;
        }
      }
      return alvo;
    }),
    updateMany: vi.fn(async () => ({ count: 0 })),
  },
  clientRequestDb: { findUnique: vi.fn(async () => ({ businessName: "Padaria do João", segment: "alimentação", services: "[]", objectives: "[]" })) },
  activityEvent: { create: vi.fn(async () => ({})) },
  materialRequest: { count: vi.fn(async () => 0) },
  // O cliente e a gaveta das PROIBIÇÕES. Desde 15/08 o destravamento do pacote
  // tem PISO DE VERDADE — ele era o único dos quatro motores que refazia peça
  // sem conferir dado inventado, justamente no caminho de CONSERTO.
  client: { findUnique: vi.fn(async () => ({ phone: null, email: null })) },
  brainArtifact: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({})) },
  approvalRequest: { updateMany: vi.fn(async () => ({ count: 0 })) },
  portalMessage: { create: vi.fn(async () => ({})) },
  deliverableVersion: { create: vi.fn(async () => ({ id: "v1" })), findFirst: vi.fn(async () => null) },
  task: { findMany: vi.fn(async () => []) },
}));

const generate = vi.hoisted(() => vi.fn());
const auditDeliverable = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/ai/generate", () => ({ generate }));
vi.mock("@/lib/agency/execution/quality-auditor", async (original) => ({
  ...(await original<typeof import("@/lib/agency/execution/quality-auditor")>()),
  auditDeliverable,
}));
vi.mock("@/lib/agency/execution/run-execution", () => ({ runProjectExecution: vi.fn() }));
vi.mock("@/lib/agency/esteira/avisos", () => ({ avisarCliente: vi.fn(async () => undefined) }));
vi.mock("@/lib/agency/esteira/publicacao", () => ({
  agendarPostsDaEntrega: vi.fn(async () => undefined),
  aprovarCalendario: vi.fn(async () => undefined),
}));

import { destravarPacote } from "@/lib/agency/esteira/pacote-travado";
import { apresentar } from "@/lib/agency/esteira/marcos";

const REPROVADA: Entrega = {
  id: "d1", name: "Plano de Conteúdo", content: "promete triplicar as vendas",
  ownerAgentId: "a5", lastFeedback: "promessa de resultado que não se sustenta",
  version: 1, revisionStatus: "quality_flag",
};

beforeEach(() => {
  vi.clearAllMocks();
  estado.entregas = [{ ...REPROVADA }];
  estado.projeto = {
    id: "p1", name: "Padaria do João — Social", workspaceId: "ws1", clientId: "c1",
    clientRequestId: "cr1", presentedAt: null, directionApprovedAt: new Date("2026-08-01"),
    clientApprovedAt: null,
  };
  generate.mockResolvedValue({
    ok: true,
    data: {
      title: "Plano de Conteúdo v2",
      summary: "Sem promessa de resultado, com cadência semanal definida.",
      // TRÊS indicadores: o contrato de `a5` pede 3 a 8. Com UM, o conserto
      // devolveria um terço da peça — e nada conferia isso neste caminho.
      items: [
        { headline: "Bastidores", note: "3x por semana" },
        { headline: "Alcance", note: "medido no Instagram, semanal" },
        { headline: "Mensagens recebidas", note: "medido na caixa de entrada, semanal" },
      ],
    },
  });
});

const ultimaChamada = (fn: { mock: { calls: unknown[] } }): Record<string, string> => {
  const args = fn.mock.calls.at(-1) as unknown[] | undefined;
  return ((args?.[0] as { data?: Record<string, string> })?.data ?? {});
};

const ultimaMensagemAoCliente = () => String(ultimaChamada(db.portalMessage.create).body ?? "");

describe("A PORTA DOS FUNDOS ESTÁ FECHADA — reprovada não chega ao cliente sem árbitro", () => {
  it("árbitro indisponível na refação: a peça NÃO sai aprovada e a apresentação é RECUSADA", async () => {
    auditDeliverable.mockResolvedValue({ verdict: "nao_auditado", issues: [], note: "NÃO AUDITADA: a IA caiu.", motivo: "ia_indisponivel" });

    await destravarPacote("p1");
    expect(estado.entregas[0]!.revisionStatus, "sem juiz, a reprovação continua de pé").toBe("quality_flag");

    const r = await apresentar("p1");
    expect(r.ok, "era exatamente aqui que a peça reprovada escapava").toBe(false);
    expect(r.erro).toMatch(/ressalva da Qualidade/);
    expect(estado.projeto.presentedAt, "não apresentado é não apresentado").toBeNull();
    expect(db.portalMessage.create, "o cliente não recebe nada").not.toHaveBeenCalled();
  });

  it("árbitro reprovou de novo: idem — refazer não é absolver", async () => {
    auditDeliverable.mockResolvedValue({ verdict: "reprovado", issues: ["continua prometendo resultado"], note: "" });

    await destravarPacote("p1");
    const r = await apresentar("p1");

    expect(r.ok).toBe(false);
    expect(estado.projeto.presentedAt).toBeNull();
  });

  it("árbitro APROVOU a versão nova: aí a corrente anda até o cliente, como deve", async () => {
    auditDeliverable.mockResolvedValue({ verdict: "aprovado", issues: [], note: "corrigiu o apontado" });

    const d = await destravarPacote("p1");
    expect(d.corrigidas).toHaveLength(1);
    expect(estado.entregas[0]!.revisionStatus).toBe("quality_ok");

    const r = await apresentar("p1");
    expect(r.ok).toBe(true);
    expect(estado.projeto.presentedAt).toBeTruthy();
    // Auditada e aprovada — só AQUI a agência pode dizer que revisou.
    expect(ultimaMensagemAoCliente()).toContain("revisei tudo antes de te mostrar");
  });
});

describe("A MENSAGEM AO CLIENTE NÃO AFIRMA A REVISÃO QUE NÃO HOUVE", () => {
  it("pacote `nao_auditado` é apresentado (não bloqueia) mas SEM alegar revisão", async () => {
    // Peça que nunca teve juiz: a indisponibilidade não pode parar a operação
    // inteira. Mas a casa também não pode dizer ao cliente, por escrito, que
    // revisou — era a frase que o próprio código se recusava a declarar.
    estado.entregas = [{ ...REPROVADA, id: "d9", name: "Calendário", revisionStatus: "quality_nao_auditado" }];

    const r = await apresentar("p1");
    expect(r.ok, "indisponibilidade NÃO bloqueia").toBe(true);
    expect(ultimaMensagemAoCliente()).not.toContain("revisei tudo");
    expect(ultimaMensagemAoCliente(), "e sem alarmar o cliente à toa").toContain("Terminamos!");
  });

  it("um pacote misto também não pode alegar revisão do todo", async () => {
    estado.entregas = [
      { ...REPROVADA, id: "d1", revisionStatus: "quality_ok" },
      { ...REPROVADA, id: "d2", name: "Calendário", revisionStatus: "quality_nao_auditado" },
    ];
    await apresentar("p1");
    expect(ultimaMensagemAoCliente()).not.toContain("revisei tudo");
  });

  it("o TIME é avisado do que foi ao cliente sem árbitro — silêncio aqui é o buraco", async () => {
    estado.entregas = [{ ...REPROVADA, id: "d9", name: "Calendário", revisionStatus: "quality_nao_auditado" }];
    await apresentar("p1");
    const evento = ultimaChamada(db.activityEvent.create);
    expect(evento.type).toBe("apresentado_sem_auditoria");
    expect(evento.message).toContain("Calendário");
  });
});
