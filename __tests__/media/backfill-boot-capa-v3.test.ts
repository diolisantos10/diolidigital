// A CORRENTE INTEIRA COM OS NOMES REAIS DE PRODUÇÃO — e o reparo do que já foi
// gravado errado.
//
// ── O incidente que este arquivo prende (05/08/2026) ─────────────────────────
// A tarefa de boot rodou em produção e o log disse:
//
//     ▸ post #1 — capa atual: /api/media/med_6d5… (mantida)
//        tela 2: carrossel-c1-tela-2-v3.png [nome-CnTm] → …
//        …
//     ── EXCLUÍDAS ──
//        ⛔ foocci-c1-v3-capa.png (med_6d5…) — já em uso — post (cmsdoe5e30…)
//     ── Resumo ──
//        6 post(s) atualizados · 30 tela(s) ligadas.
//
// **30, e não 36.** O índice `emUso` — que existe para o LOGO não virar tela —
// excluiu a CAPA DO PRÓPRIO POST. Cada carrossel foi gravado com 5 telas,
// começando pela SEGUNDA.
//
// Por que isso não é detalhe: `components/portal/DetalheDaPeca.tsx` faz
// `telas.length > 0 ? telas : [capa]` — não prepende a capa quando há telas. O
// cliente abriria o carrossel na tela 2. E `lib/agency/esteira/publicacao.ts`
// monta o carrossel do Instagram a partir de `mediaUrlsJson`: publicaria 5 de 6
// em nome do cliente.
//
// Por isso o conserto é no DADO, não na tela — e por isso este teste anda até o
// fim da corrente: banco → backfill → `mediaUrlsJson` → `publicarAgendados`.
//
// Os nomes usados aqui são os REAIS. Não troque por um padrão sintético: foi
// exatamente isso (testar `foocci-c1t1.png`, que produção não usa) que deixou o
// buraco passar.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

const DB_PATH = vi.hoisted(() => {
  const caminho = `${process.cwd()}/prisma/backfill-capa-v3.db`;
  process.env.DATABASE_URL = `file:${caminho}`;
  return caminho;
});

// Só as fronteiras EXTERNAS são dubladas (a Meta e a assinatura de URL). Banco,
// backfill e publicação são os reais — junta com dublê não é junta testada.
const publishPost = vi.hoisted(() => vi.fn());
const conexaoDoCliente = vi.hoisted(() => vi.fn());
vi.mock("@/lib/integrations/meta/client", () => ({ publishPost }));
vi.mock("@/lib/integrations/meta/connections", () => ({ conexaoDoCliente }));
vi.mock("@/lib/agency/media/armazenamento", () => ({
  caminhoPublicoAssinado: (id: string) => `/api/media/${id}?exp=1&sig=abc`,
}));

import { prisma } from "@/lib/db/client";
import { rodarBackfillDeBoot, VARIAVEL } from "@/lib/agency/media/backfill-boot";
import { publicarAgendados } from "@/lib/agency/esteira/publicacao";

/** Os nomes REAIS da V3 em produção. A tela 1 é a capa e tem outro padrão. */
const CAPA_V3 = (c: number) => `foocci-c${c}-v3-capa.png`;
const TELA_V3 = (c: number, t: number) => `carrossel-c${c}-tela-${t}-v3.png`;

let workspaceId = "";
let clientId = "";
let approvalId = "";
const postIds: string[] = [];
/** fileName → id do MediaAsset, para conferir tela a tela pelo NOME. */
const idPorNome = new Map<string, string>();

/**
 * Semeia o mundo da Foocci com os nomes reais.
 *
 * @param telasJaGravadas o que já está em `mediaUrlsJson`. `"nada"` = a primeira
 *   passada; `"cinco-sem-capa"` = O ESTADO EXATO DE PRODUÇÃO depois do bug.
 * @param decisao o que o cliente já fez com o card. `"aprovado"` = ele decidiu
 *   vendo menos do que existe; `"ajuste-pedido"` = ele NOTOU que faltava e
 *   clicou "Solicitar ajustes" (o estado real de 05/08/2026, às 22h).
 */
