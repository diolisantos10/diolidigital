// REABRIR UMA APROVAÇÃO — as recusas, que são o valor real desta peça.
//
// Reabrir é fácil; o difícil é NÃO reabrir na hora errada. Devolver um card ao
// cliente é pedir uma decisão de novo — e há situações em que esse pedido é pior
// do que o silêncio:
//
//   ⛔ a peça já foi PUBLICADA — o botão não desfaz nada, e a pergunta mente;
//   ⛔ o cliente RECUSOU ou o card foi cancelado — não ressuscita por dado;
//   ⛔ o cliente pediu AJUSTE e NADA mudou nas peças — reabrir sem entregar
//      nada novo enterra o pedido dele; o caminho ali é a refação;
//   ⛔ o card é de OUTRO cliente — id de post não abre porta para o card alheio.
//
// E a metade positiva: quando reabre, o histórico da decisão anterior fica no
// card, o aval sai das peças e nenhum prazo é inventado.
//
// ── A extensão de 05/08/2026, e por que ela não afrouxa nada ─────────────────
// O CEO clicou "Solicitar ajustes" porque via só a capa dos carrosséis. O reparo
// de dado atendeu o pedido dele (5 → 6 telas) e o card ficou PRESO em
// "revision_requested" — trabalho parado num estado que ninguém destrava.
//
// A regra ganhou uma CONDIÇÃO, não uma exceção: card em ajuste volta a "pending"
// se, e só se, a mesma operação acrescentou tela a alguma peça DELE. Este
// arquivo anda as duas metades — com ganho e sem ganho — porque uma regra que
// só é testada quando permite é uma regra sem trava.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

const DB_PATH = vi.hoisted(() => {
  const caminho = `${process.cwd()}/prisma/reabrir-aprovacao.db`;
  process.env.DATABASE_URL = `file:${caminho}`;
  return caminho;
});

import { prisma } from "@/lib/db/client";
import {
  reabrirAprovacoesDosPosts,
  reabrirCardPorDecisaoDaDirecao,
  textoDoRegistro,
  textoDaDecisaoDaDirecao,
  ganhoDePecas,
  fraseDaCompletude,
  fraseDoEstadoDasPecas,
  pecasIncompletas,
  idDaMidia,
  type PecaConferida,
} from "@/lib/agency/esteira/reabrir-aprovacao";

let workspaceId = "";
let clientId = "";

const MOTIVO = "as telas de cada carrossel foram ligadas às peças.";

async function criarCliente(nome: string) {
  const c = await prisma.client.create({ data: { workspaceId, name: nome, industry: "Alimentação" } });
  return c.id;
}

async function criarPeca(dono: string, status: string) {
  const p = await prisma.socialPost.create({
    data: {
      workspaceId, clientId: dono, caption: "Peça", networks: '["instagram"]',
      format: "carousel", visibility: "compartilhado", status,
      scheduledFor: new Date("2026-08-12T13:00:00Z"),
    },
  });
  return p.id;
}

/** O pedido de ajuste como o portal o grava: comentário do CLIENTE, visível. */
async function pedirAjuste(cardId: string, texto: string) {
  const c = await prisma.approvalComment.create({
    data: {
      approvalRequestId: cardId, authorName: "Dioli", authorRole: "client",
      kind: "comment", body: texto, isClientVisible: true,
    },
  });
  return c.id;
}

/** O de-para que o reparo entrega: cada peça de 5 para 6 telas. */
function reparoDe5Para6(postIds: string[]) {
  return postIds.map((postId) => ({ postId, telasAntes: 5, telasDepois: 6 }));
}

async function criarCard(dono: string, status: string, postIds: string[], extra: Record<string, unknown> = {}) {
  const c = await prisma.approvalRequest.create({
    data: {
      clientId: dono, department: "social-media", clientVisible: true, status,
      reviewedBy: status === "pending" ? null : "client:Dioli",
      reviewedAt: status === "pending" ? null : new Date("2026-08-04T21:33:00Z"),
      reviewNote: "Carrosséis de lançamento — 2 peças\n\ncorpo original",
      sourcePostIdsJson: JSON.stringify(postIds),
      ...extra,
    },
  });
  return c.id;
}

beforeAll(async () => {
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
  execSync("npx prisma db push --accept-data-loss", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: `file:${DB_PATH}` },
    stdio: "pipe",
  });
  const ws = await prisma.agencyWorkspace.create({ data: { name: "Dioli", slug: `reab-${Date.now()}` } });
  workspaceId = ws.id;
});

afterAll(async () => {
  await prisma.$disconnect().catch(() => {});
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
});

beforeEach(async () => {
  await prisma.approvalComment.deleteMany({});
  await prisma.approvalRequest.deleteMany({});
  await prisma.socialPost.deleteMany({});
  await prisma.clientRequestDb.deleteMany({});
  await prisma.client.deleteMany({});
  clientId = await criarCliente("Foocci");
});

