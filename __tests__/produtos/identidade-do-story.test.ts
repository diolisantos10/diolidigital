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
    // ── ESTA LINHA DIZIA `toBeUndefined()` (até 25/08/2026) ───────────────
    //
    // Com o comentário "o feed ainda não foi migrado, e isso é declarado". A
    // declaração era honesta e o estado era o DEFEITO: sem produto canônico, o
    // pedido de feed desviava para o caminho de texto e o cliente pagava R$ 79
    // por um card sem arquivo. Agora o feed tem produtor.
    const { ID_POST_FEED_V1 } = await import("@/lib/agency/produtos/registro");
    expect(feed.produtoId, "o feed produz — e é o produto que diz qual arquivo sai").toBe(ID_POST_FEED_V1);
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

describe("contraste — escolher não é conferir", () => {
  it("mede a razão da WCAG com a MESMA luminância que o molde usa para escolher", async () => {
    const { razaoDeContraste, CONTRASTE_MINIMO } = await import("@/lib/agency/design/contraste");
    // Os dois extremos, com o número exato da norma.
    expect(razaoDeContraste("#000000", "#FFFFFF")).toBe(21);
    expect(razaoDeContraste("#FFFFFF", "#FFFFFF")).toBe(1);
    expect(CONTRASTE_MINIMO).toBe(4.5);
  });

  it("PEGA a faixa em que `tintaSobre` escolhe a menos ruim e ninguém percebe", async () => {
    // O caso de livro: cinza médio. A heurística escolhe branco — e branco
    // sobre #808080 dá 3,95:1, abaixo do piso. Era exatamente isto que saía sem
    // régua nenhuma.
    const { conferirContraste } = await import("@/lib/agency/design/contraste");
    const { tintaSobre } = await import("@/lib/agency/design/molde");
    const m = conferirContraste("#808080", tintaSobre("#808080"))!;
    expect(m.tinta, "a heurística escolheu branco").toBe("#FFFFFF");
    expect(m.razao).toBeLessThan(4.5);
    expect(m.suficiente, "e o resultado dela NÃO serve — é o que ninguém conferia").toBe(false);
  });

  it("aprova a marca do piloto, com o número na mão", async () => {
    const { conferirContraste } = await import("@/lib/agency/design/contraste");
    const { tintaSobre } = await import("@/lib/agency/design/molde");
    const m = conferirContraste("#7A3B12", tintaSobre("#7A3B12"))!;
    expect(m.suficiente).toBe(true);
    expect(m.razao).toBeGreaterThanOrEqual(4.5);
  });

  it("cor inválida NÃO vira aprovação — sem medida não há veredito", async () => {
    const { conferirContraste, razaoDeContraste } = await import("@/lib/agency/design/contraste");
    expect(razaoDeContraste("nao-e-cor", "#FFFFFF")).toBeNull();
    expect(conferirContraste("nao-e-cor", "#FFFFFF")).toBeNull();
  });

  it("a frase da recusa traz o NÚMERO e o dono — placar sem número não é prova", async () => {
    const { conferirContraste, motivoDoContraste } = await import("@/lib/agency/design/contraste");
    const { tintaSobre } = await import("@/lib/agency/design/molde");
    const frase = motivoDoContraste(conferirContraste("#808080", tintaSobre("#808080"))!);
    expect(frase).toMatch(/3\.95:1/);
    expect(frase).toMatch(/4\.5:1/);
    expect(frase).toMatch(/Brand Hub/);
  });
});

