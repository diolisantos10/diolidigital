// CONSERTO B2/4 — histórico de download: `EventoDoArquivoDaCelula.tipo`
// documentava `"download"` desde a Onda 3 e NENHUM `.create` gravava esse
// tipo (o de envio, `"envio"`, existia; o de download não). "Histórico de
// download e envio" era obrigatório da ficha B.
//
// `registrarDownloadPeloOperador` é a função nova: append-only, NÃO lê byte,
// NÃO serve arquivo — só registra quem baixou, quando (`criadoEm` do
// evento) e qual arquivo. As duas metades: arquivo não encontrado no
// workspace (falha) e arquivo encontrado (grava o evento "download").

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@/lib/generated/prisma/client";

const estado = vi.hoisted(() => ({ prisma: null as unknown as PrismaClient }));
vi.mock("@/lib/db/client", () => ({
  get prisma() {
    return estado.prisma;
  },
}));

describe("varredura estática: registrarDownloadPeloOperador só faz .create sobre eventoDoArquivoDaCelula", () => {
  const codigoFonte = readFileSync(
    path.join(process.cwd(), "lib/agency/celula/ponte/armazem.ts"),
    "utf-8",
  );

  it("a função existe e grava tipo 'download'", () => {
    expect(codigoFonte).toContain("registrarDownloadPeloOperador");
    expect(codigoFonte).toContain('tipo: "download"');
  });

  it("não lê byte nem serve arquivo — nenhum readFile/writeFile na função", () => {
    const inicio = codigoFonte.indexOf("export async function registrarDownloadPeloOperador");
    expect(inicio).toBeGreaterThan(-1);
    const trechoDaFuncao = codigoFonte.slice(inicio, inicio + 1200);
    expect(trechoDaFuncao).not.toMatch(/readFile|writeFile|lerArquivo/);
  });
});

