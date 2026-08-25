// A TRAVA 1-B — STORY NÃO CAI NO PREÇO NEM NO FORMATO DE FEED.
//
// ── O defeito que estes testes impedem de voltar ─────────────────────────────
//
// Até 25/08/2026 o atendimento `post-ou-carrossel` dizia, na própria frase que
// o modelo lê: "o cliente quer uma arte, um post, um carrossel ou um story".
// Ele apontava para `balcao-post-feed` — peça de FEED, 1080×1350, R$ 79.
//
// O cliente escrevia "quero 4 stories", o modelo escolhia o id certo pela
// descrição errada, e o formato pedido MORRIA ali. Ele pagava preço de feed e
// recebia (quando recebia) formato de feed.
//
// A carta foi separada. Esta suíte guarda a outra metade: **mesmo que a
// classificação erre**, o pedido não vira dinheiro no produto errado.
//
// ── Por que a trava PARA em vez de corrigir sozinha ─────────────────────────
//
// Porque o texto pode legitimamente pedir as duas coisas ("um post pro feed e
// um story"), que são dois trabalhos e dois preços. A casa já tem a resposta
// certa para divergência entre a leitura léxica e a escolha do modelo, e ela é
// a da TRAVA 1: **pergunta, nunca cobra.**

import { describe, it, expect, vi, beforeEach } from "vitest";
import { escadaToda } from "../_escada";

interface Registro { [k: string]: unknown }
const pedidos = new Map<string, Registro>();

const db = {
  contentRequest: {
    findUnique: vi.fn(({ where }: { where: { id: string } }) => Promise.resolve(pedidos.get(where.id) ?? null)),
    findUniqueOrThrow: vi.fn(({ where }: { where: { id: string } }) => {
      const r = pedidos.get(where.id);
      if (!r) throw new Error("não encontrado");
      return Promise.resolve(r);
    }),
    findFirst: vi.fn(() => Promise.resolve(null)),
    update: vi.fn(({ where, data }: { where: { id: string }; data: Registro }) => {
      const r = pedidos.get(where.id)!;
      Object.assign(r, data, { updatedAt: new Date() });
      return Promise.resolve(r);
    }),
    updateMany: vi.fn(({ where, data }: { where: Registro; data: Registro }) => {
      const r = pedidos.get(where.id as string);
      if (!r) return Promise.resolve({ count: 0 });
      Object.assign(r, data, { updatedAt: new Date() });
      return Promise.resolve({ count: 1 });
    }),
  },
  client: {
    findUnique: vi.fn(() => Promise.resolve(CLIENTE)),
    findUniqueOrThrow: vi.fn(() => Promise.resolve(CLIENTE)),
  },
  project: {
    findFirst: vi.fn(() => Promise.resolve({ id: "prj-1", name: "Padaria" })),
    findUnique: vi.fn(() => Promise.resolve({ clientRequestId: null })),
    findUniqueOrThrow: vi.fn(() => Promise.resolve({
      id: "prj-1", name: "Padaria", goal: "vender mais",
      workspaceId: "ws-1", clientId: "cli-1", clientRequestId: null,
    })),
  },
  cycle: { findFirst: vi.fn(() => Promise.resolve(null)) },
  clientRequestDb: { findUnique: vi.fn(() => Promise.resolve(null)) },
  task: {
    create: vi.fn(() => Promise.resolve({ id: "task-1" })),
    findUnique: vi.fn(() => Promise.resolve({ id: "task-1", agentId: "design-criativo-social" })),
    update: vi.fn(() => Promise.resolve({})),
  },
  socialPost: { findMany: vi.fn(() => Promise.resolve([])), update: vi.fn(() => Promise.resolve({})) },
  timelineEvent: { create: vi.fn(() => Promise.resolve({})) },
  activityEvent: { create: vi.fn(() => Promise.resolve({})) },
  portalMessage: { create: vi.fn(() => Promise.resolve({})) },
  brainArtifact: {
    findFirst: vi.fn(() => Promise.resolve(null)),
    findMany: vi.fn(() => Promise.resolve([])),
    create: vi.fn(() => Promise.resolve({})),
  },
  departmentLadder: {
    findMany: vi.fn(() => Promise.resolve(escadaToda("wide"))),
    findUnique: vi.fn(() => Promise.resolve({ degrau: "wide" })),
    create: vi.fn(() => Promise.resolve({})),
    update: vi.fn(() => Promise.resolve({})),
  },
  departmentLadderRecord: { create: vi.fn(() => Promise.resolve({})), findMany: vi.fn(() => Promise.resolve([])) },
};
const CLIENTE = {
  id: "cli-1", name: "Padaria da Esquina", workspaceId: "ws-1", industry: "Alimentação",
  email: "contato@padaria.test", phone: null, brandBrain: null,
};
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const generate = vi.fn<(...a: unknown[]) => Promise<unknown>>();
vi.mock("@/lib/ai/generate", () => ({ generate: (...a: unknown[]) => generate(...a) }));

