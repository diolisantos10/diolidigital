// Dioli Brain — Strategy Canvas
// Primary output of the Strategy Department.
// Pure types + quality gate. No store access, no side effects.

// ── Roadmap ───────────────────────────────────────────────────────────────────

export interface StrategyRoadmapPhase {
  phase: string;          // "Fase 1 — Fundação"
  focus: string;          // what this phase accomplishes
  durationWeeks: number;
}

// ── Strategy Quality Gate ─────────────────────────────────────────────────────

export interface StrategyQualityGateItem {
  id: string;
  label: string;
  status: "PASS" | "WARNING" | "FAIL";
  detail: string;
}

export interface StrategyQualityGateResult {
  overall: "PASS" | "WARNING" | "FAIL";
  items: StrategyQualityGateItem[];
  passCount: number;
  warningCount: number;
  failCount: number;
}

// ── Cognitive Flow trace (strategy execution) ─────────────────────────────────

export interface StrategyFlowStep {
  stepId: string;
  order: number;
  label: string;
  completed: boolean;
  summary: string;
}

// ── Strategy Canvas ───────────────────────────────────────────────────────────

export type StrategyCanvasStatus = "draft" | "approved" | "rejected";

export interface StrategyCanvas {
  id: string;
  requestId?: string;           // linked ClientRequest (real pipeline)
  clientName: string;
  segment: string;
  source: "request" | "simulation";
  status: StrategyCanvasStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewNote?: string;

  // ── Canvas content ──
  businessSummary: string;
  mainObjective: string;
  secondaryObjectives: string[];
  audience: string;
  painPoints: string[];
  differentiators: string[];
  competitiveAdvantages: string[];
  risks: string[];
  opportunities: string[];
  positioningStatement: string;
  communicationDirection: string;
  contentTerritories: string[];
  priorityChannels: string[];
  recommendedServices: string[];
  recommendedRoadmap: StrategyRoadmapPhase[];

  // ── Brain artifacts ──
  qualityGateResult: StrategyQualityGateResult;
  cognitiveFlowTrace: StrategyFlowStep[];
}

// ── Quality Gate (8-item checklist) ───────────────────────────────────────────

export function runStrategyQualityGate(
  canvas: Omit<StrategyCanvas, "qualityGateResult" | "cognitiveFlowTrace" | "id" | "status" | "createdAt" | "source">,
): StrategyQualityGateResult {
  const items: StrategyQualityGateItem[] = [
    {
      id: "objective_clear",
      label: "Objetivo principal claro",
      status: canvas.mainObjective.trim().length >= 10 ? "PASS" : "FAIL",
      detail: canvas.mainObjective || "Objetivo principal não definido.",
    },
    {
      id: "audience_clear",
      label: "Público-alvo definido",
      status: canvas.audience.trim().length >= 10 ? "PASS" : "FAIL",
      detail: canvas.audience || "Público-alvo não definido.",
    },
    {
      id: "positioning_defined",
      label: "Posicionamento definido",
      status: canvas.positioningStatement.trim().length >= 20 ? "PASS" : "FAIL",
      detail: canvas.positioningStatement || "Posicionamento não definido.",
    },
    {
      id: "differentiators",
      label: "Diferenciais identificados",
      status: canvas.differentiators.length >= 2 ? "PASS"
        : canvas.differentiators.length === 1 ? "WARNING" : "FAIL",
      detail: canvas.differentiators.length > 0
        ? canvas.differentiators.join("; ")
        : "Nenhum diferencial identificado.",
    },
    {
      id: "risks",
      label: "Riscos identificados",
      status: canvas.risks.length >= 1 ? "PASS" : "WARNING",
      detail: canvas.risks.length > 0 ? canvas.risks.join("; ") : "Nenhum risco identificado.",
    },
    {
      id: "opportunities",
      label: "Oportunidades identificadas",
      status: canvas.opportunities.length >= 1 ? "PASS" : "WARNING",
      detail: canvas.opportunities.length > 0 ? canvas.opportunities.join("; ") : "Nenhuma oportunidade identificada.",
    },
    {
      id: "content_territories",
      label: "Territórios de conteúdo definidos",
      status: canvas.contentTerritories.length >= 3 ? "PASS"
        : canvas.contentTerritories.length >= 1 ? "WARNING" : "FAIL",
      detail: canvas.contentTerritories.length > 0
        ? canvas.contentTerritories.join("; ")
        : "Nenhum território de conteúdo definido.",
    },
    {
      id: "roadmap_defined",
      label: "Roadmap definido",
      status: canvas.recommendedRoadmap.length >= 2 ? "PASS"
        : canvas.recommendedRoadmap.length === 1 ? "WARNING" : "FAIL",
      detail: canvas.recommendedRoadmap.length > 0
        ? canvas.recommendedRoadmap.map((p) => p.phase).join(" → ")
        : "Roadmap não definido.",
    },
  ];

  const failCount    = items.filter((i) => i.status === "FAIL").length;
  const warningCount = items.filter((i) => i.status === "WARNING").length;
  const passCount    = items.filter((i) => i.status === "PASS").length;
  const overall: "PASS" | "WARNING" | "FAIL" =
    failCount > 0 ? "FAIL" : warningCount > 0 ? "WARNING" : "PASS";

  return { overall, items, passCount, warningCount, failCount };
}
