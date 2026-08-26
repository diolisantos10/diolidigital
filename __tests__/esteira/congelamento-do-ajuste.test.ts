// O AJUSTE SÓ MEXE NO QUE O CLIENTE APONTOU — a regra do Diretor Geral.
//
// PROVA POR MUTAÇÃO (onde):
//   • trocar `congelarItens` por `{ itens: novos, segurados: [] }` em
//     `lib/agency/esteira/escopo-do-ajuste.ts` → reprova o bloco "o caso medido".
//   • apagar a linha `arte:` ou `legenda:` de `CAMPOS_DA_FACE` → reprova.
//   • tirar `["caption","Legenda"]` de `CAMPOS_DA_ENTREGA` → reprova o
//     roundtrip de `itensDaEntrega`.
//   • trocar `incerto` por `false` fixo → reprova "o pedido amplo".

import { describe, it, expect } from "vitest";
import { escopoDoAjuste, congelarItens, CAMPOS_DA_FACE } from "@/lib/agency/esteira/escopo-do-ajuste";
import { renderizarEntrega, itensDaEntrega } from "@/lib/agency/esteira/renderizar-entrega";

/** As palavras EXATAS do cliente na rodada paga de 27/08/2026. */
const PEDIDO_MEDIDO = "o fundo ficou escuro demais e o prato some. Refaça ESSA peça com mais luz e o prato em primeiro plano.";

describe("o caso medido: pedido visual não reescreve a legenda", () => {
  const escopo = escopoDoAjuste(PEDIDO_MEDIDO);

  it("lê o pedido como ARTE, e não como legenda", () => {
    expect(escopo.incerto).toBe(false);
    expect(escopo.faces).toContain("arte");
    expect(escopo.faces).not.toContain("legenda");
    expect(escopo.camposCongelados).toContain("caption");
    expect(escopo.camposCongelados).toContain("note");
    expect(escopo.camposCongelados).toContain("headline");
  });

  it("segura a legenda que o cliente não pediu — inclusive a que vazou de verdade", () => {
    const antes = [{
      headline: "O ambiente cheio",
      caption: "O ambiente cheio que faz você querer estar aqui também.",
      visual: "mesa cheia, luz baixa",
      pillar: "bastidores",
      format: "feed",
    }];
    const novo = [{
      headline: "Sexta é dia de estar aqui",
      caption: "Post destacando a atmosfera acolhedora da trattoria.",
      visual: "prato em primeiro plano, luz alta",
      pillar: "bastidores",
      format: "feed",
    }];
    const r = congelarItens(antes, novo, escopo);
    expect(r.itens[0]!.caption).toBe("O ambiente cheio que faz você querer estar aqui também.");
    expect(r.itens[0]!.headline).toBe("O ambiente cheio");
    // O que ele PEDIU muda:
    expect(r.itens[0]!.visual).toBe("prato em primeiro plano, luz alta");
    expect(r.segurados).toEqual(expect.arrayContaining(["1:caption", "1:headline"]));
  });
});

describe("o escopo lido das palavras do cliente", () => {
  it("pedido de legenda libera a legenda e congela a arte", () => {
    const e = escopoDoAjuste("a legenda ficou fraca, escreve outra");
    expect(e.faces).toContain("legenda");
    expect(e.camposLiberados).toContain("caption");
    expect(e.camposCongelados).toContain("visual");
  });

  it("pedido de título não muda o formato nem o pilar", () => {
    const e = escopoDoAjuste("troca o título dessa peça");
    expect(e.camposLiberados).toContain("headline");
    expect(e.camposCongelados).toEqual(expect.arrayContaining(["format", "pillar", "caption"]));
  });

  it("o pedido AMPLO não congela nada — e sai declarado", () => {
    const e = escopoDoAjuste("não gostei, refaz");
    expect(e.incerto).toBe(true);
    expect(e.camposCongelados).toEqual([]);
    const r = congelarItens([{ caption: "a" }], [{ caption: "b" }], e);
    expect(r.itens[0]!.caption).toBe("b");
    expect(r.segurados).toEqual([]);
  });

  it("comentário vazio é pedido amplo, nunca congelamento total", () => {
    expect(escopoDoAjuste("").incerto).toBe(true);
    expect(escopoDoAjuste(null).incerto).toBe(true);
  });
});

describe("as travas do congelamento", () => {
  const escopo = escopoDoAjuste("mais luz na imagem");

  it("contagem que não bate NÃO congela nada — texto da peça 2 na peça 3 é pior", () => {
    const r = congelarItens([{ caption: "a" }, { caption: "b" }], [{ caption: "z" }], escopo);
    expect(r.segurados).toEqual([]);
    expect(r.itens[0]!.caption).toBe("z");
  });

  it("campo que não existia antes não é inventado", () => {
    const r = congelarItens([{ visual: "x" }], [{ visual: "y", caption: "nova" }], escopo);
    expect(r.itens[0]!.caption).toBe("nova");
    expect(r.segurados).toEqual([]);
  });

  it("campo idêntico não conta como segurado", () => {
    const r = congelarItens([{ caption: "igual" }], [{ caption: "igual" }], escopo);
    expect(r.segurados).toEqual([]);
  });

  it("não muda o objeto que recebeu", () => {
    const novo = [{ caption: "nova" }];
    congelarItens([{ caption: "velha" }], novo, escopo);
    expect(novo[0]!.caption).toBe("nova");
  });
});

describe("itensDaEntrega — a leitura inversa do renderizador", () => {
  it("volta byte a byte no que importa ao congelamento", () => {
    const dados = {
      summary: "resumo",
      items: [
        { headline: "Terça tem prato especial", format: "feed", pillar: "cardápio", caption: "vem provar", visual: "prato de cima", cta: "reserve" },
        { headline: "Bastidores da massa", format: "carrossel", pillar: "bastidores", caption: "feita na hora", cenas: "1) massa · 2) mão" },
      ],
    };
    const lidos = itensDaEntrega(renderizarEntrega(dados));
    expect(lidos.length).toBe(2);
    expect(lidos[0]!.caption).toBe("vem provar");
    expect(lidos[0]!.headline).toBe("Terça tem prato especial");
    expect(lidos[1]!.cenas).toBe("1) massa · 2) mão");
    expect(lidos[1]!.pillar).toBe("bastidores");
  });

  it("texto sem cabeçalho nenhum não vira item adivinhado", () => {
    expect(itensDaEntrega("só um parágrafo solto")).toEqual([]);
    expect(itensDaEntrega(null)).toEqual([]);
  });

  it("todo campo congelável é um campo que a leitura inversa devolve", () => {
    const item: Record<string, string> = {};
    for (const campos of Object.values(CAMPOS_DA_FACE)) for (const c of campos) item[c] = `valor de ${c}`;
    const lido = itensDaEntrega(renderizarEntrega({ items: [item] }))[0]!;
    // `data`/`date`/`quando` não são campos do renderizador — o congelamento
    // da DATA age no calendário (ver `calendario-do-cliente.ts`), não aqui.
    for (const c of ["caption", "note", "headline", "visual", "direction", "palette", "cenas", "format", "pillar", "cta", "audience"]) {
      expect(lido[c]).toBe(`valor de ${c}`);
    }
  });
});
