// O CORPO DO ARQUIVO E O PACOTE DO OPERADOR — o caminho A da decisão D-0D1.
//
//   "O agente prepara — produz a peça, confere pela ponte, monta o pacote
//    endereçado, registra. O CEO clica para anexar no chat do 99Freelas."
//
// Até esta onda a ponte tinha checksum, versão, quarentena e destinatário
// conferido — e NENHUM ARQUIVO. `armazem.ts` declarava a lacuna no cabeçalho.
// Sem corpo gravado, não existe o que entregar ao CEO para anexar.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@/lib/generated/prisma/client";

const estado = vi.hoisted(() => ({ prisma: null as unknown as PrismaClient }));
vi.mock("@/lib/db/client", () => ({
  get prisma() {
    return estado.prisma;
  },
}));

let pasta = "";
let raizDaMidia = "";

beforeEach(async () => {
  pasta = await mkdtemp(path.join(tmpdir(), "corpo-"));
  // `raizDaMidia()` deriva de RAILWAY_VOLUME_MOUNT_PATH e acrescenta "media".
  // Apontar para uma pasta temporária isola o teste do volume real.
  process.env.RAILWAY_VOLUME_MOUNT_PATH = pasta;
  raizDaMidia = path.join(pasta, "media");
  const db = path.join(pasta, "c.db");
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: `file:${db}` },
    stdio: "pipe",
  });
  estado.prisma = new PrismaClient({ adapter: new PrismaLibSql({ url: `file:${db}` }) });
}, 120_000);

afterEach(async () => {
  await estado.prisma?.$disconnect().catch(() => {});
  await rm(pasta, { recursive: true, force: true });
  delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
});

const W = "ws-corpo";
const OP = "op-corpo";
const DESTINO = { oportunidadeId: OP, clienteId: "cli-1", projetoId: "proj-1" };

/** Bytes com os números mágicos reais — a varredura da ponte confere. */
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("conteudo jpeg de teste".repeat(4))]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("png de teste".repeat(4))]);
const PDF = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.from("conteudo pdf de teste".repeat(4))]);
const DOCX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("docx de teste".repeat(4))]);

async function entregar(nome: string, ext: string, mime: string, bytes: Buffer) {
  const { registrarArquivoParaCliente, aprovarParaEnvio } = await import("@/lib/agency/celula/ponte/armazem");
  const r = await registrarArquivoParaCliente({
    workspaceId: W,
    oportunidadeId: OP,
    clienteId: DESTINO.clienteId,
    projetoId: DESTINO.projetoId,
    linhagemId: `linhagem-${nome}`,
    nomeOriginal: nome,
    extensao: ext,
    mimeType: mime,
    bytes,
    destinatarioDeclarado: OP,
    autor: "design",
  });
  expect(r.ok, `registro de ${nome} falhou: ${r.ok ? "" : r.motivo}`).toBe(true);
  if (!r.ok) throw new Error("registro falhou");
  const a = await aprovarParaEnvio({ workspaceId: W, arquivoId: r.arquivoId, autor: "qualidade" });
  expect(a.ok).toBe(true);
  return r.arquivoId;
}

describe("🔴 PDF, IMAGEM E EDITÁVEL — os três formatos que o CEO nomeou", () => {
  it("os quatro tipos são gravados, e o pacote devolve os bytes EXATOS de cada um", async () => {
    const { montarPacoteDoOperador } = await import("@/lib/agency/celula/ponte/pacote-do-operador");
    const casos: [string, string, string, Buffer][] = [
      ["post-01.jpg", "jpg", "image/jpeg", JPEG],
      ["logo.png", "png", "image/png", PNG],
      ["proposta.pdf", "pdf", "application/pdf", PDF],
      ["roteiro.docx", "docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", DOCX],
    ];
    for (const [nome, ext, mime, bytes] of casos) {
      const id = await entregar(nome, ext, mime, bytes);
      const p = await montarPacoteDoOperador({ workspaceId: W, arquivoId: id, destinoPretendido: DESTINO }, estado.prisma);
      expect(p.ok, `pacote de ${nome}: ${p.ok ? "" : p.motivo}`).toBe(true);
      if (p.ok) {
        // Byte a byte. "Tamanho igual" não prova conteúdo igual.
        expect(p.pacote.bytes.equals(bytes), `${nome} voltou diferente do que entrou`).toBe(true);
        expect(p.pacote.nomeParaAnexar).toBe(nome);
        expect(p.pacote.mimeType).toBe(mime);
      }
    }
  }, 120_000);

  it("o corpo existe MESMO no disco — não é só registro", async () => {
    const id = await entregar("prova.pdf", "pdf", "application/pdf", PDF);
    const linha = await estado.prisma.arquivoDaCelula.findUniqueOrThrow({ where: { id } });
    const noDisco = await readFile(path.join(raizDaMidia, linha.caminhoInterno));
    expect(noDisco.equals(PDF)).toBe(true);
  }, 60_000);
});

