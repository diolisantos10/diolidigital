// A CORRENTE INTEIRA, com banco de verdade.
//
// Cada peça tem teste próprio e todos passam; é nas JUNTAS que ela arrebenta.
// Este arquivo anda a corrente do começo ao fim, sem mock de prisma:
//
//   cliente DIRETO (o caso Foocci, sem ClientRequestDb)
//     → abre o portal por token real (PortalAccess)
//     → MANDA mensagem                      ← era 404 para sempre
//     → a agência VÊ na caixa de entrada     ← não existia caixa de entrada
//     → a agência abre e o não-lida ZERA     ← readByTeam era escrito e nunca lido
//     → o cliente PEDE uma peça nova         ← não existia nada com o cliente na origem
//     → a agência tria → nasce a Task         ← o elo com a esteira
//     → o cliente é avisado na mesma conversa
//
// E a trava: um segundo cliente no mesmo workspace nunca vê nem conta nada do
// primeiro.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { NextRequest } from "next/server";

const DB_PATH = vi.hoisted(() => {
  const caminho = `${process.cwd()}/prisma/corrente-do-pedido.db`;
  process.env.DATABASE_URL = `file:${caminho}`;
  return caminho;
});

const requireSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/api-guard", () => ({ requireSession }));

import { prisma } from "@/lib/db/client";
import { createPortalAccess } from "@/lib/agency/persistence/portal-access-service";
import { POST as enviarMensagem, GET as lerConversa } from "@/app/api/portal/messages/route";
import { GET as caixaDeEntrada } from "@/app/api/messages/route";
import { POST as pedirConteudo, GET as meusPedidos } from "@/app/api/portal/pedidos/route";
import { POST as triarPedido, GET as filaDePedidos } from "@/app/api/messages/pedidos/route";

let workspaceId = "";
let foocciId = "";
let outroId = "";
let tokenFoocci = "";
let tokenOutro = "";

function postJson(url: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost${url}`, { method: "POST", body: JSON.stringify(body) });
}
function getUrl(url: string): NextRequest {
  return new NextRequest(`http://localhost${url}`);
}

beforeAll(async () => {
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
  execSync("npx prisma db push --accept-data-loss", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: `file:${DB_PATH}` },
    stdio: "pipe",
  });

  const ws = await prisma.agencyWorkspace.create({ data: { name: "Dioli", slug: `corr-${Date.now()}` } });
  workspaceId = ws.id;

  // Os dois clientes nascem DIRETO — como `/api/clients` cria: sem
  // ClientRequestDb nenhum. É exatamente o caso que quebrava.
  const foocci = await prisma.client.create({ data: { workspaceId, name: "Foocci" } });
  const outro  = await prisma.client.create({ data: { workspaceId, name: "Salão da Ana" } });
  foocciId = foocci.id;
  outroId  = outro.id;

  tokenFoocci = (await createPortalAccess({ clientId: foocciId })).token;
  tokenOutro  = (await createPortalAccess({ clientId: outroId })).token;

  requireSession.mockResolvedValue({
    session: { name: "Dioli", workspaceId, role: "master", userId: "u1" },
    error: null,
  });
});

afterAll(async () => {
  await prisma.$disconnect();
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
});

