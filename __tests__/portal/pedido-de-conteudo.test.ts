// O PRIMEIRO ELO CLIENTE → AGÊNCIA.
//
// Até 05/08/2026 toda a esteira era agência → cliente: nenhum modelo tinha o
// cliente como origem. Pedir uma peça nova morria no chat que ninguém lia.
//
// As duas metades que este arquivo anda:
//
//   PORTA DE ENTRADA (o cliente pede)
//     • cliente COM solicitação e cliente DIRETO conseguem abrir pedido;
//     • VAZIO É VAZIO: sem descrição e sem objetivo o sistema PERGUNTA (422 com
//       a pergunta em português), nunca grava um pedido mudo;
//     • o dono vem do token — nunca de query/corpo;
//     • data impossível é barrada em vez de virar dado inventado.
//
//   TRIAGEM (a agência decide)
//     • sem decisão de ESCOPO não há tarefa: preço e prazo não se inventam;
//     • sem PRAZO não há tarefa — tarefa sem data trava calada;
//     • sem DEPARTAMENTO não há tarefa — sem agentId o motor nunca a move;
//     • sem PROJETO não há tarefa, e a resposta diz o que fazer;
//     • pedido já triado não vira duas tarefas;
//     • recusar exige motivo e avisa o cliente — nada some da fila em silêncio;
//     • cliente de outro workspace não é alcançável.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  contentRequest: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  clientRequestDb: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
  client: { findFirst: vi.fn(), findMany: vi.fn() },
  project: { findFirst: vi.fn() },
  task: { create: vi.fn() },
  timelineEvent: { create: vi.fn() },
  portalMessage: { create: vi.fn() },
}));
const resolvePortalClient = vi.hoisted(() => vi.fn());
const requireSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/persistence/portal-access-service", () => ({
  resolvePortalClient,
  validatePortalAccess: vi.fn(),
}));
vi.mock("@/lib/auth/api-guard", () => ({ requireSession }));

import { POST as pedir, GET as meusPedidos, tituloDoPedido } from "@/app/api/portal/pedidos/route";
import { POST as triar } from "@/app/api/messages/pedidos/route";

function pede(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/portal/pedidos", { method: "POST", body: JSON.stringify(body) });
}
function tria(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/messages/pedidos", { method: "POST", body: JSON.stringify(body) });
}

const PEDIDO_NOVO = {
  id: "pc1",
  clientId: "cli-foocci",
  title: "Um reels do corte degradê",
  description: "Um reels mostrando o corte degradê que a gente faz",
  objective: "Vender mais",
  desiredFor: null as Date | null,
  status: "novo",
};

beforeEach(() => {
  vi.clearAllMocks();
  resolvePortalClient.mockResolvedValue({ clientId: "cli-foocci", workspaceId: "ws1" });
  db.clientRequestDb.findFirst.mockResolvedValue(null); // cliente DIRETO por padrão
  db.clientRequestDb.findMany.mockResolvedValue([]);
  db.contentRequest.create.mockResolvedValue({
    id: "pc1", title: "Um reels do corte degradê", status: "novo", createdAt: new Date("2026-08-05T10:00:00Z"),
  });
  requireSession.mockResolvedValue({ session: { name: "Dioli", workspaceId: "ws1", role: "master" }, error: null });
  db.client.findFirst.mockResolvedValue({ id: "cli-foocci", name: "Foocci" });
  db.contentRequest.findUnique.mockResolvedValue({ ...PEDIDO_NOVO });
  db.project.findFirst.mockResolvedValue({ id: "proj1", name: "Foocci — Social" });
  db.task.create.mockResolvedValue({ id: "task1" });
  db.contentRequest.update.mockResolvedValue({});
  db.timelineEvent.create.mockResolvedValue({});
  db.portalMessage.create.mockResolvedValue({});
});