describe("🔴 a integridade é conferida na LEITURA, não só na gravação", () => {
  it("corpo ADULTERADO no disco NÃO é entregue — mesmo com o registro intacto", async () => {
    const { montarPacoteDoOperador } = await import("@/lib/agency/celula/ponte/pacote-do-operador");
    const id = await entregar("post-02.jpg", "jpg", "image/jpeg", JPEG);
    const linha = await estado.prisma.arquivoDaCelula.findUniqueOrThrow({ where: { id } });

    // Alguém troca o arquivo no volume. O banco continua dizendo que está tudo certo.
    await writeFile(path.join(raizDaMidia, linha.caminhoInterno), Buffer.from("ARQUIVO TROCADO"));

    const p = await montarPacoteDoOperador({ workspaceId: W, arquivoId: id, destinoPretendido: DESTINO }, estado.prisma);
    expect(p.ok).toBe(false);
    if (!p.ok) {
      expect(p.regra).toBe("corpo_indisponivel");
      expect(p.motivo).toMatch(/não é o que foi registrado/i);
    }
  }, 60_000);

  it("corpo APAGADO do disco vira recusa explícita, não pacote vazio", async () => {
    const { montarPacoteDoOperador } = await import("@/lib/agency/celula/ponte/pacote-do-operador");
    const { apagarCorpo } = await import("@/lib/agency/celula/ponte/corpo");
    const id = await entregar("some.pdf", "pdf", "application/pdf", PDF);
    const linha = await estado.prisma.arquivoDaCelula.findUniqueOrThrow({ where: { id } });
    expect(await apagarCorpo(linha.caminhoInterno)).toBe(true);

    const p = await montarPacoteDoOperador({ workspaceId: W, arquivoId: id, destinoPretendido: DESTINO }, estado.prisma);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.motivo).toMatch(/NÃO está no disco/i);
  }, 60_000);
});