describe("a corrente inteira, de ponta a ponta", () => {
  it("1 · o cliente direto MANDA mensagem (o 404 que travava o CEO)", async () => {
    const res = await enviarMensagem(
      postJson("/api/portal/messages", { token: tokenFoocci, body: "Oi! Quero falar sobre o mês que vem.", authorName: "Foocci" }),
    );
    expect(res.status).toBe(201);

    const gravada = await prisma.portalMessage.findFirst({ where: { clientId: foocciId } });
    expect(gravada?.clientRequestId).toBeNull();
    expect(gravada?.readByTeam).toBe(false);
  });

  it("2 · a agência VÊ na caixa de entrada, com a contagem certa", async () => {
    const { conversas, pedidosNovos } = await (await caixaDeEntrada(getUrl("/api/messages"))).json();
    expect(pedidosNovos).toBe(0);
    const foocci = conversas.find((c: { nome: string }) => c.nome === "Foocci");
    expect(foocci).toBeTruthy();
    expect(foocci.naoLidas).toBe(1);
    expect(foocci.total).toBe(1);
    expect(foocci.previa).toContain("Quero falar sobre o mês");
    expect(foocci.ultimaPor).toBe("client");
    // Quem tem não-lida vem primeiro.
    expect(conversas[0].nome).toBe("Foocci");

    const resumo = await (await caixaDeEntrada(getUrl("/api/messages?resumo=1"))).json();
    expect(resumo).toEqual({ naoLidas: 1, pedidosNovos: 0, total: 1 });
  });

  it("3 · a agência abre a conversa por clientId e o não-lida ZERA", async () => {
    const res = await lerConversa(getUrl(`/api/portal/messages?clientId=${foocciId}`));
    expect(res.status).toBe(200);
    const { messages } = await res.json();
    expect(messages).toHaveLength(1);
    expect(messages[0].mine).toBe(false); // é do cliente, visto pela equipe

    const resumo = await (await caixaDeEntrada(getUrl("/api/messages?resumo=1"))).json();
    expect(resumo.naoLidas).toBe(0);
  });

  it("4 · a equipe responde e o cliente vê — a conversa é bidirecional de verdade", async () => {
    const enviou = await enviarMensagem(postJson("/api/portal/messages", { clientId: foocciId, body: "Oi, Dioli! Pode falar." }));
    expect(enviou.status).toBe(201);

    const { messages } = await (await lerConversa(getUrl(`/api/portal/messages?token=${tokenFoocci}`))).json();
    expect(messages).toHaveLength(2);
    expect(messages[1].authorRole).toBe("team");
    expect(messages[1].authorName).toBe("Dioli");
    expect(messages[1].mine).toBe(false); // visto pelo cliente
  });

  it("5 · o cliente PEDE uma peça nova — e o pedido vazio não passa", async () => {
    const mudo = await pedirConteudo(postJson("/api/portal/pedidos", { token: tokenFoocci, descricao: "", objetivo: "Vender" }));
    expect(mudo.status).toBe(422);
    expect((await mudo.json()).pergunta).toBeTruthy();

    const ok = await pedirConteudo(postJson("/api/portal/pedidos", {
      token: tokenFoocci,
      descricao: "Um reels mostrando o combo do almoço",
      objetivo: "Vender mais no horário de almoço",
      para: "2026-08-25",
    }));
    expect(ok.status).toBe(201);

    const meus = await (await meusPedidos(getUrl(`/api/portal/pedidos?token=${tokenFoocci}`))).json();
    expect(meus.pedidos).toHaveLength(1);
    expect(meus.pedidos[0].statusLegivel).toMatch(/Recebido/);
  });

  it("6 · o pedido aparece na caixa de entrada da agência", async () => {
    const resumo = await (await caixaDeEntrada(getUrl("/api/messages?resumo=1"))).json();
    expect(resumo.pedidosNovos).toBe(1);
    expect(resumo.total).toBe(1);

    const { pedidos } = await (await filaDePedidos(getUrl("/api/messages/pedidos"))).json();
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0].cliente).toBe("Foocci");
    expect(pedidos[0].status).toBe("novo");
  });

  it("7 · sem projeto aberto a triagem NÃO inventa projeto", async () => {
    const { pedidos } = await (await filaDePedidos(getUrl("/api/messages/pedidos"))).json();
    const res = await triarPedido(postJson("/api/messages/pedidos", {
      pedidoId: pedidos[0].id, decisao: "ciclo", departamento: "social-media", prazo: "2026-08-25",
    }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("sem_projeto");
    expect(await prisma.task.count()).toBe(0);
  });

  it("8 · com projeto, a triagem cria a TASK e avisa o cliente na mesma conversa", async () => {
    const projeto = await prisma.project.create({
      data: { workspaceId, clientId: foocciId, name: "Foocci — Operação contínua" },
    });

    const { pedidos } = await (await filaDePedidos(getUrl("/api/messages/pedidos"))).json();
    const res = await triarPedido(postJson("/api/messages/pedidos", {
      pedidoId: pedidos[0].id, decisao: "ciclo", departamento: "social-media", prazo: "2026-08-25",
    }));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.taskId).toBeTruthy();
    expect(j.projectId).toBe(projeto.id);

    // O ELO: a tarefa existe, com dono e com prazo.
    const tarefa = await prisma.task.findUnique({ where: { id: j.taskId } });
    expect(tarefa?.projectId).toBe(projeto.id);
    expect(tarefa?.agentId).toBe("a3");
    expect(tarefa?.dueDate).toBe("2026-08-25");
    expect(tarefa?.status).toBe("pending");
    expect(tarefa?.description).toContain("combo do almoço");

    // O pedido saiu da fila, com rastro de quem decidiu.
    const pedido = await prisma.contentRequest.findUnique({ where: { id: pedidos[0].id } });
    expect(pedido?.status).toBe("triado");
    expect(pedido?.scopeDecision).toBe("ciclo");
    expect(pedido?.triagedBy).toBe("Dioli");

    // E o cliente ficou sabendo pelo mesmo canal em que pediu.
    const conversa = await (await lerConversa(getUrl(`/api/portal/messages?token=${tokenFoocci}`))).json();
    expect(conversa.messages.at(-1).body).toMatch(/entrou na produção/i);

    const resumo = await (await caixaDeEntrada(getUrl("/api/messages?resumo=1"))).json();
    expect(resumo.pedidosNovos).toBe(0);
  });

  it("9 · o mesmo pedido não vira duas tarefas", async () => {
    const { pedidos } = await (await filaDePedidos(getUrl("/api/messages/pedidos"))).json();
    const res = await triarPedido(postJson("/api/messages/pedidos", {
      pedidoId: pedidos[0].id, decisao: "extra", departamento: "design", prazo: "2026-09-01",
    }));
    expect(res.status).toBe(409);
    expect(await prisma.task.count()).toBe(1);
  });
});

