// O ARQUIVO VAI PARA O CLIENTE ESCOLHIDO NA TELA — contra BANCO REAL.
//
// ── O DEFEITO (03/10/2026, segunda falha da tela Ativos de Marca) ──────────
// O Master tinha aberto o portal do Sushi Cazza no mesmo navegador. O cookie
// do portal passava na frente do login da agência no `POST /api/media`: o
// brand book do DDF, do FOOCCI, do City Jobs e da Dioli caíram TODOS no Sushi
// Cazza, como se o próprio Sushi Cazza tivesse mandado. A escolha da tela era
// ignorada em silêncio.
//
// Este teste faz o percurso de ponta a ponta: cria um cliente NOVO, sobe um
// PDF por ele com a sessão da equipe E com o cookie do portal de OUTRO cliente
// no mesmo pedido, e confere que o arquivo aparece na lista do cliente certo —
// e não na do outro.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

const DB_PATH = vi.hoisted(() => {
  const caminho = `${process.cwd()}/prisma/upload-cliente-certo-e2e.db`;
  process.env.DATABASE_URL = `file:${caminho}`;
  process.env.RAILWAY_VOLUME_MOUNT_PATH = `${process.cwd()}/.media-teste-upload-e2e`;
  return caminho;
});

const sessao = vi.hoisted(() => ({ atual: null as null | { userId: string; workspaceId: string; role: string } }));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn(async () => sessao.atual) }));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { materiaisDeMarca } from "@/lib/agency/esteira/material-do-drive";
import { createPortalAccess } from "@/lib/agency/persistence/portal-access-service";
import { PORTAL_COOKIE } from "@/lib/agency/persistence/portal-cookie";
import { POST } from "@/app/api/media/route";

let wsId = "";
let sushiId = "";
let tokenDoSushi = "";

beforeAll(async () => {
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
  execSync("npx prisma db push --accept-data-loss", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: `file:${DB_PATH}` },
  });
  const ws = await prisma.agencyWorkspace.create({ data: { name: "Dioli", slug: `dioli-${Date.now()}` } });
  wsId = ws.id;
  const sushi = await prisma.client.create({ data: { workspaceId: wsId, name: "Sushi Cazza" } });
  sushiId = sushi.id;
  tokenDoSushi = (await createPortalAccess({ clientId: sushiId })).token;
}, 120_000);

afterAll(async () => {
  await prisma.$disconnect();
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
  rmSync(`${process.cwd()}/.media-teste-upload-e2e`, { recursive: true, force: true });
});

function pedidoDeUpload(clientId: string, comCookieDoPortal: boolean): NextRequest {
  const form = new FormData();
  // Cabeçalho de PDF de verdade: o armazenamento confere o conteúdo.
  form.append("file", new File([Buffer.from("%PDF-1.4\n% teste\n%%EOF\n")], "DDF_Branding_Book.pdf", { type: "application/pdf" }));
  form.append("clientId", clientId);
  form.append("papel", "manual_de_marca");
  const headers = new Headers();
  if (comCookieDoPortal) headers.set("cookie", `${PORTAL_COOKIE}=${tokenDoSushi}`);
  return new NextRequest("https://www.diolidigital.com.br/api/media", { method: "POST", body: form, headers });
}

describe("upload pela tela da agência", () => {
  it("cliente recém-criado: o arquivo aparece na lista DELE, mesmo com o cookie do portal de outro cliente no navegador", async () => {
    sessao.atual = { userId: "u-master", workspaceId: wsId, role: "master" };
    const ddf = await prisma.client.create({ data: { workspaceId: wsId, name: "DDF" } });

    const res = await POST(pedidoDeUpload(ddf.id, true));
    const corpo = (await res.json()) as { ok?: boolean; error?: string; materialDeMarca?: { registrado: boolean } };
    expect(res.status, corpo.error).toBe(201);
    expect(corpo.materialDeMarca?.registrado).toBe(true);

    const doDdf = await materiaisDeMarca(ddf.id);
    expect(doDdf.map((m) => m.nome)).toContain("DDF_Branding_Book.pdf");
    expect(doDdf[0]?.papel).toBe("manual_de_marca");

    const doSushi = await materiaisDeMarca(sushiId);
    expect(doSushi.map((m) => m.nome)).not.toContain("DDF_Branding_Book.pdf");
  }, 60_000);

  it("sem sessão da agência, o cookie do portal continua valendo (o cliente sobe pelo portal dele)", async () => {
    sessao.atual = null;
    const outro = await prisma.client.create({ data: { workspaceId: wsId, name: "Outro" } });
    const res = await POST(pedidoDeUpload(outro.id, true));
    expect(res.status).toBe(201);
    const asset = await prisma.mediaAsset.findFirst({ where: { uploadedBy: "cliente" }, orderBy: { createdAt: "desc" } });
    // O dono vem do TOKEN, nunca do corpo: o arquivo é do Sushi Cazza.
    expect(asset?.clientId).toBe(sushiId);
  }, 60_000);
});