describe("quando reabre", () => {
  it("volta a pendente, registra o histórico e tira o aval das peças", async () => {
    const p1 = await criarPeca(clientId, "approved");
    const p2 = await criarPeca(clientId, "approved");
    const card = await criarCard(clientId, "approved", [p1, p2], {
      expiresAt: new Date("2026-08-04T23:59:00Z"), // vencido
    });

    const r = await reabrirAprovacoesDosPosts({ clientId, postIds: [p1, p2], motivo: MOTIVO });

    expect(r.reabertos).toHaveLength(1);
    expect(r.reabertos[0]).toMatchObject({
      approvalRequestId: card, statusAnterior: "approved",
      postsDevolvidos: 2, prazoRemovido: true,
    });

    const depois = await prisma.approvalRequest.findUnique({ where: { id: card } });
    expect(depois!.status).toBe("pending");
    expect(depois!.reviewedAt).toBeNull();
    expect(depois!.reviewedBy).toBeNull();
    expect(depois!.expiresAt).toBeNull();
    // O corpo que o cliente leu continua intacto — a reabertura não reescreve.
    expect(depois!.reviewNote).toContain("corpo original");

    const posts = await prisma.socialPost.findMany({ where: { clientId } });
    expect(posts.every((p) => p.status === "draft")).toBe(true);

    const comentarios = await prisma.approvalComment.findMany({ where: { approvalRequestId: card } });
    expect(comentarios).toHaveLength(1);
    expect(comentarios[0]!.isClientVisible).toBe(true);
    expect(comentarios[0]!.body).toContain("REABERTA");
    expect(comentarios[0]!.body).toContain(MOTIVO);
  });

  it("prazo FUTURO é preservado — reabrir não é adiar", async () => {
    const p1 = await criarPeca(clientId, "approved");
    const futuro = new Date(Date.now() + 3 * 24 * 3600_000);
    const card = await criarCard(clientId, "approved", [p1], { expiresAt: futuro });

    const r = await reabrirAprovacoesDosPosts({ clientId, postIds: [p1], motivo: MOTIVO });
    expect(r.reabertos[0]!.prazoRemovido).toBe(false);
    const depois = await prisma.approvalRequest.findUnique({ where: { id: card } });
    expect(depois!.expiresAt?.getTime()).toBe(futuro.getTime());
  });

  it("peça que NÃO estava aprovada não é mexida — só o aval é retirado", async () => {
    const aprovada = await criarPeca(clientId, "approved");
    const emAjuste = await criarPeca(clientId, "revision_requested");
    await criarCard(clientId, "approved", [aprovada, emAjuste]);

    const r = await reabrirAprovacoesDosPosts({ clientId, postIds: [aprovada], motivo: MOTIVO });
    expect(r.reabertos[0]!.postsDevolvidos).toBe(1);
    const ajuste = await prisma.socialPost.findUnique({ where: { id: emAjuste } });
    expect(ajuste!.status).toBe("revision_requested");
  });
});

