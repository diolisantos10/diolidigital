// TODO PRODUTO CANÔNICO PASSA PELA CONFERÊNCIA DO ARQUIVO — não só o Story.
//
// ═══ O QUE ESTE ARQUIVO GUARDA ═══════════════════════════════════════════════
//
// A conferência dos bytes (`conferirArquivoDoProduto`) tem UM chamador:
// `story-instagram-v1.ts`. Ler isso como "só o story é conferido" foi o
// diagnóstico que esta rodada checou e NÃO confirmou — o chamador único é a
// corrente ÚNICA, escrita contra `ProdutoCanonico` e não contra a palavra
// "story", e `producao-de-pedido.ts` a chama para QUALQUER produto declarado
// (`if (produto)`), nunca por id.
//
// O risco, então, não é o de hoje: é o de amanhã. Um produto novo no registro
// que a corrente não alcance, ou um desvio por id em vez de por presença de
// produto, reabre exatamente o buraco de 25/08 — cobrar por peça e entregar
// texto. Este arquivo é a catraca disso.
//
// ⚠️ O QUE ELE NÃO PROVA, e a distinção importa: que a peça SAI. Isso depende
// de gerar imagem, e as contas de imagem estão zeradas por decisão do CEO.
// A conferência de bytes de verdade, no ar, continua **não medida** — e é
// bloqueio de crédito, não defeito de código.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PRODUTOS_CANONICOS, dimensaoExigida } from "@/lib/agency/produtos/registro";
import { conferirArquivoDoProduto } from "@/lib/agency/produtos/conferencia-do-arquivo";
import { ATENDIMENTOS } from "@/lib/agency/esteira/triagem";

async function jpeg(largura: number, altura: number): Promise<Buffer> {
  const { default: sharp } = await import("sharp");
  return sharp({ create: { width: largura, height: altura, channels: 3, background: { r: 30, g: 40, b: 50 } } })
    .jpeg().toBuffer();
}

describe("a conferência vale para TODO produto do registro", () => {
  it("já são mais de um produto — a leitura de 'PRODUTOS_CANONICOS tem um item' está vencida", () => {
    expect(PRODUTOS_CANONICOS.length).toBeGreaterThan(1);
    expect(PRODUTOS_CANONICOS.map((p) => p.formatoDoPost)).toContain("feed");
  });

  for (const produto of PRODUTOS_CANONICOS) {
    it(`${produto.id}: aprova o arquivo na medida exigida e reprova o de outro formato`, async () => {
      const d = dimensaoExigida(produto);
      const bom = await conferirArquivoDoProduto({ bytes: await jpeg(d.largura, d.altura), produto });
      expect(bom.ok, `o produto ${produto.id} reprovou o próprio formato`).toBe(true);

      // A substituição silenciosa: entregar OUTRA dimensão. Usa a dimensão de
      // um irmão do registro — nunca um número digitado aqui, que divergiria
      // do molde no primeiro ajuste.
      const irmao = PRODUTOS_CANONICOS.find((p) => {
        const o = dimensaoExigida(p);
        return o.largura !== d.largura || o.altura !== d.altura;
      });
      if (!irmao) return; // um registro de um formato só não tem essa prova a dar
      const o = dimensaoExigida(irmao);
      const ruim = await conferirArquivoDoProduto({ bytes: await jpeg(o.largura, o.altura), produto });
      expect(ruim.ok, `${produto.id} aceitou um arquivo ${o.largura}×${o.altura}`).toBe(false);
    });
  }
});

