// REABRIR UMA APROVAÇÃO — as recusas, que são o valor real desta peça.
//
// Reabrir é fácil; o difícil é NÃO reabrir na hora errada. Devolver um card ao
// cliente é pedir uma decisão de novo — e há três situações em que esse pedido
// é pior do que o silêncio:
//
//   ⛔ a peça já foi PUBLICADA — o botão não desfaz nada, e a pergunta mente;
//   ⛔ o cliente pediu AJUSTE ou RECUSOU — o caminho dele é a refação; reabrir
//      por cima apagaria o pedido que ele fez;
//   ⛔ o card é de OUTRO cliente — id de post não abre porta para o card alheio.
//
// E a metade positiva: quando reabre, o histórico da decisão anterior fica no
// card, o aval sai das peças e nenhum prazo é inventado.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

const DB_PATH = vi.hoisted(() => {
  const caminho = `${process.cwd()}/prisma/reabrir-aprovacao.db`;
  process.env.DATABASE_URL = `file:${caminho}`;
  return caminho;
});

import { prisma } from "@/lib/db/client";
import { reabrirAprovacoesDosPosts, textoDoRegistro } from "@/lib/agency/esteira/reabrir-aprovacao";

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

  it("⛔ card em 'revision_requested': o caminho é a refação, não a reabertura", async () => {
    const p1 = await criarPeca(clientId, "revision_requested");
    const card = await criarCard(clientId, "revision_requested", [p1]);

    const r = await reabrirAprovacoesDosPosts({ clientId, postIds: [p1], motivo: MOTIVO });
    expect(r.reabertos).toHaveLength(0);
    expect(r.recusados[0]!.motivo).toMatch(/refação/);
    expect((await prisma.approvalRequest.findUnique({ where: { id: card } }))!.status)
      .toBe("revision_requested");
  });

  it("⛔ card 'cancelled' não ressuscita por dado", async () => {
    const p1 = await criarPeca(clientId, "draft");
    await criarCard(clientId, "cancelled", [p1]);
    const r = await reabrirAprovacoesDosPosts({ clientId, postIds: [p1], motivo: MOTIVO });
    expect(r.reabertos).toHaveLength(0);
    expect(r.recusados).toHaveLength(1);
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
