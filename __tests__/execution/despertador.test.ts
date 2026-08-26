import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({ project: { findMany: vi.fn(), update: vi.fn() } }));
const runProjectExecution = vi.hoisted(() => vi.fn());
const dispatchWhatsAppNotifications = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/execution/run-execution", () => ({ runProjectExecution }));
vi.mock("@/lib/integrations/meta/notifications", () => ({ dispatchWhatsAppNotifications }));
const destravarPacote = vi.hoisted(() => vi.fn());
const pacotesTravados = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agency/esteira/pacote-travado", () => ({ destravarPacote, pacotesTravados }));

import { baterORelogio, transicaoDeEstado } from "@/lib/agency/despertador";

beforeEach(() => {
  vi.clearAllMocks();
  db.project.findMany.mockResolvedValue([]);
  runProjectExecution.mockResolvedValue({ ok: true, status: "done", produced: ["X"], askedClient: [], skipped: [] });
  dispatchWhatsAppNotifications.mockResolvedValue({ scanned: 0, sent: 0, failed: 0, skipped: 0, details: [] });
  db.project.update.mockResolvedValue({});
  pacotesTravados.mockResolvedValue([]);
  destravarPacote.mockResolvedValue({ projectId: "p1", corrigidas: [], persistentes: [], escalado: false });
});


/**
 * A batida do relógio faz MAIS de uma varredura em `project.findMany`: desde
 * `ligar-projeto.ts` a primeira é a dos projetos `idle` que ninguém ligou. Fixar
 * `calls[0]` amarraria estes testes à ORDEM das pernas, e não ao que eles
 * querem provar — as travas de `retomarProducao`. Escolhemos a chamada pela
 * assinatura dela: só a de `retomarProducao` consulta por `OR` de estados.
 */
function varreduraDeRetomada() {
  const chamada = db.project.findMany.mock.calls.find(
    (c) => Array.isArray((c[0] as { where?: { OR?: unknown } } | undefined)?.where?.OR),
  ) as [{ where: Record<string, any>; take: number; orderBy: unknown }] | undefined;
  if (!chamada) throw new Error("retomarProducao não consultou project.findMany");
  return chamada[0];
}

describe("o despertador — o que faz a agência trabalhar às 3 da manhã", () => {
  it("retoma a produção parada e dispara os avisos na mesma batida", async () => {
    db.project.findMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);
    dispatchWhatsAppNotifications.mockResolvedValue({ scanned: 3, sent: 2, failed: 0, skipped: 1, details: [] });

    const r = await baterORelogio();
    expect(runProjectExecution).toHaveBeenCalledTimes(2);
    expect(r.retomados).toBe(2);
    expect(r.avisos).toBe(2);
  });

  it("só acorda projeto cuja direção o cliente JÁ aprovou", async () => {
    // Sem este filtro o relógio atropelaria o portão de direção — produziria
    // um mês inteiro de trabalho que o cliente ainda não avalizou.
    await baterORelogio();
    const where = varreduraDeRetomada().where;
    expect(where.directionApprovedAt).toEqual({ not: null });
  });

  it("acorda os três estados que ficariam parados para sempre", async () => {
    await baterORelogio();
    const where = varreduraDeRetomada().where;
    const estados = where.OR.map((o: { executionStatus: string }) => o.executionStatus);
    expect(estados).toContain("running"); // caiu no meio
    expect(estados).toContain("failed");  // falha momentânea de IA
    expect(estados).toContain("pending"); // aprovou e o disparo não chegou a acontecer
  });

  it("desiste depois de tentar demais — insistir para sempre queima dinheiro de IA", async () => {
    await baterORelogio();
    const where = varreduraDeRetomada().where;
    expect(where.executionAttempts).toEqual({ lt: 5 });
  });

  it("recuperação é recuperação, não enxurrada: no máximo 5 por rodada", async () => {
    await baterORelogio();
    expect(varreduraDeRetomada().take).toBe(5);
  });

  it("o mais antigo primeiro — quem espera há mais tempo tem a vez", async () => {
    await baterORelogio();
    expect(varreduraDeRetomada().orderBy).toEqual({ executionRequestedAt: "asc" });
  });
});

