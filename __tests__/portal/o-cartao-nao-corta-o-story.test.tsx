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
// ═══════════════════════════════════════════════════════════════════════════
// O SEGUNDO DEFEITO — O DESTE ARQUIVO (Auditor, 25/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// A primeira versão deste teste afirmava que a STRING `aspect-[ 9/16 ]` estava no
// HTML. **String no atributo não prova regra no CSS.** O Tailwind v4 varre o
// texto-fonte do repositório e só emite as regras que encontrou; a classe era
// montada por interpolação (`aspect-[${...}]`), que o scanner não lê, e as
// regras só existiam porque a string aparecia por acidente num comentário e
// **neste arquivo de teste**. O Auditor apagou os dois, recompilou, e todas as
// regras sumiram — com este teste continuando verde. A trava dependia de um
// comentário estar no disco.
//
// Agora a régua cai sobre a caixa: o CSS é COMPILADO com o mesmo plugin do
// build de produção e se confere que a regra existe nele. E — de propósito —
// **nenhuma classe utilitária aparece escrita por extenso neste arquivo**: elas
// chegam como VALOR, importadas do módulo de produção. Se elas estivessem aqui
// como texto, o scanner leria o próprio teste como fonte e fabricaria a regra
// que deveria estar faltando: uma régua que só pode dar verde.
//
// O que ele NÃO mede, dito com todas as letras: pixels na tela de um navegador
// real (nada aqui aplica o CSS ao HTML e mede a caixa resultante) e
// legibilidade tipográfica. Isso continua não medido.

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CarrosselDeTelas } from "@/components/portal/DetalheDaPeca";
import {
  proporcaoDaPeca,
  PROPORCOES_DECLARADAS,
  CLASSES_DECLARADAS,
} from "@/lib/agency/portal/proporcao-da-peca";
import { FORMATOS } from "@/lib/agency/design/molde";
import { classeTemRegraNoCss, cssCompiladoDoApp } from "../_helpers/css-compilado";

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
    expect(html).toContain(proporcaoDaPeca("story"));
    expect(proporcaoDaPeca("story"), "9/16 é 1080/1920").toContain("9/16");
    // E a imagem REAL está lá, apontando para o arquivo da peça.
    expect(html).toMatch(/<img/);
    expect(html).toContain(CAPA);
  });

  it("a peça de FEED também não é quadrada — 4/5, que é 1080×1350", () => {
    const html = cartao("feed");
    expect(html).not.toMatch(/aspect-square/);
    expect(html).toContain(proporcaoDaPeca("feed"));
    expect(proporcaoDaPeca("feed")).toContain("4/5");
  });

  it("formato desconhecido cai no VERTICAL, nunca no quadrado", () => {
    // Todas as peças que esta casa produz são verticais. O padrão conservador
    // é o que não corta nenhuma delas.
    const padrao = proporcaoDaPeca("feed");
    expect(proporcaoDaPeca("um-formato-que-nao-existe")).toBe(padrao);
    expect(proporcaoDaPeca(null)).toBe(padrao);
    expect(proporcaoDaPeca("")).toBe(padrao);
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

// ═══════════════════════════════════════════════════════════════════════════
// A RÉGUA SOBRE A CAIXA, NÃO SOBRE O ATRIBUTO
// ═══════════════════════════════════════════════════════════════════════════

describe("a proporção do cartão existe como REGRA no CSS que o cliente baixa", () => {
  it("TODA classe que a tabela de produção pode emitir tem regra no CSS compilado", async () => {
    // Inclui a do QUADRADO, que nunca existiu: nenhuma string dessas aparecia
    // em lugar nenhum do repositório, então a peça quadrada recebia uma classe
    // sem nenhum efeito. Aqui ela é cobrada como as outras.
    const classes = [...new Set(Object.values(CLASSES_DECLARADAS)), proporcaoDaPeca("desconhecido")];
    expect(classes.length, "a tabela não pode ficar vazia sem este teste notar").toBeGreaterThanOrEqual(3);
    for (const classe of classes) {
      expect(
        await classeTemRegraNoCss(classe),
        `a classe ${classe} vai para o HTML mas NÃO existe no CSS compilado — ` +
        "o cartão não muda de forma nenhuma. É classe decorativa, não trava.",
      ).toBe(true);
    }
  }, 60_000);

  it("CONTROLE: uma classe que ninguém usa NÃO tem regra — a régua sabe dizer não", async () => {
    // Sem este controle, um `includes` sempre-verdadeiro passaria despercebido
    // e o teste acima seria uma régua que só pode dar verde.
    const inventada = ["aspect", "[", "7", "/", "13", "]"].join("");
    expect(await classeTemRegraNoCss(inventada)).toBe(false);
  }, 60_000);

  it("CONTROLE: o CSS compilado é o do app de verdade, não uma folha vazia", async () => {
    const css = await cssCompiladoDoApp();
    expect(css.length, "o Tailwind rodou").toBeGreaterThan(10_000);
    // Um token semântico da casa, que só existe em `app/globals.css`.
    expect(css).toContain("--text-secondary");
  }, 60_000);
});