describe("quando NÃO reabre", () => {
  it("⛔ peça já PUBLICADA: recusa com motivo, e o card fica como está", async () => {
    const p1 = await criarPeca(clientId, "published");
    const p2 = await criarPeca(clientId, "approved");
    const card = await criarCard(clientId, "approved", [p1, p2]);

    const r = await reabrirAprovacoesDosPosts({ clientId, postIds: [p1, p2], motivo: MOTIVO });

    expect(r.reabertos).toHaveLength(0);
    expect(r.recusados[0]).toMatchObject({ approvalRequestId: card });
    expect(r.recusados[0]!.motivo).toMatch(/PUBLICADAS/);
    const depois = await prisma.approvalRequest.findUnique({ where: { id: card } });
    expect(depois!.status).toBe("approved");
    expect(await prisma.approvalComment.count()).toBe(0);
    // E a peça publicada continua publicada.
    expect((await prisma.socialPost.findUnique({ where: { id: p1 } }))!.status).toBe("published");
  });

  it("⛔ card em 'revision_requested' SEM mudança nas peças: o caminho é a refação", async () => {
    const p1 = await criarPeca(clientId, "revision_requested");
    const card = await criarCard(clientId, "revision_requested", [p1]);
    const pedido = await pedirAjuste(card, "Só apareceu a capa, quero ver o carrossel todo.");

    // Sem `mudancas`: a operação não tem como provar que entregou algo novo.
    const r = await reabrirAprovacoesDosPosts({ clientId, postIds: [p1], motivo: MOTIVO });
    expect(r.reabertos).toHaveLength(0);
    expect(r.recusados[0]!.motivo).toMatch(/refação/);
    expect((await prisma.approvalRequest.findUnique({ where: { id: card } }))!.status)
      .toBe("revision_requested");
    // E NADA foi escrito: nem registro novo, nem status de peça mexido.
    const comentarios = await prisma.approvalComment.findMany({ where: { approvalRequestId: card } });
    expect(comentarios.map((c) => c.id)).toEqual([pedido]);
    expect((await prisma.socialPost.findUnique({ where: { id: p1 } }))!.status)
      .toBe("revision_requested");
  });

  it("⛔ 'revision_requested' com de-para que NÃO acrescentou nada continua recusado", async () => {
    const p1 = await criarPeca(clientId, "revision_requested");
    const card = await criarCard(clientId, "revision_requested", [p1]);
    await pedirAjuste(card, "Trocar a cor do fundo.");

    // O reparo rodou, olhou a peça e não mudou nada nela: 6 → 6.
    const r = await reabrirAprovacoesDosPosts({
      clientId, postIds: [p1], motivo: MOTIVO,
      mudancas: [{ postId: p1, telasAntes: 6, telasDepois: 6 }],
    });
    expect(r.reabertos).toHaveLength(0);
    expect(r.recusados[0]!.motivo).toMatch(/NADA mudou/);
    expect(await prisma.approvalComment.count({ where: { approvalRequestId: card } })).toBe(1);
  });

  it("⛔ mudança em peça de OUTRO card não autoriza a reabertura deste", async () => {
    const meu = await criarPeca(clientId, "revision_requested");
    const alheio = await criarPeca(clientId, "approved");
    const card = await criarCard(clientId, "revision_requested", [meu]);

    const r = await reabrirAprovacoesDosPosts({
      clientId, postIds: [meu], motivo: MOTIVO,
      // O ganho é REAL, mas é de outra peça — a condição é por card.
      mudancas: [{ postId: alheio, telasAntes: 1, telasDepois: 6 }],
    });
    expect(r.reabertos).toHaveLength(0);
    expect(r.recusados[0]!.motivo).toMatch(/NADA mudou/);
    expect((await prisma.approvalRequest.findUnique({ where: { id: card } }))!.status)
      .toBe("revision_requested");
  });

  it("⛔ card 'cancelled' não ressuscita por dado — nem com telas novas", async () => {
    const p1 = await criarPeca(clientId, "draft");
    const card = await criarCard(clientId, "cancelled", [p1]);

    const semGanho = await reabrirAprovacoesDosPosts({ clientId, postIds: [p1], motivo: MOTIVO });
    expect(semGanho.reabertos).toHaveLength(0);
    expect(semGanho.recusados).toHaveLength(1);

    const comGanho = await reabrirAprovacoesDosPosts({
      clientId, postIds: [p1], motivo: MOTIVO, mudancas: reparoDe5Para6([p1]),
    });
    expect(comGanho.reabertos).toHaveLength(0);
    expect(comGanho.recusados[0]!.motivo).toMatch(/não ressuscitam/i);
    expect((await prisma.approvalRequest.findUnique({ where: { id: card } }))!.status)
      .toBe("cancelled");
    expect(await prisma.approvalComment.count()).toBe(0);
  });

  it("⛔ card 'rejected' não ressuscita por dado — nem com telas novas", async () => {
    const p1 = await criarPeca(clientId, "revision_requested");
    const card = await criarCard(clientId, "rejected", [p1]);
    await pedirAjuste(card, "Não é isso que a gente combinou.");

    const semGanho = await reabrirAprovacoesDosPosts({ clientId, postIds: [p1], motivo: MOTIVO });
    expect(semGanho.recusados).toHaveLength(1);

    const comGanho = await reabrirAprovacoesDosPosts({
      clientId, postIds: [p1], motivo: MOTIVO, mudancas: reparoDe5Para6([p1]),
    });
    expect(comGanho.reabertos).toHaveLength(0);
    expect(comGanho.recusados[0]!.motivo).toMatch(/não ressuscitam/i);
    expect((await prisma.approvalRequest.findUnique({ where: { id: card } }))!.status)
      .toBe("rejected");
    // A recusa dele continua sozinha no histórico — nada foi acrescentado.
    expect(await prisma.approvalComment.count({ where: { approvalRequestId: card } })).toBe(1);
  });

  it("card já PENDENTE: nada a fazer — as telas novas aparecem nele sozinhas", async () => {
    const p1 = await criarPeca(clientId, "draft");
    const card = await criarCard(clientId, "pending", [p1]);
    const r = await reabrirAprovacoesDosPosts({ clientId, postIds: [p1], motivo: MOTIVO });
    expect(r.jaPendentes).toEqual([card]);
    expect(await prisma.approvalComment.count()).toBe(0);
  });

  it("⛔ card de OUTRO cliente citando os mesmos ids NÃO é alcançado", async () => {
    const outro = await criarCliente("Outro cliente");
    const p1 = await criarPeca(clientId, "approved");
    const cardAlheio = await criarCard(outro, "approved", [p1]);

    const r = await reabrirAprovacoesDosPosts({ clientId, postIds: [p1], motivo: MOTIVO });
    expect(r.reabertos).toHaveLength(0);
    expect(r.recusados).toHaveLength(0);
    expect((await prisma.approvalRequest.findUnique({ where: { id: cardAlheio } }))!.status)
      .toBe("approved");
  });

  it("card do fluxo Brain (posse por clientRequestId) TAMBÉM é alcançado", async () => {
    // Sem esta metade, o card nascido do briefing público ficaria com conteúdo
    // velho na tela do cliente e o log diria "nada a reabrir".
    const pedido = await prisma.clientRequestDb.create({
      data: {
        workspaceId, clientId, businessName: "Foocci", segment: "Alimentação",
        services: "[]", objectives: "[]", status: "accepted",
      },
    });
    const p1 = await criarPeca(clientId, "approved");
    const card = await prisma.approvalRequest.create({
      data: {
        clientRequestId: pedido.id, department: "social-media", clientVisible: true,
        status: "approved", reviewedBy: "client:Dioli",
        reviewedAt: new Date("2026-08-04T21:33:00Z"),
        sourcePostIdsJson: JSON.stringify([p1]),
      },
    });

    const r = await reabrirAprovacoesDosPosts({ clientId, postIds: [p1], motivo: MOTIVO });
    expect(r.reabertos.map((c) => c.approvalRequestId)).toEqual([card.id]);
    expect((await prisma.socialPost.findUnique({ where: { id: p1 } }))!.status).toBe("draft");
  });

  it("lista de posts vazia: no-op, sem nem consultar", async () => {
    const r = await reabrirAprovacoesDosPosts({ clientId, postIds: [], motivo: MOTIVO });
    expect(r).toEqual({ reabertos: [], jaPendentes: [], recusados: [] });
  });

  it("card que não cita nenhum dos posts fica de fora", async () => {
    const p1 = await criarPeca(clientId, "approved");
    const outroPost = await criarPeca(clientId, "approved");
    await criarCard(clientId, "approved", [outroPost]);
    const r = await reabrirAprovacoesDosPosts({ clientId, postIds: [p1], motivo: MOTIVO });
    expect(r.reabertos).toHaveLength(0);
    expect(r.jaPendentes).toHaveLength(0);
  });
});

// ─── A extensão: o card em ajuste cujas peças mudaram ────────────────────────

