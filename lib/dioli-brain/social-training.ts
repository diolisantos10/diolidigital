// Dioli Brain — Social Training Structure
// Learning sources and governance integration for the Social Media Department.
// Rule: never self-train. Every improvement passes through BrainChangeRequest.

import type { SocialCanvas } from "./social-canvas";
import type { CreateChangeRequestInput } from "./governance-service";

// ── Training sources ──────────────────────────────────────────────────────────

export type SocialTrainingSource =
  | "approved_plan"
  | "rejected_plan"
  | "performance_result"
  | "engagement_signal"
  | "client_feedback"
  | "strategy_revision"
  | "evidence_layer";

export const SOCIAL_TRAINING_SOURCE_LABELS: Record<SocialTrainingSource, string> = {
  approved_plan:      "Plano Aprovado",
  rejected_plan:      "Plano Rejeitado",
  performance_result: "Resultado de Performance",
  engagement_signal:  "Sinal de Engajamento",
  client_feedback:    "Feedback do Cliente",
  strategy_revision:  "Revisão de Estratégia",
  evidence_layer:     "Evidence Layer",
};

export const SOCIAL_TRAINING_RULES = [
  "Aprendizado nunca é autônomo — toda melhoria vira BrainChangeRequest.",
  "Planos rejeitados com nota de revisão são a fonte de treinamento prioritária.",
  "Resultados de performance (engajamento, alcance) validam territórios, formatos e frequência.",
  "Revisões de estratégia invalidam planos derivados — Social nunca contraria a Estratégia.",
  "O Social Engine só muda via governança — nunca em runtime.",
] as const;

// ── Governance integration ────────────────────────────────────────────────────

// Builds the payload for POST /api/brain/changes from a reviewed social plan.
// The request enters the Brain Director queue as pending_review — never auto-applies.
export function buildSocialChangeRequestInput(
  canvas: SocialCanvas,
  trainingSource: SocialTrainingSource,
  proposedChange: string,
): CreateChangeRequestInput {
  const sourceLabel = SOCIAL_TRAINING_SOURCE_LABELS[trainingSource];
  return {
    title: `[Social Media] Melhoria a partir de: ${canvas.clientName} (${sourceLabel})`,
    description: `Canvas ${canvas.id} (${canvas.segment}) — status ${canvas.status}. Objetivo de conteúdo: ${canvas.contentObjective}`,
    rationale: canvas.reviewNote
      ? `Nota de revisão: ${canvas.reviewNote}`
      : `Origem: ${sourceLabel}. Quality Gate: ${canvas.qualityGateResult.overall}.`,
    expectedImpact: "Melhorar a qualidade dos planos de conteúdo e calendários gerados para o segmento.",
    proposedChange,
    source:
      trainingSource === "approved_plan" || trainingSource === "performance_result" || trainingSource === "engagement_signal"
        ? "approved_delivery"
        : trainingSource === "rejected_plan"
        ? "rejected_delivery"
        : trainingSource === "client_feedback"
        ? "real_client"
        : "quality_review",
    department: "social-media",
    category: "department_logic",
    riskLevel: "low",
    requestedBy: "social_department",
    agentId: "social-media",
    status: "pending_review",
  };
}
