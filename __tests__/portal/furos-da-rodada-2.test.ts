// ── OS FUROS QUE O `seguranca` PLANTOU CONTRA A RODADA 1 (15/08/2026) ───────
//
// A rodada 1 cercou a CONVERSA. O `seguranca` passou por cima da cerca com
// ataques reais e barrou o merge. Este arquivo é um teste por furo, com banco
// de verdade e rotas de verdade — cada um falha sem o conserto.
//
// A causa reescrita: quem move o ponteiro `ClientRequestDb.clientId` NÃO é o
// `/api/admin/reset` (ele apaga `portalMessage` e `portalAccess` em TODOS os
// modos — `route.ts:177-178` — então não sobra mensagem para vazar). Quem move
// é `lib/agency/balcao/producao.ts`: acha `Client` por e-mail NÃO VERIFICADO
// vindo do formulário de compra e re-aponta a solicitação incondicionalmente.

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { NextRequest } from "next/server";

const DB_PATH = vi.hoisted(() => {
  const caminho = `${process.cwd()}/prisma/furos-rodada-2.db`;
  process.env.DATABASE_URL = `file:${caminho}`;
  return caminho;
});

const requireSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/api-guard", () => ({ requireSession }));

import { prisma } from "@/lib/db/client";
import { GET as lerConversa } from "@/app/api/portal/messages/route";
import { GET as lerVista } from "@/app/api/portal/vista/route";
import { donoDoToken, resolvePortalClient } from "@/lib/agency/persistence/portal-access-service";
import { conversaDaSolicitacao } from "@/app/api/messages/conversa";
import { gravarMensagemDoPortal } from "@/lib/agency/portal/mensagem-do-portal";
import { donoConfere } from "@/lib/agency/portal/dono-da-tela";
import { PORTAL_COOKIE } from "@/lib/agency/persistence/portal-cookie";

const SEGREDO_LEGADO = "SEGREDO-LEGADO proposta de R$ 12.000";

let ws = "";
let alfa = "";
let beta = "";
let reqAlfa = "";

function get(url: string, cookie?: string): NextRequest {
  const r = new NextRequest(`http://localhost${url}`);
  if (cookie) r.cookies.set(PORTAL_COOKIE, cookie);
  return r;
}
async function corpos(res: Response): Promise<string[]> {
  const j = (await res.json()) as { messages?: { body: string }[] };
  return (j.messages ?? []).map((m) => m.body);
}

beforeAll(async () => {
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
  execSync("npx prisma db push --accept-data-loss", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: `file:${DB_PATH}` },
    stdio: "pipe",
  });
  ws = (await prisma.agencyWorkspace.create({ data: { name: "Dioli", slug: `furo-${Date.now()}` } })).id;
  alfa = (await prisma.client.create({ data: { workspaceId: ws, name: "Agência ALFA", email: "dono@alfa.com" } })).id;
  beta = (await prisma.client.create({ data: { workspaceId: ws, name: "Loja BETA" } })).id;
  requireSession.mockResolvedValue({ session: { name: "PM", workspaceId: ws, role: "master" }, error: null });
});

beforeEach(async () => {
  await prisma.portalMessage.deleteMany({});
  await prisma.portalAccess.deleteMany({});
  await prisma.clientRequestDb.deleteMany({});
  reqAlfa = (await prisma.clientRequestDb.create({
    data: {
      workspaceId: ws, clientId: alfa, businessName: "Agência ALFA", segment: "agência",
      services: "[]", objectives: "[]", status: "in_progress", rawContext: "x",
    },
  })).id;
});

