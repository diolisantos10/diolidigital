// CONSERTO B2/2 — o `caminhoInterno` é DERIVADO do id, DENTRO de
// `armazem.ts`; NUNCA aceito como string vinda de quem chama. Laudo do
// `qualidade` na Onda 3: antes deste conserto, `caminhoInterno` era aceito
// cru como parâmetro de `registrarArquivoDoCliente`/`registrarArquivoParaCliente`
// — o oposto do que a ficha B mandava reaproveitar de
// `lib/agency/media/armazenamento.ts` ("Derivado do id — NUNCA do nome
// enviado pelo cliente, que é o que mata travessia de diretório por
// construção").
//
// Metade 1: `derivarCaminhoInterno` (pura) — determinística, sanitiza cada
// pedaço, nunca produz `../`.
// Metade 2: contra SQLite real — um `caminhoInterno` malicioso injetado no
// objeto de entrada (via `as any`, simulando um chamador que ignora o tipo)
// NUNCA é gravado; o que vai para o banco é sempre o caminho derivado.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { derivarCaminhoInterno } from "@/lib/agency/celula/ponte/endereco-interno";

const estado = vi.hoisted(() => ({ prisma: null as unknown as PrismaClient }));
vi.mock("@/lib/db/client", () => ({
  get prisma() {
    return estado.prisma;
  },
}));

describe("derivarCaminhoInterno — pura", () => {
  it("monta o caminho a partir de workspaceId + id + extensão, sempre no formato celula/<workspace>/<id>.<ext>", () => {
    const caminho = derivarCaminhoInterno({ workspaceId: "ws_1", id: "arqcel_abc123", extensao: "pdf" });
    expect(caminho).toBe("celula/ws_1/arqcel_abc123.pdf");
  });

  it("sanitiza workspaceId, id e extensão — nenhum caractere fora de [a-zA-Z0-9_-] sobrevive", () => {
    const caminho = derivarCaminhoInterno({
      workspaceId: "ws_1/../etc",
      id: "arq/../../passwd",
      extensao: "pdf/../exe",
    });
    // A propriedade que importa é ESTRUTURAL, e é a do título deste teste:
    // nenhum caractere fora de `[a-zA-Z0-9_-]` sobrevive em segmento nenhum.
    // Ela é mais forte que procurar por substring: uma letra do texto do
    // atacante sobreviver (`passwd` vira `passwd` dentro do segmento) é
    // inofensivo — o que NUNCA pode sobreviver é separador, ponto ou `..`,
    // porque é isso que produz travessia de diretório.
    //
    // (Ajuste do PM no portão da Onda 3, 30/08/2026: a primeira versão deste
    // teste exigia `not.toContain("passwd")`, que não é propriedade de
    // segurança nenhuma — a asserção abaixo é ESTRITAMENTE mais forte, não
    // mais fraca: ela cobra o formato inteiro, não a ausência de três letras.)
    expect(caminho).toMatch(/^celula\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/);
    expect(caminho).not.toContain("..");
    expect(caminho.startsWith("celula/")).toBe(true);
  });

  it("nunca produz travessia de diretório mesmo com entrada adversarial pesada", () => {
    const caminho = derivarCaminhoInterno({
      workspaceId: "../../../../etc",
      id: "../../../../etc/passwd",
      extensao: "../../exe",
    });
    expect(caminho.includes("../")).toBe(false);
    expect(caminho.includes("..\\")).toBe(false);
  });

  it("workspaceId, id ou extensão vazios caem num valor-padrão nomeado, nunca num segmento vazio", () => {
    const caminho = derivarCaminhoInterno({ workspaceId: "", id: "", extensao: "" });
    expect(caminho).toBe("celula/sem-workspace/sem-id.bin");
  });
});