vi.mock("@/lib/agency/persistence/approval-service", () => ({
  createApprovalRequest: () => Promise.resolve({ id: "apr-1" }),
}));

vi.mock("@/app/api/messages/conversa", () => ({
  conversaDoCliente: () => Promise.resolve({ ancora: { clientId: "cli-1", clientRequestId: null } }),
}));

const { triarPedido, precoDaTabela } = await import("@/lib/agency/esteira/triagem");
const { ID_STORY_V1 } = await import("@/lib/agency/produtos/registro");

function novoPedido(descricao: string, objetivo = "aparecer mais no Instagram") {
  pedidos.clear();
  pedidos.set("pc-1", {
    id: "pc-1", clientId: "cli-1", clientRequestId: null, projectId: null,
    title: descricao.slice(0, 60), description: descricao, objective: objetivo,
    desiredFor: null, attachmentsJson: "[]", status: "novo",
    scopeDecision: null, quotedPrice: null, quoteNote: null, quoteStatus: null,
    taskId: null, promisedFor: null, deliverableId: null, productionAttempts: 0,
    produtoId: null, triagedBy: null, triagedAt: null, declineReason: null,
    createdAt: new Date("2026-08-25T12:00:00Z"), updatedAt: new Date("2026-08-25T12:00:00Z"),
  });
}

/** A resposta do classificador, escolhida pelo teste. */
function classificaComo(atendimentoId: string, confianca = 92) {
  generate.mockResolvedValue({ ok: true, data: { atendimentoId, confianca, motivo: "escolha do modelo" } });
}

beforeEach(() => {
  generate.mockReset();
  for (const m of Object.values(db)) {
    for (const f of Object.values(m)) (f as { mockClear?: () => void }).mockClear?.();
  }
});

describe("o caminho legítimo — story vira story", () => {
  it("o pedido de stories é triado para o produto canônico, com o preço da tabela de STORIES", async () => {
    novoPedido("Quero 4 stories para o Instagram da padaria falando do pão de fermentação natural.");
    classificaComo("story-instagram");

    const r = await triarPedido("pc-1");
    expect(r.ok, "o caso legítimo atravessa sem atrito").toBe(true);
    if (!r.ok || !r.triado) return;

    expect(r.triado.atendimento.produtoId).toBe(ID_STORY_V1);
    expect(r.triado.atendimento.itemDeCatalogo).toBe("balcao-4-stories");
    expect(r.triado.preco).toBe(precoDaTabela("balcao-4-stories"));
    // E o preço NÃO é o do feed — que é o defeito inteiro em uma linha.
    expect(r.triado.preco).not.toBe(precoDaTabela("balcao-post-feed"));

    // O PRODUTO FOI GRAVADO NO PEDIDO. Sem isto ele não sobrevive até a
    // produção, e a corrente visual nunca é chamada.
    expect(pedidos.get("pc-1")!.produtoId).toBe(ID_STORY_V1);
  });

  it("quem pede UM story NÃO é cobrado pelo pacote de quatro — para e pergunta", async () => {
    // A trava da quantidade era fail-closed só PARA MENOS: impedia orçar 1
    // quando ele pediu 11, e deixava passar cobrar 4 de quem pediu 1. Cobrar a
    // mais não é arredondamento.
    novoPedido("Quero 1 story pro Instagram da padaria mostrando o pão saindo do forno.");
    classificaComo("story-instagram");

    const r = await triarPedido("pc-1");
    expect(r.ok, "cobrar quatro de quem pediu um não vira orçamento").toBe(false);

    const pedido = pedidos.get("pc-1")!;
    expect(pedido.status).toBe("precisa_decisao");
    expect(String(pedido.declineReason), "a frase diz os dois números").toMatch(/1 peça/);
    expect(String(pedido.declineReason)).toMatch(/pacote de 4/);
    expect(pedido.quotedPrice ?? null, "e nada foi cobrado").toBeNull();
    expect(db.task.create).not.toHaveBeenCalled();
  });

  it("pedir QUATRO stories não é barrado pela contagem — o item já é de um conjunto", async () => {
    // `cobre: "pacote"`. Declarar este item como unidade faria a trava da
    // quantidade parar exatamente o cliente que escreveu o número certo.
    novoPedido("Preciso de 4 stories verticais pro perfil da padaria.");
    classificaComo("story-instagram");
    const r = await triarPedido("pc-1");
    expect(r.ok).toBe(true);
  });
});

