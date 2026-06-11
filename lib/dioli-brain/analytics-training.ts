// Dioli Brain — Analytics Training
// Builds BrainChangeRequest inputs from Analytics Canvas outcomes.
// Status is always "pending_review" — never auto-applied.

import type { AnalyticsCanvas } from "./analytics-canvas";

export type AnalyticsTrainingSource =
  | "approved_canvas"
  | "rejected_canvas"
  | "kpi_exceeded"
  | "kpi_missed"
  | "attribution_learning"
  | "recommendation_executed"
  | "performance_review";

export interface CreateChangeRequestInput {
  title: string;
  proposedChange: string;
  description?: string;
  rationale?: string;
  expectedImpact?: string;
  source: string;
  department: string;
  category: string;
  riskLevel: string;
  requestedBy: string;
  agentId: string;
  status: "pending_review";
}

const SOURCE_META: Record<AnalyticsTrainingSource, { label: string; riskLevel: string; category: string }> = {
  approved_canvas:         { label: "Analytics Canvas aprovado",      riskLevel: "low",    category: "department_logic" },
  rejected_canvas:         { label: "Analytics Canvas rejeitado",     riskLevel: "medium", category: "department_logic" },
  kpi_exceeded:            { label: "KPI superado",                    riskLevel: "low",    category: "department_logic" },
  kpi_missed:              { label: "KPI não atingido",               riskLevel: "medium", category: "quality_gate"    },
  attribution_learning:    { label: "Aprendizado de atribuição",       riskLevel: "low",    category: "department_logic" },
  recommendation_executed: { label: "Recomendação executada",          riskLevel: "low",    category: "department_logic" },
  performance_review:      { label: "Revisão de performance",          riskLevel: "medium", category: "department_logic" },
};

export function buildAnalyticsChangeRequestInput(
  canvas: AnalyticsCanvas,
  trainingSource: AnalyticsTrainingSource,
  proposedChange: string,
): CreateChangeRequestInput {
  const meta = SOURCE_META[trainingSource];
  return {
    title:          `[Analytics] ${meta.label} — ${canvas.clientName} (${canvas.segment})`,
    proposedChange,
    description:    `Canvas de Analytics gerado para ${canvas.clientName} — segmento: ${canvas.segment}. KPI primário: ${canvas.primaryKPI}. Recomendações: ${canvas.recommendations.length}.`,
    rationale:      `Origem: ${meta.label}. Canvas ${canvas.status} em ${canvas.reviewedAt ?? canvas.createdAt}.`,
    expectedImpact: `Melhoria na qualidade do Analytics Engine para segmento "${canvas.segment}".`,
    source:         trainingSource,
    department:     "analytics",
    category:       meta.category,
    riskLevel:      meta.riskLevel,
    requestedBy:    "analytics_engine_v1",
    agentId:        "analytics_agent",
    status:         "pending_review",
  };
}
