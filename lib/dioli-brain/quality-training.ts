// Dioli Brain — Quality Training
// Builds BrainChangeRequest inputs from Quality Canvas audit outcomes.
// Status is always "pending_review" — never auto-applied.

import type { QualityCanvas } from "./quality-canvas";

export type QualityTrainingSource =
  | "approved_audit"
  | "rejected_audit"
  | "blocking_failure_found"
  | "pattern_identified"
  | "recommendation_executed"
  | "evidence_candidate_found"
  | "cross_dept_audit";

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

const SOURCE_META: Record<QualityTrainingSource, { label: string; riskLevel: string; category: string }> = {
  approved_audit:          { label: "Auditoria aprovada",                riskLevel: "low",    category: "department_logic" },
  rejected_audit:          { label: "Auditoria rejeitada",               riskLevel: "medium", category: "department_logic" },
  blocking_failure_found:  { label: "Falha bloqueante encontrada",       riskLevel: "high",   category: "quality_gate"    },
  pattern_identified:      { label: "Padrão identificado",               riskLevel: "low",    category: "department_logic" },
  recommendation_executed: { label: "Recomendação executada",            riskLevel: "low",    category: "department_logic" },
  evidence_candidate_found:{ label: "Candidato a evidência encontrado",  riskLevel: "low",    category: "department_logic" },
  cross_dept_audit:        { label: "Auditoria cross-departamento",      riskLevel: "medium", category: "department_logic" },
};

export function buildQualityChangeRequestInput(
  canvas: QualityCanvas,
  trainingSource: QualityTrainingSource,
  proposedChange: string,
): CreateChangeRequestInput {
  const meta = SOURCE_META[trainingSource];
  return {
    title:          `[Quality] ${meta.label} — ${canvas.clientName} (${canvas.auditedDepartment})`,
    proposedChange,
    description:    `Auditoria de qualidade para ${canvas.clientName} — departamento: ${canvas.auditedDepartment}. Veredicto: ${canvas.overallVerdict}. Padrões: ${canvas.patternsIdentified.length}. Recomendações: ${canvas.recommendations.length}.`,
    rationale:      `Origem: ${meta.label}. Auditoria ${canvas.status} em ${canvas.reviewedAt ?? canvas.createdAt}.`,
    expectedImpact: `Melhoria no padrão de qualidade do departamento "${canvas.auditedDepartment}".`,
    source:         trainingSource,
    department:     "quality",
    category:       meta.category,
    riskLevel:      meta.riskLevel,
    requestedBy:    "quality_engine_v1",
    agentId:        "quality_agent",
    status:         "pending_review",
  };
}
