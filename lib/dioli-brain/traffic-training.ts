// Dioli Brain — Traffic Training Structure

import type { TrafficCanvas } from "./traffic-canvas";
import type { CreateChangeRequestInput } from "./governance-service";

export type TrafficTrainingSource =
  | "approved_canvas"
  | "rejected_canvas"
  | "campaign_performance"
  | "budget_optimization"
  | "audience_learning"
  | "creative_feedback"
  | "cac_roas_result";

export const TRAFFIC_TRAINING_SOURCE_LABELS: Record<TrafficTrainingSource, string> = {
  approved_canvas:      "Canvas Aprovado",
  rejected_canvas:      "Canvas Rejeitado",
  campaign_performance: "Performance de Campanha",
  budget_optimization:  "Otimização de Budget",
  audience_learning:    "Aprendizado de Audiência",
  creative_feedback:    "Feedback de Criativo",
  cac_roas_result:      "Resultado CAC/ROAS",
};

export function buildTrafficChangeRequestInput(
  canvas: TrafficCanvas,
  trainingSource: TrafficTrainingSource,
  proposedChange: string,
): CreateChangeRequestInput {
  const sourceLabel = TRAFFIC_TRAINING_SOURCE_LABELS[trainingSource];
  return {
    title: `[Tráfego Pago] Melhoria a partir de: ${canvas.clientName} (${sourceLabel})`,
    description: `Canvas ${canvas.id} (${canvas.segment}) — status ${canvas.status}. Budget: R$ ${canvas.budgetAllocation.mediaBudgetBRL.toLocaleString("pt-BR")}/mês. Campanhas: ${canvas.campaigns.length}.`,
    rationale: canvas.reviewNote
      ? `Nota de revisão: ${canvas.reviewNote}`
      : `Origem: ${sourceLabel}. Quality Gate: ${canvas.qualityGateResult.overall}.`,
    expectedImpact: "Melhorar a qualidade dos planos de tráfego e a eficiência de budget para o segmento.",
    proposedChange,
    source:
      trainingSource === "approved_canvas" || trainingSource === "campaign_performance" || trainingSource === "cac_roas_result"
        ? "approved_delivery"
        : trainingSource === "rejected_canvas"
        ? "rejected_delivery"
        : "quality_review",
    department: "paid-traffic",
    category: "department_logic",
    riskLevel: "low",
    requestedBy: "traffic_department",
    agentId: "paid-traffic",
    status: "pending_review",
  };
}
