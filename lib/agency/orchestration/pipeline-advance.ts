// ─── Pipeline Auto-Advance ────────────────────────────────────────────────────
//
// Rule-based stage recommender. NEVER auto-writes project stage.
// Returns a recommendation only — caller decides whether to apply.
// ─────────────────────────────────────────────────────────────────────────────

import type { Project, Deliverable, StrategyRoom, Client } from "@/lib/agency/mock-data";
import type { MaterialRequest } from "@/lib/agency/workspace";
import { evaluateProjectPipeline } from "./pipeline";

export interface PipelineAdviceResult {
  currentStage: string;
  recommendedStage: string | null;
  reason: string;
  confidence: "high" | "medium" | "low";
  isAligned: boolean;
}

export function computeRecommendedStage(input: {
  project: Project;
  client?: Client;
  deliverables: Deliverable[];
  materialRequests: MaterialRequest[];
  strategyRooms: StrategyRoom[];
}): PipelineAdviceResult {
  const { project } = input;
  const current = project.stage;

  if ((current as string) === "completed") {
    return { currentStage: current, recommendedStage: null, reason: "Projeto concluído.", confidence: "high", isAligned: true };
  }

  const stages = evaluateProjectPipeline(input);
  const byId = Object.fromEntries(stages.map((s) => [s.def.id, s]));

  const proposalApproved   = byId["approval"]?.status === "complete";
  const hasStrategyRoom    = byId["strategy"]?.status === "complete";
  const socialExecuted     = byId["social_execution"]?.status === "complete" || byId["social_execution"]?.status === "active";
  const designExecuted     = byId["design_execution"]?.status === "complete" || byId["design_execution"]?.status === "active";
  const adsExecuted        = byId["ads_execution"]?.status === "complete" || byId["ads_execution"]?.status === "active";
  const anyExecuted        = socialExecuted || designExecuted || adsExecuted;
  const clientReviewActive = byId["client_review"]?.status === "active";
  const allDone            = byId["completion"]?.status === "ready" || byId["completion"]?.status === "complete";

  let recommended: string | null = null;
  let reason = "";
  let confidence: "high" | "medium" | "low" = "medium";

  if (allDone && current !== "delivery" && current !== "completed") {
    recommended = "delivery";
    reason = "Todas as entregas aprovadas — projeto pronto para fase de entrega.";
    confidence = "high";
  } else if (clientReviewActive && current === "production") {
    recommended = "review";
    reason = "Entregas enviadas ao cliente para revisão. Avançar para revisão.";
    confidence = "high";
  } else if (proposalApproved && hasStrategyRoom && anyExecuted && (current === "briefing" || current === "diagnosis" || current === "planning")) {
    recommended = "production";
    reason = "Proposta aprovada, Strategy Room pronto e execução iniciada.";
    confidence = "high";
  } else if (proposalApproved && hasStrategyRoom && (current === "briefing" || current === "diagnosis" || current === "planning")) {
    recommended = "production";
    reason = "Proposta aprovada e Strategy Room gerado — pronto para iniciar produção.";
    confidence = "high";
  } else if (proposalApproved && !hasStrategyRoom && (current === "briefing" || current === "diagnosis")) {
    recommended = "planning";
    reason = "Proposta aprovada. Gerar Strategy Room antes de iniciar produção.";
    confidence = "medium";
  }

  const isAligned = recommended === null || recommended === current;

  return {
    currentStage: current,
    recommendedStage: recommended,
    reason: recommended ? reason : "Fase atual alinhada com o estado do pipeline.",
    confidence,
    isAligned,
  };
}
