// O GERENTE GERAL DESPACHAVA PARA SI MESMO — 8ª volta, 26/08/2026.
//
// Medido em produção: `gerente_geral_recusou_demanda` — "O Gerente Geral não
// despacha para si mesmo — demanda que volta para o topo não anda."
//
// A trava está certa e continua de pé. Quem errava era a ORIGEM: no manifesto,
// o gerente do departamento `project-management` é o próprio `gerente-geral`.
// Toda tarefa nascida com esse departamento produzia, por aritmética da cadeia,
// um despacho do GG para ele mesmo — e uma recusa. Não era borda: era sempre.

import { describe, it, expect } from "vitest";
import { validatePMOrchestratorOutput, buildPMOrchestratorMessages } from "@/lib/agency/intelligence/openai-schemas";
import { proposeProjectRuleBased } from "@/lib/dioli-brain/pm-orchestrator";
import { despacharPlanoPeloGerenteGeral } from "@/lib/agency/gerencia/entrada-da-demanda";
import { gerenteDe, GERENTE_GERAL } from "@/lib/agency/gerencia/cadeia";

import type { ClientKnowledgeSnapshot } from "@/lib/dioli-brain/client-snapshot";

const CTX = { aceiteComercial: true, correlationId: "teste" };

/** O snapshot mínimo que o tipo exige. `tsc` barrou este teste antes do commit
 *  por causa de `brandBrainComplete` — a régua da casa pegando de novo o meu
 *  próprio teste, e é para isso que ela existe. */
const snapshot = (o: Partial<ClientKnowledgeSnapshot>): ClientKnowledgeSnapshot => ({
  clientRequestId: "r1", businessName: "N", segment: "", services: [], objectives: [],
  rawContext: "", missingFields: [], brandBrainComplete: false, ...o,
});

describe("o fato que produziu a recusa", () => {
  it("o gerente de project-management É o Gerente Geral — a colisão é estrutural", () => {
    expect(gerenteDe("project-management")).toBe(GERENTE_GERAL);
  });

  it("a trava continua de pé: uma tarefa de project-management AINDA é recusada", () => {
    const plano = despacharPlanoPeloGerenteGeral(
      [{ title: "Coordenar o projeto", description: null, department: "project-management", estimatedDays: 2 }],
      CTX,
    );
    expect(plano.despachadas).toHaveLength(0);
    expect(plano.recusadas[0].motivo).toContain("não despacha para si mesmo");
  });
});

describe("a origem parou de chamar errado", () => {
  it("a tarefa do Brand Brain incompleto vai para BRANDING e é DESPACHADA", () => {
    const proposta = proposeProjectRuleBased(snapshot({
      businessName: "GRAO DO BECO NOME TESTE", segment: "cafeteria",
      services: ["social media"], objectives: ["vender mais"],
      missingFields: ["tom de voz", "paleta", "público", "posicionamento", "tagline"],
    }));

    const alinhamento = proposta.tasks.find((t) => t.title.includes("Brand Brain"));
    expect(alinhamento?.department).toBe("branding");

    const plano = despacharPlanoPeloGerenteGeral(
      proposta.tasks.map((t) => ({ title: t.title, description: t.description ?? null, department: t.department, estimatedDays: t.estimatedDays })),
      CTX,
    );
    // O plano inteiro passa: nenhuma recusa, e nenhuma delas do próprio GG.
    expect(plano.recusadas).toEqual([]);
    expect(plano.despachadas.map((d) => d.gerenteId)).not.toContain(GERENTE_GERAL);
  });

  it("NENHUMA tarefa da proposta rule-based nasce em project-management", () => {
    for (const servicos of [["social media"], ["tráfego pago"], ["design"], []]) {
      const p = proposeProjectRuleBased(snapshot({ services: servicos, missingFields: ["tom de voz"] }));
      expect(p.tasks.map((t) => t.department), servicos.join()).not.toContain("project-management");
    }
  });

  it("a porta que oferecia o departamento ao modelo deixou de oferecê-lo", () => {
    const { system } = buildPMOrchestratorMessages({
      businessName: "N", segment: "", services: [], objectives: [], rawContext: "",
    });
    expect(system).toContain("branding");
    expect(system).toMatch(/NUNCA use "project-management"/);
  });

  it("e o validador RECUSA o plano que insistir — prompt é aviso, código é trava", () => {
    const cru = {
      name: "P", goal: "G", stage: "briefing",
      tasks: [{ title: "Coordenar", description: "d", department: "project-management", priority: "high", estimatedDays: 2 }],
    };
    expect(validatePMOrchestratorOutput(cru)).toBeNull();

    const bom = { ...cru, tasks: [{ ...cru.tasks[0], department: "branding" }] };
    expect(validatePMOrchestratorOutput(bom)?.tasks[0].department).toBe("branding");
  });
});