async function semear(
  telasJaGravadas: "nada" | "cinco-sem-capa",
  decisao: "aprovado" | "ajuste-pedido" = "aprovado",
) {
  const ws = await prisma.agencyWorkspace.create({
    data: { name: "Dioli Agência", slug: `capa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` },
  });
  workspaceId = ws.id;
  const cliente = await prisma.client.create({
    data: { workspaceId, name: "Foocci", industry: "Alimentação" },
  });
  clientId = cliente.id;

  idPorNome.clear();
  const criarAsset = async (fileName: string, kind = "deliverable") => {
    const a = await prisma.mediaAsset.create({
      data: {
        workspaceId, clientId, kind, fileName, mimeType: "image/png",
        sizeBytes: 100_000 + idPorNome.size, sha256: `sha-${fileName}`,
        storagePath: `media/${fileName}`, uploadedBy: "equipe",
      },
    });
    idPorNome.set(fileName, a.id);
    return a.id;
  };

  // 6 capas + 30 telas = as 36 peças que o CEO quer ver inteiras.
  for (let c = 1; c <= 6; c++) {
    await criarAsset(CAPA_V3(c));
    for (let t = 2; t <= 6; t++) await criarAsset(TELA_V3(c, t));
  }
  // O que NUNCA pode virar tela.
  await criarAsset("logo-foocci.png", "inbound");
  await criarAsset("IMG_4821.jpg", "inbound");

  postIds.length = 0;
  for (let c = 1; c <= 6; c++) {
    const capa = `/api/media/${idPorNome.get(CAPA_V3(c))}`;
    const cinco = [2, 3, 4, 5, 6].map((t) => `/api/media/${idPorNome.get(TELA_V3(c, t))}`);
    const post = await prisma.socialPost.create({
      data: {
        workspaceId, clientId,
        caption: `Carrossel ${c} — o lançamento da Foocci contado em 6 telas.`,
        networks: JSON.stringify(["instagram"]),
        format: "carousel", pillar: "lançamento",
        mediaUrl: capa, // a capa V3, posta à mão — o backfill nunca a troca
        mediaUrlsJson: telasJaGravadas === "nada" ? "[]" : JSON.stringify(cinco),
        visibility: "compartilhado",
        scheduledFor: new Date(`2026-08-${10 + c}T13:00:00Z`),
        // A decisão do cliente propaga à peça — é o que o portal grava.
        status: decisao === "aprovado" ? "approved" : "revision_requested",
      },
    });
    postIds.push(post.id);
  }

  const card = await prisma.approvalRequest.create({
    data: {
      clientId, department: "social-media", requestedBy: "equipe:master@dioli.studio",
      clientVisible: true,
      status: decisao === "aprovado" ? "approved" : "revision_requested",
      reviewedBy: "client:Dioli", reviewedAt: new Date("2026-08-04T21:33:00Z"),
      reviewNote: "Carrosséis de lançamento — 6 peças",
      sourcePostIdsJson: JSON.stringify(postIds),
    },
  });
  approvalId = card.id;

  if (decisao === "ajuste-pedido") {
    // O texto que ele escreveu. É ELE que não pode sumir de jeito nenhum.
    await prisma.approvalComment.create({
      data: {
        approvalRequestId: card.id, authorName: "Dioli", authorRole: "client",
        kind: "comment", isClientVisible: true,
        body: PEDIDO_DO_CLIENTE,
      },
    });
  }
}

/** O pedido literal que trancou o card em produção. */
const PEDIDO_DO_CLIENTE =
  "Só estou vendo uma imagem por carrossel — cadê as outras telas? Manda completo pra eu aprovar.";

async function limpar() {
  await prisma.approvalComment.deleteMany({});
  await prisma.approvalRequest.deleteMany({});
  await prisma.mediaAsset.deleteMany({});
  await prisma.socialPost.deleteMany({});
  await prisma.client.deleteMany({});
  await prisma.agencyWorkspace.deleteMany({});
}

