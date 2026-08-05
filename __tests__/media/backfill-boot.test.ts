// O BACKFILL SEM CLIQUE, CONTRA UM BANCO DE VERDADE — a corrente inteira.
//
// Por que este teste existe em banco real e não em mock: o que quebrou no
// lançamento da Foocci não foi nenhuma peça isolada (todas tinham teste e todas
// passavam) — foram as JUNTAS. As telas existiam nos Arquivos, o post existia
// no calendário, o card de aprovação existia no portal, e nada ligava os três.
// Mock não pega junta: ele prova que cada função devolve o que a outra espera
// receber, que é exatamente a suposição que falhou.
//
// A corrente que este arquivo anda, do começo ao fim:
//   MediaAsset (36 telas nomeadas como as reais)
//     → plano de casamento (nome, nunca posição)
//       → SocialPost.mediaUrlsJson  (a escrita, em transação)
//         → GET /api/social-posts        → telas: string[] com 6 itens
//         → GET /api/brain/portal-data   → pecas[].telas com 6 itens
//           → e o card de aprovação VOLTA ao CEO, agora com 100% do material
//
// O que fica travado aqui:
//   ⛔ o ensaio completo é impresso ANTES da primeira escrita (a conferência);
//   ⛔ rodar de novo não regrava nada e não reabre o card de novo;
//   ⛔ post que já tem telas não é tocado; capa posta à mão não é trocada;
//   ⛔ `scheduledFor` nulo aborta sem escrever, com explicação no log;
//   ✅ o card reaberto guarda o registro da decisão anterior — histórico não
//      se perde, e o cliente continua com UM card só.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

// O caminho do banco precisa estar no ambiente ANTES de qualquer import — o
// cliente Prisma lê DATABASE_URL na criação (mesma razão do teste da jornada).
const DB_PATH = vi.hoisted(() => {
  const caminho = `${process.cwd()}/prisma/backfill-boot.db`;
  process.env.DATABASE_URL = `file:${caminho}`;
  return caminho;
});

// As duas fronteiras de identidade das rotas são dubladas — e SÓ elas. Tudo o
// que toca dado é real: se a rota parar de devolver `telas`, este teste cai.
const validatePortalAccess = vi.hoisted(() => vi.fn());
const resolvePortalClient = vi.hoisted(() => vi.fn());
const requireSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agency/persistence/portal-access-service", () => ({
  validatePortalAccess, resolvePortalClient,
}));
vi.mock("@/lib/auth/api-guard", () => ({ requireSession }));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { rodarBackfillDeBoot, VARIAVEL } from "@/lib/agency/media/backfill-boot";
import { GET as listarPosts } from "@/app/api/social-posts/route";
import { GET as portalData } from "@/app/api/brain/portal-data/route";

let workspaceId = "";
let clientId = "";
let approvalId = "";
const postIds: string[] = [];

/** As 6 capas V3, já postas à mão em produção — o backfill NUNCA as troca. */
const CAPA = (n: number) => `/api/media/capa-v3-${n}`;

/**
 * O padrão de nome das telas subidas à mão (V3): `foocci-c<N>t<M>.png`, e duas
 * delas com sufixo de conteúdo — C2T3 e C4T5 são os mockups de conversa de
 * WhatsApp, a assinatura do feed (registrado em docs/pendencias.md).
 *
 * É o padrão que `PADRAO_CNTM` reconhece. Se o que estiver em produção não
 * casar com ele, o ensaio não escreve nada e lista os 36 nomes em "o que sobrou
 * sem casar" — é assim que o log revela o padrão real sem arriscar escrita.
 */
function nomeDaTela(carrossel: number, tela: number): string {
  const sufixo =
    (carrossel === 2 && tela === 3) || (carrossel === 4 && tela === 5) ? "-whatsapp" : "";
  return `foocci-c${carrossel}t${tela}${sufixo}.png`;
}

