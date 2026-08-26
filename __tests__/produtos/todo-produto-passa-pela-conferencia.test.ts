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
