// Dioli Brain — Design Training Structure
// Training loop for the Design Department.
// Every approved/rejected DesignCanvas feeds back into the Brain via BrainChangeRequest.

import type { DesignCanvas } from "./design-canvas";
import type { CreateChangeRequestInput } from "./governance-service";

export type DesignTrainingSource =
  | "approved_canvas"
  | "rejected_canvas"
  | "client_revision"
  | "brand_update"
  | "performance_result"
  | "visual_feedback"
  | "production_learning";

export const DESIGN_TRAINING_SOURCE_LABELS: Record<DesignTrainingSource, string> = {
  approved_canvas:    "Canvas Aprovado na 1ª Rodada",
  rejected_canvas:    "Canvas Rejeitado — Motivo Registrado",
  client_revision:    "Revisão do Cliente — Aprendizado de Preferência",
  brand_update:       "Atualização de Marca — Novo Padrão",
  performance_result: "Resultado de Performance Visual",
  visual_feedback:    "Feedback Visual Direto",
  production_learning: "Aprendizado de Produção",
};

export const DESIGN_TRAINING_KNOWLEDGE_SOURCES = [
  {
    id: "approved_design_canvases",
    label: "Design Canvases Aprovados",
    description: "Conceitos visuais aprovados pelo cliente sem revisão — padrão de qualidade para o segmento.",
  },
  {
    id: "rejected_design_canvases",
    label: "Design Canvases Rejeitados",
    description: "Canvases rejeitados com motivo registrado — identificam gaps de direção criativa.",
  },
  {
    id: "client_revision_patterns",
    label: "Padrões de Revisão do Cliente",
    description: "Solicitações de revisão recorrentes que revelam preferências visuais não documentadas.",
  },
  {
    id: "brand_guidelines",
    label: "Diretrizes de Marca Atualizadas",
    description: "Mudanças no brandbook que exigem atualização do conceito visual base.",
  },
  {
    id: "performance_visual_data",
    label: "Performance Visual por Formato",
    description: "Dados de engajamento diferenciados por estilo visual — informa a direção criativa futura.",
  },
  {
    id: "image_prompt_feedback",
    label: "Feedback de Prompts de Imagem",
    description: "Prompts que geraram resultados aprovados vs. rejeitados pelo cliente.",
  },
  {
    id: "production_efficiency",
    label: "Eficiência de Produção",
    description: "Tempo e custo por asset por tipo — informa priorização de templates e automação.",
  },
] as const;

export function buildDesignChangeRequestInput(
  canvas: DesignCanvas,
  trainingSource: DesignTrainingSource,
  proposedChange: string,
): CreateChangeRequestInput {
  const sourceLabel = DESIGN_TRAINING_SOURCE_LABELS[trainingSource];
  return {
    title: `[Design] Melhoria a partir de: ${canvas.clientName} (${sourceLabel})`,
    description: `Canvas ${canvas.id} (${canvas.segment}) — status ${canvas.status}. Briefs: ${canvas.creativeBriefs.length}. Assets: ${canvas.totalAssetsRequired}.`,
    rationale: canvas.reviewNote
      ? `Nota de revisão: ${canvas.reviewNote}`
      : `Origem: ${sourceLabel}. Quality Gate: ${canvas.qualityGateResult.overall}.`,
    expectedImpact: "Melhorar a qualidade dos briefs criativos e direção visual para o segmento.",
    proposedChange,
    source:
      trainingSource === "approved_canvas" || trainingSource === "performance_result"
        ? "approved_delivery"
        : trainingSource === "rejected_canvas" || trainingSource === "client_revision"
        ? "rejected_delivery"
        : trainingSource === "visual_feedback"
        ? "real_client"
        : "quality_review",
    department: "design",
    category: "department_logic",
    riskLevel: "low",
    requestedBy: "design_department",
    agentId: "design",
    status: "pending_review",
  };
}