// ── PORTA DE ENTRADA ────────────────────────────────────────────────────────
describe("o cliente abre um pedido", () => {
  it("cliente DIRETO (sem solicitação de briefing) consegue pedir", async () => {
    const res = await pedir(pede({ token: "tok", descricao: "Um reels mostrando o corte degradê", objetivo: "Vender mais" }));
    expect(res.status).toBe(201);
    const data = db.contentRequest.create.mock.calls[0]![0].data;
    expect(data.clientId).toBe("cli-foocci");
    expect(data.clientRequestId).toBeNull();
    expect(data.status).toBe("novo");
  });

  it("cliente COM solicitação carrega o vínculo do histórico dele", async () => {
    db.clientRequestDb.findFirst.mockResolvedValue({ id: "cr1" });
    await pedir(pede({ token: "tok", descricao: "Post para o dia das mães", objetivo: "Data comemorativa" }));
    expect(db.contentRequest.create.mock.calls[0]![0].data.clientRequestId).toBe("cr1");
  });

  it("VAZIO É VAZIO: sem descrição o sistema PERGUNTA — não grava pedido mudo", async () => {
    const res = await pedir(pede({ token: "tok", descricao: "  ", objetivo: "Vender mais" }));
    expect(res.status).toBe(422);
    const j = await res.json();
    expect(j.campo).toBe("descricao");
    expect(j.pergunta).toMatch(/o que você quer/i);
    expect(db.contentRequest.create).not.toHaveBeenCalled();
  });

  it("“oi” não é um pedido — o mínimo é uma frase", async () => {
    const res = await pedir(pede({ token: "tok", descricao: "oi", objetivo: "Vender mais" }));
    expect(res.status).toBe(422);
    expect(db.contentRequest.create).not.toHaveBeenCalled();
  });

  it("sem OBJETIVO também pergunta — sem o porquê o especialista escolhe o ângulo no chute", async () => {
    const res = await pedir(pede({ token: "tok", descricao: "Um reels do corte degradê" }));
    expect(res.status).toBe(422);
    expect((await res.json()).campo).toBe("objetivo");
    expect(db.contentRequest.create).not.toHaveBeenCalled();
  });

  it("data impossível é barrada — não vira dado inventado no banco", async () => {
    const res = await pedir(pede({ token: "tok", descricao: "Um reels do corte", objetivo: "Vender", para: "amanhã de manhã" }));
    expect(res.status).toBe(422);
    expect((await res.json()).campo).toBe("para");
    expect(db.contentRequest.create).not.toHaveBeenCalled();
  });

  it("token inválido → 403, e o dono NUNCA vem do corpo", async () => {
    resolvePortalClient.mockResolvedValue(null);
    const res = await pedir(pede({ token: "podre", clientId: "cli-alheio", descricao: "Quero um post novo", objetivo: "Vender" }));
    expect(res.status).toBe(403);
    expect(db.contentRequest.create).not.toHaveBeenCalled();
  });

  it("a lista do cliente é filtrada pelo dono derivado do token", async () => {
    db.contentRequest.findMany.mockResolvedValue([]);
    await meusPedidos(new NextRequest("http://localhost/api/portal/pedidos?token=tok"));
    expect(db.contentRequest.findMany.mock.calls[0]![0].where).toEqual({ clientId: "cli-foocci" });
  });

  it("o título é derivado da descrição — um campo a menos para o cliente preencher", () => {
    expect(tituloDoPedido("Um reels do corte degradê. Bem rápido.")).toBe("Um reels do corte degradê");
    expect(tituloDoPedido("x".repeat(200)).length).toBe(70);
  });
});