describe("a trava: um cliente nunca vê o outro", () => {
  it("a conversa do outro cliente não tem NENHUMA mensagem da Foocci", async () => {
    const { messages } = await (await lerConversa(getUrl(`/api/portal/messages?token=${tokenOutro}`))).json();
    expect(messages).toHaveLength(0);
  });

  it("os pedidos do outro cliente não incluem o da Foocci", async () => {
    const { pedidos } = await (await meusPedidos(getUrl(`/api/portal/pedidos?token=${tokenOutro}`))).json();
    expect(pedidos).toHaveLength(0);
  });

  it("a caixa de entrada separa as duas conversas — nada se soma na linha errada", async () => {
    await enviarMensagem(postJson("/api/portal/messages", { token: tokenOutro, body: "Aqui é a Ana", authorName: "Salão da Ana" }));

    const { conversas } = await (await caixaDeEntrada(getUrl("/api/messages"))).json();
    const ana = conversas.find((c: { nome: string }) => c.nome === "Salão da Ana");
    const foocci = conversas.find((c: { nome: string }) => c.nome === "Foocci");
    expect(ana.naoLidas).toBe(1);
    expect(ana.total).toBe(1);
    expect(foocci.naoLidas).toBe(0);
    expect(foocci.total).toBe(3); // 2 mensagens + o aviso da triagem
    // Quem espera resposta vem primeiro, mesmo com a Foocci sendo mais antiga.
    expect(conversas[0].nome).toBe("Salão da Ana");
  });

  it("a agência de OUTRO workspace não abre a conversa por clientId", async () => {
    requireSession.mockResolvedValueOnce({
      session: { name: "Intruso", workspaceId: "ws-alheio", role: "master", userId: "u9" },
      error: null,
    });
    const res = await lerConversa(getUrl(`/api/portal/messages?clientId=${foocciId}`));
    expect(res.status).toBe(404);
  });
});
