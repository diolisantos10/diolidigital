// RELER os brand books guardados (04/10/2026) — contra banco real.
//
// Relê o que precisa (erro ou nunca lido), pula o que já foi lido ou está
// sendo lido, e diz quando o arquivo sumiu do disco. Sem o cofre, a rota
// recusa com o recado de espera em vez de fingir que algo começou.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { NextRequest } from "next/server";

const DB_PATH = vi.hoisted(() => {
  const caminho = `${process.cwd()}/prisma/reler-brand-books-e2e.db`;
  process.env.DATABASE_URL = `file:${caminho}`;
  return caminho;
});

const sessao = vi.hoisted(() => ({ atual: null as null | { userId: string; email: string; name: string; role: string; workspaceId: string } }));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn(async () => sessao.atual) }));
const lidos = vi.hoisted(() => [] as string[]);
vi.mock("@/lib/agency/brand/brand-book-recebido", () => ({
  lerBrandBookRecebido: vi.fn(async (e: { arquivo: string }): Promise<void> => { lidos.push(e.arquivo); }),
}));
vi.mock("@/lib/agency/media/armazenamento", () => ({
  lerArquivo: vi.fn(async (p: string): Promise<Buffer | null> => (p.includes("sumiu") ? null : Buffer.from("%PDF"))),
}));

import { prisma } from "@/lib/db/client";
import { relerBrandBooksGuardados } from "@/lib/agency/brand/reler-brand-books";
import { POST } from "@/app/api/agency/clients/[id]/marca/reler-brand-books/route";

let workspaceId = "";
let clientId = "";

async function brandBook(nome: string, storagePath: string, ultimaLeitura: string | null) {
  const a = await prisma.mediaAsset.create({
    data: { workspaceId, clientId, kind: "inbound", fileName: nome, mimeType: "application/pdf", sizeBytes: 4, sha256: `sha-${nome}`, storagePath, uploadedBy: "equipe" },
  });
  const m = await prisma.driveMaterial.create({
    data: { workspaceId, clientId, origem: "envio_direto", fileId: a.id, nome, papel: "manual_de_marca", mediaAssetId: a.id },
  });
  if (ultimaLeitura) {
    await prisma.brainArtifact.create({
      data: { clientId, department: "brand-book-extraido", canvasId: m.id, canvasJson: "{}", status: ultimaLeitura },
    });
  }
}

beforeAll(async () => {
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
  execSync("npx prisma db push --accept-data-loss", { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: `file:${DB_PATH}` }, stdio: "pipe" });
  workspaceId = (await prisma.agencyWorkspace.create({ data: { name: "Dioli", slug: `reler-${Date.now()}` } })).id;
  clientId = (await prisma.client.create({ data: { workspaceId, name: "DDF" } })).id;
  sessao.atual = { userId: "u", email: "m@x", name: "M", role: "master", workspaceId };
  await brandBook("esperando-ia.pdf", "/vol/a.pdf", "erro");
  await brandBook("nunca-lido.pdf", "/vol/b.pdf", null);
  await brandBook("ja-lido.pdf", "/vol/c.pdf", "aguardando_revisao");
  await brandBook("sumiu.pdf", "/vol/sumiu.pdf", "erro");
}, 120_000);

afterAll(async () => {
  await prisma.$disconnect().catch(() => {});
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
});

describe("reler os brand books guardados", () => {
  it("relê o que deu erro e o que nunca foi lido; pula o resto dizendo por quê", async () => {
    const plano = await relerBrandBooksGuardados({ workspaceId, clientId });
    expect(plano.relidos.sort()).toEqual(["esperando-ia.pdf", "nunca-lido.pdf"]);
    expect(plano.pulados).toEqual(expect.arrayContaining([
      { arquivo: "ja-lido.pdf", motivo: expect.stringContaining("já foi lido") },
      { arquivo: "sumiu.pdf", motivo: expect.stringContaining("não está mais no disco") },
    ]));
    await vi.waitFor(() => expect(lidos.sort()).toEqual(["esperando-ia.pdf", "nunca-lido.pdf"]));
  });

  it("a rota, sem o cofre aprovado (pareamento), recusa com o recado de espera", async () => {
    const r = await POST(new NextRequest("http://x/", { method: "POST" }), { params: Promise.resolve({ id: clientId }) });
    expect(r.status).toBe(409);
    expect(((await r.json()) as { error: string }).error).toContain("Aguardando a IA da Control Room");
  });

  it("a rota não alcança cliente de outro workspace", async () => {
    try {
      sessao.atual = { userId: "u", email: "m@x", name: "M", role: "master", workspaceId: "outro" };
      const r = await POST(new NextRequest("http://x/", { method: "POST" }), { params: Promise.resolve({ id: clientId }) });
      expect(r.status).toBe(404);
    } finally {
      sessao.atual = { userId: "u", email: "m@x", name: "M", role: "master", workspaceId };
    }
  });
});
