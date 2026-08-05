// O NÚMERO DO P0 DA CASA, DERIVADO DO CÓDIGO.
//
// O P0 é citado em prosa em pelo menos cinco lugares (CLAUDE.md,
// docs/pendencias.md, docs/agents/qualidade/vitrine.md, docs/onboarding-pm.md,
// o cabeçalho de lib/agency/execution/piso-de-verdade.ts). Número escrito à mão
// em documento não é derivado do código e envelhece errado — e uma lista P0 com
// item fantasma nasce mentindo, exatamente como o gate que ela denuncia.
//
// Este teste é a fonte: se alguém tornar uma checagem executável (que é o
// objetivo) ou acrescentar uma nova, ele quebra e força a atualização da prosa
// junto. É a única forma de o número parar de ser folclore.

import { describe, it, expect } from "vitest";
import { ALL_QUALITY_GATES, GLOBAL_QUALITY_GATE, getQualityGateForDepartment } from "@/lib/dioli-brain/quality-gates";

const TODAS = Object.values(ALL_QUALITY_GATES).flat();

describe("o número do P0 — conferido em 05/08/2026", () => {
  it("são 31 checagens declaradas, 3 executáveis, 28 não executáveis", () => {
    expect(TODAS.length).toBe(31);
    expect(TODAS.filter((c) => c.autoCheckable).length).toBe(3);
    expect(TODAS.filter((c) => !c.autoCheckable).length).toBe(28);
  });

  it("as 3 executáveis são estas — nomeadas, para ninguém contar de memória", () => {
    expect(TODAS.filter((c) => c.autoCheckable).map((c) => c.id).sort()).toEqual(
      ["approval_need_checked", "pm_deadline", "pm_task_owner"],
    );
  });

  it("nenhum id repetido — repetição inflaria a contagem sem inflar a proteção", () => {
    const ids = TODAS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("as 5 bloqueantes globais que chegam a TODO departamento seguem não executáveis", () => {
    // É o coração do P0: "sem alucinação", "respeita a marca", "corresponde ao
    // briefing", "valor claro" e "riscos verificados" são exatamente as falhas
    // que chegam no cliente. Enquanto este teste passar, o P0 está aberto.
    const bloqueantesNaoExecutaveis = GLOBAL_QUALITY_GATE.filter((c) => c.blocking && !c.autoCheckable);
    expect(bloqueantesNaoExecutaveis.map((c) => c.id)).toEqual(
      ["no_hallucination", "respects_brand", "matches_briefing", "clear_client_value", "risk_checked"],
    );
  });

  it("todo departamento carrega as 7 globais + as suas", () => {
    for (const [dept, proprias] of Object.entries(ALL_QUALITY_GATES)) {
      if (dept === "global") continue;
      expect(getQualityGateForDepartment(dept).length, dept).toBe(GLOBAL_QUALITY_GATE.length + proprias.length);
    }
  });
});
