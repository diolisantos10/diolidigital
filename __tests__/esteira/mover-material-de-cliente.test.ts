// "MOVER PARA OUTRO CLIENTE" (04/10/2026) — contra banco real.
//
// O caso que gerou o botão: brand books de DDF, City Jobs, Dioli Digital e
// FOOCCI gravados no Sushi Cazza. Devolver cada um ao dono, pela tela, sem
// ninguém rodar comando, e sem apagar nada.
//
// As duas metades de cada trava:
//   • Master move; qualquer outro papel → 403; cliente do portal → 403;
//   • mesmo workspace move; cliente de outro workspace → 404 e nada muda;
//   • o arquivo, o material e a leitura do brand book vão JUNTOS ao destino;
//     bytes e papel ficam; o rastro aparece nos dois clientes.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, rmSync, readFileSync } from "node:fs";
import { NextRequest } from "next/server";

const DB_PATH = vi.hoisted(() => {
  const caminho = `${process.cwd()}/prisma/mover-material-e2e.db`;
  process.env.DATABASE_URL = `file:${caminho}`;
  return caminho;
});

type Sessao = { userId: string; email: string; name: string; role: string; workspaceId: string; clientId?: string } | null;
const sessao = vi.hoisted(() => ({ atual: null as Sessao }));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn(async (): Promise<Sessao> => sessao.atual) }));

import { prisma } from "@/lib/db/client";
import { POST } from "@/app/api/agency/material-de-marca/mover/route";
import { moverMaterialDeCliente } from "@/lib/agency/brand/mover-material";

let ws = "";
let outroWs = "";
let sushi = "";
let ddf = "";
let deFora = "";
let asset = "";
let material = "";

const master = () => ({ userId: "u", email: "ceo@x", name: "Diego", role: "master", workspaceId: ws });
const pedir = (corpo: unknown) => POST(new NextRequest("http://x/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }));

beforeAll(async () => {
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
  execSync("npx prisma db push --accept-data-loss", { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: `file:${DB_PATH}` }, stdio: "pipe" });
  ws = (await prisma.agencyWorkspace.create({ data: { name: "Dioli", slug: `mover-${Date.now()}` } })).id;
  outroWs = (await prisma.agencyWorkspace.create({ data: { name: "Outra", slug: `outra-${Date.now()}` } })).id;
  sushi = (await prisma.client.create({ data: { workspaceId: ws, name: "Sushi Cazza" } })).id;
  ddf = (await prisma.client.create({ data: { workspaceId: ws, name: "DDF" } })).id;
  deFora = (await prisma.client.create({ data: { workspaceId: outroWs, name: "Cliente de outra agência" } })).id;
  const a = await prisma.mediaAsset.create({
    data: { workspaceId: ws, clientId: sushi, kind: "inbound", fileName: "DDF_Branding_Book.pdf", mimeType: "application/pdf", sizeBytes: 10, sha256: "sha-ddf", storagePath: "/vol/ddf.pdf", uploadedBy: "cliente" },
  });
  asset = a.id;
  material = (await prisma.driveMaterial.create({
    data: { workspaceId: ws, clientId: sushi, origem: "envio_direto", fileId: a.id, nome: a.fileName, papel: "manual_de_marca", mediaAssetId: a.id },
  })).id;
  await prisma.brainArtifact.create({ data: { clientId: sushi, department: "brand-book-extraido", canvasId: material, canvasJson: "{}", status: "erro" } });
}, 120_000);

afterAll(async () => {
  await prisma.$disconnect().catch(() => {});
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
});

describe("quem pode mover", () => {
  it("sem sessão → 401", async () => {
    sessao.atual = null;
    expect((await pedir({ mediaAssetId: asset, deClientId: sushi, paraClientId: ddf })).status).toBe(401);
  });

  it("papel que não é Master → 403, e nada muda", async () => {
    sessao.atual = { ...master(), role: "social_staff" };
    expect((await pedir({ mediaAssetId: asset, deClientId: sushi, paraClientId: ddf })).status).toBe(403);
    expect((await prisma.mediaAsset.findUnique({ where: { id: asset } }))?.clientId).toBe(sushi);
  });

  it("sessão de cliente do portal → 403, mesmo com papel master", async () => {
    sessao.atual = { ...master(), clientId: sushi };
    expect((await pedir({ mediaAssetId: asset, deClientId: sushi, paraClientId: ddf })).status).toBe(403);
  });

  it("destino em OUTRO workspace → 404, e nada muda", async () => {
    sessao.atual = master();
    expect((await pedir({ mediaAssetId: asset, deClientId: sushi, paraClientId: deFora })).status).toBe(404);
    expect((await prisma.mediaAsset.findUnique({ where: { id: asset } }))?.clientId).toBe(sushi);
  });
});

describe("o ensaio (do script) não grava", () => {
  it("conta o que mudaria e deixa tudo onde está", async () => {
    const r = await moverMaterialDeCliente({ workspaceId: ws, mediaAssetId: asset, deClientId: sushi, paraClientId: ddf, quem: "teste", ensaio: true });
    expect(r).toMatchObject({ ok: true, de: "Sushi Cazza", para: "DDF", materiais: 1, leituras: 1 });
    expect((await prisma.mediaAsset.findUnique({ where: { id: asset } }))?.clientId).toBe(sushi);
  });
});

describe("Master move — e nada é apagado", () => {
  it("arquivo, material e leitura do brand book vão juntos para o dono", async () => {
    sessao.atual = master();
    const r = await pedir({ mediaAssetId: asset, deClientId: sushi, paraClientId: ddf });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, arquivo: "DDF_Branding_Book.pdf", de: "Sushi Cazza", para: "DDF" });

    const a = await prisma.mediaAsset.findUnique({ where: { id: asset } });
    expect(a).toMatchObject({ clientId: ddf, uploadedBy: "equipe", storagePath: "/vol/ddf.pdf", sizeBytes: 10 });
    const m = await prisma.driveMaterial.findUnique({ where: { id: material } });
    expect(m).toMatchObject({ clientId: ddf, papel: "manual_de_marca" });
    const leitura = await prisma.brainArtifact.findFirst({ where: { canvasId: material } });
    expect(leitura?.clientId).toBe(ddf);
  });

  it("o rastro aparece nos dois clientes, com quem moveu", async () => {
    const eventos = await prisma.activityEvent.findMany({ where: { type: "material_movido" } });
    expect(eventos.map((e) => e.clientId).sort()).toEqual([ddf, sushi].sort());
    expect(eventos[0]!.message).toContain("por Diego");
  });

  it("mover de novo da origem → 404: o arquivo já não está lá", async () => {
    const r = await pedir({ mediaAssetId: asset, deClientId: sushi, paraClientId: ddf });
    expect(r.status).toBe(404);
  });
});

describe("na tela", () => {
  const TELA = readFileSync(`${process.cwd()}/components/agency/clients/MaterialDeMarca.tsx`, "utf8");
  it("o botão Mover só é desenhado para Master — e quem diz é o SERVIDOR", () => {
    expect(TELA).toContain("{ehMaster && outrosClientes.length > 0 && (");
    expect(TELA).toContain("setEhMaster(json.podeMover === true)");
    const ROTA = readFileSync(`${process.cwd()}/app/api/agency/material-de-marca/route.ts`, "utf8");
    expect(ROTA).toContain('podeMover = session.role === "master" && !session.clientId');
  });
  it("pede confirmação e diz que nada é apagado", () => {
    expect(TELA).toMatch(/window\.confirm\(.*Nada é apagado/);
  });
});
