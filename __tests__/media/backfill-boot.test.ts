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
// ⚠️ 15/08/2026 (rodada 3): `escopoDoToken` — o ESCOPO CONGELADO — entrou no
// caminho das rotas de portal. Esta suíte roda contra BANCO DE VERDADE (não há
// mock de prisma aqui), então o certo é deixar a implementação REAL rodar:
// stub sobre banco real esconderia justamente a trava que se quer exercitar.
// Só `validatePortalAccess` e `resolvePortalClient` continuam substituídos.
vi.mock("@/lib/agency/persistence/portal-access-service", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  validatePortalAccess, resolvePortalClient,
}));
vi.mock("@/lib/auth/api-guard", () => ({ requireSession }));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import {
  rodarBackfillDeBoot,
  rodarReaberturaDeBoot,
  VARIAVEL,
  VARIAVEL_REABRIR,
} from "@/lib/agency/media/backfill-boot";
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
  delete process.env[VARIAVEL_REABRIR];
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
    // ⚠️ rodada 3: o escopo do portal é derivado do `PortalAccess` REAL (é
    // nele que o dono fica congelado). Num teste de banco de verdade, o token
    // tem de existir de verdade — mockar o registro esconderia a trava.
    await prisma.portalAccess.upsert({
      where: { token: "tok-foocci" },
      update: { clientId },
      create: { token: "tok-foocci", clientId },
    });
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

// ─── A SEGUNDA PORTA: REABRIR_CARD_APROVACAO ─────────────────────────────────
//
// O impasse de ovo e galinha, reproduzido: as telas JÁ estão ligadas (o backfill
// diz "nada a fazer") e o card continua em "revision_requested". A porta
// automática exige ganho, e não há mais ganho para provar — o card nunca reabre
// e o CEO fica esperando para aprovar sem botão nenhum.
//
// O que fica travado aqui:
//   ✅ peças completas → reabre, com o pedido do cliente preservado e o card
//      dizendo que quem destravou foi a DIREÇÃO (não "algo mudou agora");
//   ⛔ peça incompleta → RECUSA, nomeando o que falta, sem escrever uma linha;
//   ⛔ rejected/cancelled/approved/publicada → recusa;
//   ⛔ segundo boot com a variável ainda ligada → nenhum comentário novo.

