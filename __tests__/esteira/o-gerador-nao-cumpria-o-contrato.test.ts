// O GERADOR NÃO CUMPRIA O CONTRATO — e o portão estava certo.
//
// ═══ O CASO, MEDIDO EM PRODUÇÃO (26/08/2026) ═════════════════════════════════
//
// O cliente pedia ajuste. A refação passou a rodar sobre a peça CERTA (a mira
// foi consertada na volta anterior) — e morria logo depois, em
// `fora_do_contrato`: as peças voltavam faltando, **sem `format` e sem
// `pillar`**.
//
// A tentação era afrouxar o portão. Seria o conserto errado, e caro:
// `contratoDasLegendas` cobra `pillar` porque `pilares-bloqueados.ts` existe
// desde 07/08/2026, quando TRÊS peças saíram com salário inventado dentro dos
// pixels; e cobra `format` porque é ele que decide como a arte é gerada e onde
// a peça é publicada. Portão que aprova por omissão é pior que portão nenhum.
//
// A causa era a outra ponta: **o esquema JSON que o prompt pedia ao modelo não
// citava `format` nem `pillar`.** A casa exigia na saída o que nunca pediu na
// entrada — o mesmo defeito de `cenas` de 25/08, na mesma constante.
//
// Este arquivo prova o ELO: uma peça montada com EXATAMENTE os campos que o
// esquema pede cumpre o contrato de saída, sem nenhum campo inventado por quem
// escreveu o teste.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ESQUEMA_DA_ENTREGA, quantosItens, renderizarEntrega } from "@/lib/agency/esteira/renderizar-entrega";
import { TODOS_OS_ESPECIALISTAS, conferirContrato } from "@/lib/agency/execution/especialistas";

/** Os campos de item que o esquema pede ao modelo, lidos DO PRÓPRIO esquema.
 *  Nada aqui é digitado à mão: se um campo sair do esquema, ele sai daqui. */
function camposPedidosAoModelo(): string[] {
  const bloco = ESQUEMA_DA_ENTREGA.slice(ESQUEMA_DA_ENTREGA.indexOf('"items"'));
  return [...bloco.matchAll(/"([a-z]+)":/g)].map((m) => m[1]!).filter((k) => k !== "items");
}

/** Uma peça montada SÓ com o que o esquema pede — o melhor caso possível para
 *  um modelo perfeitamente obediente. */
function pecaObediente(i: number): Record<string, string> {
  const item: Record<string, string> = {};
  for (const campo of camposPedidosAoModelo()) {
    item[campo] =
      // A mistura é parte do contrato: lote inteiro no mesmo formato é
      // reprovado, e com razão. Rotaciona os três que a casa produz.
      campo === "format" ? (["feed", "carrossel", "story"][i % 3] as string)
      : campo === "pillar" ? "Apetite"
      // Telas de conteúdos DIFERENTES de propósito: o contrato também barra
      // duas telas que descrevem a mesma cena (duas imagens pagas iguais).
      : campo === "cenas"
        ? `1) [gancho] a fila na calçada do domingo ${i} · 2) [tensao] o forno vazio das quintas ${i} · 3) [acao] reserva pelo link da bio ${i}`
      : `${campo} da peça ${i + 1}`;
  }
  return item;
}

const COPY = TODOS_OS_ESPECIALISTAS.find((e) => e.id === "social-copy")!;

describe("o modelo obediente ao esquema CUMPRE o contrato de saída", () => {
  it("o esquema pede `format` e `pillar` — os dois que o contrato cobra item a item", () => {
    // MUTAÇÃO QUE PROVA: tire `"format"` (ou `"pillar"`) de
    // `ESQUEMA_DA_ENTREGA` e esta linha cai. É o estado exato de produção.
    expect(camposPedidosAoModelo()).toContain("format");
    expect(camposPedidosAoModelo()).toContain("pillar");
  });

  it("6 peças montadas só com os campos do esquema passam por `contratoDasLegendas`", () => {
    const dados = { title: "Legendas Prontas", summary: "resumo", items: [0, 1, 2, 3, 4, 5].map(pecaObediente) };
    const r = conferirContrato(COPY, dados);
    // MUTAÇÃO QUE PROVA: tire `"pillar"` do esquema e `pecaObediente` deixa de
    // montá-lo — o contrato passa a acusar `6 peça(s) sem o campo "pillar"`,
    // que é a frase que a produção leu, palavra por palavra.
    expect(r.violacoes).toEqual([]);
    expect(r.cumpriu).toBe(true);
  });

  it("e o portão CONTINUA com dente: sem os dois campos, ele reprova", () => {
    const semOsDois = [0, 1, 2, 3, 4, 5].map((i) => {
      const { format: _f, pillar: _p, ...resto } = pecaObediente(i);
      return resto;
    });
    const r = conferirContrato(COPY, { title: "t", summary: "s", items: semOsDois });
    expect(r.cumpriu).toBe(false);
    expect(r.violacoes.join(" ")).toContain('sem o campo "format"');
    expect(r.violacoes.join(" ")).toContain('sem o campo "pillar"');
  });
});

describe("a refação diz ao modelo QUANTOS itens devolver", () => {
  it("`quantosItens` é a leitura inversa do renderizador — não uma segunda régua", () => {
    const md = renderizarEntrega({ summary: "s", items: [0, 1, 2].map(pecaObediente) });
    expect(quantosItens(md)).toBe(3);
    // Ausência de cabeçalho é "não sei", nunca um palpite de quantidade.
    expect(quantosItens("texto solto sem item nenhum")).toBe(0);
    expect(quantosItens(null)).toBe(0);
  });

  it("o prompt da refação carrega o número — e não a régua de outro arquivo", () => {
    // MUTAÇÃO QUE PROVA: apague o bloco `quantosItens(entrega.content)` do
    // prompt de `refacao.ts` e esta linha cai. Era o caso medido: "muda só o
    // gancho do primeiro" e o modelo devolvia UM item.
    const s = readFileSync("lib/agency/esteira/refacao.ts", "utf8");
    expect(s).toContain("quantosItens(entrega.content)");
    expect(s).toContain("Devolva EXATAMENTE");
  });
});
