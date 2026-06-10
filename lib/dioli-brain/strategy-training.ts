// Dioli Brain — Strategy Training Structure
// Learning sources and governance integration for the Strategy Department.
// No autonomous learning: every improvement passes through BrainChangeRequest.

import type { StrategyCanvas } from "./strategy-canvas";
import type { CreateChangeRequestInput } from "./governance-service";

// ── Training sources ──────────────────────────────────────────────────────────

export type StrategyTrainingSource =
  | "approved_strategy"
  | "rejected_strategy"
  | "client_feedback"
  | "successful_campaign"
  | "evidence_layer";

export const STRATEGY_TRAINING_SOURCE_LABELS: Record<StrategyTrainingSource, string> = {
  approved_strategy:   "Estratégia Aprovada",
  rejected_strategy:   "Estratégia Rejeitada",
  client_feedback:     "Feedback do Cliente",
  successful_campaign: "Campanha de Sucesso",
  evidence_layer:      "Evidence Layer",
};

export const STRATEGY_TRAINING_RULES = [
  "Aprendizado nunca é autônomo — toda melhoria vira BrainChangeRequest.",
  "Estratégias rejeitadas com nota de revisão são a fonte de treinamento prioritária.",
  "Padrões de aprovação alimentam os perfis de segmento da base de conhecimento.",
  "Campanhas de sucesso validam (ou invalidam) territórios e canais recomendados.",
  "O Strategy Engine só muda via governança — nunca em runtime.",
] as const;

// ── Governance integration ────────────────────────────────────────────────────

// Builds the payload for POST /api/brain/changes from a reviewed strategy.
// The request enters the Brain Director queue as pending_review — never auto-applies.
export function buildStrategyChangeRequestInput(
  canvas: StrategyCanvas,
  trainingSource: StrategyTrainingSource,
  proposedChange: string,
): CreateChangeRequestInput {
  const sourceLabel = STRATEGY_TRAINING_SOURCE_LABELS[trainingSource];
  return {
    title: `[Estratégia] Melhoria a partir de: ${canvas.clientName} (${sourceLabel})`,
    description: `Canvas ${canvas.id} (${canvas.segment}) — status ${canvas.status}. ${canvas.businessSummary}`,
    rationale: canvas.reviewNote
      ? `Nota de revisão: ${canvas.reviewNote}`
      : `Origem: ${sourceLabel}. Quality Gate: ${canvas.qualityGateResult.overall}.`,
    expectedImpact: "Melhorar a qualidade das estratégias geradas para o segmento.",
    proposedChange,
    source: trainingSource === "approved_strategy" || trainingSource === "successful_campaign"
      ? "approved_delivery"
      : trainingSource === "rejected_strategy"
      ? "rejected_delivery"
      : trainingSource === "client_feedback"
      ? "real_client"
      : "quality_review",
    department: "strategy",
    category: "department_logic",
    riskLevel: "low",
    requestedBy: "strategy_department",
    agentId: "strategy",
    status: "pending_review",
  };
}
