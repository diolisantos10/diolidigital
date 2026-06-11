// Dioli Brain — Analytics Canvas
// Primary output of the Analytics Department.
// Receives all upstream canvases (Strategy + Social + Design + Traffic) and produces
// a KPI framework, attribution model, performance analysis and recommendations.
// Pure types + quality gate. No store access, no side effects.

// ── KPI & Measurement types ───────────────────────────────────────────────────

export type KPICategory = "business" | "content" | "traffic" | "brand" | "cross_dept";

export type AttributionModel =
  | "last_click"
  | "first_click"
  | "linear"
  | "time_decay"
  | "data_driven"
  | "position_based";

export type AnalyticsCanvasStatus = "draft" | "approved" | "rejected";

export type PerformanceStatus = "on_track" | "at_risk" | "off_track" | "not_started";

// ── KPI Framework ─────────────────────────────────────────────────────────────

export interface KPIItem {
  id: string;
  category: KPICategory;
  name: string;
  description: string;
  unit: string;               // "leads/mês", "R$", "%", "reach"
  baselineValue: string;      // current state (may be "N/D" if no data)
  targetValue: string;        // goal
  measurementPeriod: string;  // "mensal", "semanal", "diário"
  dataSource: string;         // "Meta Ads Manager", "Google Analytics", etc.
  status: PerformanceStatus;
}

// ── Attribution Layer ─────────────────────────────────────────────────────────

export interface AttributionTouchpoint {
  id: string;
  channel: string;            // "meta_ads", "instagram_organic", "google_search"
  touchpointType: "awareness" | "engagement" | "conversion" | "retention";
  estimatedContribution: number;  // percentage 0–100
  role: string;               // "Primeiro contato via anúncio" etc.
}

export interface AttributionLayer {
  recommendedModel: AttributionModel;
  modelRationale: string;
  touchpoints: AttributionTouchpoint[];
  conversionWindow: string;   // "7 dias post-clique + 1 dia view"
  analyticsSetupRequired: string[];  // tools/tags that must be installed
}

// ── Performance Analysis ──────────────────────────────────────────────────────

export interface PerformanceGap {
  id: string;
  area: string;               // "Social Media", "Tráfego Pago", "Conversão"
  currentState: string;
  targetState: string;
  gapDescription: string;
  priority: "alta" | "media" | "baixa";
  estimatedImpact: string;    // "Aumento de 30–50 leads/mês"
}

// ── Recommendation Engine ─────────────────────────────────────────────────────

export interface AnalyticsRecommendation {
  id: string;
  type: "optimization" | "test" | "setup" | "alert" | "opportunity";
  department: string;         // "social", "traffic", "design", "strategy"
  title: string;
  rationale: string;
  expectedImpact: string;
  effort: "baixo" | "medio" | "alto";
  urgency: "imediata" | "proximos_30_dias" | "proximo_trimestre";
}

// ── Evidence Aggregation ──────────────────────────────────────────────────────

export interface DeptPerformanceSummary {
  department: string;
  canvasesApproved: number;
  keyMetric: string;          // most important metric for that dept
  keyMetricValue: string;
  trendIndicator: "up" | "stable" | "down" | "unknown";
}

// ── Analytics Quality Gate ────────────────────────────────────────────────────

export interface AnalyticsQualityGateItem {
  id: string;
  label: string;
  status: "PASS" | "WARNING" | "FAIL";
  detail: string;
}

export interface AnalyticsQualityGateResult {
  overall: "PASS" | "WARNING" | "FAIL";
  items: AnalyticsQualityGateItem[];
  passCount: number;
  warningCount: number;
  failCount: number;
}

// ── Cognitive Flow trace ──────────────────────────────────────────────────────

export interface AnalyticsFlowStep {
  stepId: string;
  order: number;
  label: string;
  completed: boolean;
  summary: string;
}

// ── Analytics Canvas ──────────────────────────────────────────────────────────

export interface AnalyticsCanvas {
  id: string;
  strategyCanvasId?: string;
  socialCanvasId?: string;
  designCanvasId?: string;
  trafficCanvasId?: string;
  requestId?: string;
  clientName: string;
  segment: string;
  source: "request" | "simulation";
  status: AnalyticsCanvasStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewNote?: string;

  // ── Business context ──
  mainObjective: string;
  reportingCadence: string;   // "semanal + mensal"
  dashboardPlatform: string;  // "Google Looker Studio", "Meta Business Suite", etc.

  // ── KPI Framework ──
  kpis: KPIItem[];
  primaryKPI: string;         // the single most important KPI

  // ── Attribution ──
  attributionLayer: AttributionLayer;

  // ── Performance gaps ──
  performanceGaps: PerformanceGap[];

  // ── Recommendations ──
  recommendations: AnalyticsRecommendation[];

  // ── Cross-dept summary ──
  deptSummaries: DeptPerformanceSummary[];

  // ── Key insights ──
  keyInsights: string[];
  alertThresholds: string[];   // "Se CAC > R$ 120, escalar para revisão de budget"

