// A PEÇA APROVADA QUE NÃO ENTROU NA FILA — a parada mais cara da casa, declarada.
//
// ═══════════════════════════════════════════════════════════════════════════
// O ACHADO (Auditor, 5ª rodada, 25/08/2026) — item F
// ═══════════════════════════════════════════════════════════════════════════
//
// `agendarPecasAprovadas` já devolvia `ignorados`. O que a rota do portal fazia
// com ele era **uma linha de log**:
//
//     console.error("[portal/approvals] peças aprovadas NÃO agendadas:", …)
//
// Nada no estado. Nada para o PM. Nada para o cliente. E o log do teste VERDE
// do ajuste imprimia exatamente esse defeito enquanto o teste passava por cima.
//
// O critério F exige, com estas palavras: *"toda parada mostra motivo, dono e
// próxima ação"*. **`console.error` não é parada declarada** — é a casa falando
// sozinha, num terminal que ninguém abre.
//
// Este arquivo mede os TRÊS destinatários. Um teste que medisse só o retorno da
// função seria a mesma régua sobre o mesmo componente errado.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

const DB_PATH = vi.hoisted(() => {
  const caminho = `${process.cwd()}/prisma/parada-declarada.db`;
  process.env.DATABASE_URL = `file:${caminho}`;
  return caminho;
});

import { prisma } from "@/lib/db/client";
import { declararPecasAprovadasQueNaoEntraramNaFila } from "@/lib/agency/esteira/peca-aprovada-que-nao-agendou";

let workspaceId = "";
let clientId = "";
let clientRequestId = "";

async function peca(status: string): Promise<string> {
  const p = await prisma.socialPost.create({
    data: { workspaceId, clientId, clientRequestId, format: "story", status, caption: "peça" },
  });
  return p.id;
}

beforeAll(async () => {
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
  execSync("npx prisma db push --accept-data-loss", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: `file:${DB_PATH}` },
    stdio: "pipe",
  });
  const ws = await prisma.agencyWorkspace.create({ data: { name: "Dioli", slug: `parada-${Date.now()}` } });
  workspaceId = ws.id;
  const c = await prisma.client.create({ data: { workspaceId, name: "Padaria Presa" } });
  clientId = c.id;
  const r = await prisma.clientRequestDb.create({
    data: {
      workspaceId, clientId, businessName: "Padaria Presa", segment: "Alimentação",
      services: "[]", objectives: "[]", status: "accepted",
    },
  });
  clientRequestId = r.id;
});

beforeEach(async () => {
  await prisma.socialPost.deleteMany({});
  await prisma.activityEvent.deleteMany({});
  await prisma.portalMessage.deleteMany({});
});

afterAll(async () => {
  await prisma.$disconnect();
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
});

describe("trabalho pago e aprovado que a fila não lê não some em silêncio", () => {
  it("os TRÊS destinatários recebem motivo, dono e próxima ação", async () => {
    const presa = await peca("revision_requested");
    const ok = await peca("scheduled");

    const r = await declararPecasAprovadasQueNaoEntraramNaFila({
      ignorados: [
        { postId: presa, status: "revision_requested" },
        { postId: ok, status: "scheduled" },
      ],
      clientId, clientRequestId,
    });

    expect(r.presas, "'scheduled' já está na fila e não é parada").toBe(1);

    // 1. A PEÇA — é o que vira pixel na tela de decisão.
    const nb = await prisma.socialPost.findUniqueOrThrow({ where: { id: presa } });
    expect(nb.avisoAoCliente, "sem isto o aviso repete a história do 'sem árbitro'").toBeTruthy();
    expect(nb.avisoAoCliente).toMatch(/não entrou na fila de entrega/i);
    expect(nb.avisoAoCliente, "dono").toMatch(/equipe/i);
    expect(nb.avisoAoCliente, "próxima ação").toMatch(/Próxima ação:/);
    expect(nb.avisoAoCliente, "e o 'sim' dele não é jogado fora").toMatch(/não precisa aprovar de novo/i);

    // 2. O PM — é por onde uma pessoa descobre HOJE.
    const eventos = await prisma.activityEvent.findMany({ where: { type: "peca_aprovada_nao_agendada" } });
    expect(eventos.length, "console.error não é destinatário").toBe(1);
    expect(eventos[0]!.message).toMatch(/Dono: a agência/);
    expect(eventos[0]!.message).toMatch(/Próxima ação:/);
    expect(eventos[0]!.message, "e diz o estado real em que a peça travou")
      .toMatch(/em ajuste/i);

    // 3. O CLIENTE, na conversa.
    const mensagens = await prisma.portalMessage.findMany({});
    expect(mensagens.length).toBe(1);
    expect(mensagens[0]!.body).toMatch(/não entrou na fila de entrega/i);
    expect(mensagens[0]!.readByTeam, "a equipe precisa ver que isto foi dito").toBe(false);

    // E a peça que estava BEM não é alarmada.
    const boa = await prisma.socialPost.findUniqueOrThrow({ where: { id: ok } });
    expect(boa.avisoAoCliente, "alarme falso mata o alarme verdadeiro").toBeNull();
  });

  it("SEM PARADA nada é escrito — aviso sem parada é ruído", async () => {
    const ok = await peca("scheduled");
    const publicada = await peca("published");
    const r = await declararPecasAprovadasQueNaoEntraramNaFila({
      ignorados: [{ postId: ok, status: "scheduled" }, { postId: publicada, status: "published" }],
      clientId, clientRequestId,
    });
    expect(r.presas).toBe(0);
    expect(await prisma.activityEvent.count()).toBe(0);
    expect(await prisma.portalMessage.count()).toBe(0);
    expect((await prisma.socialPost.findUniqueOrThrow({ where: { id: ok } })).avisoAoCliente).toBeNull();
  });

  it("a lista vazia é o caminho quente e não escreve nada", async () => {
    const r = await declararPecasAprovadasQueNaoEntraramNaFila({
      ignorados: [], clientId, clientRequestId,
    });
    expect(r.presas).toBe(0);
    expect(await prisma.activityEvent.count()).toBe(0);
  });
});
