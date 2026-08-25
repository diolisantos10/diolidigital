// A IDENTIDADE DO STORY — as travas que não precisam de banco.
//
// O caso de ponta a ponta (`story-instagram-v1-ponta-a-ponta.test.ts`) prova a
// corrente inteira contra banco, Chromium e portas reais. Ele é lento por
// natureza. Estas afirmações são de REGRA, e regra se afirma sem montar meia
// casa — é a mesma divisão que `design/medir-fundo.ts` e `trava-de-fundo.ts`
// fazem entre medir e decidir.

import { describe, it, expect } from "vitest";
import {
  INSTAGRAM_STORY_ESTATICO_V1, ID_STORY_V1, PRODUTOS_CANONICOS,
  produtoCanonico, dimensaoExigida, margemSeguraExigida,
} from "@/lib/agency/produtos/registro";
import { pediuStoryPorEscrito, pediuFeedPorEscrito } from "@/lib/agency/produtos/leitura-de-formato";
import {
  conferirArquivoDoProduto, mimePelosBytes, medidaEmUmaLinha,
} from "@/lib/agency/produtos/conferencia-do-arquivo";
import { SELF_SERVE_CATALOG } from "@/lib/agency/self-serve-catalog";
import { FORMATOS } from "@/lib/agency/design/molde";
import { MIME_DE_IMAGEM_ACEITO } from "@/lib/integrations/meta/formato-de-midia";

describe("o produto canônico é uma verdade só", () => {
  it("a dimensão exigida é DERIVADA do molde — nunca digitada", () => {
    // Se alguém mudar `FORMATOS.story`, a régua da conferência anda junto. É o
    // único jeito de uma régua não virar mentira seis meses depois.
    expect(dimensaoExigida(INSTAGRAM_STORY_ESTATICO_V1))
      .toEqual({ largura: FORMATOS.story.largura, altura: FORMATOS.story.altura });
    expect(dimensaoExigida(INSTAGRAM_STORY_ESTATICO_V1)).toEqual({ largura: 1080, altura: 1920 });
  });

  it("a margem segura também sai do molde, e é a do Story (não a do feed)", () => {
    const m = margemSeguraExigida(INSTAGRAM_STORY_ESTATICO_V1);
    expect(m).toEqual({
      topo: FORMATOS.story.margemTopo,
      base: FORMATOS.story.margemBase,
      lateral: FORMATOS.story.margemLateral,
    });
    // A zona morta do Story é MUITO maior que a do feed: é ali que moram o
    // avatar, a barra de progresso e a caixa de resposta.
    expect(m.topo).toBeGreaterThan(FORMATOS.feed.margemTopo);
    expect(m.base).toBeGreaterThan(FORMATOS.feed.margemBase);
  });

  it("o MIME exigido é o que a Meta aceita, e é JPEG", () => {
    expect(INSTAGRAM_STORY_ESTATICO_V1.mimeExigido).toBe(MIME_DE_IMAGEM_ACEITO);
    expect(INSTAGRAM_STORY_ESTATICO_V1.mimeExigido).toBe("image/jpeg");
  });

  it("o item de catálogo existe, é o de STORIES e NÃO é o de feed", () => {
    const item = SELF_SERVE_CATALOG.find((s) => s.id === INSTAGRAM_STORY_ESTATICO_V1.itemDeCatalogo);
    expect(item, "produto aponta item que não existe é preço que ninguém sabe cobrar").toBeTruthy();
    expect(INSTAGRAM_STORY_ESTATICO_V1.itemDeCatalogo).not.toBe("balcao-post-feed");
    // A quantidade do produto é a que o preço da tabela cobre — entregar menos
    // por um preço cheio é erro de dinheiro.
    expect(item!.deliverables.join(" ")).toMatch(/1080×1920/);
    expect(item!.deliverables.join(" "), "o catálogo promete JPEG, que é o que sai").toMatch(/JPEG/);
  });

  it("id desconhecido NÃO vira produto padrão", () => {
    expect(produtoCanonico("story")).toBeNull();
    expect(produtoCanonico(null)).toBeNull();
    expect(produtoCanonico("")).toBeNull();
    expect(produtoCanonico(ID_STORY_V1)).toBe(INSTAGRAM_STORY_ESTATICO_V1);
  });

  it("dois produtos nunca disputam o mesmo item de catálogo", () => {
    const itens = PRODUTOS_CANONICOS.map((p) => p.itemDeCatalogo);
    expect(new Set(itens).size).toBe(itens.length);
  });
});

describe("a triagem separa story de feed, e a carta não mistura mais", () => {
  it("existe UM atendimento que entrega o produto, e ele não cobra pelo item de feed", async () => {
    const { ATENDIMENTOS } = await import("@/lib/agency/esteira/triagem");
    const doStory = ATENDIMENTOS.filter((a) => a.produtoId === ID_STORY_V1);
    expect(doStory.length, "um produto, um atendimento").toBe(1);
    expect(doStory[0]!.itemDeCatalogo).toBe(INSTAGRAM_STORY_ESTATICO_V1.itemDeCatalogo);
    expect(doStory[0]!.entrega, "story é peça final, não insumo").toBe("peca");
  });

  it("a frase do atendimento de FEED não convida mais o modelo a mandar story para lá", async () => {
    const { ATENDIMENTOS } = await import("@/lib/agency/esteira/triagem");
    const feed = ATENDIMENTOS.find((a) => a.itemDeCatalogo === "balcao-post-feed")!;
    // Era exatamente esta palavra, nesta frase, que fazia o formato do cliente
    // morrer na triagem: o modelo lia "ou um story" e escolhia o id do feed.
    expect(feed.quando.toLowerCase()).not.toMatch(/story/);
    expect(feed.produtoId, "o feed ainda não foi migrado, e isso é declarado").toBeUndefined();
  });
});