  // ── Brain artifacts ──
  qualityGateResult: AnalyticsQualityGateResult;
  cognitiveFlowTrace: AnalyticsFlowStep[];
}

// ── Quality Gate (10-item checklist) ─────────────────────────────────────────

export function runAnalyticsQualityGate(
  canvas: Omit<AnalyticsCanvas, "qualityGateResult" | "cognitiveFlowTrace" | "id" | "status" | "createdAt" | "source">,
): AnalyticsQualityGateResult {
  const items: AnalyticsQualityGateItem[] = [
    {
      id: "kpis_defined",
      label: "KPIs definidos",
      status: canvas.kpis.length >= 3 ? "PASS" : canvas.kpis.length >= 1 ? "WARNING" : "FAIL",
      detail: canvas.kpis.length > 0
        ? `${canvas.kpis.length} KPI(s): ${canvas.kpis.slice(0, 3).map((k) => k.name).join(", ")}`
        : "Nenhum KPI definido.",
    },
    {
      id: "primary_kpi",
      label: "KPI primário estabelecido",
      status: canvas.primaryKPI.trim().length >= 5 ? "PASS" : "FAIL",
      detail: canvas.primaryKPI || "KPI primário não definido.",
    },
    {
      id: "attribution_model",
      label: "Modelo de atribuição definido",
      status: canvas.attributionLayer.recommendedModel ? "PASS" : "FAIL",
      detail: canvas.attributionLayer.recommendedModel
        ? `Modelo: ${canvas.attributionLayer.recommendedModel} — ${canvas.attributionLayer.modelRationale.slice(0, 60)}...`
        : "Modelo de atribuição não definido.",
    },
    {
      id: "touchpoints_mapped",
      label: "Touchpoints mapeados",
      status: canvas.attributionLayer.touchpoints.length >= 2 ? "PASS"
        : canvas.attributionLayer.touchpoints.length === 1 ? "WARNING" : "FAIL",
      detail: canvas.attributionLayer.touchpoints.length > 0
        ? `${canvas.attributionLayer.touchpoints.length} touchpoint(s) mapeado(s)`
        : "Nenhum touchpoint mapeado.",
    },
    {
      id: "analytics_setup",
      label: "Setup de analytics definido",
      status: canvas.attributionLayer.analyticsSetupRequired.length >= 1 ? "PASS" : "WARNING",
      detail: canvas.attributionLayer.analyticsSetupRequired.length > 0
        ? canvas.attributionLayer.analyticsSetupRequired.slice(0, 3).join(", ")
        : "Setup de analytics não especificado.",
    },
    {
      id: "performance_gaps",
      label: "Gaps de performance identificados",
      status: canvas.performanceGaps.length >= 1 ? "PASS" : "WARNING",
      detail: canvas.performanceGaps.length > 0
        ? `${canvas.performanceGaps.length} gap(s): ${canvas.performanceGaps.map((g) => g.area).join(", ")}`
        : "Nenhum gap de performance identificado.",
    },
    {
      id: "recommendations",
      label: "Recomendações geradas",
      status: canvas.recommendations.length >= 2 ? "PASS"
        : canvas.recommendations.length === 1 ? "WARNING" : "FAIL",
      detail: canvas.recommendations.length > 0
        ? `${canvas.recommendations.length} recomendação(ões) de ${[...new Set(canvas.recommendations.map((r) => r.department))].join(", ")}`
        : "Nenhuma recomendação gerada.",
    },
    {
      id: "reporting_cadence",
      label: "Cadência de relatório definida",
      status: canvas.reportingCadence.trim().length >= 3 ? "PASS" : "WARNING",
      detail: canvas.reportingCadence || "Cadência de relatório não definida.",
    },
    {
      id: "insights_generated",
      label: "Insights-chave gerados",
      status: canvas.keyInsights.length >= 2 ? "PASS"
        : canvas.keyInsights.length === 1 ? "WARNING" : "FAIL",
      detail: canvas.keyInsights.length > 0
        ? canvas.keyInsights[0]?.slice(0, 80)
        : "Nenhum insight gerado.",
    },
    {
      id: "strategy_linked",
      label: "Strategy Canvas vinculado",
      status: canvas.strategyCanvasId && canvas.strategyCanvasId.length > 0 ? "PASS" : "WARNING",
      detail: canvas.strategyCanvasId
        ? `Estratégia: ${canvas.strategyCanvasId}`
        : "Analytics sem Strategy Canvas — recomenda-se vincular.",
    },
  ];

  const failCount    = items.filter((i) => i.status === "FAIL").length;
  const warningCount = items.filter((i) => i.status === "WARNING").length;
  const passCount    = items.filter((i) => i.status === "PASS").length;
  const overall: "PASS" | "WARNING" | "FAIL" =
    failCount > 0 ? "FAIL" : warningCount > 0 ? "WARNING" : "PASS";

  return { overall, items, passCount, warningCount, failCount };
}