describe("a corrente é a porta de TODO produto — não a do story", () => {
  it("`producao-de-pedido.ts` desvia por PRESENÇA de produto, nunca por id", () => {
    const s = readFileSync("lib/agency/esteira/producao-de-pedido.ts", "utf8");
    // MUTAÇÃO QUE PROVA: troque `if (produto)` por `if (produto?.id === ID_STORY_V1)`
    // e as duas linhas abaixo caem — que é o desvio por id voltando, com o
    // feed devolvido ao caminho de TEXTO (card sem arquivo, cobrado).
    expect(s).toContain("if (produto) {");
    expect(/produto\??\.id\s*===/.test(s), "o desvio voltou a ser por id de produto").toBe(false);
  });

  it("e nenhum atendimento que entrega PEÇA fica sem produtor — feed e carrossel inclusive", () => {
    const feed = ATENDIMENTOS.find((a) => a.id === "post-feed")!;
    const carrossel = ATENDIMENTOS.find((a) => a.id === "carrossel")!;
    // O feed PRODUZ: tem produto canônico, logo passa pela corrente e pela
    // conferência dos bytes.
    expect(feed.produtoId, "o feed voltou a não declarar produto").toBeTruthy();
    // O carrossel NÃO produz por esta corrente, e a venda está FECHADA com o
    // motivo escrito — nunca cobrada e entregue como texto. Ausência de
    // produtor declarada é dívida; silenciosa seria armadilha.
    expect(carrossel.produtoId).toBeUndefined();
    expect(carrossel.itemDeCatalogo, "carrossel sem produtor não pode ter preço").toBeNull();
    expect(carrossel.semProdutorProprio?.trim()).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A MEDIÇÃO PEDIDA NA FASE 1 (26/08/2026) — QUEM ESTAVA CERTO
// ═══════════════════════════════════════════════════════════════════════════
//
// Dois auditores discordaram: um disse que `PRODUTOS_CANONICOS` tinha UM item
// e que o feed estava de fora; o outro disse que já eram DOIS e que o feed
// passava. **Medido: o segundo estava certo** — e as duas asserções do topo
// deste arquivo são a medida.
//
// O que NENHUM dos dois tinha medido, e é o que este bloco fecha: a promessa
// escrita em `semProdutorProprio`. Cinco atendimentos entregam PEÇA, têm
// PREÇO na tabela e NÃO passam pela conferência dos bytes. Três deles se
// defendem por escrito — *"a venda já está fechada pela régua de capacidade"*.
//
// Prosa não fecha venda. Enquanto a frase não for conferida contra o
// MECANISMO, ela é uma declaração otimista de quem escreveu — e o dia em que
// alguém promover a capacidade sem reabrir a corrente é o dia em que a casa
// volta a cobrar por peça e entregar texto (o defeito de 25/08).

import { SELF_SERVE_CATALOG } from "@/lib/agency/self-serve-catalog";
import { conferirOferta } from "@/lib/agency/capacidade-de-producao";

describe("todo produto VENDIDO tem conferência — ou a venda está fechada por MECANISMO", () => {
  const pecasComPreco = ATENDIMENTOS.filter((a) => a.entrega === "peca" && a.itemDeCatalogo !== null);

  it("existe mais de um atendimento de peça com preço — a medição não é vazia", () => {
    expect(pecasComPreco.length).toBeGreaterThan(1);
  });

  for (const a of pecasComPreco) {
    it(`${a.id}: ou a corrente confere o arquivo, ou a rota de compra RECUSA o item`, () => {
      if (a.produtoId) {
        // Caminho 1 — a corrente visual produz e `conferirArquivoDoProduto`
        // mede os bytes. Já provado peça a peça no topo deste arquivo.
        expect(PRODUTOS_CANONICOS.map((p) => p.id)).toContain(a.produtoId);
        return;
      }

      // Caminho 2 — sem produto canônico, o arquivo NUNCA é conferido. Então a
      // única coisa que impede o cliente de pagar por ele é a régua de
      // capacidade. Ela tem de dizer NÃO, e a carta tem de dizer POR QUÊ.
      expect(a.semProdutorProprio?.trim(), `${a.id} entrega peça, cobra, e não diz quem produz`).toBeTruthy();

      const item = SELF_SERVE_CATALOG.find((s) => s.id === a.itemDeCatalogo);
      expect(item, `${a.id} aponta para o item "${a.itemDeCatalogo}", fora do catálogo`).toBeTruthy();

      const veredito = conferirOferta({
        requer: item!.requer,
        textos: [item!.label, item!.description ?? ""].filter(Boolean) as string[],
      });

      // A EXCEÇÃO DECLARADA, e ela é UMA: quem NÃO entrega arquivo de imagem.
      // Pacote do mês é uma AGENDA (o motor de ciclo cria os `SocialPost` e a
      // fila de arte confere cada um no lugar certo); campanha de tráfego é
      // campanha PAUSADA na conta do cliente, não arquivo. Conferir bytes de
      // um arquivo que não existe seria régua verde sobre o componente errado
      // — pior do que régua nenhuma.
      const naoEhArquivo = /motor de ciclo|integrador da Meta/.test(a.semProdutorProprio!);
      if (naoEhArquivo) {
        expect(veredito.vendavel, `${a.id} declara produtor próprio fora da corrente e a régua o barrou`).toBe(true);
        return;
      }

      // MUTAÇÃO QUE PROVA: em `capacidade-de-producao.ts`, dê um `ponto` a
      // `legenda-animada-em-video` (ou a `arquivo-pdf`, ou a
      // `logotipo-de-cliente`) sem ligar a corrente visual do produto. Esta
      // linha fica VERMELHA — que é a casa dizendo "você reabriu a venda de
      // algo que ninguém confere".
      expect(
        veredito.vendavel,
        `${a.id} entrega PEÇA, cobra pelo item "${a.itemDeCatalogo}", NÃO passa pela conferência ` +
          `do arquivo e a régua de capacidade o considera VENDÁVEL. A carta diz: "${a.semProdutorProprio}". ` +
          "Ou declare o produto canônico (e ganhe a conferência dos bytes), ou feche a venda de verdade.",
      ).toBe(false);
      expect(veredito.faltando.length).toBeGreaterThan(0);
    });
  }
});
