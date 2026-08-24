// TESTE DE CLASSE — evento declarado sem verificação de chegada quebra o build.
//
// A declaração de eventos desta casa vive em `RESULTADO_POR_OBJETIVO` e
// `OBJETIVOS_DE_ALCANCE` (`lib/integrations/meta/ads-leitura.ts`). Até
// 24/08/2026 aquele mapa só respondia "qual destes serve como resultado?" —
// ninguém perguntava "qual destes faltou?".
//
// O risco de classe é o próximo objetivo acrescentado ao mapa: ele entraria no
// relatório e ficaria FORA da comparação, silenciosamente. Este teste percorre
// a declaração inteira e exige, de CADA objetivo declarado, as duas metades:
//
//   • com o evento chegando  → íntegro;
//   • com nada chegando      → incompleto, com o nome do evento na frase.
//
// Um objetivo novo sem plano derivável reprova aqui. Um plano que "aceita
// qualquer coisa" reprova na segunda metade.

import { describe, it, expect } from "vitest";
import { RESULTADO_POR_OBJETIVO, OBJETIVOS_DE_ALCANCE } from "@/lib/integrations/meta/ads-leitura";
import { planoDoObjetivo } from "@/lib/agency/medicao/plano-de-mensuracao";
import { conciliar, confiavel } from "@/lib/agency/medicao/conciliacao";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const OBJETIVOS_DECLARADOS = [...Object.keys(RESULTADO_POR_OBJETIVO), ...OBJETIVOS_DE_ALCANCE];

describe("todo objetivo declarado tem plano de mensuração", () => {
  it("nenhum objetivo do mapa fica sem lista de eventos esperados", () => {
    // Duas formas de ficar de fora, e as duas contam: plano ausente (`null`) e
    // plano presente com lista vazia. A segunda é a mais traiçoeira — ela tem
    // cara de declaração e não confere nada.
    const semPlano = OBJETIVOS_DECLARADOS.filter((o) => {
      const p = planoDoObjetivo("meta_ads", o);
      return !p || p.eventos.length === 0;
    });
    expect(semPlano, "objetivo declarado em ads-leitura.ts sem evento a conferir em plano-de-mensuracao.ts").toEqual([]);
  });

  it.each(OBJETIVOS_DECLARADOS)("%s: o evento chegando dá ÍNTEGRO, e nada chegando dá INCOMPLETO", (objetivo) => {
    const plano = planoDoObjetivo("meta_ads", objetivo)!;
    const esperados = plano.eventos.map((e) => e.nome);
    expect(esperados.length).toBeGreaterThan(0);

    const bom = conciliar({ plano, recebidos: [esperados[0]!] });
    expect(bom.estado, `${objetivo}: o evento declarado chegou e não foi reconhecido`).toBe("integro");
    expect(confiavel(bom)).toBe(true);

    // "impression" nunca é resultado de objetivo nenhum — serve de ruído.
    const ruim = conciliar({ plano, recebidos: ["impression"] });
    expect(ruim.estado, `${objetivo}: o evento declarado sumiu e ninguém reclamou`).toBe("incompleto");
    expect(ruim.faltando.length).toBeGreaterThan(0);
    expect(ruim.faltando[0]!.frase).toContain(esperados[0]!);
  });
});

describe("a comparação não fica na gaveta — o relatório a usa", () => {
  it("a rota de desempenho chama a medição de integridade", () => {
    const rota = readFileSync(join(process.cwd(), "app/api/meta/desempenho/route.ts"), "utf8");
    // A CHAMADA, não o import: apagar a chamada e deixar o import de pé é
    // exatamente a forma como uma comparação vai para a gaveta.
    expect(rota).toMatch(/integridade:\s*medirIntegridade\(\{[\s\S]*?desempenho/);
  });

  it("a tela trata integridade ausente como NÃO MEDIDO, e não como verde", () => {
    const tela = readFileSync(join(process.cwd(), "app/agency/desempenho-pago/page.tsx"), "utf8");
    expect(tela).toContain("NÃO MEDIDO");
    // A guarda precisa cobrir os TRÊS casos: campo ausente, comparação que não
    // rodou, e estado diferente de íntegro.
    expect(tela).toMatch(/!i\s*\|\|\s*!i\.comparacaoRodou\s*\|\|\s*i\.estado !== "integro"/);
  });
});
