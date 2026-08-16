// ── "O BOTÃO ABRE PARA O ESTRANHO" — a sonda que mediu, virada em gate ──────
//
// A frase é do `seguranca`, e ela descreve o defeito que sobreviveu a SETE
// rodadas de conserto: as leituras foram fechando, uma por uma, e **o POST que
// APROVA continuou aberto**. Aprovar, nesta casa, publica.
//
// A sonda NÃO conhece interno nenhum: planta o cenário no banco e bate nas
// ROTAS. Por isso ela roda igual na base e no PR, e a diferença medida é
// comportamento, não implementação.
//
// ── O A/B, MEDIDO EM 16/08/2026 ─────────────────────────────────────────────
//
// | commit | 1. o botão | 2. portal-data | 3. social-posts | 4. messages |
// |---|---|---|---|---|
// | `64d8afe5` (base)         | ⛔ `approved`, HTTP 200 | ⛔ vazou | ⛔ vazou | ⛔ vazou |
// | `2b96d391` (minha rodada 7/8) | ⛔ `approved`, HTTP 200 | ✅ | ✅ | ✅ |
// | `1a873fc6` (rodada 9)     | ✅ 403, `pending` | ✅ | ✅ | ✅ |
//
// A linha do meio é o achado: eu tinha declarado a frente fechada com o botão
// ainda abrindo. Ler é o que se testa fácil; **decidir é o que publica.**
//
// ⚠️ A PRIMEIRA VERSÃO DESTA SONDA ERA VAZIA. Ela mandava `decision:
// "approved"` e a rota quer `action: "approve"` — as três árvores devolviam
// **400 "token, approvalRequestId, action required"**, e o teste passava em
// todas por erro de validação, nunca chegando à trava de posse. Por isso o
// ponto 1 exige **403**, e não "≥ 400": um gate que aceita qualquer 4xx aceita
// o próprio erro de digitação como prova de segurança.
//
// O CENÁRIO, que é o da produção:
//   • a solicitação R pertence HOJE ao BETA — o ponteiro andou (era do ALFA);
//   • as linhas de R são ÓRFÃS (`clientId` nulo): foram escritas antes do
//     carimbo existir, e são materialmente do ALFA;
//   • o BETA tem um token LEGÍTIMO, com dono escrito. Ele não é invasor: é um
//     cliente real, com credencial válida, alcançando o que não é dele;
//   • NÃO há carimbo alheio em lugar nenhum, e o `PortalAccess` da solicitação
//     é legado (`clientId` nulo). É exatamente o ponto cego: não existe
//     "evidência de troca de dono" para nenhuma regra de leitura achar.
//
// OS QUATRO PONTOS:
//   1. POST /api/portal/approvals   → o BOTÃO. Aprovar, nesta casa, PUBLICA.
//   2. GET  /api/brain/portal-data  → o card e o pipeline
//   3. GET  /api/social-posts       → a peça
//   4. GET  /api/portal/messages    → a conversa

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { NextRequest } from "next/server";

const DB_PATH = vi.hoisted(() => {
  const caminho = `${process.cwd()}/prisma/o-botao-do-estranho.db`;
  process.env.DATABASE_URL = `file:${caminho}`;
  return caminho;
});
const requireSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/api-guard", () => ({ requireSession }));

import { prisma } from "@/lib/db/client";

const SEGREDO = "contrato do ALFA de 48 mil reais";

let ws = "";
let alfa = "";
let beta = "";
let req = "";
let cardId = "";

beforeAll(async () => {
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
  execSync("npx prisma db push --accept-data-loss", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: `file:${DB_PATH}` },
    stdio: "pipe",
  });
  ws = (await prisma.agencyWorkspace.create({ data: { name: "Dioli", slug: `botao-${Date.now()}` } })).id;
  alfa = (await prisma.client.create({ data: { workspaceId: ws, name: "Agencia ALFA" } })).id;
  beta = (await prisma.client.create({ data: { workspaceId: ws, name: "Loja BETA" } })).id;
  requireSession.mockResolvedValue({ session: { name: "PM", workspaceId: ws, role: "master" }, error: null });
});

beforeEach(async () => {
  await prisma.portalMessage.deleteMany({});
  await prisma.approvalRequest.deleteMany({});
  await prisma.socialPost.deleteMany({});
  await prisma.portalAccess.deleteMany({});
  await prisma.clientRequestDb.deleteMany({});

  req = (await prisma.clientRequestDb.create({
    data: {
      workspaceId: ws, clientId: beta, businessName: "Loja BETA", segment: "loja",
      services: "[]", objectives: "[]", status: "in_progress", rawContext: "x",
    },
  })).id;

  // As linhas ÓRFÃS — materialmente do ALFA, sem carimbo nenhum.
  await prisma.portalMessage.create({
    data: { clientRequestId: req, authorRole: "team", authorName: "Equipe", body: SEGREDO },
  });
  cardId = (await prisma.approvalRequest.create({
    data: {
      clientRequestId: req, department: "social-media", status: "pending",
      clientVisible: true, requestedBy: "agencia", reviewNote: SEGREDO, sourcePostIdsJson: "[]",
    },
  })).id;
  await prisma.socialPost.create({
    data: {
      workspaceId: ws, clientRequestId: req, caption: SEGREDO, status: "approved",
      visibility: "compartilhado", format: "feed", networks: "[]",
    },
  });

  // O token do BETA: LEGÍTIMO, com dono escrito. E o acesso legado da
  // solicitação, sem dono — o ponto cego.
  await prisma.portalAccess.create({ data: { token: "tk-beta", clientId: beta } });
  await prisma.portalAccess.create({ data: { token: "tk-legado-da-req", clientRequestId: req } });
});

