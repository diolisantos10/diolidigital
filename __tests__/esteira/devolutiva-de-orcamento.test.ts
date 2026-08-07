// A TERCEIRA SAÍDA DO ORÇAMENTO — e a prova de que ela vira TRABALHO.
//
// A história (CEO, 06/08/2026): "eu não aprovei os carrosséis, mandei uma
// devolutiva do que tem que ser feito, e estou esperando até agora." O cartão
// de orçamento só tinha "Aprovar e fazer" e "Agora não". A devolutiva dele não
// tinha para onde ir, e o pedido ficou DOIS DIAS parado.
//
// O erro que este teste existe para impedir é o da versão preguiçosa: gravar o
// texto do cliente e não acionar ninguém. Isso reproduz o problema com outra
// roupa — um campo a mais no banco e o trabalho ainda esperando alguém lembrar.
//
// AS DUAS METADES:
//   1. Com apontamento → vira rodada nova COM DONO E PRAZO, pelo portão do PM.
//   2. Sem apontamento → não envia, e NADA é criado. (A prova do vazio mora no
//      teste da rota, `devolutiva-orcamento-rota.test.ts`, porque é lá que o 400
//      acontece; aqui provamos o fundo de poço da própria função.)

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  contentRequest: { findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  task: { findUnique: vi.fn(), createMany: vi.fn() },
  portalMessage: { create: vi.fn() },
  project: { findUnique: vi.fn() },
  activityEvent: { create: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import {
  devolverOrcamentoComApontamentos,
  AJUSTE_SOLICITADO,
} from "@/lib/agency/esteira/devolutiva-de-orcamento";

const PEDIDO = {
  id: "pd1",
  title: "Carrosséis semanais",
  description: "preciso de dois carrosseis por semana",
  quotedPrice: 297,
  projectId: "p1",
  taskId: "t1",
  clientId: "c1",
};

const APONTAMENTO = "O valor está acima do que posso agora. Consegue fechar só os 2 primeiros?";

beforeEach(() => {
  vi.clearAllMocks();
  db.contentRequest.findFirst.mockResolvedValue({ ...PEDIDO });
  db.contentRequest.updateMany.mockResolvedValue({ count: 1 });
  db.contentRequest.update.mockResolvedValue({});
  db.portalMessage.create.mockResolvedValue({});
  db.task.findUnique.mockResolvedValue({ agentId: "social-copy" });
  db.task.createMany.mockResolvedValue({ count: 1 });
  db.project.findUnique.mockResolvedValue({ workspaceId: "w1", clientId: "c1" });
  db.activityEvent.create.mockResolvedValue({});
});

describe("METADE 1 — com apontamento, a devolutiva vira trabalho de verdade", () => {
  it("abre uma rodada nova COM DONO E COM PRAZO", async () => {
    const r = await devolverOrcamentoComApontamentos({
      pedidoId: "pd1", clientId: "c1", apontamento: APONTAMENTO,
    });

    expect(r.ok).toBe(true);
    expect(r.tarefaCriada, "o apontamento não virou tarefa — é o silêncio de 06/08 de novo").toBe(true);

    // A tarefa existe, e passou pelo portão do PM (que recusaria sem estes dois).
    expect(db.task.createMany).toHaveBeenCalledTimes(1);
    const tarefa = db.task.createMany.mock.calls[0][0].data[0];
    expect(tarefa.agentId, "tarefa sem dono não pode ser salva").toBe("social-copy");
    expect(tarefa.dueDate, "tarefa sem prazo não pode ser salva").toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(tarefa.projectId).toBe("p1");

    // As palavras do CLIENTE chegam inteiras a quem vai executar — não viram
    // resumo de ninguém. É a verdade ancorada do especialista.
    expect(tarefa.description).toContain(APONTAMENTO);
  });

  it("a agência FICA SABENDO — o apontamento aparece na conversa, com as palavras dele", async () => {
    await devolverOrcamentoComApontamentos({
      pedidoId: "pd1", clientId: "c1", apontamento: APONTAMENTO,
    });
    const msg = db.portalMessage.create.mock.calls[0][0].data;
    expect(msg.authorRole).toBe("client");
    expect(msg.body).toContain(APONTAMENTO);
  });

  it("NÃO reescreve o orçamento anterior — sai da fila do cliente e volta para a agência", async () => {
    await devolverOrcamentoComApontamentos({
      pedidoId: "pd1", clientId: "c1", apontamento: APONTAMENTO,
    });
    const escrita = db.contentRequest.updateMany.mock.calls[0][0];
    expect(escrita.data.quoteStatus).toBe(AJUSTE_SOLICITADO);
    // O preço NÃO é apagado nem sobrescrito: a proposta anterior fica no
    // registro, e a próxima é uma rodada nova. Imutabilidade, como a tela promete.
    expect(escrita.data).not.toHaveProperty("quotedPrice");
    // Escrita condicional: o estado entra no WHERE (dois toques no 4G não
    // podem produzir duas devolutivas).
    expect(escrita.where.quoteStatus).toBe("pendente");
  });

  it("orçamento já decidido não aceita devolutiva — e nenhuma tarefa nasce", async () => {
    db.contentRequest.updateMany.mockResolvedValue({ count: 0 });
    const r = await devolverOrcamentoComApontamentos({
      pedidoId: "pd1", clientId: "c1", apontamento: APONTAMENTO,
    });
    expect(r.ok).toBe(false);
    expect(db.task.createMany).not.toHaveBeenCalled();
  });
});

describe("METADE 2 — sem apontamento, nada acontece", () => {
  it("apontamento vazio não grava, não avisa e não cria tarefa", async () => {
    const r = await devolverOrcamentoComApontamentos({
      pedidoId: "pd1", clientId: "c1", apontamento: "   ",
    });
    expect(r.ok).toBe(false);
    expect(db.contentRequest.updateMany).not.toHaveBeenCalled();
    expect(db.portalMessage.create).not.toHaveBeenCalled();
    expect(db.task.createMany).not.toHaveBeenCalled();
  });
});

describe("FAIL-CLOSED — sem dono derivável a casa PARA e chama gente", () => {
  it("pedido sem tarefa anterior não sorteia responsável: escala, e não fica em silêncio", async () => {
    db.task.findUnique.mockResolvedValue({ agentId: null });

    const r = await devolverOrcamentoComApontamentos({
      pedidoId: "pd1", clientId: "c1", apontamento: APONTAMENTO,
    });

    // A devolutiva foi REGISTRADA (ok), mas não virou tarefa — e isso é dito.
    expect(r.ok).toBe(true);
    expect(r.tarefaCriada).toBe(false);
    expect(db.task.createMany).not.toHaveBeenCalled();

    // E não sumiu: o pedido vai para `precisa_decisao`, que a caixa de entrada
    // da agência já mostra, com o texto do cliente no motivo.
    const update = db.contentRequest.update.mock.calls[0][0];
    expect(update.data.status).toBe("precisa_decisao");
    expect(update.data.declineReason).toContain(APONTAMENTO);

    // …e vira alarme no workspace.
    expect(db.activityEvent.create).toHaveBeenCalled();
    expect(db.activityEvent.create.mock.calls[0][0].data.type).toBe("orcamento_devolvido_sem_dono");
  });

  it("pedido sem projeto também escala, em vez de inventar um projeto", async () => {
    db.contentRequest.findFirst.mockResolvedValue({ ...PEDIDO, projectId: null });
    const r = await devolverOrcamentoComApontamentos({
      pedidoId: "pd1", clientId: "c1", apontamento: APONTAMENTO,
    });
    expect(r.tarefaCriada).toBe(false);
    expect(db.task.createMany).not.toHaveBeenCalled();
    expect(db.contentRequest.update.mock.calls[0][0].data.status).toBe("precisa_decisao");
  });
});