/** As telas gravadas de cada post, já traduzidas de volta para NOME. */
async function telasPorNome(): Promise<string[][]> {
  const posts = await prisma.socialPost.findMany({ where: { clientId }, orderBy: { scheduledFor: "asc" } });
  const nomePorUrl = new Map([...idPorNome].map(([nome, id]) => [`/api/media/${id}`, nome]));
  return posts.map((p) => (JSON.parse(p.mediaUrlsJson) as string[]).map((u) => nomePorUrl.get(u) ?? u));
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

// ─── 1. A primeira passada, com os nomes reais ───────────────────────────────

describe("primeira passada com os nomes reais da V3", () => {
  let texto = "";

  beforeAll(async () => {
    await limpar();
    await semear("nada");
    process.env[VARIAVEL] = clientId;
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const r = await rodarBackfillDeBoot();
    texto = spy.mock.calls.map((c) => String(c[0])).join("\n");
    spy.mockRestore();
    // 36, não 30. É o número que o incidente errou.
    expect(r).toMatchObject({ rodou: true, motivo: "aplicado", postsAtualizados: 6, telasLigadas: 36 });
  });

  it("✅ 6 telas por carrossel, e a CAPA é a primeira", async () => {
    const porPost = await telasPorNome();
    expect(porPost).toHaveLength(6);
    porPost.forEach((telas, i) => {
      const c = i + 1; // a ordem do calendário É o C<n>
      expect(telas).toEqual([CAPA_V3(c), ...[2, 3, 4, 5, 6].map((t) => TELA_V3(c, t))]);
    });
  });

  it("✅ o contrato da casa fica de pé: mediaUrl === mediaUrlsJson[0]", async () => {
    const posts = await prisma.socialPost.findMany({ where: { clientId } });
    for (const p of posts) {
      expect((JSON.parse(p.mediaUrlsJson) as string[])[0]).toBe(p.mediaUrl);
    }
  });

  it("o log mostra o método de cada tela — a capa sai marcada [capa]", () => {
    expect(texto).toMatch(/tela 1: foocci-c1-v3-capa\.png \[capa\]/);
    expect(texto).toMatch(/tela 2: carrossel-c1-tela-2-v3\.png \[nome-CnTm\]/);
    expect(texto).not.toContain("[ordem]");
  });

  it("⛔ a capa NÃO aparece mais como excluída — mas o logo continua excluído", () => {
    expect(texto).not.toMatch(/⛔ foocci-c\d-v3-capa\.png/);
    expect(texto).toMatch(/logo-foocci\.png.*institucional/);
  });

  it("⛔ o logo e o material bruto NÃO viraram tela de ninguém", async () => {
    const todas = (await telasPorNome()).flat();
    expect(todas).not.toContain("logo-foocci.png");
    expect(todas).not.toContain("IMG_4821.jpg");
  });

  it("⛔ nenhuma tela foi parar no carrossel do vizinho", async () => {
    const porPost = await telasPorNome();
    porPost.forEach((telas, i) => {
      const c = i + 1;
      expect(telas.every((n) => n.includes(`c${c}-`))).toBe(true);
    });
  });
});

// ─── 2. O REPARO — o estado exato que produção já tem gravado ────────────────

describe("o reparo dos 6 carrosséis que produção gravou com 5 telas", () => {
  let texto = "";

  beforeAll(async () => {
    await limpar();
    await semear("cinco-sem-capa"); // o resultado do bug, tal como está no banco
    process.env[VARIAVEL] = clientId;
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const r = await rodarBackfillDeBoot();
    texto = spy.mock.calls.map((c) => String(c[0])).join("\n");
    spy.mockRestore();
    expect(r).toMatchObject({ rodou: true, motivo: "aplicado", postsAtualizados: 6, telasLigadas: 36 });
  });

  it("✅ os 6 posts foram reparados de 5 para 6 telas, com a capa em primeiro", async () => {
    const porPost = await telasPorNome();
    porPost.forEach((telas, i) => {
      const c = i + 1;
      expect(telas).toHaveLength(6);
      expect(telas[0]).toBe(CAPA_V3(c));
    });
  });

  it("o log ANUNCIA o reparo, com o número de antes e o de depois", () => {
    // A frase que o CEO procura no log do Railway.
    expect(texto).toMatch(/reparado: 5 → 6 telas/);
    expect(texto).toContain("INCOMPLETO — será reparado: 5 → 6 telas");
    expect(texto).toContain("6 post(s) seriam atualizados (0 novo(s) · 6 reparo(s))");
    // E NÃO diz que está pulando: era essa a mentira da idempotência binária.
    expect(texto).not.toContain("NÃO será tocado");
  });

  it("⛔ a capa posta à mão NÃO foi trocada", async () => {
    const posts = await prisma.socialPost.findMany({ where: { clientId }, orderBy: { scheduledFor: "asc" } });
    posts.forEach((p, i) => {
      expect(p.mediaUrl).toBe(`/api/media/${idPorNome.get(CAPA_V3(i + 1))}`);
    });
  });

  it("✅ a aprovação volta ao cliente: ele decidiu vendo 5 telas de 6", async () => {
    const card = await prisma.approvalRequest.findUnique({ where: { id: approvalId } });
    expect(card!.status).toBe("pending");
    const posts = await prisma.socialPost.findMany({ where: { clientId } });
    expect(posts.every((p) => p.status === "draft")).toBe(true);
  });

  it("⛔ rodar DE NOVO não regrava nada — o reparo não vira laço infinito", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const r = await rodarBackfillDeBoot();
    const t2 = spy.mock.calls.map((c) => String(c[0])).join("\n");
    spy.mockRestore();
    expect(r).toMatchObject({ rodou: false, motivo: "nada-a-fazer" });
    expect(t2).toContain("telas ligadas e COMPLETAS");
    expect(await prisma.approvalComment.count({ where: { approvalRequestId: approvalId } })).toBe(1);
  });

  // ── A ponta da corrente: o que a Meta receberia ───────────────────────────
  it("✅ publicacao.ts manda as 6 telas para o Instagram — a capa na primeira", async () => {
    process.env.PUBLIC_BASE_URL = "https://app.dioli.studio";
    publishPost.mockResolvedValue({ ok: true, externalPostId: "ig_1", permalink: "https://insta/p/1" });
    conexaoDoCliente.mockResolvedValue({ id: "mc1", status: "connected" });

    // Um único post no relógio, já vencido — o resto do calendário fica quieto.
    const alvo = await prisma.socialPost.findFirst({ where: { clientId }, orderBy: { scheduledFor: "asc" } });
    await prisma.socialPost.update({
      where: { id: alvo!.id },
      data: { status: "scheduled", scheduledFor: new Date("2026-08-01T10:00:00Z") },
    });

    const r = await publicarAgendados();
    expect(r.publicados).toBe(1);

    const arg = publishPost.mock.calls[0]![1] as { format: string; mediaUrls?: string[] };
    expect(arg.format).toBe("carousel");
    // 6, não 5: é a razão de o conserto ter sido no dado e não na tela.
    expect(arg.mediaUrls).toHaveLength(6);
    expect(arg.mediaUrls![0]).toContain(idPorNome.get(CAPA_V3(1))!);
  });
});

