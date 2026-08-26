// A RESPOSTA DO CLIENTE TAMBÉM DESTRAVA — e a promessa escrita passa a ser verdade.
//
// ── O defeito, medido em produção em 26/08/2026 ────────────────────────────
//
// Fechar o pedido de material e DESTRAVAR a produção são duas coisas, e a casa
// tinha duas portas de fechamento com só uma destravando:
//
//   • `PATCH /api/material-requests/[id]` → `received`, destravava. Porta da EQUIPE.
//   • `POST /api/portal/materiais`        → `resolved`, e parava aí. Porta do
//     CLIENTE — a única que ele tem para dizer "mandei", "não tenho" ou "está
//     no Drive" —, e ela respondia a ele: *"Anotado. A produção volta a andar
//     com isso."*
//
// Promessa escrita ao cliente que o código não cumpre não quebra nada, não
// acusa em lugar nenhum, e o cliente espera. Na 7ª volta de cliente oculto o
// número apareceu inteiro: **30 pedidos no workspace, 30 `pending`, ZERO
// fechados em toda a história.**
//
// Esta régua cobre `destravarPorMaterial`, que subiu sem teste próprio.

import { describe, it, expect, beforeEach, vi } from "vitest";

// ⚠️ As assinaturas destes mocks são EXPLÍCITAS de propósito. Sem elas o
// `vi.hoisted` infere `never[]` para `mock.calls` e o `tsc --noEmit` do CI
// reprova todo acesso por índice — foi assim que esta casa barrou o CI três
// vezes seguidas com teste novo verde localmente.
type Escrita = { where: Record<string, unknown>; data: Record<string, unknown> };
const db = vi.hoisted(() => ({
  materialRequest: {
    count: vi.fn(async (_a: { where: Record<string, unknown> }): Promise<number> => 0),
    findUnique: vi.fn(),
    update: vi.fn(async (_a: Escrita) => ({})),
  },
  project: { findUnique: vi.fn(), update: vi.fn(async (_a: Escrita) => ({})) },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const moverTarefasDoAgente = vi.hoisted(() => vi.fn(async () => ({ movidas: 0 })));
vi.mock("@/lib/agency/esteira/tarefas", () => ({ moverTarefasDoAgente }));

import { destravarPorMaterial, materialRecebido } from "@/lib/agency/esteira/materiais";

const PROJETO_PRONTO = { directionApprovedAt: new Date("2026-08-26T05:35:20Z"), executionStatus: "done" };

beforeEach(() => {
  vi.clearAllMocks();
  db.project.findUnique.mockResolvedValue(PROJETO_PRONTO);
});

describe("chegou tudo → a produção volta para a fila", () => {
  it("re-enfileira, zera o contador de tentativas e limpa o erro anterior", async () => {
    db.materialRequest.count.mockResolvedValue(0);

    const r = await destravarPorMaterial({ projectId: "p1", requestedByAgentId: "a3" });

    expect(r).toMatchObject({ ok: true, aindaFaltam: 0, producaoRetomada: true });
    const escrita = db.project.update.mock.calls.at(0)?.[0];
    expect(escrita).toBeDefined();
    expect(escrita!.data.executionStatus).toBe("pending");
    // Sem zerar, o projeto que ESPEROU material chegaria ao teto de tentativas
    // e nunca mais seria retomado — a espera viraria condenação.
    expect(escrita!.data.executionAttempts).toBe(0);
    expect(escrita!.data.executionError).toBeNull();
  });

  it("o agente que estava travado volta para a fila — a tarefa dele para de mentir", async () => {
    db.materialRequest.count.mockResolvedValue(0);
    await destravarPorMaterial({ projectId: "p1", requestedByAgentId: "a3" });
    expect(moverTarefasDoAgente).toHaveBeenCalledWith("p1", "a3", "pending");
  });

  it("o quadro de tarefas falhar NÃO impede o destrave", async () => {
    db.materialRequest.count.mockResolvedValue(0);
    moverTarefasDoAgente.mockRejectedValueOnce(new Error("quadro fora"));

    const r = await destravarPorMaterial({ projectId: "p1", requestedByAgentId: "a3" });
    expect(r.producaoRetomada).toBe(true);
  });
});

describe("ainda falta coisa → continua esperando, de propósito", () => {
  it("com pedido pendente, NÃO re-enfileira — produzir metade cobraria o cliente de novo", async () => {
    db.materialRequest.count.mockResolvedValue(2);

    const r = await destravarPorMaterial({ projectId: "p1", requestedByAgentId: "a3" });
    expect(r).toMatchObject({ ok: true, aindaFaltam: 2, producaoRetomada: false });
    expect(db.project.update).not.toHaveBeenCalled();
  });

  it("a contagem pergunta por `pending` — `resolved` e `received` são fechamentos, não falta", async () => {
    db.materialRequest.count.mockResolvedValue(0);
    await destravarPorMaterial({ projectId: "p1" });
    expect(db.materialRequest.count.mock.calls.at(0)?.[0]).toEqual({
      where: { projectId: "p1", status: "pending" },
    });
  });
});

describe("as travas que continuam de pé", () => {
  it("sem direção aprovada não se produz, nem com todo o material do mundo", async () => {
    db.materialRequest.count.mockResolvedValue(0);
    db.project.findUnique.mockResolvedValue({ directionApprovedAt: null, executionStatus: "done" });

    const r = await destravarPorMaterial({ projectId: "p1" });
    expect(r.producaoRetomada).toBe(false);
    expect(db.project.update).not.toHaveBeenCalled();
  });

  it("já está rodando → deixa rodar, não re-enfileira por cima", async () => {
    db.materialRequest.count.mockResolvedValue(0);
    db.project.findUnique.mockResolvedValue({ ...PROJETO_PRONTO, executionStatus: "running" });

    const r = await destravarPorMaterial({ projectId: "p1" });
    expect(r.producaoRetomada).toBe(false);
    expect(db.project.update).not.toHaveBeenCalled();
  });
});

describe("a porta da EQUIPE continua passando pelo mesmo destrave", () => {
  it("`materialRecebido` marca `received` e destrava pelo mesmo caminho", async () => {
    db.materialRequest.findUnique.mockResolvedValue({
      id: "m1", projectId: "p1", status: "pending", requestedByAgentId: "a3",
    });
    db.materialRequest.count.mockResolvedValue(0);

    const r = await materialRecebido("m1");

    expect(db.materialRequest.update.mock.calls.at(0)?.[0]?.data.status).toBe("received");
    expect(r.producaoRetomada).toBe(true);
    // Duas portas, UM destrave. Duas cópias da mesma decisão divergem — foi
    // assim que uma porta passou a destravar e a outra não.
    expect(moverTarefasDoAgente).toHaveBeenCalledWith("p1", "a3", "pending");
  });

  it("pedido inexistente não destrava nada e diz por quê", async () => {
    db.materialRequest.findUnique.mockResolvedValue(null);
    const r = await materialRecebido("nao-existe");
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/não encontrado/i);
    expect(db.project.update).not.toHaveBeenCalled();
  });
});