describe("o estranho com credencial legítima NÃO alcança a linha órfã do outro", () => {
  it("1. O BOTÃO: POST /api/portal/approvals não aprova o card órfão", async () => {
    const { POST } = await import("@/app/api/portal/approvals/route");
    const res = await POST(new NextRequest("http://localhost/api/portal/approvals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "tk-beta", approvalRequestId: cardId, action: "approve" }),
    }));
    const depois = await prisma.approvalRequest.findUnique({ where: { id: cardId } });
    // O que importa é o BANCO: aprovar publica. Status devolvido é sintoma.
    expect(depois?.status, `o card foi decidido (HTTP ${res.status})`).toBe("pending");
    expect(res.status, "e a recusa tem de ser de POSSE (403), nao de validacao (400)").toBe(403);
  });

  it("2. GET /api/brain/portal-data não devolve o card nem o pipeline do outro", async () => {
    const { GET } = await import("@/app/api/brain/portal-data/route");
    const bruto = await (await GET(new NextRequest("http://localhost/api/brain/portal-data?token=tk-beta"))).text();
    expect(bruto).not.toContain("48 mil");
  });

  it("3. GET /api/social-posts não devolve a peça do outro", async () => {
    const { GET } = await import("@/app/api/social-posts/route");
    const bruto = await (await GET(new NextRequest("http://localhost/api/social-posts?token=tk-beta"))).text();
    expect(bruto).not.toContain("48 mil");
  });

  it("4. GET /api/portal/messages não devolve a conversa do outro", async () => {
    const { GET } = await import("@/app/api/portal/messages/route");
    const bruto = await (await GET(new NextRequest("http://localhost/api/portal/messages?token=tk-beta"))).text();
    expect(bruto).not.toContain("48 mil");
  });
});

// ── 🟠 O RESÍDUO, MEDIDO E FIXADO ───────────────────────────────────────────
//
// Este cenário é o pior caso do backfill: o ponteiro andou **sem deixar
// rastro nenhum**. Não há carimbo alheio, não há `PortalAccess` do dono
// antigo, e os dois clientes são mais velhos que as linhas. As três provas do
// backfill são DOCUMENTAIS — sem documento, ele carimba o dono ATUAL, que
// aqui é o errado.
//
// **Escrevo isto como teste, e não como comentário, de propósito.** Limitação
// que mora em prosa não é conferida quando o código muda; esta fixa o número.
// Se alguém apertar o critério e este teste virar vermelho, ótimo — mas então
// mede-se o outro lado (a tela do dono legítimo) antes de comemorar.
describe("🟠 o limite declarado do backfill — ponteiro que andou sem rastro", () => {
  it("carimba o dono ATUAL, e MARCA a linha para conferência humana", async () => {
    const { backfillDeCarimbo } = await import("@/lib/agency/portal/backfill-de-carimbo");
    const r = await backfillDeCarimbo(false);

    expect(r.aplicou, "o ensaio NUNCA grava").toBe(false);
    expect(r.carimbadas).toBe(1);
    expect(r.deixadasDeFora).toBe(0);
    // Ele não deixa de fora — e é justamente por isso que precisa marcar.
    expect(r.comAtencao, "a ressalva é o que faz a curadoria existir").toBe(1);
    expect(r.linhas[0]!.atencao).toContain("token de portal SEM dono escrito");
    expect(r.linhas[0]!.clientId).toBe(beta);
  });

  it("com carimbo ALHEIO na pasta, ele RECUSA e escreve o motivo", async () => {
    // A metade positiva desta guarda: quando existe documento, ele obedece ao
    // documento. Sem este par, "marcar tudo" passaria no teste de cima.
    await prisma.socialPost.create({
      data: {
        workspaceId: ws, clientId: alfa, clientRequestId: req, caption: "peça do ALFA",
        status: "approved", visibility: "compartilhado", format: "feed", networks: "[]",
      },
    });
    const { backfillDeCarimbo } = await import("@/lib/agency/portal/backfill-de-carimbo");
    const r = await backfillDeCarimbo(false);

    expect(r.carimbadas).toBe(0);
    expect(r.deixadasDeFora).toBe(1);
    expect(r.linhas[0]!.deixadaDeFora).toContain("OUTRO cliente");
    expect(r.totalDeLinhasCarimbadas).toBe(0);
  });
});
