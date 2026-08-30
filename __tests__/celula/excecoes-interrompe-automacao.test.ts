// TRAVA 2 — CAPTCHA, sessão expirada e bloqueio SEMPRE param a automação.
// As duas metades: barra o caso plantado, não barra o caso limpo. E o
// fail-closed: lista ilegível/indefinida, ou item ilegível dentro dela,
// também NÃO pode seguir.

import { describe, it, expect } from "vitest";
import { CASOS, CASOS_QUE_INTERROMPEM_A_AUTOMACAO } from "@/lib/agency/celula/excecoes/tipos";
import { podeSeguirAutomatizando } from "@/lib/agency/celula/excecoes/fila";

// Listado LITERALMENTE, na ordem da ficha C — não derivado do conjunto.
const OS_5_CASOS_QUE_INTERROMPEM = [
  "captcha",
  "sessao_expirada",
  "confirmacao_de_seguranca",
  "mensagem_bloqueada",
  "possivel_violacao_de_politica",
];

describe("CASOS_QUE_INTERROMPEM_A_AUTOMACAO — o conjunto fechado dos 5", () => {
  it("contém exatamente estes 5, nem mais nem menos", () => {
    expect([...CASOS_QUE_INTERROMPEM_A_AUTOMACAO].sort()).toEqual([...OS_5_CASOS_QUE_INTERROMPEM].sort());
    expect(CASOS_QUE_INTERROMPEM_A_AUTOMACAO.size).toBe(5);
  });

  it("os 9 casos restantes NÃO interrompem automação", () => {
    const restantes = CASOS.filter((c) => !CASOS_QUE_INTERROMPEM_A_AUTOMACAO.has(c));
    expect(restantes).toHaveLength(9);
    for (const caso of restantes) {
      expect(CASOS_QUE_INTERROMPEM_A_AUTOMACAO.has(caso)).toBe(false);
    }
  });
});

describe("podeSeguirAutomatizando — fail closed na lista", () => {
  it("lista undefined/null/não-array → NÃO pode seguir", () => {
    for (const listaInvalida of [undefined, null, "não é lista", 42, { casos: [] }]) {
      const v = podeSeguirAutomatizando(listaInvalida);
      expect(v.podeSeguir, `deveria bloquear para ${JSON.stringify(listaInvalida)}`).toBe(false);
    }
  });

  it("lista vazia → pode seguir (não há exceção nenhuma aberta)", () => {
    const v = podeSeguirAutomatizando([]);
    expect(v.podeSeguir).toBe(true);
  });

  it("item com caso ou estado ilegível dentro da lista → fail closed, NÃO pode seguir", () => {
    expect(podeSeguirAutomatizando([{ caso: "nao_existe", estado: "aberta" }]).podeSeguir).toBe(false);
    expect(podeSeguirAutomatizando([{ caso: "captcha", estado: "pendente_zzz" }]).podeSeguir).toBe(false);
    expect(podeSeguirAutomatizando([{ caso: null, estado: "aberta" }]).podeSeguir).toBe(false);
    expect(podeSeguirAutomatizando([{}]).podeSeguir).toBe(false);
  });
});

describe("metade suja: cada um dos 5 casos, aberto ou em_tratamento, BARRA a automação", () => {
  it.each(OS_5_CASOS_QUE_INTERROMPEM)("caso '%s' com estado 'aberta' bloqueia", (caso) => {
    const v = podeSeguirAutomatizando([{ caso, estado: "aberta" }]);
    expect(v.podeSeguir).toBe(false);
    if (!v.podeSeguir) {
      expect(v.casoBloqueador).toBe(caso);
      expect(v.motivo).toContain(caso);
    }
  });

  it.each(OS_5_CASOS_QUE_INTERROMPEM)("caso '%s' com estado 'em_tratamento' também bloqueia", (caso) => {
    const v = podeSeguirAutomatizando([{ caso, estado: "em_tratamento" }]);
    expect(v.podeSeguir).toBe(false);
  });

  it("um caso bloqueador no meio de vários outros ainda bloqueia (não é só o primeiro item)", () => {
    const v = podeSeguirAutomatizando([
      { caso: "ambiguidade_de_briefing", estado: "aberta" },
      { caso: "limite_atingido", estado: "aberta" },
      { caso: "captcha", estado: "aberta" },
    ]);
    expect(v.podeSeguir).toBe(false);
    if (!v.podeSeguir) expect(v.casoBloqueador).toBe("captcha");
  });
});

describe("metade limpa: caso bloqueador RESOLVIDO ou DESCARTADO não bloqueia; casos fora do conjunto não bloqueiam", () => {
  it.each(OS_5_CASOS_QUE_INTERROMPEM)("caso '%s' já 'resolvida' não bloqueia mais", (caso) => {
    const v = podeSeguirAutomatizando([{ caso, estado: "resolvida" }]);
    expect(v.podeSeguir).toBe(true);
  });

  it.each(OS_5_CASOS_QUE_INTERROMPEM)("caso '%s' 'descartada' não bloqueia", (caso) => {
    const v = podeSeguirAutomatizando([{ caso, estado: "descartada" }]);
    expect(v.podeSeguir).toBe(true);
  });

  it("só exceções de 'ambiguidade_de_briefing' abertas → a automação SEGUE (a fila não para tudo por qualquer coisa)", () => {
    const v = podeSeguirAutomatizando([
      { caso: "ambiguidade_de_briefing", estado: "aberta" },
      { caso: "ambiguidade_de_briefing", estado: "em_tratamento" },
    ]);
    expect(v.podeSeguir).toBe(true);
  });

  it("os 9 casos que não interrompem, todos abertos ao mesmo tempo, ainda deixam a automação seguir", () => {
    const naoInterrompem = CASOS.filter((c) => !CASOS_QUE_INTERROMPEM_A_AUTOMACAO.has(c));
    const lista = naoInterrompem.map((caso) => ({ caso, estado: "aberta" as const }));
    const v = podeSeguirAutomatizando(lista);
    expect(v.podeSeguir).toBe(true);
  });
});