describe("a segunda porta — reabrir o card por decisão da direção", () => {
  /**
   * O estado EXATO de produção em 05/08/2026: as 36 telas já gravadas nos posts
   * (o backfill não tem mais o que fazer, e é isso que produz o impasse) e o
   * card preso em "ajustes solicitados" com o pedido do CEO no histórico.
   */
  async function estadoDeProducao(): Promise<void> {
    await semear();
    const assets = await prisma.mediaAsset.findMany({ where: { clientId } });
    const idPorNome = new Map(assets.map((a) => [a.fileName, a.id]));
    const posts = await prisma.socialPost.findMany({
      where: { clientId }, orderBy: { scheduledFor: "asc" },
    });
    for (const [i, p] of posts.entries()) {
      const telas = [1, 2, 3, 4, 5, 6].map((t) => `/api/media/${idPorNome.get(nomeDaTela(i + 1, t))}`);
      await prisma.socialPost.update({
        where: { id: p.id },
        // capa = tela 1: o contrato de execution/artes.ts, já satisfeito.
        data: { mediaUrlsJson: JSON.stringify(telas), mediaUrl: telas[0], status: "revision_requested" },
      });
    }
    await prisma.approvalRequest.update({
      where: { id: approvalId },
      data: { status: "revision_requested", reviewedBy: "client:Dioli" },
    });
    await prisma.approvalComment.create({
      data: {
        approvalRequestId: approvalId, authorName: "Dioli", authorRole: "client",
        kind: "comment", body: "Só apareceu a capa, quero ver o carrossel todo.",
        isClientVisible: true,
      },
    });
  }

  /** Roda a porta e devolve o log inteiro, como o CEO o lê no Railway. */
  async function rodarComLog() {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const r = await rodarReaberturaDeBoot();
    const texto = spy.mock.calls.map((c) => String(c[0])).join("\n");
    spy.mockRestore();
    return { r, texto };
  }

  beforeEach(async () => {
    await limpar();
    delete process.env[VARIAVEL];
    delete process.env[VARIAVEL_REABRIR];
  });

  it("sem a variável: silêncio total — a porta não fala em deploy que não é dela", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const r = await rodarReaberturaDeBoot();
    expect(r).toMatchObject({ rodou: false, motivo: "variavel-ausente" });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("A CORRENTE INTEIRA: backfill sem ganho + porta da direção → o card volta ao CEO", async () => {
    await estadoDeProducao();
    process.env[VARIAVEL] = clientId;
    process.env[VARIAVEL_REABRIR] = approvalId;

    // 1. O backfill roda primeiro e não tem NADA a acrescentar — é o impasse.
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const backfill = await rodarBackfillDeBoot();
    const reabertura = await rodarReaberturaDeBoot();
    const texto = spy.mock.calls.map((c) => String(c[0])).join("\n");
    spy.mockRestore();

    expect(backfill).toMatchObject({ rodou: false, motivo: "nada-a-fazer", cardsReabertos: [] });
    expect(texto).toContain("Todos os carrosséis JÁ têm telas ligadas e COMPLETAS");

    // 2. A porta da direção destrava — e se declara como decisão humana.
    expect(reabertura).toMatchObject({ rodou: true, motivo: "reaberto", postsDevolvidos: 6 });
    expect(texto).toContain("[reabrir-card]");
    expect(texto).toContain("peças conferidas: 6, TODAS completas");
    expect(texto).toContain("POR DECISÃO DA DIREÇÃO");
    expect(texto).toContain("nada mudou nas peças nesta passada");
    expect(texto).toContain('6 peça(s) devolvida(s) para "draft"');
    expect(texto).toContain("CONTINUA no histórico do card");
    // A regra do ganho não foi tocada, e o log diz isso com todas as letras.
    expect(texto).toContain("esta porta NÃO usa ganho de telas");

    // 3. O estado: card pendente, peças sem aval, histórico com as DUAS vozes.
    const card = await prisma.approvalRequest.findUnique({ where: { id: approvalId } });
    expect(card!.status).toBe("pending");
    expect(card!.reviewedAt).toBeNull();
    expect(card!.expiresAt).toBeNull(); // o prazo vencido media a decisão antiga
    const posts = await prisma.socialPost.findMany({ where: { clientId } });
    expect(posts.every((p) => p.status === "draft")).toBe(true);

    const historico = await prisma.approvalComment.findMany({
      where: { approvalRequestId: approvalId }, orderBy: { createdAt: "asc" },
    });
    expect(historico).toHaveLength(2);
    expect(historico[0]!.authorRole).toBe("client");
    expect(historico[0]!.body).toContain("Só apareceu a capa");
    expect(historico[1]!.body).toContain("POR DECISÃO DA DIREÇÃO DA AGÊNCIA");
    expect(historico[1]!.body).toContain("NADA foi alterado nas peças");
    expect(historico[1]!.body).toContain("cada um dos 6 carrosséis deste card traz as 6 telas");

    // 4. A ponta que interessa: o PORTAL do cliente pede a decisão, com tudo.
    await prisma.portalAccess.upsert({
      where: { token: "tok" }, update: { clientId }, create: { token: "tok", clientId },
    });
    const res = await portalData(new NextRequest("http://localhost/api/brain/portal-data?token=tok"));
    const json = await res.json();
    const noPortal = json.approvals.find((a: { id: string }) => a.id === approvalId);
    expect(noPortal.status).toBe("pending");
    expect(noPortal.pecas).toHaveLength(6);
    for (const peca of noPortal.pecas) expect(peca.telas).toHaveLength(6);
  });

  it("IDEMPOTENTE: o segundo boot com a variável ligada não escreve segundo comentário", async () => {
    await estadoDeProducao();
    process.env[VARIAVEL_REABRIR] = approvalId;

    await rodarComLog();
    expect(await prisma.approvalComment.count({ where: { approvalRequestId: approvalId } })).toBe(2);

    const { r, texto } = await rodarComLog();
    expect(r).toMatchObject({ rodou: false, motivo: "ja-pendente" });
    expect(texto).toContain("NADA A FAZER — o card já está PENDENTE");
    expect(texto).toContain("NÃO escreve segundo comentário");
    expect(await prisma.approvalComment.count({ where: { approvalRequestId: approvalId } })).toBe(2);
  });

  it("⛔ peça INCOMPLETA: recusa, diz o que falta e não escreve uma linha", async () => {
    await estadoDeProducao();
    // Um carrossel volta a ter só a capa — o defeito de origem, num post só.
    const capenga = await prisma.socialPost.findFirst({
      where: { clientId }, orderBy: { scheduledFor: "asc" },
    });
    await prisma.socialPost.update({
      where: { id: capenga!.id },
      data: { mediaUrlsJson: "[]" },
    });
    process.env[VARIAVEL_REABRIR] = approvalId;

    const { r, texto } = await rodarComLog();

    expect(r).toMatchObject({ rodou: false, motivo: "recusado", postsDevolvidos: 0 });
    expect(texto).toContain("⛔ NÃO REABERTO");
    expect(texto).toContain("1 de 6 peça(s) deste card NÃO estão completas");
    expect(texto).toContain("o que falta, peça por peça:");
    expect(texto).toContain(`✗ ${capenga!.id} — carrossel SEM NENHUMA TELA LIGADA`);
    expect(texto).toContain("Complete as peças e faça um novo deploy");
    expect(texto).toContain("NADA foi gravado");

    // O banco continua exatamente como estava: só o pedido do cliente no card.
    const card = await prisma.approvalRequest.findUnique({ where: { id: approvalId } });
    expect(card!.status).toBe("revision_requested");
    expect(await prisma.approvalComment.count({ where: { approvalRequestId: approvalId } })).toBe(1);
    const posts = await prisma.socialPost.findMany({ where: { clientId } });
    expect(posts.every((p) => p.status === "revision_requested")).toBe(true);
  });

  it("⛔ card 'rejected': recusa nomeando o estado, e nada ressuscita", async () => {
    await estadoDeProducao();
    await prisma.approvalRequest.update({ where: { id: approvalId }, data: { status: "rejected" } });
    process.env[VARIAVEL_REABRIR] = approvalId;

    const { r, texto } = await rodarComLog();
    expect(r.motivo).toBe("recusado");
    expect(texto).toMatch(/não ressuscitam/i);
    expect((await prisma.approvalRequest.findUnique({ where: { id: approvalId } }))!.status)
      .toBe("rejected");
    expect(await prisma.approvalComment.count({ where: { approvalRequestId: approvalId } })).toBe(1);
  });

  it("⛔ card 'approved': recusa — não há o que reabrir, e a porta não revoga o cliente", async () => {
    await estadoDeProducao();
    await prisma.approvalRequest.update({ where: { id: approvalId }, data: { status: "approved" } });
    process.env[VARIAVEL_REABRIR] = approvalId;

    const { r, texto } = await rodarComLog();
    expect(r.motivo).toBe("recusado");
    expect(texto).toContain("JÁ está aprovado");
    expect((await prisma.approvalRequest.findUnique({ where: { id: approvalId } }))!.status)
      .toBe("approved");
  });

  it("⛔ peça já PUBLICADA barra, mesmo com todas as peças completas", async () => {
    await estadoDeProducao();
    const noAr = await prisma.socialPost.findFirst({ where: { clientId } });
    await prisma.socialPost.update({ where: { id: noAr!.id }, data: { status: "published" } });
    process.env[VARIAVEL_REABRIR] = approvalId;

    const { r, texto } = await rodarComLog();
    expect(r.motivo).toBe("recusado");
    expect(texto).toContain("já foram PUBLICADAS");
    expect((await prisma.approvalRequest.findUnique({ where: { id: approvalId } }))!.status)
      .toBe("revision_requested");
  });

  it("⛔ id de card errado na variável: recusa dizendo o que conferir, sem derrubar nada", async () => {
    await estadoDeProducao();
    process.env[VARIAVEL_REABRIR] = "cardquenaoexiste";

    const { r, texto } = await rodarComLog();
    expect(r.motivo).toBe("recusado");
    expect(texto).toContain("não existe card de aprovação");
    expect((await prisma.approvalRequest.findUnique({ where: { id: approvalId } }))!.status)
      .toBe("revision_requested");
  });
});
