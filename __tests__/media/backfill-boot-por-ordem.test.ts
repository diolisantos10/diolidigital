// A OUTRA METADE DA TAREFA DE BOOT: a que ABORTA.
//
// A guarda contra o casamento POSICIONAL existe em dois níveis, e este arquivo
// prova o segundo — o que não depende de ninguém lembrar de não ligar a flag.
//
//   nível 1 · `backfill-contexto.ts` nunca passa `porOrdem: true`;
//   nível 2 · `aplicarBackfill` ABORTA se o plano trouxer uma tela `via:
//             "ordem"`, venha ela de onde vier.
//
// Testar o nível 2 exige simular o que o nível 1 impede. Por isso aqui — e só
// aqui — o módulo de casamento é dublado para devolver o plano COM o passe
// posicional ligado. É a única forma honesta de provar que o suspensório
// segura quando o cinto arrebenta: um teste que só exercita o nível 1 estaria
// provando a ausência da flag, não a existência da trava.
//
// Por que isso importa tanto: o passe posicional monta carrossel com o logo do
// cliente e com material bruto do briefing, e o resultado vai para o portal
// dele. Foi o achado da auditoria de 04/08/2026.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

const DB_PATH = vi.hoisted(() => {
  const caminho = `${process.cwd()}/prisma/backfill-boot-ordem.db`;
  process.env.DATABASE_URL = `file:${caminho}`;
  return caminho;
});

// O dublê: tudo do módulo real, MENOS o `porOrdem` — que aqui vem sempre
// ligado, como se alguém tivesse aberto a porta.
vi.mock("@/lib/agency/media/backfill-carrossel.mjs", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/agency/media/backfill-carrossel.mjs")>();
  return {
    ...real,
    planejarBackfill: (entrada: Parameters<typeof real.planejarBackfill>[0]) =>
      real.planejarBackfill({ ...entrada, porOrdem: true }),
  };
});

import { prisma } from "@/lib/db/client";
import { rodarBackfillDeBoot, VARIAVEL } from "@/lib/agency/media/backfill-boot";

let clientId = "";
const postIds: string[] = [];

beforeAll(async () => {
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
  execSync("npx prisma db push --accept-data-loss", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: `file:${DB_PATH}` },
    stdio: "pipe",
  });

  const ws = await prisma.agencyWorkspace.create({
    data: { name: "Dioli Agência", slug: `ordem-${Date.now()}` },
  });
  const cliente = await prisma.client.create({
    data: { workspaceId: ws.id, name: "Foocci", industry: "Alimentação" },
  });
  clientId = cliente.id;

  // Dois carrosséis sem NENHUM nome reconhecível nas imagens: é exatamente o
  // caso em que o passe posicional entraria — 4 imagens livres, 2 por post.
  for (let i = 1; i <= 2; i++) {
    const p = await prisma.socialPost.create({
      data: {
        workspaceId: ws.id, clientId, caption: `Carrossel ${i}`,
        networks: JSON.stringify(["instagram"]), format: "carousel",
        mediaUrl: null, mediaUrlsJson: "[]", visibility: "compartilhado",
        scheduledFor: new Date(`2026-08-1${i}T13:00:00Z`), status: "draft",
      },
    });
    postIds.push(p.id);
  }
  for (const nome of ["IMG_0001.jpg", "IMG_0002.jpg", "IMG_0003.jpg", "IMG_0004.jpg"]) {
    await prisma.mediaAsset.create({
      data: {
        workspaceId: ws.id, clientId, kind: "inbound", fileName: nome,
        mimeType: "image/jpeg", sizeBytes: 1_000, sha256: `sha-${nome}`,
        storagePath: `media/${nome}`, uploadedBy: "cliente",
      },
    });
  }
  await prisma.approvalRequest.create({
    data: {
      clientId, department: "social-media", clientVisible: true, status: "approved",
      reviewedBy: "client:Dioli", reviewedAt: new Date("2026-08-04T21:33:00Z"),
      reviewNote: "Carrosséis de lançamento — 2 peças",
      sourcePostIdsJson: JSON.stringify(postIds),
    },
  });
});

afterAll(async () => {
  delete process.env[VARIAVEL];
  await prisma.$disconnect().catch(() => {});
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
});

describe("plano com tela casada por ORDEM", () => {
  let texto = "";

  beforeAll(async () => {
    process.env[VARIAVEL] = clientId;
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const r = await rodarBackfillDeBoot();
    texto = spy.mock.calls.map((c) => String(c[0])).join("\n");
    spy.mockRestore();
    expect(r).toMatchObject({ rodou: false, motivo: "casamento-por-ordem", postsAtualizados: 0 });
  });

  it("⛔ NÃO grava uma única tela — mediaUrlsJson continua vazio", async () => {
    const posts = await prisma.socialPost.findMany({ where: { clientId } });
    expect(posts).toHaveLength(2);
    expect(posts.every((p) => p.mediaUrlsJson === "[]")).toBe(true);
    expect(posts.every((p) => p.mediaUrl === null)).toBe(true);
  });

  it("⛔ NÃO reabre a aprovação — nada mudou para o cliente decidir de novo", async () => {
    const card = await prisma.approvalRequest.findFirst({ where: { clientId } });
    expect(card!.status).toBe("approved");
    expect(card!.reviewedBy).toBe("client:Dioli");
    expect(await prisma.approvalComment.count()).toBe(0);
  });

  it("o log diz o que aconteceu, com o número de telas recusadas", () => {
    expect(texto).toContain("ABORTADO");
    expect(texto).toContain("ORDEM DE UPLOAD");
    expect(texto).toContain("NADA foi gravado");
    // O ensaio ainda é impresso: quem lê precisa ver O QUE teria sido casado.
    expect(texto).toContain("[ordem]");
  });
});