describe("card em 'revision_requested' + reparo que acrescentou telas", () => {
  it("volta a PENDENTE — e o pedido de ajuste do cliente continua no histórico", async () => {
    const posts = [
      await criarPeca(clientId, "revision_requested"),
      await criarPeca(clientId, "revision_requested"),
    ];
    const card = await criarCard(clientId, "revision_requested", posts);
    const pedido = await pedirAjuste(card, "Só estou vendo a capa de cada carrossel.");

    const r = await reabrirAprovacoesDosPosts({
      clientId, postIds: posts, motivo: MOTIVO, mudancas: reparoDe5Para6(posts),
    });

    expect(r.reabertos).toHaveLength(1);
    expect(r.reabertos[0]).toMatchObject({
      approvalRequestId: card,
      statusAnterior: "revision_requested",
      pecasCompletadas: 2,
      telasAcrescentadas: 2,
    });
    expect(r.reabertos[0]!.pedidoDeAjuste).toMatchObject({
      autor: "Dioli", comentarioNoHistorico: true,
    });

    const depois = await prisma.approvalRequest.findUnique({ where: { id: card } });
    expect(depois!.status).toBe("pending");
    expect(depois!.reviewedAt).toBeNull();
    expect(depois!.reviewNote).toContain("corpo original"); // o corpo lido não é reescrito

    // ⛔ O PEDIDO DELE NÃO SUMIU — e continua ACIMA da resposta da agência,
    // que é a ordem em que o portal renderiza (createdAt asc).
    const historico = await prisma.approvalComment.findMany({
      where: { approvalRequestId: card }, orderBy: { createdAt: "asc" },
    });
    expect(historico).toHaveLength(2);
    expect(historico[0]!.id).toBe(pedido);
    expect(historico[0]!.authorRole).toBe("client");
    expect(historico[0]!.body).toContain("Só estou vendo a capa");
    expect(historico[0]!.isClientVisible).toBe(true);

    // E o registro novo RESPONDE ao pedido, com o número real.
    const resposta = historico[1]!;
    expect(resposta.authorRole).toBe("internal");
    expect(resposta.isClientVisible).toBe(true);
    expect(resposta.body).toContain("Você pediu ajustes neste card");
    expect(resposta.body).toContain("As peças foram completadas");
    expect(resposta.body).toContain("cada uma das 2 peças deste card agora traz as 6 telas");
    expect(resposta.body).toContain("continua aqui no histórico, com as suas palavras");
    expect(resposta.body).toContain("Se o que você pediu foi outra coisa");
    // Não finge que foi uma aprovação: aquele texto é de outra conversa.
    expect(resposta.body).not.toContain("**aprovada**");
  });

  it("as peças saem de 'Em ajuste' — o calendário não contradiz o card", async () => {
    // Peça em "revision_requested" com card "pending" faz o portal dizer
    // "Em ajuste" na mesma tela em que o card pede decisão.
    const p1 = await criarPeca(clientId, "revision_requested");
    const card = await criarCard(clientId, "revision_requested", [p1]);
    await pedirAjuste(card, "Faltam telas.");

    const r = await reabrirAprovacoesDosPosts({
      clientId, postIds: [p1], motivo: MOTIVO, mudancas: reparoDe5Para6([p1]),
    });
    expect(r.reabertos[0]!.postsDevolvidos).toBe(1);
    expect((await prisma.socialPost.findUnique({ where: { id: p1 } }))!.status).toBe("draft");
  });

  it("idempotente: a segunda passada, sem ganho, não reabre nem escreve", async () => {
    const p1 = await criarPeca(clientId, "revision_requested");
    const card = await criarCard(clientId, "revision_requested", [p1]);
    await pedirAjuste(card, "Faltam telas.");

    await reabrirAprovacoesDosPosts({
      clientId, postIds: [p1], motivo: MOTIVO, mudancas: reparoDe5Para6([p1]),
    });
    expect(await prisma.approvalComment.count({ where: { approvalRequestId: card } })).toBe(2);

    // De novo, agora sem nada para acrescentar: o card já está pendente.
    const r2 = await reabrirAprovacoesDosPosts({
      clientId, postIds: [p1], motivo: MOTIVO,
      mudancas: [{ postId: p1, telasAntes: 6, telasDepois: 6 }],
    });
    expect(r2.jaPendentes).toEqual([card]);
    expect(r2.reabertos).toHaveLength(0);
    expect(await prisma.approvalComment.count({ where: { approvalRequestId: card } })).toBe(2);
  });

  it("⛔ peça já PUBLICADA continua barrando, mesmo com ganho de tela", async () => {
    const p1 = await criarPeca(clientId, "published");
    const card = await criarCard(clientId, "revision_requested", [p1]);
    const r = await reabrirAprovacoesDosPosts({
      clientId, postIds: [p1], motivo: MOTIVO, mudancas: reparoDe5Para6([p1]),
    });
    expect(r.reabertos).toHaveLength(0);
    expect(r.recusados[0]!.motivo).toMatch(/PUBLICADAS/);
    expect((await prisma.approvalRequest.findUnique({ where: { id: card } }))!.status)
      .toBe("revision_requested");
  });

  it("card em ajuste SEM comentário do cliente: reabre, mas não promete palavra que não existe", async () => {
    const p1 = await criarPeca(clientId, "revision_requested");
    const card = await criarCard(clientId, "revision_requested", [p1]);

    const r = await reabrirAprovacoesDosPosts({
      clientId, postIds: [p1], motivo: MOTIVO, mudancas: reparoDe5Para6([p1]),
    });
    expect(r.reabertos[0]!.pedidoDeAjuste).toMatchObject({ comentarioNoHistorico: false });
    const registro = await prisma.approvalComment.findFirst({ where: { approvalRequestId: card } });
    expect(registro!.body).toContain("continua registrado neste card");
    expect(registro!.body).not.toContain("com as suas palavras");
  });

  it("card APROVADO + reparo continua funcionando como antes (sem regressão)", async () => {
    const p1 = await criarPeca(clientId, "approved");
    const card = await criarCard(clientId, "approved", [p1]);

    const r = await reabrirAprovacoesDosPosts({
      clientId, postIds: [p1], motivo: MOTIVO, mudancas: reparoDe5Para6([p1]),
    });
    expect(r.reabertos[0]).toMatchObject({ statusAnterior: "approved", pedidoDeAjuste: null });
    expect((await prisma.approvalRequest.findUnique({ where: { id: card } }))!.status).toBe("pending");
    const registro = await prisma.approvalComment.findFirst({ where: { approvalRequestId: card } });
    expect(registro!.body).toContain("REABERTA");
    expect(registro!.body).toContain("**aprovada**");
    expect(registro!.body).not.toContain("Você pediu ajustes");
  });
});

// ─── A condição, isolada: é ela que decide enterrar ou responder ─────────────

