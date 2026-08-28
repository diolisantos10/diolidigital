// A FICHA DE MARCA TEM DONO — o vazamento entre inquilinos, fechado.
//
// ═══ O DEFEITO, MEDIDO DUAS VEZES ═══════════════════════════════════════════
//
// **16/08/2026 (PR #169):** `app/api/agency/clients/[id]/marca/route.ts` conferia
// que existia sessão e **não conferia de quem era o cliente**. Provado com
// sessão de `design_staff` do workspace A lendo e escrevendo a ficha de marca de
// um cliente do workspace B — **200 nas duas pontas**.
//
// **28/08/2026:** medido de novo contra a branch de deploy. **Continuava aberto,
// 12 dias depois.** O conserto existia e estava preso: o #169 não mergeia mais
// (história órfã — ver #375), então o módulo foi recuperado de lá para um PR
// novo sobre a base atual.
//
// ⚠️ POR QUE 404 E NUNCA 403: um 403 confirmaria que o id existe e pertence a
// outra conta. Essa confirmação já é o vazamento — transforma a rota num oráculo
// de enumeração. 404 não distingue "não existe" de "não é seu".
//
// ⛔ Custo zero: banco SQLite descartável, nenhuma chamada de IA, nada em
// produção.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { NextRequest } from "next/server";

const DB_PATH = vi.hoisted(() => {
  const caminho = `${process.cwd()}/prisma/posse-marca-e2e.db`;
  process.env.DATABASE_URL = `file:${caminho}`;
  return caminho;
});

// A sessão é o que muda entre um caso e outro — é ela que o teste controla.
const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ getSession }));

vi.mock("@/lib/ai/generate", () => ({
  generate: vi.fn(async () => ({ ok: false, error: "IA dublada" })),
  anyProviderConfigured: vi.fn(async () => false),
}));

import { prisma } from "@/lib/db/client";
import { GET, PUT } from "@/app/api/agency/clients/[id]/marca/route";
import { clienteOuNulo } from "@/lib/agency/esteira/posse-do-cliente";

let wsA = "";
let wsB = "";
let clienteDeA = "";
let clienteDeB = "";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function sessaoDe(workspaceId: string, role = "design_staff", clientId?: string) {
  return { userId: "u1", email: "quem@dioli.studio", name: "Quem", role, workspaceId, clientId };
}

function pedidoDeEscrita() {
  return new NextRequest("http://localhost/x", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    // `proposito_e_promessa` é campo REAL da ficha (`escrita-da-ficha.ts:45`),
    // gravado na coluna `purposeAndPromise`. Um campo inventado seria ignorado
    // pela rota e o teste mediria a recusa errada.
    body: JSON.stringify({ campos: { proposito_e_promessa: "TEXTO ADULTERADO" } }),
  });
}

beforeAll(async () => {
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
  execSync("npx prisma db push --accept-data-loss", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: `file:${DB_PATH}` },
    stdio: "pipe",
  });

  const a = await prisma.agencyWorkspace.create({ data: { name: "Agência A", slug: `a-${Date.now()}` } });
  const b = await prisma.agencyWorkspace.create({ data: { name: "Agência B", slug: `b-${Date.now()}` } });
  wsA = a.id; wsB = b.id;

  clienteDeA = (await prisma.client.create({ data: { workspaceId: wsA, name: "Cliente da A" } })).id;
  clienteDeB = (await prisma.client.create({ data: { workspaceId: wsB, name: "Cliente da B" } })).id;

  await prisma.brandBrain.create({
    data: { clientId: clienteDeB, brandName: "Marca da B", purposeAndPromise: "O propósito da B" },
  });
});

afterAll(async () => {
  await prisma.$disconnect().catch(() => {});
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
});

