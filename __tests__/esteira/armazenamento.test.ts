import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHash } from "node:crypto";

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

describe("S7 — dedupe não vaza mídia entre clientes do mesmo workspace", () => {
  // O achado (28/09/2026): quando `clientRequestId` está ausente (entrada de
  // material pela equipe, acervo do Instagram, vigia do Drive), a busca de
  // dedupe caía para `sha256 + workspaceId` sozinhos — sem checar `clientId` —
  // e devolvia o MediaAsset de OUTRO cliente do mesmo workspace. Uma agência
  // atende várias marcas sob um único workspace (`Client.workspaceId`), então
  // "mesmo workspace" não quer dizer "mesmo dono".
  //
  // As duas metades: o mock simula a única coisa que o Prisma de verdade faz
  // diferente de um `vi.fn()` solto — trata `undefined` como "não filtre" e
  // `null`/valor como igualdade exata — e guarda os registros já "gravados"
  // para a próxima chamada enxergar.
  const bancoFake =
    (registros: Array<Record<string, unknown>>) =>
    async ({ where }: { where: Record<string, unknown> }): Promise<Record<string, unknown> | null> => {
      return (
        registros.find((r) =>
          Object.entries(where).every(([campo, valor]) => valor === undefined || r[campo] === valor),
        ) ?? null
      );
    };

  const arquivoDoClienteA = {
    id: "med_cliente_a",
    workspaceId: "ws1",
    // O MESMO sha256 que `guardarArquivo` calcula para `base.bytes` — é o que
    // faz o mock representar de verdade "os dois clientes mandaram o mesmo
    // byte", em vez de um hash inventado que nunca bateria na vida real.
    sha256: createHash("sha256").update(base.bytes).digest("hex"),
    clientId: "cliente-A",
    clientRequestId: null,
    fileName: "orcamento-confidencial-cliente-a.pdf",
    mimeType: "video/mp4",
    sizeBytes: 37,
  };

  it("mesmo byte, DOIS CLIENTES diferentes do mesmo workspace, sem clientRequestId → dois assets (barra o caso plantado)", async () => {
    const registros: Array<Record<string, unknown>> = [arquivoDoClienteA];
    db.mediaAsset.findFirst.mockImplementation(bancoFake(registros));
    db.mediaAsset.create.mockImplementation(async (a: { data: Record<string, unknown> }) => {
      registros.push(a.data);
      return a.data;
    });

    // Cliente B manda o MESMO byte (mesmo sha256) que o Cliente A já mandou —
    // sem clientRequestId, igual à entrada de material e ao acervo.
    const r = await guardarArquivo({
      ...base,
      clientRequestId: undefined,
      clientId: "cliente-B",
      bytes: Buffer.from(base.bytes), // mesmo conteúdo → mesmo sha256
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // A prova: reaproveitar o asset do Cliente A devolveria fileName/id dele —
    // PII de um cliente vazando na resposta do upload de outro.
    expect(r.arquivo.fileName).not.toBe(arquivoDoClienteA.fileName);
    expect(r.arquivo.id).not.toBe(arquivoDoClienteA.id);
    expect(fs.writeFile, "tinha que gravar um asset NOVO, não reaproveitar o do outro cliente").toHaveBeenCalled();
    const criado = db.mediaAsset.create.mock.calls[0]![0].data as { clientId: string };
    expect(criado.clientId).toBe("cliente-B");
  });

  it("mesmo byte, MESMO cliente (clientId, sem clientRequestId) → reaproveita (não inventa problema no caso limpo)", async () => {
    const registros: Array<Record<string, unknown>> = [arquivoDoClienteA];
    db.mediaAsset.findFirst.mockImplementation(bancoFake(registros));
    db.mediaAsset.create.mockImplementation(async (a: { data: Record<string, unknown> }) => {
      registros.push(a.data);
      return a.data;
    });

    // O PRÓPRIO Cliente A reenvia o mesmo byte por outro caminho (ex.: a vigia
    // do Drive depois de um upload manual) — mesmo clientId, sem clientRequestId.
    const r = await guardarArquivo({
      ...base,
      clientRequestId: undefined,
      clientId: "cliente-A",
      bytes: Buffer.from(base.bytes),
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.arquivo.id).toBe(arquivoDoClienteA.id);
    expect(fs.writeFile, "mesmo dono, mesmo byte: não deveria gravar de novo").not.toHaveBeenCalled();
  });
});

describe("as travas que impedem o volume de derrubar o banco", () => {
  it("arquivo que MENTE o tipo é recusado — diz SVG e não é SVG", async () => {
    // `base.bytes` é texto comum. Se o MIME diz SVG e o conteúdo não tem raiz
    // <svg>, o tipo está mentindo e nada garante o resto do arquivo.
    const r = await guardarArquivo({ ...base, mimeType: "image/svg+xml", kind: "inbound" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toBe("svg_invalido");
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

describe("SVG do cliente ENTRA — e entra limpo", () => {
  // 09/08/2026: o CityJobs mandou os seis logos da marca em SVG e a agência
  // recusou todos. Recusar o melhor formato de logo que existe custava mais que
  // o risco que evitava. A porta abriu; a limpeza é o que a mantém segura.
  const logoDoCliente = (miolo: string) =>
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${miolo}</svg>`);

  const bytesGravados = () => (fs.writeFile.mock.calls[0]![1] as Buffer).toString("utf8");

  it("o logo do cliente é ACEITO — era o material que faltava", async () => {
    const r = await guardarArquivo({
      bytes: logoDoCliente('<path d="M10 10h80v80H10z"/>'),
      fileName: "05_city_jobs_retangular_principal.svg",
      mimeType: "image/svg+xml", workspaceId: "ws1", kind: "inbound",
    });
    expect(r.ok, "recusar o logo vetorial do cliente foi o defeito de 09/08").toBe(true);
    expect(bytesGravados()).toContain("<path");
  });

  it("aceita, mas o onload NÃO chega ao disco", async () => {
    const r = await guardarArquivo({
      bytes: logoDoCliente('<circle cx="50" cy="50" r="40" onload="alert(1)"/>'),
      fileName: "logo.svg", mimeType: "image/svg+xml", workspaceId: "ws1", kind: "inbound",
    });
    expect(r.ok).toBe(true);
    const gravado = bytesGravados();
    expect(gravado, "o manipulador de evento tinha que sair").not.toContain("onload");
    expect(gravado, "o desenho tinha que ficar").toContain("<circle");
  });

  it("o <script> some e o desenho fica", async () => {
    await guardarArquivo({
      bytes: logoDoCliente('<script>fetch("https://roubo.example")</script><path d="M0 0"/>'),
      fileName: "logo.svg", mimeType: "image/svg+xml", workspaceId: "ws1", kind: "inbound",
    });
    const gravado = bytesGravados();
    expect(gravado).not.toContain("<script");
    expect(gravado).not.toContain("roubo.example");
    expect(gravado).toContain("<path");
  });

  it("referência a servidor de terceiro sai, mas o xmlns FICA", async () => {
    // O xmlns é `http://www.w3.org/2000/svg` e não pode ser confundido com
    // busca de recurso: sem ele o arquivo deixa de ser um SVG válido.
    await guardarArquivo({
      bytes: logoDoCliente('<image href="https://terceiro.example/pixel.png"/>'),
      fileName: "logo.svg", mimeType: "image/svg+xml", workspaceId: "ws1", kind: "inbound",
    });
    const gravado = bytesGravados();
    expect(gravado).not.toContain("terceiro.example");
    expect(gravado, "sem xmlns não é SVG").toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it("DOCTYPE com entidade não passa — é por onde vem XXE", async () => {
    await guardarArquivo({
      bytes: Buffer.from(
        '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg"><text>&xxe;</text></svg>',
      ),
      fileName: "logo.svg", mimeType: "image/svg+xml", workspaceId: "ws1", kind: "inbound",
    });
    const gravado = bytesGravados();
    expect(gravado).not.toContain("DOCTYPE");
    expect(gravado).not.toContain("etc/passwd");
  });

  it("o que a CASA gera não passa pela limpeza — nós o produzimos", async () => {
    const nosso = '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://cdn.interno/x.png"/></svg>';
    await guardarArquivo({
      bytes: Buffer.from(nosso), fileName: "logo.svg",
      mimeType: "image/svg+xml", workspaceId: "ws1", kind: "deliverable",
    });
    expect(bytesGravados()).toBe(nosso);
  });

  it("o hash e o tamanho são do arquivo LIMPO, não do que chegou", async () => {
    // Se o sha256 fosse do original, o reenvio do mesmo arquivo não bateria com
    // o registro guardado e duplicaria bytes no volume — e o tamanho anotado no
    // banco não seria o do byte em disco, quebrando a conta da cota.
    const sujo = logoDoCliente('<path d="M0 0" onload="alert(1)"/>');
    await guardarArquivo({
      bytes: sujo, fileName: "logo.svg",
      mimeType: "image/svg+xml", workspaceId: "ws1", kind: "inbound",
    });
    const gravado = fs.writeFile.mock.calls[0]![1] as Buffer;
    const anotado = db.mediaAsset.create.mock.calls[0]![0].data as { sizeBytes: number };
    expect(anotado.sizeBytes).toBe(gravado.length);
    expect(anotado.sizeBytes, "o limpo é menor que o sujo").toBeLessThan(sujo.length);
  });
});

describe("sem kind informado, o SVG de fora é tratado como de fora", () => {
  it("o esquecimento do campo faz o arquivo ser LIMPO, nunca confiado", async () => {
    // Antes, esquecer o `kind` recusava o arquivo. Agora ele entra — então o
    // esquecimento precisa cair no caminho MAIS seguro, não no mais permissivo.
    await guardarArquivo({
      bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'),
      fileName: "x.svg", mimeType: "image/svg+xml", workspaceId: "ws1",
    });
    expect((fs.writeFile.mock.calls[0]![1] as Buffer).toString("utf8")).not.toContain("onload");
  });
});