describe("ganhoDePecas — a condição de 'mudou materialmente'", () => {
  it("conta só as peças DO CARD que ganharam tela", () => {
    const g = ganhoDePecas(["a", "b", "c"], [
      { postId: "a", telasAntes: 5, telasDepois: 6 },
      { postId: "b", telasAntes: 0, telasDepois: 6 },
      { postId: "c", telasAntes: 6, telasDepois: 6 }, // sem ganho
      { postId: "z", telasAntes: 0, telasDepois: 6 }, // de outro card
    ]);
    expect(g).toEqual({ pecasCompletadas: 2, telasAcrescentadas: 7, telasDepois: [6, 6] });
  });

  it("de-para ausente, vazio ou encolhendo = ganho ZERO", () => {
    expect(ganhoDePecas(["a"], undefined).pecasCompletadas).toBe(0);
    expect(ganhoDePecas(["a"], []).pecasCompletadas).toBe(0);
    expect(ganhoDePecas(["a"], [{ postId: "a", telasAntes: 6, telasDepois: 5 }]).pecasCompletadas).toBe(0);
  });

  it("id repetido conta uma vez só — não se infla ganho por duplicata", () => {
    const g = ganhoDePecas(["a"], [
      { postId: "a", telasAntes: 5, telasDepois: 6 },
      { postId: "a", telasAntes: 5, telasDepois: 6 },
    ]);
    expect(g.pecasCompletadas).toBe(1);
    expect(g.telasAcrescentadas).toBe(1);
  });
});

