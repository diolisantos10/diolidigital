// O CARTÃO NÃO CORTA O STORY — a camada visual, medida SEM navegador.
//
// ═══════════════════════════════════════════════════════════════════════════
// O DEFEITO (25/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// `CarrosselDeTelas` renderizava toda peça com `aspect-square object-cover`.
// Um Story é 1080×1920: enfiado num quadrado com corte, ele perde ~44% da
// altura — e o que se perde é **o topo e a base**, exatamente onde o molde põe
// o TÍTULO e a ASSINATURA DA MARCA.
//
// O cliente era chamado a aprovar uma peça vendo uma versão que a casa nunca
// vai publicar. O contrato de aceite lista isso duas vezes na REPROVAÇÃO
// IMEDIATA: "formato quadrado" e "card sem corpo visual"/"em tamanho legível".
//
// ── POR QUE ESTE TESTE EXISTE, E POR QUE ELE RENDERIZA ─────────────────────
//
// A camada visual do portal não tinha régua: o navegador não navega neste
// ambiente, e a saída fácil seria declarar "não medido". Mas há um caminho
// honesto sem navegador — **renderizar o componente de verdade** com
// `react-dom/server` e medir o que ele PRODUZ.
//
// Não é leitura de código-fonte (`expect(FONTE).toContain(...)`), que é a
// prática que esta casa já classificou como fraca: aqui o componente MONTA, com
// as props reais, e o que se afirma é o HTML que sai dele.
//
// O que ele NÃO mede, dito com todas as letras: pixels na tela de um navegador
// real (o Tailwind não roda aqui, então a classe é afirmada, não a caixa
// resultante) e legibilidade tipográfica. Isso continua não medido.

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CarrosselDeTelas } from "@/components/portal/DetalheDaPeca";
import { proporcaoDaPeca, PROPORCOES_DECLARADAS } from "@/lib/agency/portal/proporcao-da-peca";
import { FORMATOS } from "@/lib/agency/design/molde";

const CAPA = "/api/media/med_exemplo";

function cartao(format: string): string {
  return renderToStaticMarkup(
    <CarrosselDeTelas telas={[CAPA]} token="tok" alt="Story" format={format} />,
  );
}

describe("o cartão mostra a peça na proporção em que ela foi desenhada", () => {
  it("STORY não é cortado em quadrado — 9/16, que é 1080×1920", () => {
    const html = cartao("story");
    expect(html, "quadrado corta topo e base: o título e a assinatura da marca")
      .not.toMatch(/aspect-square/);
    expect(html).toMatch(/aspect-\[9\/16\]/);
    // E a imagem REAL está lá, apontando para o arquivo da peça.
    expect(html).toMatch(/<img/);
    expect(html).toContain(CAPA);
  });

  it("a peça de FEED também não é quadrada — 4/5, que é 1080×1350", () => {
    const html = cartao("feed");
    expect(html).not.toMatch(/aspect-square/);
    expect(html).toMatch(/aspect-\[4\/5\]/);
  });

  it("formato desconhecido cai no VERTICAL, nunca no quadrado", () => {
    // Todas as peças que esta casa produz são verticais. O padrão conservador
    // é o que não corta nenhuma delas.
    expect(proporcaoDaPeca("um-formato-que-nao-existe")).toBe("aspect-[4/5]");
    expect(proporcaoDaPeca(null)).toBe("aspect-[4/5]");
    expect(proporcaoDaPeca("")).toBe("aspect-[4/5]");
  });

  it("a proporção do cartão CONCORDA com a que o rasterizador desenha", () => {
    // A tabela do portal é uma cópia pequena e pura (o molde arrasta CSS e
    // fontes em base64, que não podem ir para o navegador do cliente). Duas
    // cópias que um teste obriga a concordar não são duas verdades.
    const esperado = (l: number, a: number) => {
      const mdc = (x: number, y: number): number => (y === 0 ? x : mdc(y, x % y));
      const d = mdc(l, a);
      return `${l / d}/${a / d}`;
    };
    expect(PROPORCOES_DECLARADAS.story).toBe(esperado(FORMATOS.story.largura, FORMATOS.story.altura));
    expect(PROPORCOES_DECLARADAS.feed).toBe(esperado(FORMATOS.feed.largura, FORMATOS.feed.altura));
    expect(PROPORCOES_DECLARADAS.carousel).toBe(esperado(FORMATOS.carrossel.largura, FORMATOS.carrossel.altura));
    expect(PROPORCOES_DECLARADAS.quadrado).toBe(esperado(FORMATOS.quadrado.largura, FORMATOS.quadrado.altura));
  });

  it("a imagem ocupa a LARGURA INTEIRA do cartão — não é miniatura", () => {
    // "Tamanho legível" (critério E) não é medível em pixels sem navegador. O
    // que É medível: a peça não é renderizada como miniatura de lista.
    const html = cartao("story");
    expect(html).toMatch(/w-full/);
    expect(html, "a miniatura de 44px é da LISTA, não do cartão de decisão")
      .not.toMatch(/w-11 h-11/);
  });
});