describe("armazem.ts contra SQLite real: caminhoInterno malicioso vindo de fora NUNCA é usado", () => {
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
    pasta = await mkdtemp(path.join(tmpdir(), "dioli-ponte-caminho-"));
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

  it("registrarArquivoDoCliente: um caminhoInterno malicioso injetado no input (bypass de tipo) é IGNORADO — o gravado é sempre o derivado", async () => {
    const { registrarArquivoDoCliente } = await import("@/lib/agency/celula/ponte/armazem");

    const entradaComCaminhoMalicioso = {
      workspaceId: "ws_1",
      oportunidadeId: "opp_1",
      clienteId: "cli_1",
      linhagemId: "lin_ataque",
      nomeOriginal: "briefing.pdf",
      extensaoDeclarada: "pdf",
      mimeType: "application/pdf",
      bytes: Buffer.from("conteudo"),
      // o tipo público NÃO tem mais este campo — simula um chamador em JS
      // puro (ou `as any`) tentando injetar mesmo assim.
      caminhoInterno: "../../../../etc/passwd",
      destinatarioDeclarado: "atendimento-dioli",
      autor: "operador_1",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const resultado = await registrarArquivoDoCliente(entradaComCaminhoMalicioso);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error("deveria registrar");

    const linha = await estado.prisma.arquivoDaCelula.findUnique({ where: { id: resultado.arquivoId } });
    expect(linha).not.toBeNull();
    expect(linha?.caminhoInterno).not.toContain("..");
    expect(linha?.caminhoInterno).not.toContain("/etc/passwd");
    expect(linha?.caminhoInterno).toBe(`celula/ws_1/${resultado.arquivoId}.pdf`);
  });

  it("registrarArquivoParaCliente: mesma trava — caminhoInterno injetado de fora é ignorado", async () => {
    const { registrarArquivoParaCliente } = await import("@/lib/agency/celula/ponte/armazem");

    const entradaComCaminhoMalicioso = {
      workspaceId: "ws_1",
      oportunidadeId: "opp_1",
      clienteId: "cli_1",
      linhagemId: "lin_ataque_2",
      nomeOriginal: "proposta.pdf",
      extensao: "pdf",
      mimeType: "application/pdf",
      bytes: Buffer.from("proposta"),
      caminhoInterno: "../../../../var/segredo",
      destinatarioDeclarado: "cliente-a@exemplo.com",
      autor: "designer_1",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const resultado = await registrarArquivoParaCliente(entradaComCaminhoMalicioso);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error("deveria registrar");

    const linha = await estado.prisma.arquivoDaCelula.findUnique({ where: { id: resultado.arquivoId } });
    expect(linha?.caminhoInterno).not.toContain("..");
    expect(linha?.caminhoInterno).not.toContain("/var/segredo");
    expect(linha?.caminhoInterno).toBe(`celula/ws_1/${resultado.arquivoId}.pdf`);
  });

  it("dois registros na MESMA linhagem recebem ids (e portanto caminhos) DIFERENTES — nunca colidem", async () => {
    const { registrarArquivoDoCliente } = await import("@/lib/agency/celula/ponte/armazem");

    const v1 = await registrarArquivoDoCliente({
      workspaceId: "ws_1",
      oportunidadeId: "opp_1",
      clienteId: "cli_1",
      linhagemId: "lin_dois_ids",
      nomeOriginal: "a.pdf",
      extensaoDeclarada: "pdf",
      mimeType: "application/pdf",
      bytes: Buffer.from("v1"),
      destinatarioDeclarado: "atendimento-dioli",
      autor: "operador_1",
    });
    const v2 = await registrarArquivoDoCliente({
      workspaceId: "ws_1",
      oportunidadeId: "opp_1",
      clienteId: "cli_1",
      linhagemId: "lin_dois_ids",
      nomeOriginal: "a.pdf",
      extensaoDeclarada: "pdf",
      mimeType: "application/pdf",
      bytes: Buffer.from("v2"),
      destinatarioDeclarado: "atendimento-dioli",
      autor: "operador_1",
    });
    if (!v1.ok || !v2.ok) throw new Error("deveria registrar as duas versões");
    expect(v1.arquivoId).not.toBe(v2.arquivoId);

    const linhas = await estado.prisma.arquivoDaCelula.findMany({ where: { linhagemId: "lin_dois_ids" } });
    const caminhos = linhas.map((l) => l.caminhoInterno);
    expect(new Set(caminhos).size).toBe(2);
  });
});
