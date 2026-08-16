// ── 🚨 O P0 QUE O `seguranca` ABRIU: A FÁBRICA DE FUSÃO DE FICHAS ──────────
//
// `lib/agency/balcao/producao.ts` fazia duas coisas, e as duas eram
// exploráveis por qualquer pessoa com um cartão e R$ 79:
//
//   1. achava `Client` por `{ workspaceId, email }` com o e-mail vindo do
//      FORMULÁRIO DE COMPRA, **sem verificação nenhuma**;
//   2. fazia `clientRequestDb.update({ data: { clientId } })`
//      **incondicionalmente**, ignorando que a solicitação já tivesse dono.
//
// O ataque: digito o e-mail de um cliente existente no balcão. A minha
// solicitação entra na ficha dele, um projeto meu nasce sob o `clientId` dele,
// e o portal dele passa a mostrar o meu pedido.
//
// É a ORIGEM dos dois furos do portal — quem move o ponteiro
// `ClientRequestDb.clientId` é esta função. O `/api/admin/reset`, que a rodada
// 1 acusou, apaga `portalMessage` e `portalAccess` em TODOS os modos
// (`app/api/admin/reset/route.ts:177-178`): não sobra mensagem para vazar.

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

const DB_PATH = vi.hoisted(() => {
  const caminho = `${process.cwd()}/prisma/balcao-fusao.db`;
  process.env.DATABASE_URL = `file:${caminho}`;
  return caminho;
});

import { prisma } from "@/lib/db/client";
import { produzirPedidoDeBalcao } from "@/lib/agency/balcao/producao";

const EMAIL_DA_VITIMA = "dono@vitima.com.br";
let ws = "";
let vitima = "";

async function pedidoDeCompra(email: string, nome: string, clientId?: string) {
  return prisma.clientRequestDb.create({
    data: {
      workspaceId: ws,
      clientId: clientId ?? null,
      businessName: nome,
      services: "[]",
      objectives: "[]",
      status: "new",
      rawContext: "compra de balcão",
      briefingJson: JSON.stringify({
        serviceId: "balcao-post-feed",
        prospectEmail: email,
        prospectName: nome,
      }),
    },
  });
}

beforeAll(async () => {
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
  execSync("npx prisma db push --accept-data-loss", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: `file:${DB_PATH}` },
    stdio: "pipe",
  });
  ws = (await prisma.agencyWorkspace.create({ data: { name: "Dioli", slug: `balc-${Date.now()}` } })).id;
});

beforeEach(async () => {
  await prisma.project.deleteMany({});
  await prisma.portalAccess.deleteMany({});
  await prisma.clientRequestDb.deleteMany({});
  await prisma.client.deleteMany({});
  vitima = (await prisma.client.create({
    data: { workspaceId: ws, name: "Cliente que já existe", email: EMAIL_DA_VITIMA },
  })).id;
});

describe("e-mail digitado na compra NÃO é chave de identidade", () => {
  it("⛔ comprar usando o e-mail de um cliente existente NÃO entra na ficha dele", async () => {
    const pedido = await pedidoDeCompra(EMAIL_DA_VITIMA, "Sou outra pessoa");

    const r = await produzirPedidoDeBalcao(pedido.id);
    expect(r.ok).toBe(true);

    // O comprador ganhou ficha PRÓPRIA — duplicada é problema de cadastro,
    // fundida é vazamento.
    if (r.ok) expect(r.clientId).not.toBe(vitima);
    const depois = await prisma.clientRequestDb.findUnique({ where: { id: pedido.id } });
    expect(depois?.clientId).not.toBe(vitima);
  });

  it("⛔ e nenhum projeto do comprador nasce sob o clientId da vítima", async () => {
    const pedido = await pedidoDeCompra(EMAIL_DA_VITIMA, "Sou outra pessoa");
    await produzirPedidoDeBalcao(pedido.id);
    expect(await prisma.project.count({ where: { clientId: vitima } })).toBe(0);
  });

  it("⛔ e nenhum acesso de portal é emitido para a ficha da vítima", async () => {
    const pedido = await pedidoDeCompra(EMAIL_DA_VITIMA, "Sou outra pessoa");
    await produzirPedidoDeBalcao(pedido.id);
    expect(await prisma.portalAccess.count({ where: { clientId: vitima } })).toBe(0);
  });
});

describe("solicitação que JÁ TEM dono nunca é re-apontada", () => {
  it("⛔ o dono original é preservado, aconteça o que acontecer no formulário", async () => {
    const outro = await prisma.client.create({ data: { workspaceId: ws, name: "Dono legítimo" } });
    const pedido = await pedidoDeCompra(EMAIL_DA_VITIMA, "texto qualquer", outro.id);

    await produzirPedidoDeBalcao(pedido.id);

    const depois = await prisma.clientRequestDb.findUnique({ where: { id: pedido.id } });
    expect(depois?.clientId).toBe(outro.id);
    // E o status anda — ele não é identidade.
    expect(depois?.status).toBe("in_progress");
  });
});

describe("a outra metade — a compra legítima continua funcionando", () => {
  it("✅ comprador novo ganha ficha, projeto e acesso ao portal", async () => {
    const pedido = await pedidoDeCompra("novo@comprador.com", "Padaria do Bairro");

    const r = await produzirPedidoDeBalcao(pedido.id);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cliente = await prisma.client.findUnique({ where: { id: r.clientId } });
    expect(cliente?.name).toBe("Padaria do Bairro");
    // O e-mail continua GRAVADO (é o contato do comprador) — só não serve de
    // chave de identidade enquanto não for verificado.
    expect(cliente?.email).toBe("novo@comprador.com");
    expect(await prisma.project.count({ where: { clientId: r.clientId } })).toBe(1);
    expect(await prisma.portalAccess.count({ where: { clientId: r.clientId } })).toBe(1);
    expect((await prisma.clientRequestDb.findUnique({ where: { id: pedido.id } }))?.clientId).toBe(r.clientId);
  });

  it("✅ webhook repetido não duplica projeto", async () => {
    const pedido = await pedidoDeCompra("novo@comprador.com", "Padaria do Bairro");
    const a = await produzirPedidoDeBalcao(pedido.id);
    const b = await produzirPedidoDeBalcao(pedido.id);
    expect(a.ok && b.ok && b.jaExistia).toBe(true);
    expect(await prisma.project.count()).toBe(1);
  });
});
