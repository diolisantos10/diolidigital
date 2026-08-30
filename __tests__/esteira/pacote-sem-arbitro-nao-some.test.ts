// O PACOTE QUE NINGUÉM AUDITOU NÃO PODE SUMIR.
//
// Medido em produção em 26/08/2026, cliente oculto, projeto
// `cmt9l4eu0005e0xmngtcm4w3o`: o árbitro bateu no `HTTP 429` do provedor, a
// peça ficou `quality_nao_auditado`, e `apresentar()` a segurou — corretamente,
// com a frase certa:
//
//   "1 entrega(s) que NINGUÉM auditou — ausência de auditoria não é aprovação.
//    Não é defeito da peça: não reescreva, destrave a auditoria."
//
// E aí o pacote sumiu: `pacotesTravados()` filtrava só `quality_flag`, então
// `/api/pacotes-travados` não o listava, o despertador não passava por ele, e
// ninguém reauditava — nunca. Proibição sem instrução gêmea empurra o operador
// para o contorno, e o contorno aqui é `mesmoComRessalva`, que desliga o único
// freio da casa.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  project: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  deliverable: { findMany: vi.fn(), update: vi.fn(async (_args: { where: { id: string }; data: Record<string, unknown> }) => ({})) },
  clientRequestDb: { findUnique: vi.fn(async () => null) },
  client: { findUnique: vi.fn(async () => null) },
  activityEvent: { create: vi.fn(async () => ({})) },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const auditDeliverable = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agency/execution/quality-auditor", async (original) => {
  const real = await original<typeof import("@/lib/agency/execution/quality-auditor")>();
  return { ...real, auditDeliverable };
});

import { pacotesTravados, reauditarSemArbitro } from "@/lib/agency/esteira/pacote-travado";

const PROJETO = {
  id: "proj-oculto",
  workspaceId: "ws-1",
  clientId: "cli-1",
  clientRequestId: "req-1",
  presentedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.project.findUnique.mockResolvedValue(PROJETO);
});

describe("o instrumento enxerga o pacote parado por FALTA DE JUIZ", () => {
  it("lista o projeto e separa as duas listas — reprovada e não auditada são fatos diferentes", async () => {
    db.project.findMany.mockResolvedValue([
      {
        id: "proj-oculto",
        name: "Cantina Oculta",
        clientId: "cli-1",
        updatedAt: new Date("2026-08-26T05:00:00Z"),
        deliverables: [
          { id: "d1", name: "Legendas Prontas", lastFeedback: null, version: 1, revisionStatus: "quality_nao_auditado" },
          { id: "d2", name: "Posicionamento", lastFeedback: "tom errado", version: 1, revisionStatus: "quality_flag" },
        ],
      },
    ]);

    const [p] = await pacotesTravados();
    expect(p.projectId).toBe("proj-oculto");
    expect(p.naoAuditadas.map((d) => d.name)).toEqual(["Legendas Prontas"]);
    expect(p.reprovadas.map((d) => d.name)).toEqual(["Posicionamento"]);

    // A consulta ao banco pergunta pelos DOIS estados — é isso que fazia o
    // pacote sumir quando perguntava só por um.
    const where = db.project.findMany.mock.calls[0][0].where;
    expect(where.deliverables.some.revisionStatus.in).toEqual(
      expect.arrayContaining(["quality_flag", "quality_nao_auditado"]),
    );
  });

  it("o teto de tentativas de REESCRITA não aposenta quem só espera um juiz", async () => {
    db.project.findMany.mockResolvedValue([
      {
        id: "proj-oculto",
        name: "Cantina Oculta",
        clientId: "cli-1",
        updatedAt: new Date(),
        deliverables: [
          { id: "d1", name: "Legendas", lastFeedback: null, version: 9, revisionStatus: "quality_nao_auditado" },
        ],
      },
    ]);
    const [p] = await pacotesTravados();
    // `esperandoDecisao` é o freio da REESCRITA cara. Reaudição não reescreve —
    // e um provedor fora do ar pode voltar a qualquer hora.
    expect(p.esperandoDecisao).toBe(false);
  });
});

describe("a instrução gêmea: reauditar, nunca reescrever", () => {
  const semJuiz = [
    { id: "d1", name: "Legendas Prontas", content: "Corpo da peça", type: "social", ownerAgentId: "a3" },
  ];

  it("árbitro aprova → a peça sai de barrada, e o conteúdo NÃO é tocado", async () => {
    db.deliverable.findMany.mockResolvedValue(semJuiz);
    auditDeliverable.mockResolvedValue({
      verdict: "aprovado", issues: [], note: "ok", arbitro: "gemini", arbitroIndependente: true,
    });

    const r = await reauditarSemArbitro("proj-oculto");
    expect(r.aprovadas).toEqual(["Legendas Prontas"]);

    const escrita = db.deliverable.update.mock.calls.at(0)?.[0] as { data: Record<string, unknown> };
    expect(escrita).toBeDefined();
    expect(escrita.data.revisionStatus).toBe("quality_ok");
    expect(escrita.data.qualityArbiter).toBe("gemini");
    // A PROVA DE QUE NÃO REESCREVE: nem `content` nem `name` entram na escrita.
    expect(escrita.data).not.toHaveProperty("content");
    expect(escrita.data).not.toHaveProperty("name");
  });

  it("árbitro reprova → vira `quality_flag`, e aí sim a reescrita passa a valer", async () => {
    db.deliverable.findMany.mockResolvedValue(semJuiz);
    auditDeliverable.mockResolvedValue({
      verdict: "reprovado", issues: ["promessa sem lastro"], note: "refazer", arbitro: "openai", arbitroIndependente: true,
    });

    const r = await reauditarSemArbitro("proj-oculto");
    expect(r.reprovadas).toEqual(["Legendas Prontas"]);
    const escrita = db.deliverable.update.mock.calls.at(0)?.[0] as { data: Record<string, unknown> };
    expect(escrita.data.revisionStatus).toBe("quality_flag");
  });

  it("FAIL-CLOSED: árbitro ainda fora do ar não muda NADA — ausência de parecer não é aprovação", async () => {
    db.deliverable.findMany.mockResolvedValue(semJuiz);
    auditDeliverable.mockResolvedValue({
      verdict: "nao_auditado", issues: [], note: "limite de taxa", motivo: "limite_de_taxa",
    });

    const r = await reauditarSemArbitro("proj-oculto");
    expect(r.aindaSemArbitro).toEqual(["Legendas Prontas"]);
    expect(r.aprovadas).toEqual([]);
    expect(db.deliverable.update).not.toHaveBeenCalled();
  });

  it("auditoria que ESTOURA também deixa a peça barrada — exceção não vira absolvição", async () => {
    db.deliverable.findMany.mockResolvedValue(semJuiz);
    auditDeliverable.mockRejectedValue(new Error("provedor caiu"));

    const r = await reauditarSemArbitro("proj-oculto");
    expect(r.aindaSemArbitro).toEqual(["Legendas Prontas"]);
    expect(db.deliverable.update).not.toHaveBeenCalled();
  });

  it("pacote JÁ APRESENTADO não é reauditado por baixo do cliente", async () => {
    db.project.findUnique.mockResolvedValue({ ...PROJETO, presentedAt: new Date() });
    db.deliverable.findMany.mockResolvedValue(semJuiz);

    const r = await reauditarSemArbitro("proj-oculto");
    expect(r.aprovadas).toEqual([]);
    expect(auditDeliverable).not.toHaveBeenCalled();
  });
});