describe("briefing mínimo — as três incondicionais, e as condicionais declaradas", () => {
  const completo = {
    oQueComunicar: "Quero 4 stories sobre o pão de fermentação natural. Quero que a pessoa venha encomendar na loja.",
    objetivo: "fazer o pessoal do bairro conhecer o pão",
  };

  it("cobra as TRÊS incondicionais do §4 — não uma", async () => {
    const { conferirBriefingMinimo } = await import("@/lib/agency/produtos/briefing-minimo");
    const v = conferirBriefingMinimo(INSTAGRAM_STORY_ESTATICO_V1, { oQueComunicar: "oi", objetivo: "" });
    expect(v.completo).toBe(false);
    expect(v.faltas).toContain("o-que-comunicar");
    expect(v.faltas).toContain("objetivo");
    expect(v.faltas).toContain("chamada-para-acao");
    expect(v.faltas.length, "as três, e a pergunta nomeia cada uma").toBe(3);
  });

  it("briefing completo passa — a régua não é freio de mão puxado", async () => {
    const { conferirBriefingMinimo } = await import("@/lib/agency/produtos/briefing-minimo");
    expect(conferirBriefingMinimo(INSTAGRAM_STORY_ESTATICO_V1, completo).completo).toBe(true);
  });

  it("cada falta tem pergunta PRÓPRIA — solicitação acionável é a que se sabe responder", async () => {
    const { conferirBriefingMinimo } = await import("@/lib/agency/produtos/briefing-minimo");
    const semCta = conferirBriefingMinimo(INSTAGRAM_STORY_ESTATICO_V1, {
      // Nem no "o que comunicar" NEM no "para quê" — a régua olha os dois
      // campos desde 25/08/2026 (ver o teste do achado 6.7 abaixo).
      oQueComunicar: "Quero 4 stories sobre o pão de fermentação natural da casa.",
      objetivo: "mostrar que a padaria existe no bairro",
    });
    expect(semCta.faltas).toEqual(["chamada-para-acao"]);
    expect(semCta.pergunta).toMatch(/O QUE VOCÊ QUER QUE A PESSOA FAÇA/);
    expect(semCta.pergunta, "com exemplos do que responder").toMatch(/WhatsApp|loja|link da bio/);

    const semObjetivo = conferirBriefingMinimo(INSTAGRAM_STORY_ESTATICO_V1, { ...completo, objetivo: "" });
    expect(semObjetivo.faltas).toEqual(["objetivo"]);
    expect(semObjetivo.pergunta).toMatch(/PARA QUÊ/);
    expect(semObjetivo.pergunta, "e NÃO cobra o que não falta").not.toMatch(/PESSOA FAÇA/);
  });

  it("a CHAMADA PARA AÇÃO vale escrita no OBJETIVO — não se cobra o que já foi dito", async () => {
    // ── ACHADO 6.7 DO AUDITOR (25/08/2026) ────────────────────────────────
    //
    // A régua só procurava a chamada em `oQueComunicar`. Mas "para quê" e "o
    // que a pessoa deve fazer" são a mesma pergunta na cabeça de quem escreve:
    // o cliente que respondia "quero que chamem no WhatsApp" no campo de
    // OBJETIVO era barrado e cobrado de novo pela informação que acabara de
    // dar. O campo onde a frase caiu é detalhe de formulário.
    const { conferirBriefingMinimo } = await import("@/lib/agency/produtos/briefing-minimo");
    const ctaNoObjetivo = conferirBriefingMinimo(INSTAGRAM_STORY_ESTATICO_V1, {
      oQueComunicar: "Quero 4 stories sobre o pão de fermentação natural da casa.",
      objetivo: "quero que as pessoas chamem no WhatsApp para encomendar",
    });
    expect(
      ctaNoObjetivo.faltas,
      "a ação está escrita, no campo ao lado — cobrar de novo é fazer o cliente se repetir",
    ).not.toContain("chamada-para-acao");
    expect(ctaNoObjetivo.completo).toBe(true);

    // E a régua não virou passe-livre: sem a ação em NENHUM dos dois campos,
    // ela continua barrando.
    const semAcaoEmLugarNenhum = conferirBriefingMinimo(INSTAGRAM_STORY_ESTATICO_V1, {
      oQueComunicar: "Quero 4 stories sobre o pão de fermentação natural da casa.",
      objetivo: "aumentar a presença digital da padaria",
    });
    expect(semAcaoEmLugarNenhum.faltas).toContain("chamada-para-acao");
  });

  it("os itens CONDICIONAIS do plano ficam DECLARADOS, com quem cuida deles", async () => {
    // O plano escreveu "quando houver" e "quando indispensável". Transformar
    // condicional em obrigatório barraria o pedido correto de quem não tem
    // oferta nem precisa de material. A decisão fica legível de fora — em vez
    // de ser reencontrada como buraco na próxima auditoria.
    const { conferirBriefingMinimo } = await import("@/lib/agency/produtos/briefing-minimo");
    const v = conferirBriefingMinimo(INSTAGRAM_STORY_ESTATICO_V1, completo);
    expect(v.condicionaisDeclarados.length).toBe(2);
    expect(v.condicionaisDeclarados.join(" ")).toMatch(/piso de verdade/);
    expect(v.condicionaisDeclarados.join(" ")).toMatch(/MaterialRequest/);
  });

  it("produto sem exigência declarada passa direto — nenhum outro produto muda", async () => {
    const { conferirBriefingMinimo } = await import("@/lib/agency/produtos/briefing-minimo");
    expect(conferirBriefingMinimo(null, { oQueComunicar: "", objetivo: "" }).completo).toBe(true);
  });
});
