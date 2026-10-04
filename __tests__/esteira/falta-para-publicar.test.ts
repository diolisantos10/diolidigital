// O PAINEL "FALTA PARA PUBLICAR" (CEO, 04/10/2026) — contra banco real.
//
// As duas metades: cliente que é o Sushi Cazza de hoje (só manual, sem logo,
// sem fotos, sem cardápio, sem Instagram) mostra cada falta com o botão que
// resolve; cliente completo mostra tudo pronto — o painel não acusa à toa.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, rmSync, readFileSync } from "node:fs";
import { NextRequest } from "next/server";

const DB_PATH = vi.hoisted(() => {
  const caminho = `${process.cwd()}/prisma/falta-para-publicar-e2e.db`;
  process.env.DATABASE_URL = `file:${caminho}`;
  return caminho;
});

type Sessao = { userId: string; email: string; name: string; role: string; workspaceId: string; clientId?: string } | null;
const sessao = vi.hoisted(() => ({ atual: null as Sessao }));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn(async (): Promise<Sessao> => sessao.atual) }));

import { prisma } from "@/lib/db/client";
import { GET } from "@/app/api/agency/clients/[id]/falta-para-publicar/route";
import type { FaltaParaPublicar } from "@/lib/agency/esteira/falta-para-publicar";

let ws = "";
let sushi = "";
let completo = "";

const PACOTE_SO_DE_STORIES = {
  postsPorDia: 0, postsPorSemana: 0, formatos: ["stories"], dias: [0, 1, 2, 3, 4, 5, 6], horarios: [],
  pilares: [{ nome: "Geral", peso: 1 }],
  stories: { porDiaMin: 1, porDiaMax: 1, aPartirDe: "18:00", intervaloMinimoMin: 30, combosMinPorDia: 0, mistura: ["reciclado"] },
};

async function ler(id: string): Promise<{ status: number; corpo: FaltaParaPublicar }> {
  const r = await GET(new NextRequest("http://x/"), { params: Promise.resolve({ id }) });
  return { status: r.status, corpo: (await r.json()) as FaltaParaPublicar };
}

async function material(clientId: string, nome: string, mime: string, papel: string) {
  const a = await prisma.mediaAsset.create({
    data: { workspaceId: ws, clientId, kind: "inbound", fileName: nome, mimeType: mime, sizeBytes: 1, sha256: `sha-${clientId}-${nome}`, storagePath: `/v/${nome}`, uploadedBy: "equipe" },
  });
  await prisma.driveMaterial.create({
    data: { workspaceId: ws, clientId, origem: "envio_direto", fileId: a.id, nome, papel, mediaAssetId: a.id, papelConfirmadoEm: new Date() },
  });
}

beforeAll(async () => {
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
  execSync("npx prisma db push --accept-data-loss", { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: `file:${DB_PATH}` }, stdio: "pipe" });
  ws = (await prisma.agencyWorkspace.create({ data: { name: "Dioli", slug: `falta-${Date.now()}` } })).id;
  sessao.atual = { userId: "u", email: "m@x", name: "M", role: "master", workspaceId: ws };

  // O Sushi Cazza de hoje: pacote sem cardápio, só o manual.
  sushi = (await prisma.client.create({ data: { workspaceId: ws, name: "Sushi Cazza", pacoteJson: JSON.stringify(PACOTE_SO_DE_STORIES) } })).id;
  await material(sushi, "manual.pdf", "application/pdf", "manual_de_marca");

  // O completo: logo, fotos que bastam, cardápio, Instagram com permissão.
  completo = (await prisma.client.create({
    data: { workspaceId: ws, name: "Completo", pacoteJson: JSON.stringify({ ...PACOTE_SO_DE_STORIES, cardapio: { combos: [{ nome: "Combo", preco: "R$ 10,00" }] } }) },
  })).id;
  await material(completo, "logo.png", "image/png", "logo");
  for (let i = 0; i < 15; i++) await material(completo, `foto-${i}.jpg`, "image/jpeg", "foto_produto");
  await prisma.googleDriveConnection.create({
    data: { workspaceId: ws, clientId: completo, contaHint: "dono@…", accessTokenEncrypted: "x", refreshTokenEncrypted: "x", escopos: "drive.file" },
  }).catch((e: unknown) => { throw new Error(`ajuste o teste ao schema de GoogleDriveConnection: ${String(e).slice(0, 300)}`); });
  await prisma.metaConnection.create({
    data: { workspaceId: ws, clientId: completo, platform: "instagram", externalId: "ig-1", accessTokenEncrypted: "x", scopes: JSON.stringify(["instagram_basic", "instagram_content_publish"]) },
  });
}, 120_000);