describe("a frase que o CEO lê", () => {
  it("todas as peças no mesmo número: 'cada uma das 6 peças … as 6 telas'", () => {
    const frase = fraseDaCompletude(
      { pecasCompletadas: 6, telasAcrescentadas: 6, telasDepois: [6, 6, 6, 6, 6, 6] }, 6,
    );
    expect(frase).toBe(
      "As peças foram completadas: cada uma das 6 peças deste card agora traz as 6 telas " +
        "(6 tela(s) acrescentada(s) nesta rodada).",
    );
  });

  it("números diferentes NÃO viram generalização — a frase diz o intervalo", () => {
    const frase = fraseDaCompletude(
      { pecasCompletadas: 2, telasAcrescentadas: 4, telasDepois: [4, 6] }, 6,
    );
    expect(frase).toContain("2 das 6 peças deste card agora trazem entre 4 e 6 telas");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A SEGUNDA PORTA — decisão da direção, travada pelo ESTADO das peças
// ═══════════════════════════════════════════════════════════════════════════
//
// O impasse que a produziu: a passada que acrescentou as telas rodou ANTES de a
// regra do ganho existir; quando a regra passou a valer, não havia mais ganho
// para provar e o card ficou preso em "revision_requested" para sempre.
//
// A metade que dá valor a esta porta é a RECUSA. Reabrir card com peça capenga
// por decisão da direção é repetir o erro de origem — com assinatura.

let seq = 0;
/** Uma peça COMPLETA pelo contrato de artes.ts: N telas e a capa é a tela 1. */
async function criarCarrosselCompleto(dono: string, status: string, telas = 6) {
  const urls = Array.from({ length: telas }, (_, i) => `/api/media/t${++seq}-${i + 1}`);
  const p = await prisma.socialPost.create({
    data: {
      workspaceId, clientId: dono, caption: "Carrossel", networks: '["instagram"]',
      format: "carousel", visibility: "compartilhado", status,
      scheduledFor: new Date("2026-08-12T13:00:00Z"),
      mediaUrl: urls[0], mediaUrlsJson: JSON.stringify(urls),
    },
  });
  return p.id;
}

describe("reabrirCardPorDecisaoDaDirecao — quando REABRE", () => {
  it("peças completas: volta a pendente, o pedido do cliente fica ACIMA da resposta", async () => {
    const posts = [
      await criarCarrosselCompleto(clientId, "revision_requested"),
      await criarCarrosselCompleto(clientId, "revision_requested"),
    ];
    const card = await criarCard(clientId, "revision_requested", posts, {
      expiresAt: new Date("2026-08-04T23:59:00Z"), // vencido
    });
    const pedido = await pedirAjuste(card, "Só estou vendo a capa de cada carrossel.");

    const r = await reabrirCardPorDecisaoDaDirecao({ approvalRequestId: card });

    expect(r).toMatchObject({
      resultado: "reaberto", statusAnterior: "revision_requested",
      postsDevolvidos: 2, prazoRemovido: true, faltas: [],
    });
    expect(r.pecasConferidas).toHaveLength(2);
    expect(r.pedidoDeAjuste).toMatchObject({ autor: "Dioli", comentarioNoHistorico: true });

    const depois = await prisma.approvalRequest.findUnique({ where: { id: card } });
    expect(depois!.status).toBe("pending");
    expect(depois!.reviewedAt).toBeNull();
    expect(depois!.reviewedBy).toBeNull();
    expect(depois!.expiresAt).toBeNull();
    expect(depois!.reviewNote).toContain("corpo original"); // o corpo lido não é reescrito

    // ⛔ O pedido dele continua no histórico, e ANTES da resposta (createdAt asc).
    const historico = await prisma.approvalComment.findMany({
      where: { approvalRequestId: card }, orderBy: { createdAt: "asc" },
    });
    expect(historico).toHaveLength(2);
    expect(historico[0]!.id).toBe(pedido);
    expect(historico[0]!.body).toContain("Só estou vendo a capa");

    const resposta = historico[1]!;
    expect(resposta.authorRole).toBe("internal");
    expect(resposta.isClientVisible).toBe(true);
    expect(resposta.body).toContain("POR DECISÃO DA DIREÇÃO DA AGÊNCIA");
    // ⛔ A frase é HONESTA: não inventa que algo mudou nesta passada.
    expect(resposta.body).toContain("NADA foi alterado nas peças");
    expect(resposta.body).not.toContain("as peças MUDARAM");
    expect(resposta.body).not.toContain("foram completadas");
    expect(resposta.body).toContain("cada um dos 2 carrosséis deste card traz as 6 telas");
    expect(resposta.body).toContain("continua aqui no histórico, com as suas palavras");
  });

  it("as peças saem de 'Em ajuste' para 'draft' — o calendário não contradiz o card", async () => {
    const p1 = await criarCarrosselCompleto(clientId, "revision_requested");
    const card = await criarCard(clientId, "revision_requested", [p1]);
    await pedirAjuste(card, "Faltam telas.");

    const r = await reabrirCardPorDecisaoDaDirecao({ approvalRequestId: card });
    expect(r.postsDevolvidos).toBe(1);
    expect((await prisma.socialPost.findUnique({ where: { id: p1 } }))!.status).toBe("draft");
  });

  it("prazo FUTURO é preservado — decisão da direção não é adiamento", async () => {
    const p1 = await criarCarrosselCompleto(clientId, "revision_requested");
    const futuro = new Date(Date.now() + 3 * 24 * 3600_000);
    const card = await criarCard(clientId, "revision_requested", [p1], { expiresAt: futuro });

    const r = await reabrirCardPorDecisaoDaDirecao({ approvalRequestId: card });
    expect(r.prazoRemovido).toBe(false);
    expect((await prisma.approvalRequest.findUnique({ where: { id: card } }))!.expiresAt?.getTime())
      .toBe(futuro.getTime());
  });

  it("sem comentário do cliente: reabre, mas não promete palavra que não existe", async () => {
    const p1 = await criarCarrosselCompleto(clientId, "revision_requested");
    const card = await criarCard(clientId, "revision_requested", [p1]);

    const r = await reabrirCardPorDecisaoDaDirecao({ approvalRequestId: card });
    expect(r.pedidoDeAjuste).toMatchObject({ comentarioNoHistorico: false });
    const registro = await prisma.approvalComment.findFirst({ where: { approvalRequestId: card } });
    expect(registro!.body).toContain("continua registrado neste card");
    expect(registro!.body).not.toContain("com as suas palavras");
  });

  it("IDEMPOTENTE: o segundo boot não escreve segundo comentário", async () => {
    const p1 = await criarCarrosselCompleto(clientId, "revision_requested");
    const card = await criarCard(clientId, "revision_requested", [p1]);
    await pedirAjuste(card, "Faltam telas.");

    await reabrirCardPorDecisaoDaDirecao({ approvalRequestId: card });
    expect(await prisma.approvalComment.count({ where: { approvalRequestId: card } })).toBe(2);

    const r2 = await reabrirCardPorDecisaoDaDirecao({ approvalRequestId: card });
    expect(r2.resultado).toBe("ja-pendente");
    expect(await prisma.approvalComment.count({ where: { approvalRequestId: card } })).toBe(2);
    expect((await prisma.approvalRequest.findUnique({ where: { id: card } }))!.status).toBe("pending");
  });

  it("card do fluxo Brain (posse por clientRequestId) também é alcançado", async () => {
    const pedido = await prisma.clientRequestDb.create({
      data: {
        workspaceId, clientId, businessName: "Foocci", segment: "Alimentação",
        services: "[]", objectives: "[]", status: "accepted",
      },
    });
    const p = await prisma.socialPost.create({
      data: {
        workspaceId, clientRequestId: pedido.id, caption: "Carrossel",
        networks: '["instagram"]', format: "carousel", visibility: "compartilhado",
        status: "revision_requested", scheduledFor: new Date("2026-08-12T13:00:00Z"),
        mediaUrl: "/api/media/brain-1",
        mediaUrlsJson: JSON.stringify(["/api/media/brain-1", "/api/media/brain-2"]),
      },
    });
    const card = await prisma.approvalRequest.create({
      data: {
        clientRequestId: pedido.id, department: "social-media", clientVisible: true,
        status: "revision_requested", reviewedBy: "client:Dioli",
        reviewedAt: new Date("2026-08-04T21:33:00Z"),
        sourcePostIdsJson: JSON.stringify([p.id]),
      },
    });

    const r = await reabrirCardPorDecisaoDaDirecao({ approvalRequestId: card.id });
    expect(r.resultado).toBe("reaberto");
    expect((await prisma.socialPost.findUnique({ where: { id: p.id } }))!.status).toBe("draft");
  });
});

describe("reabrirCardPorDecisaoDaDirecao — quando RECUSA (a metade que vale)", () => {
  it("⛔ carrossel com 1 tela só: recusa e DIZ o que falta", async () => {
    const bom = await criarCarrosselCompleto(clientId, "revision_requested");
    const capenga = await criarCarrosselCompleto(clientId, "revision_requested", 1);
    const card = await criarCard(clientId, "revision_requested", [bom, capenga]);
    const pedido = await pedirAjuste(card, "Só a capa.");

    const r = await reabrirCardPorDecisaoDaDirecao({ approvalRequestId: card });

    expect(r.resultado).toBe("recusado");
    expect(r.motivo).toMatch(/1 de 2 peça\(s\) deste card NÃO estão completas/);
    expect(r.faltas).toEqual([
      { postId: capenga, falta: expect.stringContaining("1 tela só") },
    ]);
    // NADA foi escrito: nem status, nem comentário, nem peça.
    expect((await prisma.approvalRequest.findUnique({ where: { id: card } }))!.status)
      .toBe("revision_requested");
    const comentarios = await prisma.approvalComment.findMany({ where: { approvalRequestId: card } });
    expect(comentarios.map((c) => c.id)).toEqual([pedido]);
    expect((await prisma.socialPost.findUnique({ where: { id: bom } }))!.status)
      .toBe("revision_requested");
  });

  it("⛔ carrossel SEM tela nenhuma: a recusa nomeia o problema de origem", async () => {
    const p = await prisma.socialPost.create({
      data: {
        workspaceId, clientId, caption: "Carrossel", networks: '["instagram"]',
        format: "carousel", visibility: "compartilhado", status: "revision_requested",
        scheduledFor: new Date("2026-08-12T13:00:00Z"),
        mediaUrl: "/api/media/so-a-capa", mediaUrlsJson: "[]",
      },
    });
    const card = await criarCard(clientId, "revision_requested", [p.id]);

    const r = await reabrirCardPorDecisaoDaDirecao({ approvalRequestId: card });
    expect(r.resultado).toBe("recusado");
    expect(r.faltas[0]!.falta).toMatch(/SEM NENHUMA TELA LIGADA/);
    expect(await prisma.approvalComment.count()).toBe(0);
  });

  it("⛔ capa que NÃO é a tela 1: recusa — o publicado começaria por outra imagem", async () => {
    const p = await prisma.socialPost.create({
      data: {
        workspaceId, clientId, caption: "Carrossel", networks: '["instagram"]',
        format: "carousel", visibility: "compartilhado", status: "revision_requested",
        scheduledFor: new Date("2026-08-12T13:00:00Z"),
        mediaUrl: "/api/media/capa-v3",
        mediaUrlsJson: JSON.stringify(["/api/media/tela-2", "/api/media/tela-3"]),
      },
    });
    const card = await criarCard(clientId, "revision_requested", [p.id]);

    const r = await reabrirCardPorDecisaoDaDirecao({ approvalRequestId: card });
    expect(r.resultado).toBe("recusado");
    expect(r.faltas[0]!.falta).toMatch(/capa NÃO é a tela 1/);
    expect((await prisma.approvalRequest.findUnique({ where: { id: card } }))!.status)
      .toBe("revision_requested");
  });

  it("⛔ peça que o portal NÃO mostra (visibility interno) conta como incompleta", async () => {
    const p = await prisma.socialPost.create({
      data: {
        workspaceId, clientId, caption: "Carrossel", networks: '["instagram"]',
        format: "carousel", visibility: "interno", status: "revision_requested",
        scheduledFor: new Date("2026-08-12T13:00:00Z"),
        mediaUrl: "/api/media/x1",
        mediaUrlsJson: JSON.stringify(["/api/media/x1", "/api/media/x2"]),
      },
    });
    const card = await criarCard(clientId, "revision_requested", [p.id]);

    const r = await reabrirCardPorDecisaoDaDirecao({ approvalRequestId: card });
    expect(r.resultado).toBe("recusado");
    expect(r.faltas[0]!.falta).toMatch(/o cliente não a veria no card/);
  });

  it("⛔ peça de OUTRO cliente citada no card: recusa, não abre porta para o card alheio", async () => {
    const outro = await criarCliente("Outro cliente");
    const alheia = await criarCarrosselCompleto(outro, "revision_requested");
    const card = await criarCard(clientId, "revision_requested", [alheia]);

    const r = await reabrirCardPorDecisaoDaDirecao({ approvalRequestId: card });
    expect(r.resultado).toBe("recusado");
    expect(r.faltas[0]!.falta).toMatch(/não pertence ao dono deste card/);
    expect((await prisma.socialPost.findUnique({ where: { id: alheia } }))!.status)
      .toBe("revision_requested");
  });

  it("⛔ peça já PUBLICADA barra — decisão da direção não desfaz o que foi ao ar", async () => {
    const p1 = await criarCarrosselCompleto(clientId, "published");
    const card = await criarCard(clientId, "revision_requested", [p1]);

    const r = await reabrirCardPorDecisaoDaDirecao({ approvalRequestId: card });
    expect(r.resultado).toBe("recusado");
    expect(r.motivo).toMatch(/PUBLICADAS/);
    expect((await prisma.approvalRequest.findUnique({ where: { id: card } }))!.status)
      .toBe("revision_requested");
    expect(await prisma.approvalComment.count()).toBe(0);
  });

  it("⛔ 'rejected' e 'cancelled' não ressuscitam — nem com as peças completas", async () => {
    for (const status of ["rejected", "cancelled"]) {
      const p1 = await criarCarrosselCompleto(clientId, "revision_requested");
      const card = await criarCard(clientId, status, [p1]);
      const r = await reabrirCardPorDecisaoDaDirecao({ approvalRequestId: card });
      expect(r.resultado).toBe("recusado");
      expect(r.motivo).toMatch(/não ressuscitam/i);
      expect((await prisma.approvalRequest.findUnique({ where: { id: card } }))!.status).toBe(status);
    }
    expect(await prisma.approvalComment.count()).toBe(0);
  });

  it("⛔ card 'approved' recusa: não há o que reabrir, e a porta não revoga o cliente", async () => {
    const p1 = await criarCarrosselCompleto(clientId, "approved");
    const card = await criarCard(clientId, "approved", [p1]);

    const r = await reabrirCardPorDecisaoDaDirecao({ approvalRequestId: card });
    expect(r.resultado).toBe("recusado");
    expect(r.motivo).toMatch(/JÁ está aprovado/);
    expect((await prisma.approvalRequest.findUnique({ where: { id: card } }))!.status).toBe("approved");
    expect((await prisma.socialPost.findUnique({ where: { id: p1 } }))!.status).toBe("approved");
  });

  it("⛔ id de card que não existe: recusa dizendo o que conferir, sem lançar", async () => {
    const r = await reabrirCardPorDecisaoDaDirecao({ approvalRequestId: "cardqueninguemtem" });
    expect(r.resultado).toBe("recusado");
    expect(r.motivo).toMatch(/não existe card de aprovação/);
    expect(r.motivo).toMatch(/NADA foi gravado/);
  });

  it("⛔ id vazio: recusa sem consultar", async () => {
    const r = await reabrirCardPorDecisaoDaDirecao({ approvalRequestId: "   " });
    expect(r).toMatchObject({ resultado: "recusado", motivo: "nenhum id de card informado" });
  });

  it("⛔ card sem peça nenhuma: não há estado para conferir", async () => {
    const card = await criarCard(clientId, "revision_requested", []);
    const r = await reabrirCardPorDecisaoDaDirecao({ approvalRequestId: card });
    expect(r.resultado).toBe("recusado");
    expect(r.motivo).toMatch(/sourcePostIdsJson vazio/);
  });

  it("⛔ a regra do GANHO continua intacta: a porta automática não mudou de comportamento", async () => {
    // A prova de que esta porta nova não afrouxou nada — o mesmo card em ajuste,
    // pela porta automática e sem ganho, continua recusado.
    const p1 = await criarCarrosselCompleto(clientId, "revision_requested");
    const card = await criarCard(clientId, "revision_requested", [p1]);
    await pedirAjuste(card, "Só a capa.");

    const automatica = await reabrirAprovacoesDosPosts({ clientId, postIds: [p1], motivo: MOTIVO });
    expect(automatica.reabertos).toHaveLength(0);
    expect(automatica.recusados[0]!.motivo).toMatch(/refação/);

    // E a porta da direção, sobre EXATAMENTE o mesmo card, reabre.
    const direcao = await reabrirCardPorDecisaoDaDirecao({ approvalRequestId: card });
    expect(direcao.resultado).toBe("reaberto");
  });
});

describe("pecasIncompletas — a trava desta porta, isolada", () => {
  const carrossel = (extra: Partial<PecaConferida>): PecaConferida => ({
    postId: "p1", ausente: null, formato: "carousel",
    capa: "/api/media/a", telas: ["/api/media/a", "/api/media/b"], ...extra,
  });

  it("carrossel com ≥2 telas e capa = tela 1 está COMPLETO", () => {
    expect(pecasIncompletas([carrossel({})])).toEqual([]);
  });

  it("o formato em português também é carrossel", () => {
    expect(pecasIncompletas([carrossel({ formato: "carrossel", telas: ["/api/media/a"] })]))
      .toHaveLength(1);
  });

  it("peça de imagem única: completa é ter arte; sem arte nenhuma, falta", () => {
    expect(pecasIncompletas([carrossel({ formato: "feed", telas: [] })])).toEqual([]);
    expect(pecasIncompletas([carrossel({ formato: "feed", capa: null, telas: [] })]))
      .toEqual([{ postId: "p1", falta: expect.stringContaining("não tem arte nenhuma") }]);
  });

  it("a comparação capa/tela 1 é por ID de mídia, não por string crua", () => {
    // Um `?v=2` numa das pontas não pode recusar um carrossel perfeito.
    expect(pecasIncompletas([carrossel({
      capa: "/api/media/a?v=2", telas: ["/api/media/a", "/api/media/b"],
    })])).toEqual([]);
    expect(idDaMidia("/api/media/abc?v=2")).toBe("abc");
    expect(idDaMidia("https://cdn/x.png")).toBe("https://cdn/x.png");
    expect(idDaMidia(null)).toBeNull();
  });

  it("peça ausente do portal é o pior incompleto — entra com o motivo dela", () => {
    expect(pecasIncompletas([carrossel({ ausente: "a peça não existe mais no calendário" })]))
      .toEqual([{ postId: "p1", falta: "a peça não existe mais no calendário" }]);
  });
});

describe("a frase de ESTADO que o CEO lê", () => {
  const peca = (telas: number): PecaConferida => ({
    postId: `p${telas}`, ausente: null, formato: "carousel", capa: "/api/media/a",
    telas: Array.from({ length: telas }, (_, i) => `/api/media/${i}`),
  });

  it("todos no mesmo número: 'cada um dos 6 carrosséis … as 6 telas'", () => {
    expect(fraseDoEstadoDasPecas([peca(6), peca(6), peca(6), peca(6), peca(6), peca(6)]))
      .toContain("cada um dos 6 carrosséis deste card traz as 6 telas, e a capa é a tela 1");
  });

  it("números diferentes NÃO viram generalização — a frase diz o intervalo", () => {
    expect(fraseDoEstadoDasPecas([peca(4), peca(6)]))
      .toContain("cada um dos 2 carrosséis deste card traz entre 4 e 6 telas");
  });
});

describe("o texto da decisão da direção", () => {
  const pecas: PecaConferida[] = [{
    postId: "p1", ausente: null, formato: "carousel",
    capa: "/api/media/a", telas: ["/api/media/a", "/api/media/b"],
  }];

  it("declara-se DECISÃO HUMANA e não finge que algo mudou agora", () => {
    const texto = textoDaDecisaoDaDirecao({ pecas, pedido: null });
    expect(texto).toContain("POR DECISÃO DA DIREÇÃO DA AGÊNCIA");
    expect(texto).toContain("não porque alguma coisa mudou agora");
    expect(texto).toContain("NADA foi alterado nas peças");
    // ⛔ Não empresta o texto da outra porta, que fala de mudança material.
    expect(texto).not.toContain("as peças MUDARAM");
    expect(texto).not.toContain("As peças foram completadas");
    expect(texto).not.toContain("**aprovada**");
  });

  it("é histórico puro: não repete legenda nem URL de mídia", () => {
    const texto = textoDaDecisaoDaDirecao({ pecas, pedido: null });
    expect(texto).not.toContain("/api/media/");
    expect(texto).not.toMatch(/Legenda:|Telas:/);
    expect(texto).toContain("1 peça(s)");
  });

  it("não especula o motivo do cliente — só diz que ele pediu e que nada sumiu", () => {
    const texto = textoDaDecisaoDaDirecao({
      pecas,
      pedido: { registradoEm: new Date("2026-08-05T01:00:00Z"), autor: "Dioli", comentarioNoHistorico: true },
    });
    expect(texto).toContain("Você pediu ajustes neste card");
    expect(texto).toContain("com as suas palavras");
    expect(texto).toContain("Dioli");
    expect(texto).toContain("nada foi apagado");
    expect(texto).toContain("Se o que você pediu foi outra coisa");
  });
});

describe("o texto do registro", () => {
  it("é histórico puro: não repete legenda, tela nem URL de mídia", () => {
    const texto = textoDoRegistro({
      decididoEm: new Date("2026-08-04T21:33:00Z"),
      decididoPor: "client:Dioli",
      motivo: MOTIVO,
      pecas: 6,
    });
    expect(texto).toContain("Dioli");
    expect(texto).not.toContain("client:"); // o prefixo técnico não vaza
    expect(texto).not.toContain("/api/media/");
    expect(texto).not.toMatch(/Legenda:|Telas:/);
    expect(texto).toContain("6 peça(s)");
  });

  it("decisão sem data registrada não vira data inventada", () => {
    const texto = textoDoRegistro({ decididoEm: null, decididoPor: null, motivo: MOTIVO, pecas: 1 });
    expect(texto).toContain("data não registrada");
    expect(texto).toContain("não registrado");
  });
});
