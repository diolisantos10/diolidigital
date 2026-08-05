// Os canvases de tráfego chegavam ao time com números fabricados.
//
// `budgetScenario` tinha default `"medium"` (R$ 4.000) e `run-auto-scope.ts`
// nunca passava cenário: TODO cliente recebia R$ 800 de fee, R$ 3.200 de mídia,
// ROAS "6x–12x", CAC e alcance "30K–80K" — tudo de tabela por segmento, sem
// nenhuma relação com o que o cliente informou, persistido como BrainArtifact.
// O filtro de preço do portal segurava o "R$"; o ROAS e o alcance passavam
// limpos, e o time da agência planejava em cima deles.

import { describe, it, expect } from "vitest";
import { generateTrafficCanvas } from "@/lib/dioli-brain/traffic-engine";
import { generateStrategyCanvas } from "@/lib/dioli-brain/strategy-engine";
import { MARCA_FAIXA_DE_REFERENCIA, projecoesComOrigemDeclarada } from "@/lib/dioli-brain/traffic-canvas";

function estrategia(segment = "restaurante") {
  return generateStrategyCanvas({
    businessName: "Cliente Teste", segment,
    objectives: ["vender mais"], services: ["tráfego pago"],
    rawContext: "negócio local", source: "request",
  });
}

describe("verba informada pelo cliente MANDA no plano", () => {
  it("o total mensal é a verba dele — não R$ 4.000 de tabela", () => {
    const c = generateTrafficCanvas({ strategyCanvas: estrategia(), verbaInformadaBRL: 1200, source: "request" });
    expect(c.budgetBasis).toBe("verba_informada");
    expect(c.budgetAllocation.totalMonthlyBRL).toBe(1200);
    expect(c.budgetAllocation.managementFeeBRL).toBe(240);
    expect(c.budgetAllocation.mediaBudgetBRL).toBe(960);
    // O furo antigo, explicitamente:
    expect(c.budgetAllocation.totalMonthlyBRL).not.toBe(4000);
    expect(c.budgetAllocation.managementFeeBRL).not.toBe(800);
    expect(c.budgetAllocation.mediaBudgetBRL).not.toBe(3200);
  });

  it("com verba real, os projetados NÃO levam ressalva — são estimativa dele", () => {
    const c = generateTrafficCanvas({ strategyCanvas: estrategia(), verbaInformadaBRL: 1200, source: "request" });
    expect(c.projectedROAS).not.toContain(MARCA_FAIXA_DE_REFERENCIA);
    expect(c.projectedCAC).not.toContain(MARCA_FAIXA_DE_REFERENCIA);
    expect(c.budgetAllocation.basisNote).toContain("informado pelo cliente");
  });

  it("verba fora das faixas da tabela continua sendo a verba dele", () => {
    const c = generateTrafficCanvas({ strategyCanvas: estrategia(), verbaInformadaBRL: 777, source: "request" });
    expect(c.budgetAllocation.totalMonthlyBRL).toBe(777);
  });
});

describe("sem verba informada, o número se declara faixa de referência", () => {
  const c = generateTrafficCanvas({ strategyCanvas: estrategia(), source: "request" });

  it("a ressalva viaja DENTRO da string — quem copia o número copia a ressalva", () => {
    expect(c.budgetBasis).toBe("faixa_de_referencia");
    for (const campo of [c.projectedROAS, c.projectedCAC, c.projectedMonthlyLeads]) {
      expect(campo).toContain(MARCA_FAIXA_DE_REFERENCIA);
    }
  });

  it("o ALCANCE — que o filtro de preço do portal nunca segurou — também vem marcado", () => {
    expect(c.audiences.length).toBeGreaterThan(0);
    for (const a of c.audiences) {
      expect(a.estimatedReach).toContain(MARCA_FAIXA_DE_REFERENCIA);
    }
  });

  it("o ROAS e o CPA de cada campanha também", () => {
    for (const camp of c.campaigns) {
      expect(camp.expectedROAS).toContain(MARCA_FAIXA_DE_REFERENCIA);
      expect(camp.expectedCPA).toContain(MARCA_FAIXA_DE_REFERENCIA);
    }
  });

  it("a tabela de budget diz, em uma linha, que ninguém informou verba", () => {
    expect(c.budgetAllocation.basis).toBe("faixa_de_referencia");
    expect(c.budgetAllocation.basisNote).toContain("não informou verba");
  });

  it("o traço cognitivo para de relatar 'Budget: medium' e passa a dizer a origem", () => {
    const certeza = c.cognitiveFlowTrace.find((s) => s.stepId === "certainty")!;
    expect(certeza.summary).toContain(MARCA_FAIXA_DE_REFERENCIA);
    expect(certeza.summary).not.toMatch(/Budget: medium$/);
  });
});

describe("o gate do tráfego confere a origem, e reprova quem não a declara", () => {
  it("canvas normal passa no projections_anchored", () => {
    const c = generateTrafficCanvas({ strategyCanvas: estrategia(), source: "request" });
    const item = c.qualityGateResult.items.find((i) => i.id === "projections_anchored")!;
    expect(item.status).toBe("PASS");
  });

  it("número de faixa SEM a ressalva é FAIL — é o estado antigo do sistema", () => {
    const c = generateTrafficCanvas({ strategyCanvas: estrategia(), source: "request" });
    // Reconstrói exatamente o que o motor produzia antes: faixa sem etiqueta.
    const antigo = { ...c, projectedROAS: "6x–12x (ticket alto)", projectedCAC: "R$ 30–80", projectedMonthlyLeads: "50–120 leads/mês" };
    expect(projecoesComOrigemDeclarada(antigo)).toBe(false);
  });
});