afterAll(async () => {
  await prisma.$disconnect().catch(() => {});
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
});

describe("Falta para publicar", () => {
  it("o Sushi Cazza de hoje: logo, fotos, cardápio, Instagram e IA faltam — cada um com quem resolve", async () => {
    const { status, corpo } = await ler(sushi);
    expect(status).toBe(200);
    const por = Object.fromEntries(corpo.itens.map((i) => [i.chave, i]));
    expect(por.logo).toMatchObject({ pronto: false, acao: { rotulo: "Subir o logo" } });
    expect(por.fotos).toMatchObject({ pronto: false, acao: { rotulo: "Subir fotos" } });
    expect(por.fotos!.detalhe).toContain("0 foto(s)");
    expect(por.pacote!.pronto).toBe(true);
    expect(por.cardapio).toMatchObject({ pronto: false, acao: { rotulo: "Cadastrar combos" } });
    // Login NATIVO: o botão abre o portal do cliente na aba Integrações —
    // nunca uma tela de colar token (CEO, 04/10/2026).
    expect(por.instagram).toMatchObject({ pronto: false, quemResolve: "ceo", acao: { rotulo: "Conectar o Instagram", destino: "portal:integracoes" } });
    expect(por.drive).toMatchObject({ pronto: false, acao: { rotulo: "Conectar o Drive", destino: "portal:integracoes" } });
    expect(por.ia).toMatchObject({ pronto: false, quemResolve: "control_room" });
    expect(por.ia!.detalhe).toContain("Plano B");
    expect(corpo.resumo).toMatch(/^Falta: /);
  });

  it("o cliente completo: logo, fotos, pacote, cardápio e Instagram prontos — o painel não acusa à toa", async () => {
    const { corpo } = await ler(completo);
    const por = Object.fromEntries(corpo.itens.map((i) => [i.chave, i]));
    for (const chave of ["logo", "fotos", "pacote", "cardapio", "instagram", "drive"]) {
      expect(por[chave]!.pronto, chave).toBe(true);
      expect(por[chave]!.acao, chave).toBeNull();
    }
  });

  it("Instagram conectado SEM a permissão de publicar → falta, e o botão é reconectar", async () => {
    await prisma.metaConnection.create({
      data: { workspaceId: ws, clientId: sushi, platform: "instagram", externalId: "ig-sushi", accessTokenEncrypted: "x", scopes: JSON.stringify(["instagram_basic"]) },
    });
    const { corpo } = await ler(sushi);
    const ig = corpo.itens.find((i) => i.chave === "instagram")!;
    expect(ig).toMatchObject({ pronto: false, acao: { rotulo: "Reconectar o Instagram" } });
    expect(ig.detalhe).toContain("SEM a permissão de publicar");
  });

  it("sessão de portal → 403; cliente de outro workspace → 404", async () => {
    sessao.atual = { userId: "u", email: "m@x", name: "M", role: "master", workspaceId: ws, clientId: sushi };
    expect((await ler(sushi)).status).toBe(403);
    sessao.atual = { userId: "u", email: "m@x", name: "M", role: "master", workspaceId: "outro" };
    expect((await ler(sushi)).status).toBe(404);
    sessao.atual = { userId: "u", email: "m@x", name: "M", role: "master", workspaceId: ws };
  });
});

describe("na tela: conectar é login nativo, no portal do cliente", () => {
  const TELA = readFileSync(`${process.cwd()}/components/agency/clients/FaltaParaPublicar.tsx`, "utf8");
  const PORTAL = readFileSync(`${process.cwd()}/app/portal/access/[token]/page.tsx`, "utf8");
  it("o botão abre o portal do cliente na aba Integrações, reaproveitando ou gerando o link", () => {
    expect(TELA).toContain("?aba=integracoes");
    expect(TELA).toContain("/api/brain/portal-access?clientId=");
    expect(TELA).toContain('fetch("/api/brain/portal-access", {');
  });
  it("a aba existe no portal, com o login da Meta e do Drive", () => {
    expect(PORTAL).toContain('{ id: "integracoes",  label: "Integrações" }');
    expect(PORTAL).toContain("<ConexoesDoCliente token={token} />");
  });
  it("nenhum campo de colar token na tela do cliente", () => {
    expect(TELA).not.toMatch(/token de acesso|cole o token|colar token/i);
  });
});