describe("🔴 as conferências do pacote", () => {
  it("destinatário divergente NÃO monta pacote — a trava nº 14 no último metro", async () => {
    const { montarPacoteDoOperador } = await import("@/lib/agency/celula/ponte/pacote-do-operador");
    const id = await entregar("post-03.jpg", "jpg", "image/jpeg", JPEG);
    const p = await montarPacoteDoOperador(
      { workspaceId: W, arquivoId: id, destinoPretendido: { ...DESTINO, clienteId: "cli-de-OUTRO" } },
      estado.prisma,
    );
    expect(p.ok).toBe(false);
    if (!p.ok) {
      expect(p.regra).toBe("destinatario_divergente");
      expect(p.motivo).toMatch(/clienteId/);
    }
  }, 60_000);

  it("arquivo NÃO aprovado pela Qualidade não vira pacote", async () => {
    const { registrarArquivoParaCliente } = await import("@/lib/agency/celula/ponte/armazem");
    const { montarPacoteDoOperador } = await import("@/lib/agency/celula/ponte/pacote-do-operador");
    const r = await registrarArquivoParaCliente({
      workspaceId: W, oportunidadeId: OP, clienteId: DESTINO.clienteId, projetoId: DESTINO.projetoId,
      linhagemId: "sem-aprovacao", nomeOriginal: "rascunho.jpg", extensao: "jpg",
      mimeType: "image/jpeg", bytes: JPEG, destinatarioDeclarado: OP, autor: "design",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = await montarPacoteDoOperador({ workspaceId: W, arquivoId: r.arquivoId, destinoPretendido: DESTINO }, estado.prisma);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.regra).toBe("nao_aprovado_para_envio");
  }, 60_000);

  it("arquivo de OUTRO workspace não é encontrado", async () => {
    const { montarPacoteDoOperador } = await import("@/lib/agency/celula/ponte/pacote-do-operador");
    const id = await entregar("post-04.jpg", "jpg", "image/jpeg", JPEG);
    const p = await montarPacoteDoOperador({ workspaceId: "outro-ws", arquivoId: id, destinoPretendido: DESTINO }, estado.prisma);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.regra).toBe("arquivo_nao_encontrado");
  }, 60_000);

  it("o pacote NÃO carrega o endereço interno — ordem do CEO", async () => {
    const { montarPacoteDoOperador } = await import("@/lib/agency/celula/ponte/pacote-do-operador");
    const id = await entregar("post-05.jpg", "jpg", "image/jpeg", JPEG);
    const p = await montarPacoteDoOperador({ workspaceId: W, arquivoId: id, destinoPretendido: DESTINO }, estado.prisma);
    expect(p.ok).toBe(true);
    if (p.ok) {
      const serializado = JSON.stringify({ ...p.pacote, bytes: undefined });
      expect(serializado).not.toMatch(/celula\//);
      expect(serializado).not.toMatch(/caminhoInterno/);
    }
  }, 60_000);
});

describe("🔴 DOWNLOAD: o arquivo do cliente também ganha corpo", () => {
  it("o que o cliente manda é gravado e volta idêntico", async () => {
    const { registrarArquivoDoCliente } = await import("@/lib/agency/celula/ponte/armazem");
    const { lerCorpo } = await import("@/lib/agency/celula/ponte/corpo");
    const r = await registrarArquivoDoCliente({
      workspaceId: W, oportunidadeId: OP, linhagemId: "logo-cliente",
      nomeOriginal: "logo-do-cliente.png", extensaoDeclarada: "png", mimeType: "image/png",
      bytes: PNG, destinatarioDeclarado: OP, autor: "operador",
    });
    expect(r.ok, `recebimento falhou: ${r.ok ? "" : r.motivo}`).toBe(true);
    if (!r.ok) return;
    const linha = await estado.prisma.arquivoDaCelula.findUniqueOrThrow({ where: { id: r.arquivoId } });
    const lido = await lerCorpo(linha.caminhoInterno, linha.sha256);
    expect(lido.ok).toBe(true);
    if (lido.ok) expect(lido.bytes.equals(PNG)).toBe(true);
  }, 60_000);
});

describe("o caminho interno só aceita o formato derivado", () => {
  it("travessia de diretório é RECUSADA na gravação e na leitura", async () => {
    const { gravarCorpo, lerCorpo } = await import("@/lib/agency/celula/ponte/corpo");
    for (const ruim of ["../../etc/passwd", "/etc/passwd", "celula/../x.jpg", "qualquer/coisa.jpg", "", "celula/ws/id.jpg/../x"]) {
      const g = await gravarCorpo(ruim, JPEG);
      expect(g.ok, `gravar ${JSON.stringify(ruim)}`).toBe(false);
      const l = await lerCorpo(ruim, "x");
      expect(l.ok, `ler ${JSON.stringify(ruim)}`).toBe(false);
    }
    // metade gêmea: o formato derivado passa
    const bom = await gravarCorpo("celula/ws-corpo/arqcel_abc123.jpg", JPEG);
    expect(bom.ok).toBe(true);
  }, 60_000);

  it("arquivo vazio não é arquivo", async () => {
    const { gravarCorpo } = await import("@/lib/agency/celula/ponte/corpo");
    const g = await gravarCorpo("celula/ws-corpo/arqcel_vazio.jpg", Buffer.alloc(0));
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.regra).toBe("sem_bytes");
  });
});
