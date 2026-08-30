// CONSERTO B2/3 — retenção configurável: `retencaoAteEm` estava no schema
// desde a Onda 3 e NENHUMA função a definia ou aceitava. Retenção era
// obrigatório da ficha B.
//
// Agora `registrarArquivoDoCliente`/`registrarArquivoParaCliente` aceitam
// `retencaoAteEm?: Date | null` e a gravam:
//   • `undefined` (quem chama não decidiu) → aplica o padrão da casa
//     (`RETENCAO_PADRAO_EM_DIAS`, uma constante nomeada, sobrescrevível por
//     `CELULA_RETENCAO_PADRAO_EM_DIAS`).
//   • `null` (quem chama decide explicitamente "sem prazo") → grava `null`.
//     Isso é "sem prazo DECLARADO" — não é "para sempre".
//   • Uma `Date` explícita → grava exatamente essa data.
//
// LACUNA DECLARADA (repetida aqui de propósito, porque é o que o `qualidade`
// cobra): nenhuma função desta pasta LÊ `retencaoAteEm` para apagar nada —
// quem executa o expurgo não existe nesta onda.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

describe("retenção contra SQLite real", () => {
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
    pasta = await mkdtemp(path.join(tmpdir(), "dioli-ponte-retencao-"));
    arquivoDb = path.join(pasta, "ponte.db");
    estado.prisma = new PrismaClient({ adapter: new PrismaLibSql({ url: `file:${arquivoDb}` }) });
    for (const instrucao of DDL.split(";").map((s) => s.trim()).filter(Boolean)) {
      await estado.prisma.$executeRawUnsafe(instrucao);
    }
    vi.resetModules();
    delete process.env.CELULA_RETENCAO_PADRAO_EM_DIAS;
  });

  afterEach(async () => {
    await estado.prisma.$disconnect().catch(() => {});
    await rm(pasta, { recursive: true, force: true });
    delete process.env.CELULA_RETENCAO_PADRAO_EM_DIAS;
  });

  it("sem informar retencaoAteEm (undefined) → aplica o padrão da casa (não fica null)", async () => {
    const { registrarArquivoDoCliente } = await import("@/lib/agency/celula/ponte/armazem");
    const antes = Date.now();
    const resultado = await registrarArquivoDoCliente({
      workspaceId: "ws_1",
      oportunidadeId: "opp_1",
      clienteId: "cli_1",
      linhagemId: "lin_retencao_padrao",
      nomeOriginal: "briefing.pdf",
      extensaoDeclarada: "pdf",
      mimeType: "application/pdf",
      bytes: Buffer.from("conteudo"),
      destinatarioDeclarado: "atendimento-dioli",
      autor: "operador_1",
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error("deveria registrar");

    const linha = await estado.prisma.arquivoDaCelula.findUnique({ where: { id: resultado.arquivoId } });
    expect(linha?.retencaoAteEm).not.toBeNull();
    // ~365 dias no futuro (padrão), com folga generosa para o tempo de execução do teste.
    const emUmAno = antes + 360 * 24 * 60 * 60 * 1000;
    expect(linha!.retencaoAteEm!.getTime()).toBeGreaterThan(emUmAno);
  });

  it("retencaoAteEm explicitamente null → grava null (\"sem prazo DECLARADO\", nunca \"para sempre\" por omissão)", async () => {
    const { registrarArquivoDoCliente } = await import("@/lib/agency/celula/ponte/armazem");
    const resultado = await registrarArquivoDoCliente({
      workspaceId: "ws_1",
      oportunidadeId: "opp_1",
      clienteId: "cli_1",
      linhagemId: "lin_retencao_null",
      nomeOriginal: "briefing.pdf",
      extensaoDeclarada: "pdf",
      mimeType: "application/pdf",
      bytes: Buffer.from("conteudo"),
      destinatarioDeclarado: "atendimento-dioli",
      autor: "operador_1",
      retencaoAteEm: null,
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error("deveria registrar");

    const linha = await estado.prisma.arquivoDaCelula.findUnique({ where: { id: resultado.arquivoId } });
    expect(linha?.retencaoAteEm).toBeNull();
  });

  it("retencaoAteEm com Date explícita → grava exatamente essa data", async () => {
    const { registrarArquivoDoCliente } = await import("@/lib/agency/celula/ponte/armazem");
    const prazo = new Date("2027-01-01T00:00:00.000Z");
    const resultado = await registrarArquivoDoCliente({
      workspaceId: "ws_1",
      oportunidadeId: "opp_1",
      clienteId: "cli_1",
      linhagemId: "lin_retencao_explicita",
      nomeOriginal: "briefing.pdf",
      extensaoDeclarada: "pdf",
      mimeType: "application/pdf",
      bytes: Buffer.from("conteudo"),
      destinatarioDeclarado: "atendimento-dioli",
      autor: "operador_1",
      retencaoAteEm: prazo,
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error("deveria registrar");

    const linha = await estado.prisma.arquivoDaCelula.findUnique({ where: { id: resultado.arquivoId } });
    expect(linha?.retencaoAteEm?.toISOString()).toBe(prazo.toISOString());
  });

  it("o padrão respeita CELULA_RETENCAO_PADRAO_EM_DIAS quando setado", async () => {
    process.env.CELULA_RETENCAO_PADRAO_EM_DIAS = "10";
    vi.resetModules();
    const { registrarArquivoDoCliente } = await import("@/lib/agency/celula/ponte/armazem");
    const antes = Date.now();
    const resultado = await registrarArquivoDoCliente({
      workspaceId: "ws_1",
      oportunidadeId: "opp_1",
      clienteId: "cli_1",
      linhagemId: "lin_retencao_env",
      nomeOriginal: "briefing.pdf",
      extensaoDeclarada: "pdf",
      mimeType: "application/pdf",
      bytes: Buffer.from("conteudo"),
      destinatarioDeclarado: "atendimento-dioli",
      autor: "operador_1",
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error("deveria registrar");

    const linha = await estado.prisma.arquivoDaCelula.findUnique({ where: { id: resultado.arquivoId } });
    const em9Dias = antes + 9 * 24 * 60 * 60 * 1000;
    const em11Dias = antes + 11 * 24 * 60 * 60 * 1000;
    expect(linha!.retencaoAteEm!.getTime()).toBeGreaterThan(em9Dias);
    expect(linha!.retencaoAteEm!.getTime()).toBeLessThan(em11Dias);
  });

  it("registrarArquivoParaCliente também aceita e grava retenção (mesmo contrato do lado cliente → Dioli)", async () => {
    const { registrarArquivoParaCliente } = await import("@/lib/agency/celula/ponte/armazem");
    const resultado = await registrarArquivoParaCliente({
      workspaceId: "ws_1",
      oportunidadeId: "opp_1",
      clienteId: "cli_1",
      linhagemId: "lin_retencao_para_cliente",
      nomeOriginal: "proposta.pdf",
      extensao: "pdf",
      mimeType: "application/pdf",
      bytes: Buffer.from("proposta"),
      destinatarioDeclarado: "cliente-a@exemplo.com",
      autor: "designer_1",
      retencaoAteEm: null,
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error("deveria registrar");

    const linha = await estado.prisma.arquivoDaCelula.findUnique({ where: { id: resultado.arquivoId } });
    expect(linha?.retencaoAteEm).toBeNull();
  });
});