describe("a leitura de formato acusa o fato, e só o fato", () => {
  it("acha a palavra do cliente em qualquer grafia usada no Brasil", () => {
    for (const t of ["quero um story novo", "4 STORIES pro insta", "uns storys", "manda o Storie"]) {
      expect(pediuStoryPorEscrito(t), t).toBe(true);
    }
  });

  it("NÃO dispara em palavra que só contém as letras — falso positivo para um pedido de verdade", () => {
    for (const t of ["quero storytelling na legenda", "conta a history da marca", "um diretório de fotos"]) {
      expect(pediuStoryPorEscrito(t), t).toBe(false);
    }
  });

  it("silêncio é silêncio: ausência da palavra NÃO afirma que não é story", () => {
    // A trava só age no caso POSITIVO, e é por isso que este `false` não pode
    // ser lido como "é outra coisa". Ausência de informação não é informação.
    expect(pediuStoryPorEscrito("quero uma arte vertical pro instagram")).toBe(false);
    expect(pediuStoryPorEscrito("")).toBe(false);
    expect(pediuStoryPorEscrito(null)).toBe(false);
  });

  it("distingue o pedido que cita os DOIS formatos", () => {
    const dois = "quero um post pro feed e um story";
    expect(pediuStoryPorEscrito(dois)).toBe(true);
    expect(pediuFeedPorEscrito(dois)).toBe(true);
    expect(pediuFeedPorEscrito("quero uns stories")).toBe(false);
  });
});

describe("a conferência do arquivo olha os BYTES, e falha fechada", () => {
  const produto = INSTAGRAM_STORY_ESTATICO_V1;

  async function jpeg(largura: number, altura: number): Promise<Buffer> {
    const { default: sharp } = await import("sharp");
    return sharp({ create: { width: largura, height: altura, channels: 3, background: { r: 30, g: 40, b: 50 } } })
      .jpeg().toBuffer();
  }

  it("aprova o JPEG 1080×1920 e devolve a medida, não só o veredito", async () => {
    const v = await conferirArquivoDoProduto({ bytes: await jpeg(1080, 1920), produto });
    expect(v.ok).toBe(true);
    expect(v.medida).toMatchObject({ mimeReal: "image/jpeg", largura: 1080, altura: 1920 });
    expect(medidaEmUmaLinha(v.medida)).toMatch(/1080×1920/);
  });

  it("reprova a peça de FEED entregue como story — a substituição silenciosa", async () => {
    const v = await conferirArquivoDoProduto({ bytes: await jpeg(1080, 1350), produto });
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.motivo).toMatch(/1080×1350/);
    expect(v.motivo).toMatch(/1080×1920/);
  });

  it("reprova a peça QUADRADA, com a frase do contrato de aceite", async () => {
    const v = await conferirArquivoDoProduto({ bytes: await jpeg(1080, 1080), produto });
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.motivo).toMatch(/quadrada/i);
  });

  it("reprova o PNG — a foto crua que já saiu daqui com cara de entrega", async () => {
    const { default: sharp } = await import("sharp");
    const png = await sharp({ create: { width: 1080, height: 1920, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .png().toBuffer();
    const v = await conferirArquivoDoProduto({ bytes: png, produto });
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.motivo).toMatch(/image\/png/);
  });

  it("reprova o arquivo VAZIO — `mediaUrl` preenchida com nada", async () => {
    const v = await conferirArquivoDoProduto({ bytes: Buffer.alloc(0), produto });
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.motivo).toMatch(/VAZIO/);
  });

  it("acusa a DIVERGÊNCIA entre o que o banco diz e o que os bytes são", async () => {
    const v = await conferirArquivoDoProduto({
      bytes: await jpeg(1080, 1920), produto, mimeDeclarado: "image/png",
    });
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.motivo).toMatch(/banco de mídia diz/);
  });

  it("o MIME sai do cabeçalho dos bytes, e formato desconhecido é RECUSA", () => {
    expect(mimePelosBytes(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe("image/jpeg");
    expect(mimePelosBytes(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    // Nem PDF, nem SVG, nem texto: o que a régua não sabe ler, ela não aprova.
    expect(mimePelosBytes(Buffer.from("%PDF-1.7"))).toBeNull();
    expect(mimePelosBytes(Buffer.from("<svg xmlns="))).toBeNull();
  });

  it("devolve TODOS os problemas de uma vez — relatório que para no primeiro erro custa três rodadas", async () => {
    const { default: sharp } = await import("sharp");
    const pngErrado = await sharp({ create: { width: 800, height: 800, channels: 3, background: { r: 1, g: 1, b: 1 } } })
      .png().toBuffer();
    const v = await conferirArquivoDoProduto({ bytes: pngErrado, produto });
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.problemas.length).toBeGreaterThanOrEqual(2);
  });
});