describe("a ficha de marca do vizinho de inquilino", () => {
  it("🔒 LER a ficha de um cliente de OUTRO workspace devolve 404", async () => {
    getSession.mockResolvedValue(sessaoDe(wsA));
    const res = await GET(new NextRequest("http://localhost/x"), ctx(clienteDeB));
    expect(
      res.status,
      "uma sessão da agência A leu a ficha de marca de um cliente da agência B",
    ).toBe(404);
  });

  it("🔒 ESCREVER na ficha de outro workspace devolve 404 — e NÃO grava", async () => {
    getSession.mockResolvedValue(sessaoDe(wsA));
    const res = await PUT(pedidoDeEscrita(), ctx(clienteDeB));
    expect(res.status).toBe(404);

    // A prova que importa não é o status: é o banco.
    const ficha = await prisma.brandBrain.findUnique({ where: { clientId: clienteDeB } });
    expect(
      ficha!.purposeAndPromise,
      "a recusa devolveu 404 e gravou assim mesmo — o 404 seria decoração",
    ).toBe("O propósito da B");
  });

  it("⚠️ é 404, nunca 403 — 403 confirmaria que o id existe em outra conta", async () => {
    getSession.mockResolvedValue(sessaoDe(wsA));
    const existeNoutro = await GET(new NextRequest("http://localhost/x"), ctx(clienteDeB));
    const naoExiste = await GET(new NextRequest("http://localhost/x"), ctx("cli_que_nao_existe"));

    // As duas respostas TÊM de ser indistinguíveis: é isso que impede a rota de
    // virar um oráculo que confirma quais ids existem.
    expect(existeNoutro.status).toBe(404);
    expect(naoExiste.status).toBe(404);
    expect(existeNoutro.status).toBe(naoExiste.status);
  });

  it("✅ o dono legítimo continua entrando — a trava não fecha para quem é de casa", async () => {
    getSession.mockResolvedValue(sessaoDe(wsB));
    const res = await GET(new NextRequest("http://localhost/x"), ctx(clienteDeB));
    expect(res.status, "a trava barrou o próprio dono da ficha").toBe(200);
    // A ficha dele volta de verdade, não uma casca vazia.
    expect((await res.json()).resumo).toBeTruthy();
  });

  it("✅ e o dono legítimo ESCREVE normalmente", async () => {
    getSession.mockResolvedValue(sessaoDe(wsB));
    const res = await PUT(pedidoDeEscrita(), ctx(clienteDeB));
    expect(res.status).toBe(200);
    const ficha = await prisma.brandBrain.findUnique({ where: { clientId: clienteDeB } });
    expect(ficha!.purposeAndPromise).toBe("TEXTO ADULTERADO");
    // devolve ao estado anterior para os outros casos
    await prisma.brandBrain.update({
      where: { clientId: clienteDeB }, data: { purposeAndPromise: "O propósito da B" },
    });
  });

  it("🔒 sessão de PORTAL só alcança o próprio cliente", async () => {
    // A sessão do portal carrega `clientId`. Sem essa linha, um token legítimo
    // de portal leria a ficha do vizinho DENTRO do mesmo workspace — o
    // vazamento mais fácil de não notar.
    getSession.mockResolvedValue(sessaoDe(wsB, "client", clienteDeB));
    const proprio = await GET(new NextRequest("http://localhost/x"), ctx(clienteDeB));
    expect(proprio.status).toBe(200);

    const outroCliente = await prisma.client.create({ data: { workspaceId: wsB, name: "Vizinho na B" } });
    const alheio = await GET(new NextRequest("http://localhost/x"), ctx(outroCliente.id));
    expect(
      alheio.status,
      "um token de portal leu a ficha de outro cliente do mesmo workspace",
    ).toBe(404);
  });

  it("⛔ sem sessão nenhuma continua 401 — a porta de fora não mudou", async () => {
    getSession.mockResolvedValue(null);
    expect((await GET(new NextRequest("http://localhost/x"), ctx(clienteDeB))).status).toBe(401);
    expect((await PUT(pedidoDeEscrita(), ctx(clienteDeB))).status).toBe(401);
  });

  it("⚠️ a régua recusa antes de tocar o banco quando a sessão é de portal alheia", async () => {
    // `sessao.clientId && sessao.clientId !== id` corta na entrada: um token de
    // portal nunca chega a consultar a linha de outro cliente.
    expect(await clienteOuNulo(clienteDeA, { workspaceId: wsB, clientId: clienteDeB })).toBeNull();
    // E o id vazio também não passa.
    expect(await clienteOuNulo("", { workspaceId: wsB })).toBeNull();
    // Sanidade: com dono certo, passa.
    expect(await clienteOuNulo(clienteDeB, { workspaceId: wsB })).not.toBeNull();
    // Workspace errado, mesmo id existente: não passa.
    expect(await clienteOuNulo(clienteDeB, { workspaceId: wsA })).toBeNull();
  });
});