describe("registrarDownloadPeloOperador contra SQLite real", () => {
  const DDL = `
CREATE TABLE "ArquivoDaCelula" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "oportunidadeId" TEXT NOT NULL,
    "clienteId" TEXT,
    "projetoId" TEXT,
    "direcao" TEXT NOT NULL,
    "linhagemId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "nomeOriginal" TEXT NOT NULL,
    "extensao" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "caminhoInterno" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'recebido',
    "destinatarioDeclarado" TEXT NOT NULL,
    "motivoDaQuarentena" TEXT,
    "retencaoAteEm" DATETIME,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ArquivoDaCelula_linhagemId_versao_key" ON "ArquivoDaCelula"("linhagemId", "versao");
CREATE INDEX "ArquivoDaCelula_workspaceId_oportunidadeId_idx" ON "ArquivoDaCelula"("workspaceId", "oportunidadeId");
CREATE INDEX "ArquivoDaCelula_sha256_idx" ON "ArquivoDaCelula"("sha256");

CREATE TABLE "EventoDoArquivoDaCelula" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "arquivoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "autor" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "detalhe" TEXT NOT NULL,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "EventoDoArquivoDaCelula_arquivoId_criadoEm_idx" ON "EventoDoArquivoDaCelula"("arquivoId", "criadoEm");
CREATE INDEX "EventoDoArquivoDaCelula_workspaceId_criadoEm_idx" ON "EventoDoArquivoDaCelula"("workspaceId", "criadoEm");
`;

  let pasta = "";
  let arquivoDb = "";

  beforeEach(async () => {
    pasta = await mkdtemp(path.join(tmpdir(), "dioli-ponte-download-"));
    arquivoDb = path.join(pasta, "ponte.db");
    estado.prisma = new PrismaClient({ adapter: new PrismaLibSql({ url: `file:${arquivoDb}` }) });
    for (const instrucao of DDL.split(";").map((s) => s.trim()).filter(Boolean)) {
      await estado.prisma.$executeRawUnsafe(instrucao);
    }
    vi.resetModules();
  });

  afterEach(async () => {
    await estado.prisma.$disconnect().catch(() => {});
    await rm(pasta, { recursive: true, force: true });
  });

  it("metade suja: arquivo inexistente (ou de outro workspace) → ok:false, nenhum evento gravado", async () => {
    const { registrarDownloadPeloOperador } = await import("@/lib/agency/celula/ponte/armazem");
    const resultado = await registrarDownloadPeloOperador({
      workspaceId: "ws_1",
      arquivoId: "arq_que_nao_existe",
      autor: "operador_1",
    });
    expect(resultado.ok).toBe(false);

    const eventos = await estado.prisma.eventoDoArquivoDaCelula.findMany({});
    expect(eventos).toHaveLength(0);
  });

  it("metade limpa: arquivo do workspace certo → registra evento 'download' com autor e horário", async () => {
    const { registrarArquivoDoCliente, registrarDownloadPeloOperador } = await import(
      "@/lib/agency/celula/ponte/armazem"
    );

    const registrado = await registrarArquivoDoCliente({
      workspaceId: "ws_1",
      oportunidadeId: "opp_1",
      clienteId: "cli_1",
      linhagemId: "lin_download",
      nomeOriginal: "briefing.pdf",
      extensaoDeclarada: "pdf",
      mimeType: "application/pdf",
      bytes: Buffer.from("conteudo"),
      destinatarioDeclarado: "atendimento-dioli",
      autor: "operador_1",
    });
    expect(registrado.ok).toBe(true);
    if (!registrado.ok) throw new Error("deveria registrar");

    const antes = Date.now();
    const resultado = await registrarDownloadPeloOperador({
      workspaceId: "ws_1",
      arquivoId: registrado.arquivoId,
      autor: "operador_gerente_1",
    });
    expect(resultado.ok).toBe(true);

    const eventos = await estado.prisma.eventoDoArquivoDaCelula.findMany({
      where: { arquivoId: registrado.arquivoId, tipo: "download" },
    });
    expect(eventos).toHaveLength(1);
    expect(eventos[0].autor).toBe("operador_gerente_1");
    expect(eventos[0].criadoEm.getTime()).toBeGreaterThanOrEqual(antes - 1000);
  });

  it("FRONTEIRA DE WORKSPACE: arquivo existe, mas em OUTRO workspace → recusa, não vaza evento", async () => {
    const { registrarArquivoDoCliente, registrarDownloadPeloOperador } = await import(
      "@/lib/agency/celula/ponte/armazem"
    );

    const registrado = await registrarArquivoDoCliente({
      workspaceId: "ws_dono",
      oportunidadeId: "opp_1",
      clienteId: "cli_1",
      linhagemId: "lin_download_fronteira",
      nomeOriginal: "briefing.pdf",
      extensaoDeclarada: "pdf",
      mimeType: "application/pdf",
      bytes: Buffer.from("conteudo"),
      destinatarioDeclarado: "atendimento-dioli",
      autor: "operador_1",
    });
    if (!registrado.ok) throw new Error("deveria registrar");

    const resultado = await registrarDownloadPeloOperador({
      workspaceId: "ws_invasor",
      arquivoId: registrado.arquivoId,
      autor: "operador_invasor",
    });
    expect(resultado.ok).toBe(false);

    const eventos = await estado.prisma.eventoDoArquivoDaCelula.findMany({ where: { arquivoId: registrado.arquivoId } });
    expect(eventos.some((e) => e.tipo === "download")).toBe(false);
  });

  it("dois downloads do mesmo arquivo geram DOIS eventos — histórico, não estado único", async () => {
    const { registrarArquivoDoCliente, registrarDownloadPeloOperador } = await import(
      "@/lib/agency/celula/ponte/armazem"
    );

    const registrado = await registrarArquivoDoCliente({
      workspaceId: "ws_1",
      oportunidadeId: "opp_1",
      clienteId: "cli_1",
      linhagemId: "lin_download_dobrado",
      nomeOriginal: "briefing.pdf",
      extensaoDeclarada: "pdf",
      mimeType: "application/pdf",
      bytes: Buffer.from("conteudo"),
      destinatarioDeclarado: "atendimento-dioli",
      autor: "operador_1",
    });
    if (!registrado.ok) throw new Error("deveria registrar");

    await registrarDownloadPeloOperador({ workspaceId: "ws_1", arquivoId: registrado.arquivoId, autor: "operador_a" });
    await registrarDownloadPeloOperador({ workspaceId: "ws_1", arquivoId: registrado.arquivoId, autor: "operador_b" });

    const eventos = await estado.prisma.eventoDoArquivoDaCelula.findMany({
      where: { arquivoId: registrado.arquivoId, tipo: "download" },
    });
    expect(eventos).toHaveLength(2);
    expect(eventos.map((e) => e.autor).sort()).toEqual(["operador_a", "operador_b"]);
  });
});