async function semear({ semData = false }: { semData?: boolean } = {}) {
  const ws = await prisma.agencyWorkspace.create({
    data: { name: "Dioli Agência", slug: `bkf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` },
  });
  workspaceId = ws.id;

  const cliente = await prisma.client.create({
    data: { workspaceId, name: "Foocci", industry: "Alimentação" },
  });
  clientId = cliente.id;

  postIds.length = 0;
  for (let i = 1; i <= 6; i++) {
    const post = await prisma.socialPost.create({
      data: {
        workspaceId, clientId,
        caption: `Carrossel ${i} — o lançamento da Foocci contado em 6 telas.`,
        networks: JSON.stringify(["instagram"]),
        format: "carousel",
        pillar: "lançamento",
        mediaUrl: CAPA(i),
        mediaUrlsJson: "[]",
        scenesJson: JSON.stringify(["capa", "dor", "solução"]),
        visibility: "compartilhado",
        scheduledFor: semData && i === 3 ? null : new Date(`2026-08-${10 + i}T13:00:00Z`),
        // O estado depois da aprovação "às cegas" do CEO.
        status: "approved",
      },
    });
    postIds.push(post.id);
  }

  // As 36 telas, na mesma nomenclatura da V3.
  let ordem = 0;
  for (let c = 1; c <= 6; c++) {
    for (let t = 1; t <= 6; t++) {
      ordem++;
      await prisma.mediaAsset.create({
        data: {
          workspaceId, clientId, kind: "deliverable",
          fileName: nomeDaTela(c, t),
          mimeType: "image/png", sizeBytes: 100_000 + ordem,
          sha256: `sha-${c}-${t}`, storagePath: `media/${c}-${t}.png`,
          uploadedBy: "equipe",
        },
      });
    }
  }
  // O que NUNCA pode virar tela: o logo (nome institucional) e material bruto
  // sem nome reconhecível (que só entraria pelo passe posicional).
  await prisma.mediaAsset.create({
    data: {
      workspaceId, clientId, kind: "inbound", fileName: "logo-foocci.png",
      mimeType: "image/png", sizeBytes: 4_000, sha256: "sha-logo",
      storagePath: "media/logo.png", uploadedBy: "cliente",
    },
  });
  for (const bruto of ["IMG_4821.jpg", "IMG_4822.jpg"]) {
    await prisma.mediaAsset.create({
      data: {
        workspaceId, clientId, kind: "inbound", fileName: bruto,
        mimeType: "image/jpeg", sizeBytes: 9_000, sha256: `sha-${bruto}`,
        storagePath: `media/${bruto}`, uploadedBy: "cliente",
      },
    });
  }

  // O card que o CEO já aprovou — vendo só as capas.
  const card = await prisma.approvalRequest.create({
    data: {
      clientId, department: "social-media", requestedBy: "equipe:master@dioli.studio",
      clientVisible: true, status: "approved",
      reviewedBy: "client:Dioli", reviewedAt: new Date("2026-08-04T21:33:00Z"),
      expiresAt: new Date("2026-08-04T23:59:00Z"), // já vencido
      reviewNote: "Carrosséis de lançamento — 6 peças\n\n**1. Carrossel 1**\n- Formato: Carrossel",
      sourcePostIdsJson: JSON.stringify(postIds),
    },
  });
  approvalId = card.id;
}

async function limpar() {
  await prisma.approvalComment.deleteMany({});
  await prisma.approvalRequest.deleteMany({});
  await prisma.mediaAsset.deleteMany({});
  await prisma.socialPost.deleteMany({});
  await prisma.client.deleteMany({});
  await prisma.agencyWorkspace.deleteMany({});
}

beforeAll(() => {
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
  execSync("npx prisma db push --accept-data-loss", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: `file:${DB_PATH}` },
    stdio: "pipe",
  });
});

afterAll(async () => {
  delete process.env[VARIAVEL];
  await prisma.$disconnect().catch(() => {});
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
});

beforeEach(() => {
  vi.restoreAllMocks();
  requireSession.mockResolvedValue({
    session: { userId: "u1", email: "m@d", name: "M", role: "master", workspaceId },
    error: null,
  });
});

// ─── A metade que APLICA ─────────────────────────────────────────────────────