describe("o relógio nunca pode morrer", () => {
  it("um projeto que explode não derruba os outros da rodada", async () => {
    db.project.findMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }, { id: "p3" }]);
    runProjectExecution
      .mockResolvedValueOnce({ ok: true, status: "done", produced: ["A"], askedClient: [], skipped: [] })
      .mockRejectedValueOnce(new Error("banco fora"))
      .mockResolvedValueOnce({ ok: true, status: "done", produced: ["C"], askedClient: [], skipped: [] });

    const r = await baterORelogio();
    expect(runProjectExecution).toHaveBeenCalledTimes(3);
    expect(r.retomados).toBe(2);
  });

  it("banco fora na busca não impede o disparo dos avisos", async () => {
    db.project.findMany.mockRejectedValue(new Error("banco fora"));
    dispatchWhatsAppNotifications.mockResolvedValue({ scanned: 1, sent: 1, failed: 0, skipped: 0, details: [] });

    const r = await baterORelogio();
    expect(r.retomados).toBe(0);
    expect(r.avisos).toBe(1);
  });

  it("WhatsApp fora do ar não impede a produção de ser retomada", async () => {
    db.project.findMany.mockResolvedValue([{ id: "p1" }]);
    dispatchWhatsAppNotifications.mockRejectedValue(new Error("Meta fora"));

    const r = await baterORelogio();
    expect(r.retomados).toBe(1);
    expect(r.avisos).toBe(0);
  });
});

// A Qualidade barrar e ninguem refazer foi o buraco encontrado no primeiro
// projeto real. O relogio e quem fecha esse ciclo agora.
describe("o relógio destrava o que a Qualidade barrou", () => {
  it("refaz as entregas reprovadas e re-enfileira o projeto", async () => {
    pacotesTravados.mockResolvedValue([{ projectId: "p9", esperandoDecisao: false, naoAuditadas: [] }]);
    destravarPacote.mockResolvedValue({ projectId: "p9", corrigidas: ["Analytics · Plano"], persistentes: [], escalado: false });

    const r = await baterORelogio();
    expect(r.destravadas).toBe(1);
    // Voltou a ter peca boa: a producao segue pelo fluxo normal (auditoria +
    // apresentacao automatica), nao por um atalho deste modulo.
    expect(db.project.update.mock.calls[0]![0].data.executionStatus).toBe("pending");
  });

  it("pacote esperando decisão do Diretor NÃO é mexido pela máquina", async () => {
    // Depois do teto de tentativas, insistir e queimar IA num problema que o
    // modelo ja mostrou que nao resolve.
    pacotesTravados.mockResolvedValue([{ projectId: "p9", esperandoDecisao: true }]);
    await baterORelogio();
    expect(destravarPacote).not.toHaveBeenCalled();
  });

  it("escalou → não re-enfileira, porque a bola é do Diretor", async () => {
    pacotesTravados.mockResolvedValue([{ projectId: "p9", esperandoDecisao: false, naoAuditadas: [] }]);
    destravarPacote.mockResolvedValue({ projectId: "p9", corrigidas: ["X"], persistentes: ["Y"], escalado: true });
    await baterORelogio();
    expect(db.project.update).not.toHaveBeenCalled();
  });

  it("destravamento explodindo não impede a produção nem os avisos", async () => {
    pacotesTravados.mockRejectedValue(new Error("banco fora"));
    db.project.findMany.mockResolvedValue([{ id: "p1" }]);
    const r = await baterORelogio();
    expect(r.retomados).toBe(1);
    expect(r.destravadas).toBe(0);
  });
});

// ── SÓ A MUDANÇA DE ESTADO VIRA LINHA DE LOG (24/08/2026) ────────────────────
//
// O achado: `decisao-do-dono falhou: … nenhum cliente resolvido` repetido a
// cada 5 minutos, por 16 dias, sobre uma casa que apenas ainda não tinha
// cliente. O conserto NÃO é calar o fato — é dizê-lo quando ele COMEÇA e
// quando ele TERMINA, e deixá-lo consultável o tempo todo em `/api/pulso`.
//
// Esta função é a metade pura do conserto: dado o que já foi anunciado e o que
// vale agora, o que precisa virar linha nova.
describe("transição de estado — o que já foi dito não se repete", () => {
  it("estado que continua igual NÃO vira linha nova", () => {
    const t = transicaoDeEstado(["decisao-do-dono::sem cliente"], ["decisao-do-dono::sem cliente"]);
    expect(t.comecaram).toEqual([]);
    expect(t.terminaram).toEqual([]);
  });

  it("estado que COMEÇA é anunciado", () => {
    const t = transicaoDeEstado([], ["decisao-do-dono::sem cliente"]);
    expect(t.comecaram).toEqual(["decisao-do-dono::sem cliente"]);
  });

  it("estado que TERMINA também é anunciado — sumir em silêncio é perder o fim da história", () => {
    const t = transicaoDeEstado(["decisao-do-dono::sem cliente"], []);
    expect(t.terminaram).toEqual(["decisao-do-dono::sem cliente"]);
    expect(t.comecaram).toEqual([]);
  });
});
