import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  mediaAsset: { aggregate: vi.fn(), findFirst: vi.fn(), create: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));
const fs = vi.hoisted(() => ({ mkdir: vi.fn(), writeFile: vi.fn(), readFile: vi.fn(), stat: vi.fn(), unlink: vi.fn() }));
vi.mock("node:fs/promises", () => fs);
vi.mock("node:fs", () => ({ existsSync: () => false }));

import { guardarArquivo, MAX_BYTES_POR_ARQUIVO, MIMES_ACEITOS } from "@/lib/agency/media/armazenamento";

const base = {
  bytes: Buffer.from("conteúdo de teste do vídeo da cliente"),
  fileName: "corte-da-ana.mp4",
  mimeType: "video/mp4",
  workspaceId: "ws1",
  clientRequestId: "cr1",
};

beforeEach(() => {
  vi.clearAllMocks();
  db.mediaAsset.aggregate.mockResolvedValue({ _sum: { sizeBytes: 0 } });
  db.mediaAsset.findFirst.mockResolvedValue(null);
  db.mediaAsset.create.mockImplementation(async (a: { data: Record<string, unknown> }) => a.data);
  fs.mkdir.mockResolvedValue(undefined);
  fs.writeFile.mockResolvedValue(undefined);
});

describe("o cliente finalmente consegue mandar arquivo", () => {
  it("guarda o vídeo e devolve uma URL para ver depois", async () => {
    const r = await guardarArquivo(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.arquivo.url).toMatch(/^\/api\/media\//);
    expect(fs.writeFile).toHaveBeenCalled();
  });

  it("aceita foto, vídeo, PDF e documento — o que um cliente real manda", () => {
    for (const m of ["image/jpeg", "video/mp4", "video/quicktime", "application/pdf"]) {
      expect(MIMES_ACEITOS[m], `${m} deveria ser aceito`).toBeDefined();
    }
  });

  it("o caminho em disco NÃO usa o nome que o cliente enviou", async () => {
    // É isto que mata travessia de diretório por construção: nome do cliente
    // nunca entra no caminho.
    await guardarArquivo({ ...base, fileName: "../../../etc/passwd" });
    const caminho = fs.writeFile.mock.calls[0]![0] as string;
    expect(caminho).not.toContain("passwd");
    expect(caminho).not.toContain("..");
  });

  it("mesmo arquivo enviado duas vezes não duplica bytes no volume", async () => {
    // Caso comum: o cliente reenvia porque não teve certeza se foi.
    db.mediaAsset.findFirst.mockResolvedValue({ id: "med_x", fileName: "a.mp4", mimeType: "video/mp4", sizeBytes: 10 });
    const r = await guardarArquivo(base);
    expect(r.ok).toBe(true);
    expect(fs.writeFile, "não deve escrever de novo").not.toHaveBeenCalled();
  });
});

describe("as travas que impedem o volume de derrubar o banco", () => {
  it("SVG de UPLOAD é recusado — servido do nosso domínio, ele vira XSS", async () => {
    // A regra afrouxou em 02/08/2026 só para o que a CASA gera (logo vetorial).
    // O que chega de fora continua recusado na porta.
    const r = await guardarArquivo({ ...base, mimeType: "image/svg+xml", kind: "inbound" });
    expect(r.ok).toBe(false);
  });

  it("tipo desconhecido é recusado na porta, não sanitizado depois", async () => {
    const r = await guardarArquivo({ ...base, mimeType: "application/x-msdownload" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toBe("mime_recusado");
  });

  it("arquivo grande demais não passa", async () => {
    const r = await guardarArquivo({ ...base, bytes: Buffer.alloc(MAX_BYTES_POR_ARQUIVO + 1) });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toBe("grande_demais");
  });

  it("cota estourada BARRA ANTES de escrever — disco cheio mata o banco junto", async () => {
    db.mediaAsset.aggregate.mockResolvedValue({ _sum: { sizeBytes: 999 * 1024 * 1024 * 1024 } });
    const r = await guardarArquivo(base);
    expect(r.ok).toBe(false);
    expect(fs.writeFile, "conferir depois de escrever seria tarde").not.toHaveBeenCalled();
  });

  it("arquivo vazio não passa", async () => {
    const r = await guardarArquivo({ ...base, bytes: Buffer.alloc(0) });
    expect(r.ok).toBe(false);
  });
});

describe("o erro é escrito para a dona do salão, não para um programador", () => {
  it("explica em português o que fazer, sem código de erro", async () => {
    const r = await guardarArquivo({ ...base, bytes: Buffer.alloc(MAX_BYTES_POR_ARQUIVO + 1) });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toMatch(/MB/);
    expect(r.motivo).toMatch(/vídeo|menor|dividido/i);
  });
});

describe("SVG é a única exceção — e o que a torna segura é como SERVIMOS", () => {
  it("SVG que a casa gera é aceito — logo sem vetor não é logo", async () => {
    const r = await guardarArquivo({
      bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
      fileName: "logo.svg", mimeType: "image/svg+xml",
      workspaceId: "ws1", kind: "deliverable",
    });
    expect(r.ok).toBe(true);
  });

  it("SVG enviado DE FORA é recusado na porta — vem de máquina que não controlamos", async () => {
    const r = await guardarArquivo({
      bytes: Buffer.from('<svg onload="alert(1)"></svg>'),
      fileName: "malicioso.svg", mimeType: "image/svg+xml",
      workspaceId: "ws1", kind: "inbound",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/SVG/);
  });
});

describe("a permissão de SVG é default-deny", () => {
  it("sem kind informado, SVG é recusado — o esquecimento não pode abrir a porta", async () => {
    const r = await guardarArquivo({
      bytes: Buffer.from("<svg/>"), fileName: "x.svg", mimeType: "image/svg+xml", workspaceId: "ws1",
    });
    expect(r.ok).toBe(false);
  });
});