describe("a TRAVA 1-B — o pedido de story nunca vira dinheiro no produto de feed", () => {
  it("cliente escreveu STORY e o modelo mandou para o item de FEED: PARA, e não cobra", async () => {
    novoPedido("Quero um story pro Instagram da padaria mostrando o pão saindo do forno.");
    classificaComo("post-ou-carrossel");

    const r = await triarPedido("pc-1");
    expect(r.ok, "classificação que contradiz o texto do cliente não vira orçamento").toBe(false);

    const pedido = pedidos.get("pc-1")!;
    expect(pedido.status).toBe("precisa_decisao");
    expect(String(pedido.declineReason)).toMatch(/STORY/);
    expect(String(pedido.declineReason), "a frase diz o formato certo, em número").toMatch(/1080×1920/);
    // NADA de dinheiro: sem preço na mesa e sem tarefa criada.
    expect(pedido.quotedPrice ?? null).toBeNull();
    expect(pedido.produtoId ?? null, "e sem produto errado gravado").toBeNull();
    expect(db.task.create).not.toHaveBeenCalled();
  });

  it("pedido que cita os DOIS formatos também para — e a frase diz que são dois", async () => {
    novoPedido("Quero um post pro feed e um story, os dois falando da promoção da manhã.");
    classificaComo("post-ou-carrossel");

    const r = await triarPedido("pc-1");
    expect(r.ok).toBe(false);
    const motivo = String(pedidos.get("pc-1")!.declineReason);
    expect(motivo).toMatch(/story E peça de feed|dois formatos/i);
    expect(db.task.create).not.toHaveBeenCalled();
  });

  it("SILÊNCIO não vira conclusão: pedido de feed sem a palavra 'story' segue normal", async () => {
    // A metade que prova que a trava não é um freio de mão puxado: quem pede
    // arte de feed continua atravessando, com o preço de feed.
    novoPedido("Quero uma arte nova pro feed da padaria, aquela do pão de queijo.");
    classificaComo("post-ou-carrossel");

    const r = await triarPedido("pc-1");
    expect(r.ok, "o produto de feed NÃO foi afetado por esta mudança").toBe(true);
    if (!r.ok || !r.triado) return;
    expect(r.triado.atendimento.itemDeCatalogo).toBe("balcao-post-feed");
    expect(r.triado.preco).toBe(precoDaTabela("balcao-post-feed"));
    expect(pedidos.get("pc-1")!.produtoId ?? null, "feed ainda não é produto canônico, e isso é honesto").toBeNull();
  });

  it("a palavra dentro de 'storytelling' NÃO dispara a trava", async () => {
    novoPedido("Quero uma arte pro feed com um storytelling bom na legenda.");
    classificaComo("post-ou-carrossel");
    const r = await triarPedido("pc-1");
    expect(r.ok, "trava que dispara no lugar errado é desligada por quem a encontra").toBe(true);
  });
});
