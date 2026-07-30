// pm-conductor.ts — o PM como MAESTRO da produção.
//
// Antes, o motor rodava os departamentos numa ordem fixa de array, por palavra-
// chave. Agora o PM rege: a partir do briefing (ClientKnowledgeSnapshot), ele
// PLANEJA quais departamentos entram e em QUE ORDEM (respeitando dependência:
// estratégia → produtores → analytics → qualidade), e o motor executa nessa
// sequência. O plano é DETERMINÍSTICO (rule-based, sempre funciona — Lei 1);
// os produtores é que geram com IA. O PM coordena; ele não refaz o trabalho.

import { buildClientSnapshot } from "@/lib/dioli-brain/client-snapshot";
import { proposeProjectRuleBased } from "@/lib/dioli-brain/pm-orchestrator";

export interface ProductionPlan {
  /** Departamentos a executar, NA ORDEM que o PM definiu (só os que sabemos rodar). */
  orderedDepartments: string[];
  /** Objetivo do projeto, como o PM sintetizou. */
  goal: string;
  /** Avisos do PM (ex.: Brand Brain incompleto). */
  warnings: string[];
  pmMode: "ai" | "rule_based";
}

/**
 * O PM planeja a produção de um projeto. `runnableDeptIds` = os departamentos que
 * o motor sabe produzir (para o plano não pedir algo que não roda ainda).
 */
export async function planProduction(clientRequestId: string, runnableDeptIds: string[]): Promise<ProductionPlan> {
  const snapshot = await buildClientSnapshot(clientRequestId);
  if (!snapshot) {
    return { orderedDepartments: [], goal: "", warnings: ["briefing indisponível para o PM planejar"], pmMode: "rule_based" };
  }

  const proposal = proposeProjectRuleBased(snapshot);

  // A ordem das tasks do PM JÁ reflete a dependência (estratégia crítica primeiro,
  // depois produtores, depois analytics). Extraímos os departamentos únicos, na
  // ordem, intersectando com o que o motor sabe rodar.
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const task of proposal.tasks) {
    const dept = task.department;
    if (runnableDeptIds.includes(dept) && !seen.has(dept)) {
      seen.add(dept);
      ordered.push(dept);
    }
  }

  return {
    orderedDepartments: ordered,
    goal: proposal.goal,
    warnings: proposal.warnings,
    pmMode: proposal.reasoningMode,
  };
}
