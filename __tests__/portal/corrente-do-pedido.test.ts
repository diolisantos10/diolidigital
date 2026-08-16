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
import { POST as triarPedido, GET as filaDePedidos, PATCH as consertarPedido } from "@/app/api/messages/pedidos/route";

let workspaceId = "";
let foocciId = "";
let outroId = "";
let tokenFoocci = "";
let tokenOutro = "";

// "sec-fetch-site: same-origin" — a FAIXA 1 do CSRF (navegacao-cross-site.ts)
// bloqueia mutação por padrão sem este sinal; aqui simulamos o navegador
// legítimo (equipe e cliente). Inofensivo nas rotas que este helper chama e
// que não têm a guarda.
function postJson(url: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: { "sec-fetch-site": "same-origin" },
    body: JSON.stringify(body),
  });
}
function getUrl(url: string): NextRequest {
  return new NextRequest(`http://localhost${url}`);
}
function patchJson(url: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method: "PATCH",
    headers: { "sec-fetch-site": "same-origin" },
    body: JSON.stringify(body),
  });
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

  // ── A PASSAGEM AUTOMÁTICA, e por que aqui ela PARA ────────────────────────
  // Desde 06/08/2026 gravar o pedido dispara a triagem automática. Neste teste
  // não existe chave de IA — e é justamente essa metade que interessa provar
  // aqui: sem classificação, o pedido NÃO fica em "novo" (o balde de dois dias)
  // e NÃO vira um departamento chutado. Ele vira `precisa_decisao`, com o motivo
  // em português, visível para o cliente E para a agência — e a triagem manual
  // continua sendo a saída.
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
    // Sem IA a triagem para — e para FALANDO. O cliente lê o motivo, não um
    // silêncio de dois dias.
    expect(meus.pedidos[0].status).toBe("precisa_decisao");
    expect(meus.pedidos[0].statusLegivel).toMatch(/confirmar/i);
    expect(String(meus.pedidos[0].motivo).length).toBeGreaterThan(20);
  });

  it("6 · o pedido aparece na caixa de entrada da agência", async () => {
    const resumo = await (await caixaDeEntrada(getUrl("/api/messages?resumo=1"))).json();
    expect(resumo.pedidosNovos).toBe(1);
    expect(resumo.total).toBe(1);

    const { pedidos } = await (await filaDePedidos(getUrl("/api/messages/pedidos"))).json();
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0].cliente).toBe("Foocci");
    // O que a máquina parou conta no MESMO badge do que ainda não foi triado:
    // fail-closed que ninguém vê é esconderijo, não freio.
    expect(pedidos[0].status).toBe("precisa_decisao");
  });

  it("7 · sem projeto aberto a triagem manual NÃO inventa projeto", async () => {
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
    // A produção dispara junto (é o elo que faltava), mas sem IA ela não conclui
    // — e nesse caso o pedido fica na FILA que o despertador varre, com o motivo
    // gravado. O que não pode acontecer, e é o que se prova aqui, é ele voltar
    // para "novo" ou sumir.
    const pedido = await prisma.contentRequest.findUnique({ where: { id: pedidos[0].id } });
    expect(["triado", "entregue", "precisa_decisao"]).toContain(pedido?.status);
    expect(pedido?.status).not.toBe("novo");
    expect(pedido?.scopeDecision).toBe("ciclo");
    expect(pedido?.triagedBy).toBe("Dioli");
    expect(pedido?.promisedFor).toBeTruthy();

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
    // Já triado: 409. (Só "novo" e "precisa_decisao" entram na triagem manual —
    // o resto já está andando, e re-triar criaria a segunda tarefa.)
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

// ─────────────────────────────────────────────────────────────────────────────
// O CONSERTO DO ORÇAMENTO ERRADO — 06/08/2026
//
// A triagem automática pôs "1 Reel — R$ 350" na frente do CEO para um pedido
// cujo entregável era o ROTEIRO, e que já estava PRONTO. Não havia como tirar
// aquele número do portal: `triado` não volta para `novo`, o POST recusa pedido
// já triado, e "recusar" apagaria o pedido legítimo junto com o erro.
//
// As duas metades, como sempre: a que conserta, e a que não pode virar porta
// dos fundos.
describe("consertar uma triagem que já saiu errada", () => {
  let pedidoId = "";

  it("o orçamento errado SAI da frente do cliente — e ele lê por quê", async () => {
    const { pedidos } = await (await filaDePedidos(getUrl("/api/messages/pedidos"))).json();
    pedidoId = pedidos[0].id;

    // O estado exato da produção: orçamento pendente na tela do cliente.
    await prisma.contentRequest.update({
      where: { id: pedidoId },
      data: { quotedPrice: 350, quoteNote: "1 Reel: um reel com roteiro, edição, música e legendas animadas.", quoteStatus: "pendente" },
    });
    const antes = await (await meusPedidos(getUrl(`/api/portal/pedidos?token=${tokenFoocci}`))).json();
    expect(antes.pedidos[0].preco).toBe(350);

    const res = await consertarPedido(patchJson("/api/messages/pedidos", {
      pedidoId, acao: "cancelar_orcamento",
      motivo: "Cancelei este orçamento: você pediu o roteiro (o texto para gravar), não a produção do reel — e esse trabalho já estava feito.",
    }));
    expect(res.status).toBe(200);

    // O número sumiu INTEIRO: preço, nota e o botão de aprovar.
    const depois = await (await meusPedidos(getUrl(`/api/portal/pedidos?token=${tokenFoocci}`))).json();
    expect(depois.pedidos[0].preco).toBeNull();
    expect(depois.pedidos[0].precoNota).toBeNull();
    expect(depois.pedidos[0].orcamento).toBeNull();
    // E não sumiu calado: o motivo está na tela dele e na conversa.
    expect(String(depois.pedidos[0].motivo)).toMatch(/roteiro/i);
    const conversa = await (await lerConversa(getUrl(`/api/portal/messages?token=${tokenFoocci}`))).json();
    expect(conversa.messages.at(-1).body).toMatch(/roteiro/i);
  });

  it("orçamento não sai calado: sem motivo, 422", async () => {
    const res = await consertarPedido(patchJson("/api/messages/pedidos", { pedidoId, acao: "cancelar_orcamento", motivo: "erro" }));
    expect(res.status).toBe(422);
  });

  it("a peça feita FORA da máquina chega ao portal — visível, com conteúdo", async () => {
    const roteiro = "ROTEIRO 1 — O que é o Foocci\n\nGANCHO (0-3s): você olha para a câmera e diz…\n".repeat(12);
    const res = await consertarPedido(patchJson("/api/messages/pedidos", {
      pedidoId, acao: "entregar",
      titulo: "Roteiros de vídeo — Foocci",
      conteudo: roteiro,
      motivo: "Os roteiros ficaram prontos e estão aqui para você conferir antes de gravar.",
    }));
    expect(res.status).toBe(200);
    const j = await res.json();

    // A entrega existe e é VISÍVEL — "interno" seria o mesmo que deixá-la no
    // repositório, que é onde o cliente não entra.
    const entrega = await prisma.deliverable.findUnique({ where: { id: j.deliverableId } });
    expect(entrega?.visibility).toBe("compartilhado");
    expect(String(entrega?.content)).toContain("GANCHO");

    // O card no portal, ligado ao pedido pelo caminho de volta.
    const card = await prisma.approvalRequest.findUnique({ where: { id: j.approvalRequestId } });
    expect(card?.clientVisible).toBe(true);
    expect(card?.department).toBe(`pedido:${pedidoId}`);

    // E o pedido reflete o que aconteceu: entregue, sem orçamento pendurado.
    const pedido = await prisma.contentRequest.findUnique({ where: { id: pedidoId } });
    expect(pedido?.status).toBe("entregue");
    expect(pedido?.quotedPrice).toBeNull();
  });

  it("entrega vazia não passa — portal com card oco é pior que card nenhum", async () => {
    const res = await consertarPedido(patchJson("/api/messages/pedidos", {
      pedidoId, acao: "entregar", titulo: "Qualquer coisa", conteudo: "pronto",
      motivo: "Segue a entrega conforme combinado.",
    }));
    expect(res.status).toBe(422);
  });

  it("a agência de OUTRO workspace não conserta pedido alheio", async () => {
    requireSession.mockResolvedValueOnce({
      session: { name: "Intruso", workspaceId: "ws-alheio", role: "master", userId: "u9" },
      error: null,
    });
    const res = await consertarPedido(patchJson("/api/messages/pedidos", {
      pedidoId, acao: "cancelar_orcamento", motivo: "quero mexer no cliente do vizinho",
    }));
    expect(res.status).toBe(404);
  });
});