describe("a tarefa de boot, com plano limpo", () => {
  let linhas: string[] = [];
  let ordemDoPrimeiroUpdate = 0;
  let ordemDaUltimaLinhaDoEnsaio = 0;

  beforeAll(async () => {
    await limpar();
    await semear();
    process.env[VARIAVEL] = clientId;

    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    // A prova de "o ensaio sai ANTES da escrita" precisa de um marcador de
    // ordem — sem ele, o teste só diria que as duas coisas aconteceram.
    const spyTx = vi.spyOn(prisma, "$transaction");

    const r = await rodarBackfillDeBoot();
    expect(r).toMatchObject({ rodou: true, motivo: "aplicado", postsAtualizados: 6, telasLigadas: 36 });

    linhas = spy.mock.calls.map((c) => String(c[0]));
    ordemDoPrimeiroUpdate = spyTx.mock.invocationCallOrder[0] ?? 0;
    const iResumo = spy.mock.calls.findIndex((c) => String(c[0]).includes("seriam atualizados"));
    expect(iResumo).toBeGreaterThan(-1);
    ordemDaUltimaLinhaDoEnsaio = spy.mock.invocationCallOrder[iResumo] ?? 0;
    spy.mockRestore();
    spyTx.mockRestore();
  });

  it("cada tela foi para o SEU carrossel — c<N>t<M> na ordem real do calendário", async () => {
    const posts = await prisma.socialPost.findMany({
      where: { clientId }, orderBy: { scheduledFor: "asc" },
    });
    expect(posts).toHaveLength(6);

    // O dicionário id→nome de arquivo: sem ele o teste só contaria telas, e
    // contar telas foi exatamente o que deixou o embaralhamento passar.
    const assets = await prisma.mediaAsset.findMany({ where: { clientId } });
    const nomePorUrl = new Map(assets.map((a) => [`/api/media/${a.id}`, a.fileName]));

    posts.forEach((p, i) => {
      const carrossel = i + 1; // a ordem do calendário É o C<n>
      const telas: string[] = JSON.parse(p.mediaUrlsJson);
      expect(telas).toHaveLength(6);
      expect(telas.map((u) => nomePorUrl.get(u))).toEqual(
        [1, 2, 3, 4, 5, 6].map((t) => nomeDaTela(carrossel, t)),
      );
      expect(p.caption).toContain(`Carrossel ${carrossel} `);
      expect(p.mediaUrl).toBe(CAPA(carrossel)); // capa posta à mão, intocada
    });
  });

  it("⛔ o logo e o material bruto NÃO viraram tela — e o log diz por quê", async () => {
    const todas = (await prisma.socialPost.findMany({ where: { clientId } }))
      .flatMap((p) => JSON.parse(p.mediaUrlsJson) as string[]);
    const logo = await prisma.mediaAsset.findFirst({ where: { fileName: "logo-foocci.png" } });
    const bruto = await prisma.mediaAsset.findFirst({ where: { fileName: "IMG_4821.jpg" } });
    expect(todas).not.toContain(`/api/media/${logo!.id}`);
    expect(todas).not.toContain(`/api/media/${bruto!.id}`);
    expect(linhas.join("\n")).toMatch(/logo-foocci\.png.*institucional/);
    expect(linhas.join("\n")).toContain("IMG_4821.jpg");
  });

  it("⛔ o ensaio COMPLETO foi impresso ANTES da primeira escrita", () => {
    expect(ordemDaUltimaLinhaDoEnsaio).toBeGreaterThan(0);
    expect(ordemDoPrimeiroUpdate).toBeGreaterThan(ordemDaUltimaLinhaDoEnsaio);
    const texto = linhas.join("\n");
    expect(texto).toContain("── O que casou ");
    expect(texto).toContain("── EXCLUÍDAS do casamento (com motivo) ");
    expect(texto).toContain("── O que sobrou sem casar ");
    // Cada tela sai com o MÉTODO do casamento — é o que torna o log conferível.
    expect(texto).toMatch(/tela 1: foocci-c1t1\.png \[nome-CnTm\] → \/api\/media\//);
    expect(texto).toMatch(/tela 3: foocci-c2t3-whatsapp\.png \[nome-CnTm\]/);
  });

  it("⛔ nenhuma tela foi casada por ORDEM — o log não menciona esse método", () => {
    expect(linhas.join("\n")).not.toContain("[ordem]");
  });

  it("GET /api/social-posts devolve telas: string[] com 6 itens por peça", async () => {
    const res = await listarPosts(new NextRequest("http://localhost/api/social-posts"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.posts).toHaveLength(6);
    for (const p of json.posts) {
      expect(Array.isArray(p.telas)).toBe(true);
      expect(p.telas).toHaveLength(6);
      expect(p.telas[0]).toMatch(/^\/api\/media\//);
    }
  });

  it("GET /api/brain/portal-data devolve pecas[].telas com 6 itens — e o card VOLTOU a pendente", async () => {
    validatePortalAccess.mockResolvedValue({ valid: true, record: { clientRequestId: null, clientId } });
    const res = await portalData(new NextRequest("http://localhost/api/brain/portal-data?token=tok-foocci"));
    const json = await res.json();
    expect(res.status).toBe(200);

    const card = json.approvals.find((a: { id: string }) => a.id === approvalId);
    expect(card.status).toBe("pending");
    expect(card.pecas).toHaveLength(6);
    for (const peca of card.pecas) {
      expect(peca.telas).toHaveLength(6);
      expect(peca.capa).toMatch(/^\/api\/media\/capa-v3-/);
    }
  });

  it("o histórico da aprovação anterior fica NO card — e não repete o que agora é visual", async () => {
    const comentarios = await prisma.approvalComment.findMany({ where: { approvalRequestId: approvalId } });
    expect(comentarios).toHaveLength(1);
    const c = comentarios[0]!;
    expect(c.isClientVisible).toBe(true);
    expect(c.body).toContain("REABERTA");
    expect(c.body).toContain("aprovada"); // a decisão anterior, registrada
    expect(c.body).toMatch(/04\/08\/2026|2026-08-04/);
    // O registro é HISTÓRICO: não repete legenda nem lista de telas — isso o
    // cliente vê em imagem, e duplicar em texto foi o que a auditoria cobrou.
    expect(c.body).not.toContain("Legenda:");
    expect(c.body).not.toContain("Telas:");
    expect(c.body).not.toContain("/api/media/");
  });

  it("o aval foi retirado das peças: 'approved' volta a 'draft' — nada publica sozinho", async () => {
    const posts = await prisma.socialPost.findMany({ where: { clientId } });
    expect(posts.every((p) => p.status === "draft")).toBe(true);
  });

  it("o prazo vencido foi removido, e prazo novo NÃO foi inventado", async () => {
    const card = await prisma.approvalRequest.findUnique({ where: { id: approvalId } });
    expect(card!.expiresAt).toBeNull();
    expect(card!.reviewedAt).toBeNull();
    expect(card!.reviewedBy).toBeNull();
  });

  it("o reviewNote do card NÃO foi reescrito pela reabertura", async () => {
    const card = await prisma.approvalRequest.findUnique({ where: { id: approvalId } });
    expect(card!.reviewNote).toContain("Carrosséis de lançamento — 6 peças");
  });

  it("o cliente continua com UM card só — a reabertura não cria um segundo", async () => {
    const cards = await prisma.approvalRequest.findMany({ where: { clientId } });
    expect(cards).toHaveLength(1);
    expect(cards[0]!.id).toBe(approvalId);
  });

  // ── Idempotência: o CEO pode esquecer a variável ligada ────────────────────
  it("rodar de novo NÃO regrava nada, NÃO reabre de novo e diz 'nada a fazer'", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const r = await rodarBackfillDeBoot();
    const texto = spy.mock.calls.map((c) => String(c[0])).join("\n");
    spy.mockRestore();

    expect(r).toMatchObject({ rodou: false, motivo: "nada-a-fazer", postsAtualizados: 0 });
    expect(texto).toContain("NADA A FAZER");
    // Nenhum comentário novo: o card não é reaberto duas vezes.
    expect(await prisma.approvalComment.count({ where: { approvalRequestId: approvalId } })).toBe(1);
    const card = await prisma.approvalRequest.findUnique({ where: { id: approvalId } });
    expect(card!.status).toBe("pending");
  });
});

// ─── As paradas: cada uma sem escrever uma linha ──────────────────────────────

describe("as paradas — nenhuma escreve", () => {
  beforeEach(async () => {
    await limpar();
  });

  it("sem a variável: silêncio total, nem consulta acontece", async () => {
    delete process.env[VARIAVEL];
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const r = await rodarBackfillDeBoot();
    expect(r).toMatchObject({ rodou: false, motivo: "variavel-ausente" });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("cliente inexistente: aborta dizendo o que conferir", async () => {
    process.env[VARIAVEL] = "cliente-que-nao-existe";
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const r = await rodarBackfillDeBoot();
    const texto = spy.mock.calls.map((c) => String(c[0])).join("\n");
    spy.mockRestore();
    expect(r).toMatchObject({ rodou: false, motivo: "cliente-inexistente" });
    expect(texto).toContain("NADA foi gravado");
  });

  it("a variável aceita o NOME do cliente — o CEO não tem o id à mão", async () => {
    await semear();
    process.env[VARIAVEL] = "Foocci";
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const r = await rodarBackfillDeBoot();
    const texto = spy.mock.calls.map((c) => String(c[0])).join("\n");
    spy.mockRestore();
    expect(texto).toContain("resolvido pelo NOME");
    expect(r).toMatchObject({ rodou: true, postsAtualizados: 6, telasLigadas: 36 });
  });

  it("⛔ nome AMBÍGUO não escreve nada — dois candidatos, e o log lista os dois", async () => {
    await semear();
    await prisma.client.create({ data: { workspaceId, name: "Foocci Filial", industry: "Alimentação" } });
    process.env[VARIAVEL] = "Foocci";

    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const r = await rodarBackfillDeBoot();
    const texto = spy.mock.calls.map((c) => String(c[0])).join("\n");
    spy.mockRestore();

    expect(r).toMatchObject({ rodou: false, motivo: "cliente-inexistente" });
    expect(texto).toContain("ambiguidade não se resolve por chute");
    expect(texto).toContain("Foocci Filial");
    const posts = await prisma.socialPost.findMany({ where: { clientId } });
    expect(posts.every((p) => p.mediaUrlsJson === "[]")).toBe(true);
  });

  it("⛔ scheduledFor nulo em UM post aborta TUDO, com explicação — e nada é gravado", async () => {
    await semear({ semData: true });
    process.env[VARIAVEL] = clientId;

    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const r = await rodarBackfillDeBoot();
    const texto = spy.mock.calls.map((c) => String(c[0])).join("\n");
    spy.mockRestore();

    expect(r).toMatchObject({ rodou: false, motivo: "plano-abortado" });
    expect(texto).toContain("sem data no calendário");
    expect(texto).toContain("NADA foi gravado");
    // O banco continua exatamente como estava.
    const posts = await prisma.socialPost.findMany({ where: { clientId } });
    expect(posts.every((p) => p.mediaUrlsJson === "[]")).toBe(true);
    expect(posts.every((p) => p.status === "approved")).toBe(true);
    const card = await prisma.approvalRequest.findUnique({ where: { id: approvalId } });
    expect(card!.status).toBe("approved");
    expect(await prisma.approvalComment.count()).toBe(0);
  });

  it("post que JÁ tem telas não é tocado — o --force não existe nesta porta", async () => {
    await semear();
    // O primeiro post já foi reconciliado à mão, com outras telas.
    const jaFeito = await prisma.socialPost.findFirst({
      where: { clientId }, orderBy: { scheduledFor: "asc" },
    });
    const telasAntigas = ["/api/media/posta-a-mao-1", "/api/media/posta-a-mao-2"];
    await prisma.socialPost.update({
      where: { id: jaFeito!.id },
      data: { mediaUrlsJson: JSON.stringify(telasAntigas) },
    });

    process.env[VARIAVEL] = clientId;
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const r = await rodarBackfillDeBoot();
    const texto = spy.mock.calls.map((c) => String(c[0])).join("\n");
    spy.mockRestore();

    expect(r.postsAtualizados).toBe(5); // os outros cinco
    expect(texto).toContain("NÃO será tocado");
    const depois = await prisma.socialPost.findUnique({ where: { id: jaFeito!.id } });
    expect(JSON.parse(depois!.mediaUrlsJson)).toEqual(telasAntigas);
  });
});