// ═══════════════════════════════════════════════════════════════════════════
// FURO B — o pior: era o PORTAL INTEIRO, não a conversa
// ═══════════════════════════════════════════════════════════════════════════
describe("FURO B — o token seguia o ponteiro e virava outro cliente", () => {
  it("⛔ `/api/portal/vista` NÃO devolve a marca de outro cliente quando o ponteiro anda", async () => {
    // Token do ALFA, congelado no primeiro uso.
    await prisma.portalAccess.create({ data: { token: "tk-b", clientId: alfa, clientRequestId: reqAlfa } });
    expect((await (await lerVista(get("/api/portal/vista?token=tk-b"))).json()).marca.nome).toBe("Agência ALFA");

    // O ponteiro anda por baixo (era o que o balcão fazia).
    await prisma.clientRequestDb.update({ where: { id: reqAlfa }, data: { clientId: beta } });

    const res = await lerVista(get("/api/portal/vista?token=tk-b"));
    // O probe do `seguranca` recebia aqui `marca.nome = "Loja BETA"`.
    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).not.toContain("Loja BETA");
  });

  it("⛔ e a conversa fecha pelo MESMO motivo, com razão nomeada", async () => {
    await prisma.portalAccess.create({ data: { token: "tk-b2", clientId: alfa, clientRequestId: reqAlfa } });
    await prisma.clientRequestDb.update({ where: { id: reqAlfa }, data: { clientId: beta } });
    const res = await lerConversa(get("/api/portal/messages?token=tk-b2"));
    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).toContain("ponteiro_andou");
  });

  it("⛔ a recusa é REGISTRADA NO BANCO, não só no log do contêiner", async () => {
    await prisma.portalAccess.create({ data: { token: "tk-b3", clientId: alfa, clientRequestId: reqAlfa } });
    await prisma.clientRequestDb.update({ where: { id: reqAlfa }, data: { clientId: beta } });
    await donoDoToken("tk-b3");
    const evento = await prisma.activityEvent.findFirst({ where: { type: "portal_ponteiro_andou" } });
    expect(evento).not.toBeNull();
    expect(evento?.clientId).toBe(alfa);
  });

  it("✅ token SEM dono congela no primeiro uso — e não muda depois", async () => {
    const semDono = await prisma.clientRequestDb.create({
      data: { workspaceId: ws, clientId: beta, businessName: "BETA", services: "[]", objectives: "[]", rawContext: "x" },
    });
    await prisma.portalAccess.create({ data: { token: "tk-b4", clientRequestId: semDono.id } });

    expect(await resolvePortalClient("tk-b4")).toMatchObject({ clientId: beta });
    // Congelou no registro — deixou de depender do ponteiro.
    expect((await prisma.portalAccess.findUnique({ where: { token: "tk-b4" } }))?.clientId).toBe(beta);

    await prisma.clientRequestDb.update({ where: { id: semDono.id }, data: { clientId: alfa } });
    expect(await resolvePortalClient("tk-b4")).toBeNull();
  });

  it("✅ caso limpo: ponteiro parado, token funciona sempre", async () => {
    await prisma.portalAccess.create({ data: { token: "tk-b5", clientId: alfa, clientRequestId: reqAlfa } });
    for (let i = 0; i < 3; i++) {
      expect((await (await lerVista(get("/api/portal/vista?token=tk-b5"))).json()).marca.nome).toBe("Agência ALFA");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FURO A — a cerca era probabilística: conversa 100% legada atravessava
// ═══════════════════════════════════════════════════════════════════════════
describe("FURO A — os sete escritores carimbam o dono", () => {
  it("⛔ mensagem gravada pelo caminho da esteira NASCE com clientId", async () => {
    // Sem isto, a linha nasce `clientId: null` — e conversa 100% legada não
    // tem carimbo alheio nenhum para a "prova de contaminação" achar.
    await gravarMensagemDoPortal({
      clientRequestId: reqAlfa, authorRole: "team", authorName: "SDR Dioli", body: SEGREDO_LEGADO,
    });
    const linha = await prisma.portalMessage.findFirst({ where: { body: SEGREDO_LEGADO } });
    expect(linha?.clientId).toBe(alfa);
  });

  it("⛔ e por isso ela NÃO atravessa para o portal de outro cliente", async () => {
    await gravarMensagemDoPortal({
      clientRequestId: reqAlfa, authorRole: "team", authorName: "SDR Dioli", body: SEGREDO_LEGADO,
    });
    // O ponteiro anda e o BETA abre com token PRÓPRIO (congelado nele).
    await prisma.clientRequestDb.update({ where: { id: reqAlfa }, data: { clientId: beta } });
    await prisma.portalAccess.create({ data: { token: "tk-a", clientId: beta } });

    const lidas = await corpos(await lerConversa(get("/api/portal/messages?token=tk-a")));
    expect(lidas).not.toContain(SEGREDO_LEGADO);
  });

  it("✅ o dono legítimo continua lendo a própria mensagem", async () => {
    await gravarMensagemDoPortal({
      clientRequestId: reqAlfa, authorRole: "team", authorName: "SDR Dioli", body: SEGREDO_LEGADO,
    });
    await prisma.portalAccess.create({ data: { token: "tk-a2", clientId: alfa, clientRequestId: reqAlfa } });
    expect(await corpos(await lerConversa(get("/api/portal/messages?token=tk-a2")))).toContain(SEGREDO_LEGADO);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RAMO DO PROSPECT — o que PRODUZ as linhas nulas, e estava sem cerca
// ═══════════════════════════════════════════════════════════════════════════
describe("ramo do prospect", () => {
  it("⛔ conversa de prospect só enxerga linha SEM dono", async () => {
    const prospect = await prisma.clientRequestDb.create({
      data: { workspaceId: ws, businessName: "Quem chegou agora", services: "[]", objectives: "[]", rawContext: "x" },
    });
    // Uma linha carimbada para um cliente de verdade, presa à mesma
    // solicitação — é o caminho de volta do vazamento, quando a solicitação é
    // desvinculada e volta a parecer prospect.
    await prisma.portalMessage.create({
      data: { clientRequestId: prospect.id, clientId: alfa, authorRole: "team", authorName: "x", body: SEGREDO_LEGADO },
    });
    await prisma.portalMessage.create({
      data: { clientRequestId: prospect.id, authorRole: "team", authorName: "x", body: "oi-prospect" },
    });

    const c = await conversaDaSolicitacao(prospect.id);
    const linhas = await prisma.portalMessage.findMany({ where: c.filtro! });
    expect(linhas.map((l) => l.body)).toEqual(["oi-prospect"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FURO C — selo opcional não é trava
// ═══════════════════════════════════════════════════════════════════════════
describe("FURO C — em modo cookie o selo é OBRIGATÓRIO", () => {
  it("⛔ sem `dono`, a conversa por cookie RECUSA", async () => {
    await prisma.portalAccess.create({ data: { token: "tk-c", clientId: alfa, clientRequestId: reqAlfa } });
    await gravarMensagemDoPortal({
      clientRequestId: reqAlfa, authorRole: "team", authorName: "x", body: SEGREDO_LEGADO,
    });
    // Um `curl` com o cookie — ou um bundle em cache do deploy anterior, que
    // não sabe mandar o selo.
    const res = await lerConversa(get("/api/portal/messages", "tk-c"));
    const bruto = JSON.stringify(await res.json());
    expect(bruto).not.toContain("SEGREDO-LEGADO");
    expect(bruto).toContain("dono-divergente");
  });

  it("✅ com TOKEN explícito o selo não é exigido — link legítimo não quebra", async () => {
    await prisma.portalAccess.create({ data: { token: "tk-c2", clientId: alfa, clientRequestId: reqAlfa } });
    await gravarMensagemDoPortal({
      clientRequestId: reqAlfa, authorRole: "team", authorName: "x", body: SEGREDO_LEGADO,
    });
    expect(await corpos(await lerConversa(get("/api/portal/messages?token=tk-c2")))).toContain(SEGREDO_LEGADO);
  });

  it("a regra, isolada: exigir=true recusa ausência; exigir=false tolera", () => {
    expect(donoConfere(alfa, undefined, true)).toBe(false);
    expect(donoConfere(alfa, undefined, false)).toBe(true);
  });
});
