// VERSÕES SEM SOBRESCRITA SILENCIOSA + AUDITORIA APPEND-ONLY — a metade de
// `armazem.ts` que toca banco de verdade (SQLite via libsql, mesmo padrão de
// `__tests__/celula/trilha-e-append-only.test.ts`).

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

describe("varredura estática: nenhuma escrita mutante sobre eventoDoArquivoDaCelula", () => {
  const codigoFonte = readFileSync(
    path.join(process.cwd(), "lib/agency/celula/ponte/armazem.ts"),
    "utf-8",
  );

  it("não existe .update / .updateMany / .delete / .deleteMany / .upsert sobre eventoDoArquivoDaCelula", () => {
    const proibidos = /eventoDoArquivoDaCelula\s*\.\s*(update|updateMany|delete|deleteMany|upsert)\s*\(/g;
    const achados = codigoFonte.match(proibidos);
    expect(achados, `métodos mutantes encontrados sobre eventoDoArquivoDaCelula: ${JSON.stringify(achados)}`).toBeNull();
  });

  it("o `.create` sobre eventoDoArquivoDaCelula existe no arquivo — a varredura acima não testa um arquivo vazio", () => {
    expect(/eventoDoArquivoDaCelula\s*\.\s*create\s*\(/.test(codigoFonte)).toBe(true);
  });
});

describe("armazem.ts contra SQLite real", () => {
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
    pasta = await mkdtemp(path.join(tmpdir(), "dioli-ponte-"));
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

  it("registrarArquivoDoCliente grava a v1 como 'liberado' para um arquivo limpo", async () => {
    const { registrarArquivoDoCliente } = await import("@/lib/agency/celula/ponte/armazem");
    const resultado = await registrarArquivoDoCliente({
      workspaceId: "ws_1",
      oportunidadeId: "opp_1",
      clienteId: "cli_1",
      linhagemId: "lin_briefing_1",
      nomeOriginal: "briefing.pdf",
      extensaoDeclarada: "pdf",
      mimeType: "application/pdf",
      bytes: Buffer.from("conteudo da versao 1"),
      caminhoInterno: "cli_1/lin_briefing_1_v1.pdf",
      destinatarioDeclarado: "atendimento-dioli",
      autor: "operador_1",
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error("deveria registrar");
    expect(resultado.versao).toBe(1);
    expect(resultado.estado).toBe("liberado");
  });

  it("VERSÃO NOVA É LINHA NOVA: duas gravações da mesma linhagem geram DUAS linhas, e a v1 continua legível byte a byte", async () => {
    const { registrarArquivoDoCliente } = await import("@/lib/agency/celula/ponte/armazem");

    const v1 = await registrarArquivoDoCliente({
      workspaceId: "ws_1",
      oportunidadeId: "opp_1",
      clienteId: "cli_1",
      linhagemId: "lin_x",
      nomeOriginal: "arquivo.pdf",
      extensaoDeclarada: "pdf",
      mimeType: "application/pdf",
      bytes: Buffer.from("conteudo v1"),
      caminhoInterno: "cli_1/lin_x_v1.pdf",
      destinatarioDeclarado: "atendimento-dioli",
      autor: "operador_1",
    });
    expect(v1.ok).toBe(true);
    if (!v1.ok) throw new Error("deveria registrar v1");
    expect(v1.versao).toBe(1);

    const v2 = await registrarArquivoDoCliente({
      workspaceId: "ws_1",
      oportunidadeId: "opp_1",
      clienteId: "cli_1",
      linhagemId: "lin_x",
      nomeOriginal: "arquivo.pdf",
      extensaoDeclarada: "pdf",
      mimeType: "application/pdf",
      bytes: Buffer.from("conteudo v2, diferente"),
      caminhoInterno: "cli_1/lin_x_v2.pdf",
      destinatarioDeclarado: "atendimento-dioli",
      autor: "operador_1",
    });
    expect(v2.ok).toBe(true);
    if (!v2.ok) throw new Error("deveria registrar v2");
    expect(v2.versao).toBe(2);

    const linhas = await estado.prisma.arquivoDaCelula.findMany({
      where: { linhagemId: "lin_x" },
      orderBy: { versao: "asc" },
    });
    expect(linhas).toHaveLength(2);
    expect(linhas[0].versao).toBe(1);
    expect(linhas[0].sha256).not.toBe(linhas[1].sha256);
    // a v1 continua legível byte a byte: o registro dela não foi tocado.
    const v1Relido = await estado.prisma.arquivoDaCelula.findUnique({ where: { id: v1.arquivoId } });
    expect(v1Relido?.caminhoInterno).toBe("cli_1/lin_x_v1.pdf");
    expect(v1Relido?.versao).toBe(1);
  });

  it("uma tentativa de gravar a MESMA versao para a MESMA linhagem falha em vez de sobrescrever (trava de banco)", async () => {
    await estado.prisma.arquivoDaCelula.create({
      data: {
        id: "arq_dup_1",
        workspaceId: "ws_1",
        oportunidadeId: "opp_1",
        clienteId: "cli_1",
        direcao: "cliente_para_dioli",
        linhagemId: "lin_dup",
        versao: 1,
        nomeOriginal: "a.pdf",
        extensao: "pdf",
        mimeType: "application/pdf",
        tamanhoBytes: 10,
        sha256: "hash1",
        caminhoInterno: "cli_1/a.pdf",
        estado: "liberado",
        destinatarioDeclarado: "atendimento-dioli",
      },
    });

    await expect(
      estado.prisma.arquivoDaCelula.create({
        data: {
          id: "arq_dup_2",
          workspaceId: "ws_1",
          oportunidadeId: "opp_1",
          clienteId: "cli_1",
          direcao: "cliente_para_dioli",
          linhagemId: "lin_dup",
          versao: 1, // repetida de propósito
          nomeOriginal: "a.pdf",
          extensao: "pdf",
          mimeType: "application/pdf",
          tamanhoBytes: 10,
          sha256: "hash2",
          caminhoInterno: "cli_1/a-outra.pdf",
          estado: "liberado",
          destinatarioDeclarado: "atendimento-dioli",
        },
      }),
    ).rejects.toThrow();
  });

  it("FRONTEIRA DE WORKSPACE: linhagemId reaproveitado por OUTRO workspace não herda a versão do dono original — falha alto, nunca mescla em silêncio", async () => {
    const { registrarArquivoDoCliente } = await import("@/lib/agency/celula/ponte/armazem");

    const doDonoOriginal = await registrarArquivoDoCliente({
      workspaceId: "ws_dono_original",
      oportunidadeId: "opp_1",
      clienteId: "cli_1",
      linhagemId: "lin_colisao_entre_workspaces",
      nomeOriginal: "briefing.pdf",
      extensaoDeclarada: "pdf",
      mimeType: "application/pdf",
      bytes: Buffer.from("conteudo do dono original"),
      caminhoInterno: "cli_1/lin_colisao_v1.pdf",
      destinatarioDeclarado: "atendimento-dioli",
      autor: "operador_1",
    });
    expect(doDonoOriginal.ok).toBe(true);
    if (!doDonoOriginal.ok) throw new Error("deveria registrar a v1 do dono original");
    expect(doDonoOriginal.versao).toBe(1);

    // Outro workspace usa (por acidente ou má-fé) o MESMO linhagemId. Antes
    // do conserto, a busca de MAX(versao) não filtrava por workspaceId e
    // devolveria versao=2 — uma linha de OUTRO workspace silenciosamente
    // "continuando" a linhagem do dono original. Agora a trava de banco
    // (`@@unique([linhagemId, versao])`) barra: falha alto, nunca mescla.
    await expect(
      registrarArquivoDoCliente({
        workspaceId: "ws_outro_workspace",
        oportunidadeId: "opp_de_outro_workspace",
        clienteId: "cli_de_outro_workspace",
        linhagemId: "lin_colisao_entre_workspaces",
        nomeOriginal: "arquivo.pdf",
        extensaoDeclarada: "pdf",
        mimeType: "application/pdf",
        bytes: Buffer.from("conteudo de outro workspace"),
        caminhoInterno: "cli_de_outro_workspace/x.pdf",
        destinatarioDeclarado: "atendimento-dioli",
        autor: "operador_2",
      }),
    ).rejects.toThrow();

    // A linhagem do dono original continua com UMA única versão — nenhuma
    // linha de outro workspace foi injetada nela.
    const linhas = await estado.prisma.arquivoDaCelula.findMany({
      where: { linhagemId: "lin_colisao_entre_workspaces" },
    });
    expect(linhas).toHaveLength(1);
    expect(linhas[0].workspaceId).toBe("ws_dono_original");
  });

  it("arquivo suspeito (descasamento de extensão/MIME) é registrado como 'em_quarentena', com evento 'quarentena'", async () => {
    const { registrarArquivoDoCliente } = await import("@/lib/agency/celula/ponte/armazem");
    const resultado = await registrarArquivoDoCliente({
      workspaceId: "ws_1",
      oportunidadeId: "opp_1",
      clienteId: "cli_1",
      linhagemId: "lin_suspeito",
      nomeOriginal: "fotos.png",
      extensaoDeclarada: "png",
      mimeType: "image/jpeg", // diverge de "png"
      bytes: Buffer.from("bytes quaisquer"),
      caminhoInterno: "cli_1/lin_suspeito_v1.jpg",
      destinatarioDeclarado: "atendimento-dioli",
      autor: "operador_1",
    });
    expect(resultado.ok).toBe(false);
    if (resultado.ok) throw new Error("deveria colocar em quarentena");
    expect(resultado.abrirExcecao?.caso).toBe("arquivo_suspeito");

    const eventos = await estado.prisma.eventoDoArquivoDaCelula.findMany({ where: { workspaceId: "ws_1" } });
    expect(eventos.some((e) => e.tipo === "quarentena")).toBe(true);
  });

  it("T4 via armazem: confirmação ao cliente falha para arquivo em quarentena e passa para arquivo liberado", async () => {
    const { registrarArquivoDoCliente, confirmarRecebimentoParaCliente } = await import(
      "@/lib/agency/celula/ponte/armazem"
    );

    const suspeito = await registrarArquivoDoCliente({
      workspaceId: "ws_1",
      oportunidadeId: "opp_1",
      clienteId: "cli_1",
      linhagemId: "lin_confirma_ruim",
      nomeOriginal: "fotos.png",
      extensaoDeclarada: "png",
      mimeType: "image/jpeg",
      bytes: Buffer.from("bytes"),
      caminhoInterno: "cli_1/x.jpg",
      destinatarioDeclarado: "atendimento-dioli",
      autor: "operador_1",
    });
    expect(suspeito.ok).toBe(false);
    if (suspeito.ok) throw new Error("deveria colocar em quarentena");
    // O registro foi criado mesmo bloqueado — buscamos o id gravado.
    const linhaSuspeita = await estado.prisma.arquivoDaCelula.findFirst({ where: { linhagemId: "lin_confirma_ruim" } });
    expect(linhaSuspeita).not.toBeNull();

    const confirmacaoBloqueada = await confirmarRecebimentoParaCliente({
      workspaceId: "ws_1",
      arquivoId: linhaSuspeita!.id,
      autor: "operador_1",
    });
    expect(confirmacaoBloqueada.ok).toBe(false);

    const limpo = await registrarArquivoDoCliente({
      workspaceId: "ws_1",
      oportunidadeId: "opp_1",
      clienteId: "cli_1",
      linhagemId: "lin_confirma_boa",
      nomeOriginal: "briefing.pdf",
      extensaoDeclarada: "pdf",
      mimeType: "application/pdf",
      bytes: Buffer.from("bytes limpos"),
      caminhoInterno: "cli_1/y.pdf",
      destinatarioDeclarado: "atendimento-dioli",
      autor: "operador_1",
    });
    expect(limpo.ok).toBe(true);
    if (!limpo.ok) throw new Error("deveria liberar");

    const confirmacaoOk = await confirmarRecebimentoParaCliente({
      workspaceId: "ws_1",
      arquivoId: limpo.arquivoId,
      autor: "operador_1",
    });
    expect(confirmacaoOk.ok).toBe(true);

    const eventos = await estado.prisma.eventoDoArquivoDaCelula.findMany({
      where: { arquivoId: limpo.arquivoId },
    });
    expect(eventos.some((e) => e.tipo === "confirmacao_ao_cliente")).toBe(true);
  });

  it("Dioli → cliente: envio com destinatário divergente é BLOQUEADO e registra 'envio_bloqueado'; com destinatário certo, ENVIA e marca 'enviado'", async () => {
    const { registrarArquivoParaCliente, aprovarParaEnvio, enviarAoCliente } = await import(
      "@/lib/agency/celula/ponte/armazem"
    );

    const registro = await registrarArquivoParaCliente({
      workspaceId: "ws_1",
      oportunidadeId: "opp_1",
      clienteId: "cli_1",
      linhagemId: "lin_entrega_1",
      nomeOriginal: "proposta.pdf",
      extensao: "pdf",
      mimeType: "application/pdf",
      bytes: Buffer.from("proposta final"),
      caminhoInterno: "cli_1/proposta.pdf",
      destinatarioDeclarado: "cliente-a@exemplo.com",
      autor: "designer_1",
    });
    expect(registro.ok).toBe(true);
    if (!registro.ok) throw new Error("deveria registrar");

    const aprovado = await aprovarParaEnvio({ workspaceId: "ws_1", arquivoId: registro.arquivoId, autor: "gerente_1" });
    expect(aprovado.ok).toBe(true);

    const bloqueado = await enviarAoCliente({
      workspaceId: "ws_1",
      arquivoId: registro.arquivoId,
      destinoPretendido: {
        oportunidadeId: "opp_1",
        clienteId: "cli_1",
        destinatarioDeclarado: "cliente-b-errado@exemplo.com",
      },
      autor: "operador_1",
    });
    expect(bloqueado.ok).toBe(false);
    if (bloqueado.ok) throw new Error("deveria bloquear");
    expect(bloqueado.abrirExcecao?.caso).toBe("destinatario_divergente");

    const eventosBloqueio = await estado.prisma.eventoDoArquivoDaCelula.findMany({
      where: { arquivoId: registro.arquivoId, tipo: "envio_bloqueado" },
    });
    expect(eventosBloqueio.length).toBeGreaterThan(0);

    const enviado = await enviarAoCliente({
      workspaceId: "ws_1",
      arquivoId: registro.arquivoId,
      destinoPretendido: {
        oportunidadeId: "opp_1",
        clienteId: "cli_1",
        destinatarioDeclarado: "cliente-a@exemplo.com",
      },
      autor: "operador_1",
    });
    expect(enviado.ok).toBe(true);

    const linhaFinal = await estado.prisma.arquivoDaCelula.findUnique({ where: { id: registro.arquivoId } });
    expect(linhaFinal?.estado).toBe("enviado");
  });
});