// ─── 3. O CARD TRANCADO EM "AJUSTES SOLICITADOS" ────────────────────────────
//
// O que aconteceu de verdade em 05/08/2026, às 22h: o CEO viu só a capa, clicou
// "Solicitar ajustes" e escreveu o pedido. O reparo rodou depois e atendeu o
// pedido — 5 → 6 telas — mas o log disse:
//
//     ⛔ card cmsdyt9in… NÃO reaberto: status "revision_requested"
//
// O card ficou preso no estado que o próprio conserto já tinha resolvido, e o
// CEO sem botão de aprovar. Este bloco é a corrente inteira desse caso: banco →
// reparo → de-para de telas → reabertura → histórico do card.

describe("o card em AJUSTE cujo pedido o reparo acabou de atender", () => {
  let texto = "";

  beforeAll(async () => {
    await limpar();
    await semear("cinco-sem-capa", "ajuste-pedido");
    process.env[VARIAVEL] = clientId;
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const r = await rodarBackfillDeBoot();
    texto = spy.mock.calls.map((c) => String(c[0])).join("\n");
    spy.mockRestore();
    expect(r).toMatchObject({ rodou: true, motivo: "aplicado", postsAtualizados: 6, telasLigadas: 36 });
    expect(r.cardsReabertos).toEqual([approvalId]);
  });

  it("✅ o card volta a PENDENTE — o CEO recupera o botão de aprovar", async () => {
    const card = await prisma.approvalRequest.findUnique({ where: { id: approvalId } });
    expect(card!.status).toBe("pending");
    expect(card!.reviewedAt).toBeNull();
    expect(card!.reviewedBy).toBeNull();
  });

  it("⛔ o PEDIDO DE AJUSTE dele continua no histórico, e vem ANTES da resposta", async () => {
    const historico = await prisma.approvalComment.findMany({
      where: { approvalRequestId: approvalId }, orderBy: { createdAt: "asc" },
    });
    expect(historico).toHaveLength(2);
    expect(historico[0]!.authorRole).toBe("client");
    expect(historico[0]!.body).toBe(PEDIDO_DO_CLIENTE);
    expect(historico[0]!.isClientVisible).toBe(true);
  });

  it("✅ o registro novo diz o que foi feito em resposta — com o número real", async () => {
    const historico = await prisma.approvalComment.findMany({
      where: { approvalRequestId: approvalId }, orderBy: { createdAt: "asc" },
    });
    const resposta = historico[1]!;
    expect(resposta.authorRole).toBe("internal");
    expect(resposta.isClientVisible).toBe(true);
    expect(resposta.body).toContain("Você pediu ajustes neste card");
    expect(resposta.body).toContain(
      "As peças foram completadas: cada uma das 6 peças deste card agora traz as 6 telas",
    );
    expect(resposta.body).toContain("continua aqui no histórico, com as suas palavras");
    // Histórico, não conteúdo: nada de legenda nem URL de mídia no texto.
    expect(resposta.body).not.toContain("/api/media/");
    expect(resposta.body).not.toContain("Legenda:");
  });

  it("✅ as peças saem de 'Em ajuste' — o calendário não contradiz o card", async () => {
    const posts = await prisma.socialPost.findMany({ where: { clientId } });
    expect(posts.every((p) => p.status === "draft")).toBe(true);
  });

  it("o log do Railway conta a história ao CEO, sem abrir o banco", () => {
    expect(texto).toMatch(/reparado: 5 → 6 telas/);
    expect(texto).toContain('estava "revision_requested"');
    expect(texto).toContain("voltou porque as peças mudaram");
    expect(texto).toContain("CONTINUA no histórico do card");
  });

  it("⛔ rodar DE NOVO não reabre nem escreve — o pedido não é respondido duas vezes", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const r = await rodarBackfillDeBoot();
    spy.mockRestore();
    expect(r).toMatchObject({ rodou: false, motivo: "nada-a-fazer" });
    expect(await prisma.approvalComment.count({ where: { approvalRequestId: approvalId } })).toBe(2);
    const card = await prisma.approvalRequest.findUnique({ where: { id: approvalId } });
    expect(card!.status).toBe("pending");
  });
});

