// A COMPARAÇÃO COM ONTEM — e a única forma de ela mentir.
//
// Metade do valor do raio-x está em "37, contra 4 ontem". O risco embutido é
// o oposto: a noite em que uma varredura quebra, todos os achados dela somem, e
// um relatório mal escrito anuncia "8 problemas resolvidos" justamente quando
// ninguém olhou. É esse caso que o teste do meio trava.

import { describe, it, expect } from "vitest";
import { comparar } from "@/lib/raio-x/comparar";
import type { Achado, Coleta } from "@/lib/raio-x/tipos";

const achado = (chave: string): Achado => ({
  padrao: "porta-aberta",
  chave,
  titulo: chave,
  evidencia: "evidência",
  local: "app/api/x/route.ts",
  gravidade: "alto",
});

const coleta = (
  data: string,
  varreduras: Coleta["varreduras"]
): Coleta => ({ data, em: `${data}T04:00:00.000Z`, commit: "abc1234", metade: "codigo", varreduras });

describe("comparar", () => {
  it("separa novo, persistente e resolvido", () => {
    const ontem = coleta("2026-08-05", [
      { varredura: "porta-aberta", padrao: "porta-aberta", status: "rodou", achados: [achado("a"), achado("b")], medidas: { rotasSemGuarda: 5 } },
    ]);
    const hoje = coleta("2026-08-06", [
      { varredura: "porta-aberta", padrao: "porta-aberta", status: "rodou", achados: [achado("b"), achado("c")], medidas: { rotasSemGuarda: 3 } },
    ]);
    const k = comparar(hoje, ontem);
    expect(k.novos.map((a) => a.chave)).toEqual(["c"]);
    expect(k.persistentes.map((a) => a.chave)).toEqual(["b"]);
    expect(k.resolvidos.map((a) => a.chave)).toEqual(["a"]);
    expect(k.variacoes.rotasSemGuarda).toEqual({ ontem: 5, hoje: 3, delta: -2 });
  });

  it("varredura cega NÃO transforma achado em resolvido", () => {
    const ontem = coleta("2026-08-05", [
      { varredura: "porta-aberta", padrao: "porta-aberta", status: "rodou", achados: [achado("a")], medidas: {} },
    ]);
    const hoje = coleta("2026-08-06", [
      { varredura: "porta-aberta", padrao: "porta-aberta", status: "cega", motivo: "nenhuma rota lida", achados: [], medidas: {} },
    ]);
    const k = comparar(hoje, ontem);
    expect(k.resolvidos).toEqual([]);
    expect(k.desconhecidos.map((a) => a.chave)).toEqual(["a"]);
    expect(k.cegas).toEqual([{ varredura: "porta-aberta", motivo: "nenhuma rota lida" }]);
  });

  it("primeira noite: tudo é novo, nada é resolvido", () => {
    const hoje = coleta("2026-08-06", [
      { varredura: "porta-aberta", padrao: "porta-aberta", status: "rodou", achados: [achado("a")], medidas: { rotasSemGuarda: 1 } },
    ]);
    const k = comparar(hoje, null);
    expect(k.novos).toHaveLength(1);
    expect(k.resolvidos).toEqual([]);
    // Sem ontem não há variação — número sem base de comparação não vira delta.
    expect(k.variacoes).toEqual({});
  });

  it("medida de varredura cega não entra na comparação", () => {
    const ontem = coleta("2026-08-05", [
      { varredura: "porta-aberta", padrao: "porta-aberta", status: "rodou", achados: [], medidas: { rotasSemGuarda: 9 } },
    ]);
    const hoje = coleta("2026-08-06", [
      { varredura: "porta-aberta", padrao: "porta-aberta", status: "cega", motivo: "x", achados: [], medidas: { rotasSemGuarda: 0 } },
    ]);
    expect(comparar(hoje, ontem).variacoes).toEqual({});
  });
});