// ── TRIAGEM ─────────────────────────────────────────────────────────────────
describe("a agência tria o pedido", () => {
  it("aceita NO CICLO: cria a Task com prazo, departamento e o pedido inteiro na descrição", async () => {
    const res = await triar(tria({ pedidoId: "pc1", decisao: "ciclo", departamento: "social-media", prazo: "2026-08-20" }));
    expect(res.status).toBe(200);

    const tarefa = db.task.create.mock.calls[0]![0].data;
    expect(tarefa.projectId).toBe("proj1");
    expect(tarefa.agentId).toBe("a3");
    expect(tarefa.dueDate).toBe("2026-08-20");
    expect(tarefa.status).toBe("pending");
    // A verdade ancorada do especialista: o que e para quê, nas palavras dele.
    expect(tarefa.description).toContain("Um reels mostrando o corte degradê");
    expect(tarefa.description).toContain("Vender mais");

    const upd = db.contentRequest.update.mock.calls[0]![0].data;
    expect(upd.status).toBe("triado");
    expect(upd.scopeDecision).toBe("ciclo");
    expect(upd.taskId).toBe("task1");
    expect(upd.triagedBy).toBe("Dioli");
  });

  it("aceita como ESCOPO EXTRA: a mensagem ao cliente promete a proposta ANTES de produzir", async () => {
    await triar(tria({ pedidoId: "pc1", decisao: "extra", departamento: "design", prazo: "2026-08-20" }));
    expect(db.contentRequest.update.mock.calls[0]![0].data.scopeDecision).toBe("extra");
    const aviso = db.portalMessage.create.mock.calls[0]![0].data;
    expect(aviso.authorRole).toBe("team");
    expect(aviso.readByClient).toBe(false);
    expect(aviso.body).toMatch(/proposta/i);
    expect(aviso.body).toMatch(/sem a sua aprovação/i);
  });

  it("SEM decisão de escopo não existe tarefa — preço e prazo não se inventam", async () => {
    const res = await triar(tria({ pedidoId: "pc1", departamento: "social-media", prazo: "2026-08-20" }));
    expect(res.status).toBe(400);
    expect(db.task.create).not.toHaveBeenCalled();
  });

  it("SEM prazo não existe tarefa — tarefa sem data trava calada", async () => {
    const res = await triar(tria({ pedidoId: "pc1", decisao: "ciclo", departamento: "social-media" }));
    expect(res.status).toBe(422);
    expect((await res.json()).campo).toBe("prazo");
    expect(db.task.create).not.toHaveBeenCalled();
  });

  it("quando o cliente disse a data, ela vira o prazo sem o PM digitar de novo", async () => {
    db.contentRequest.findUnique.mockResolvedValue({ ...PEDIDO_NOVO, desiredFor: new Date("2026-08-22T12:00:00Z") });
    await triar(tria({ pedidoId: "pc1", decisao: "ciclo", departamento: "social-media" }));
    expect(db.task.create.mock.calls[0]![0].data.dueDate).toBe("2026-08-22");
  });

  it("SEM departamento não existe tarefa — sem agentId o motor nunca a moveria", async () => {
    const res = await triar(tria({ pedidoId: "pc1", decisao: "ciclo", prazo: "2026-08-20" }));
    expect(res.status).toBe(422);
    expect(db.task.create).not.toHaveBeenCalled();
  });

  it("SEM projeto aberto não inventa projeto — devolve o que fazer", async () => {
    db.project.findFirst.mockResolvedValue(null);
    const res = await triar(tria({ pedidoId: "pc1", decisao: "ciclo", departamento: "social-media", prazo: "2026-08-20" }));
    expect(res.status).toBe(409);
    const j = await res.json();
    expect(j.error).toBe("sem_projeto");
    expect(j.mensagem).toMatch(/Foocci/);
    expect(db.task.create).not.toHaveBeenCalled();
  });

  it("projeto escolhido à mão só vale se for DO cliente do pedido", async () => {
    await triar(tria({ pedidoId: "pc1", decisao: "ciclo", departamento: "social-media", prazo: "2026-08-20", projectId: "proj-alheio" }));
    expect(db.project.findFirst.mock.calls[0]![0].where).toEqual({ id: "proj-alheio", clientId: "cli-foocci" });
  });

  it("pedido já triado não vira uma segunda tarefa", async () => {
    db.contentRequest.findUnique.mockResolvedValue({ ...PEDIDO_NOVO, status: "triado" });
    const res = await triar(tria({ pedidoId: "pc1", decisao: "ciclo", departamento: "social-media", prazo: "2026-08-20" }));
    expect(res.status).toBe(409);
    expect(db.task.create).not.toHaveBeenCalled();
  });

  it("pedido sem descrição NUNCA vira tarefa muda, mesmo entrando por aqui", async () => {
    db.contentRequest.findUnique.mockResolvedValue({ ...PEDIDO_NOVO, description: "   " });
    const res = await triar(tria({ pedidoId: "pc1", decisao: "ciclo", departamento: "social-media", prazo: "2026-08-20" }));
    expect(res.status).toBe(409);
    expect(db.task.create).not.toHaveBeenCalled();
  });

  it("recusar EXIGE motivo — nada some da fila em silêncio", async () => {
    const res = await triar(tria({ pedidoId: "pc1", decisao: "recusar", motivo: "ok" }));
    expect(res.status).toBe(422);
    expect(db.contentRequest.update).not.toHaveBeenCalled();
  });

  it("recusar com motivo fecha o pedido E avisa o cliente com o motivo por escrito", async () => {
    const res = await triar(tria({ pedidoId: "pc1", decisao: "recusar", motivo: "esse formato não roda no perfil de vocês; sugerimos carrossel" }));
    expect(res.status).toBe(200);
    expect(db.contentRequest.update.mock.calls[0]![0].data.status).toBe("recusado");
    expect(db.portalMessage.create.mock.calls[0]![0].data.body).toMatch(/carrossel/);
  });

  it("estar logado não é ser dono: pedido de cliente de outro workspace → 404", async () => {
    db.client.findFirst.mockResolvedValue(null);
    const res = await triar(tria({ pedidoId: "pc1", decisao: "ciclo", departamento: "social-media", prazo: "2026-08-20" }));
    expect(res.status).toBe(404);
    expect(db.task.create).not.toHaveBeenCalled();
  });

  it("quem decide escopo é quem responde pelo contrato — a rota exige master/PM", async () => {
    await triar(tria({ pedidoId: "pc1", decisao: "ciclo", departamento: "social-media", prazo: "2026-08-20" }));
    expect(requireSession).toHaveBeenCalledWith(["master", "project_manager"]);
  });
});