// ─── 4. A METADE QUE NÃO AFROUXOU ───────────────────────────────────────────
//
// Mesmo card em ajuste, mesmo pedido do cliente — só que o backfill não tem nada
// para acrescentar (os carrosséis já estão completos). Aqui o card TEM que ficar
// onde está: reabrir sem entregar nada novo é enterrar o pedido dele.

describe("o card em AJUSTE quando nada mudou nas peças", () => {
  beforeAll(async () => {
    await limpar();
    await semear("nada", "ajuste-pedido");
    // Os carrosséis já completos: a passada seguinte não tem o que gravar.
    for (let i = 0; i < postIds.length; i++) {
      const c = i + 1;
      await prisma.socialPost.update({
        where: { id: postIds[i]! },
        data: {
          mediaUrlsJson: JSON.stringify([
            `/api/media/${idPorNome.get(CAPA_V3(c))}`,
            ...[2, 3, 4, 5, 6].map((t) => `/api/media/${idPorNome.get(TELA_V3(c, t))}`),
          ]),
        },
      });
    }
    process.env[VARIAVEL] = clientId;
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const r = await rodarBackfillDeBoot();
    spy.mockRestore();
    expect(r).toMatchObject({ rodou: false, motivo: "nada-a-fazer", cardsReabertos: [] });
  });

  it("⛔ o card CONTINUA em 'revision_requested' — o caminho dele é a refação", async () => {
    const card = await prisma.approvalRequest.findUnique({ where: { id: approvalId } });
    expect(card!.status).toBe("revision_requested");
    expect(card!.reviewedBy).toBe("client:Dioli");
  });

  it("⛔ nada foi escrito no histórico, e a peça segue marcada 'Em ajuste'", async () => {
    const historico = await prisma.approvalComment.findMany({ where: { approvalRequestId: approvalId } });
    expect(historico).toHaveLength(1);
    expect(historico[0]!.body).toBe(PEDIDO_DO_CLIENTE);
    const posts = await prisma.socialPost.findMany({ where: { clientId } });
    expect(posts.every((p) => p.status === "revision_requested")).toBe(true);
  });
});
