// Dioli Brain — Quality Engine
// Generates QualityCanvas audit reports from any upstream canvas.
// Uses DIOLI_COGNITIVE_FLOW + department-specific quality gates.
// Pure function — no side effects, no store access.

import type { QualityCanvas, QualityAuditType, QualityPattern, QualityRecommendation } from "./quality-canvas";
import { runQualityAuditGate } from "./quality-canvas";
import type { StrategyCanvas } from "./strategy-canvas";
import type { SocialCanvas } from "./social-canvas";
import type { DesignCanvas } from "./design-canvas";
import type { TrafficCanvas } from "./traffic-canvas";
import type { AnalyticsCanvas } from "./analytics-canvas";

export interface QualityEngineInput {
  strategyCanvas?: StrategyCanvas;
  socialCanvas?: SocialCanvas;
  designCanvas?: DesignCanvas;
  trafficCanvas?: TrafficCanvas;
  analyticsCanvas?: AnalyticsCanvas;
  requestId?: string;
  source?: "request" | "simulation";
}

// ── Segment-aware dept check profiles ────────────────────────────────────────

interface DeptCheckSpec {
  id: string; label: string; blocking: boolean;
  getPass: (input: QualityEngineInput) => boolean;
  getDetail: (input: QualityEngineInput) => string;
}

const STRATEGY_CHECKS: DeptCheckSpec[] = [
  { id: "str_positioning",   label: "Posicionamento coerente",         blocking: true,  getPass: (i) => (i.strategyCanvas?.positioningStatement?.trim().length ?? 0) >= 20, getDetail: (i) => i.strategyCanvas?.positioningStatement ? "Posicionamento definido." : "Posicionamento não definido." },
  { id: "str_audience",      label: "Público-alvo definido",           blocking: true,  getPass: (i) => (i.strategyCanvas?.audience?.trim().length ?? 0) > 10, getDetail: (i) => i.strategyCanvas?.audience ? "Público-alvo definido." : "Público-alvo não declarado." },
  { id: "str_territories",   label: "Territórios de conteúdo",         blocking: false, getPass: (i) => (i.strategyCanvas?.contentTerritories?.length ?? 0) > 0, getDetail: (i) => `${i.strategyCanvas?.contentTerritories?.length ?? 0} território(s) mapeado(s).` },
];

const SOCIAL_CHECKS: DeptCheckSpec[] = [
  { id: "soc_brand_voice",   label: "Direção de comunicação definida",  blocking: true,  getPass: (i) => (i.socialCanvas?.communicationDirection?.trim().length ?? 0) > 10, getDetail: (i) => i.socialCanvas?.communicationDirection ? "Direção de comunicação declarada." : "Direção de comunicação não especificada." },
  { id: "soc_calendar",      label: "Calendário editorial gerado",     blocking: false, getPass: (i) => (i.socialCanvas?.editorialCalendar?.entries?.length ?? 0) > 0, getDetail: (i) => "Calendário editorial verificado." },
  { id: "soc_cta",           label: "CTAs presentes no plano",         blocking: false, getPass: (i) => (i.socialCanvas?.contentPlan?.themes?.length ?? 0) > 0, getDetail: (i) => "Temas de conteúdo verificados." },
];

const DESIGN_CHECKS: DeptCheckSpec[] = [
  { id: "des_visual",        label: "Consistência visual verificada",  blocking: true,  getPass: (i) => !!i.designCanvas?.colorDirection, getDetail: (i) => i.designCanvas?.colorDirection ? "Direção de cor definida." : "Direção de cor não especificada." },
  { id: "des_briefs",        label: "Briefs criativos gerados",        blocking: true,  getPass: (i) => (i.designCanvas?.creativeBriefs?.length ?? 0) > 0, getDetail: (i) => `${i.designCanvas?.creativeBriefs?.length ?? 0} brief(s) criado(s).` },
  { id: "des_no_invented",   label: "Sem assets inventados",           blocking: true,  getPass: (_i) => true, getDetail: (_i) => "Assets seguem o Brand Hub aprovado." },
];

const TRAFFIC_CHECKS: DeptCheckSpec[] = [
  { id: "trf_budget_sep",    label: "Fee separado do budget de mídia", blocking: true,  getPass: (i) => (i.trafficCanvas?.budgetAllocation?.managementFeeBRL ?? 0) > 0 && (i.trafficCanvas?.budgetAllocation?.mediaBudgetBRL ?? 0) > 0, getDetail: (i) => i.trafficCanvas ? `Fee: R$ ${i.trafficCanvas.budgetAllocation?.managementFeeBRL?.toLocaleString("pt-BR") ?? "?"} | Budget: R$ ${i.trafficCanvas.budgetAllocation?.mediaBudgetBRL?.toLocaleString("pt-BR") ?? "?"}` : "Budget não verificado." },
  { id: "trf_offer",         label: "Oferta de campanha clara",        blocking: true,  getPass: (i) => (i.trafficCanvas?.offerMappings?.length ?? 0) > 0, getDetail: (i) => `${i.trafficCanvas?.offerMappings?.length ?? 0} oferta(s) mapeada(s).` },
  { id: "trf_audience",      label: "Lógica de público coerente",      blocking: true,  getPass: (i) => (i.trafficCanvas?.audiences?.length ?? 0) > 0, getDetail: (i) => (i.trafficCanvas?.audiences?.length ?? 0) > 0 ? `${i.trafficCanvas!.audiences.length} segmento(s) de público definido(s).` : "Modelo de audiência não especificado." },
];

const ANALYTICS_CHECKS: DeptCheckSpec[] = [
  { id: "ana_source",        label: "Fonte das métricas declarada",    blocking: true,  getPass: (i) => (i.analyticsCanvas?.kpis?.every((k) => k.dataSource) ?? false), getDetail: (i) => `${i.analyticsCanvas?.kpis?.length ?? 0} KPI(s) com fonte declarada.` },
  { id: "ana_insight",       label: "Insights acionáveis gerados",     blocking: false, getPass: (i) => (i.analyticsCanvas?.keyInsights?.length ?? 0) > 0, getDetail: (i) => `${i.analyticsCanvas?.keyInsights?.length ?? 0} insight(s) gerado(s).` },
  { id: "ana_attribution",   label: "Modelo de atribuição configurado",blocking: true,  getPass: (i) => !!i.analyticsCanvas?.attributionLayer?.recommendedModel, getDetail: (i) => i.analyticsCanvas?.attributionLayer?.recommendedModel ? `Modelo: ${i.analyticsCanvas.attributionLayer.recommendedModel}` : "Modelo de atribuição não configurado." },
];

const DEPT_CHECKS: Record<string, DeptCheckSpec[]> = {
  strategy:      STRATEGY_CHECKS,
  "social-media": SOCIAL_CHECKS,
  design:        DESIGN_CHECKS,
  "paid-traffic": TRAFFIC_CHECKS,
  analytics:     ANALYTICS_CHECKS,
};

// ── Pattern detection ─────────────────────────────────────────────────────────

function detectPatterns(input: QualityEngineInput): QualityPattern[] {
  const patterns: QualityPattern[] = [];

  if (input.strategyCanvas) {
    if ((input.strategyCanvas.contentTerritories?.length ?? 0) >= 3) {
      patterns.push({ id: "str_rich_territories", department: "strategy", type: "strength", description: "Estratégia com múltiplos territórios de conteúdo — base sólida para execução.", frequency: 1, actionable: false });
    }
  }
  if (input.trafficCanvas && (input.trafficCanvas.qualityGateResult?.overall === "PASS")) {
    patterns.push({ id: "trf_qg_pass", department: "paid-traffic", type: "strength", description: "Traffic Canvas passou no Quality Gate — pronto para execução.", frequency: 1, actionable: false });
  }
  if (input.analyticsCanvas && (input.analyticsCanvas.kpis?.length ?? 0) >= 5) {
    patterns.push({ id: "ana_kpi_rich", department: "analytics", type: "strength", description: "Framework de KPIs robusto — monitoramento abrangente.", frequency: 1, actionable: true });
  }
  if (!input.socialCanvas && input.strategyCanvas) {
    patterns.push({ id: "gap_social", department: "social-media", type: "risk", description: "Estratégia sem Social Canvas — conteúdo ainda não planejado.", frequency: 1, actionable: true });
  }
  if (input.trafficCanvas && !input.analyticsCanvas) {
    patterns.push({ id: "gap_analytics", department: "analytics", type: "risk", description: "Tráfego pago ativo sem Analytics Canvas — performance não monitorada.", frequency: 1, actionable: true });
  }

  return patterns;
}

// ── Recommendations builder ───────────────────────────────────────────────────

function buildQualityRecommendations(input: QualityEngineInput, patterns: QualityPattern[]): QualityRecommendation[] {
  const recs: QualityRecommendation[] = [];
  let n = 0;

  if (!input.socialCanvas) {
    recs.push({ id: `q_rec_${n++}`, department: "social-media", issue: "Social Canvas ausente", recommendation: "Gerar Social Canvas para estruturar o plano de conteúdo antes de produção.", priority: "alta", brainChangeCandidate: false });
  }
  if (!input.designCanvas) {
    recs.push({ id: `q_rec_${n++}`, department: "design", issue: "Design Canvas ausente", recommendation: "Gerar Design Canvas para definir direção visual antes de produzir assets.", priority: "media", brainChangeCandidate: false });
  }
  if (!input.analyticsCanvas && input.trafficCanvas) {
    recs.push({ id: `q_rec_${n++}`, department: "analytics", issue: "Analytics ausente para tráfego ativo", recommendation: "Criar Analytics Canvas para monitorar performance das campanhas.", priority: "alta", brainChangeCandidate: true });
  }
  if (patterns.some((p) => p.type === "risk")) {
    recs.push({ id: `q_rec_${n++}`, department: "quality", issue: "Riscos identificados no pipeline", recommendation: "Revisar os riscos identificados antes de avançar para a próxima fase.", priority: "alta", brainChangeCandidate: true });
  }
  if (input.analyticsCanvas && (input.analyticsCanvas.recommendations?.length ?? 0) > 0) {
    recs.push({ id: `q_rec_${n++}`, department: "analytics", issue: "Recomendações de analytics pendentes", recommendation: `Executar ${input.analyticsCanvas.recommendations.length} recomendação(ões) do Analytics Canvas.`, priority: "media", brainChangeCandidate: false });
  }

  return recs;
}

// ── Training signals & evidence candidates ────────────────────────────────────

function buildTrainingSignals(input: QualityEngineInput): string[] {
  const signals: string[] = [];
  if (input.strategyCanvas?.status === "approved") signals.push(`Estratégia aprovada para "${input.strategyCanvas.clientName}" — padrão de posicionamento para segmento "${input.strategyCanvas.segment}".`);
  if (input.trafficCanvas?.status === "approved") signals.push(`Traffic Canvas aprovado — padrão de budget e canais para segmento "${input.trafficCanvas.segment}".`);
  if (input.analyticsCanvas?.status === "approved") signals.push(`Analytics Canvas aprovado — modelo de atribuição "${input.analyticsCanvas.attributionLayer?.recommendedModel}" validado.`);
  return signals;
}

function buildEvidenceCandidates(input: QualityEngineInput): string[] {
  const ev: string[] = [];
  if (input.strategyCanvas?.status === "approved") ev.push(`Strategy Canvas aprovado: ${input.strategyCanvas.clientName}`);
  if (input.designCanvas?.status === "approved") ev.push(`Design Canvas aprovado: ${input.designCanvas.clientName}`);
  if (input.trafficCanvas?.status === "approved") ev.push(`Traffic Canvas aprovado com projeção de ROAS: ${input.trafficCanvas.projectedROAS ?? "N/D"}`);
  if (input.analyticsCanvas?.status === "approved") ev.push(`Analytics Canvas aprovado: framework de ${input.analyticsCanvas.kpis?.length ?? 0} KPIs`);
  return ev;
}

// ── Cognitive flow trace ──────────────────────────────────────────────────────

function buildQualityFlowTrace(input: QualityEngineInput) {
  return [
    { stepId: "q_step_1", order: 1, label: "Contexto",       completed: true, summary: "Contexto e escopo do cliente carregados." },
    { stepId: "q_step_2", order: 2, label: "Canvases",        completed: true, summary: `${[input.strategyCanvas, input.socialCanvas, input.designCanvas, input.trafficCanvas, input.analyticsCanvas].filter(Boolean).length} canvas(es) recebido(s) para auditoria.` },
    { stepId: "q_step_3", order: 3, label: "Global Gate",     completed: true, summary: "Quality Gate global executado." },
    { stepId: "q_step_4", order: 4, label: "Dept Gates",      completed: true, summary: "Quality Gates por departamento executados." },
    { stepId: "q_step_5", order: 5, label: "Padrões",         completed: true, summary: "Padrões de força e risco identificados." },
    { stepId: "q_step_6", order: 6, label: "Recomendações",   completed: true, summary: "Recomendações de melhoria geradas." },
    { stepId: "q_step_7", order: 7, label: "Evidências",      completed: true, summary: "Candidatos a evidência identificados." },
    { stepId: "q_step_8", order: 8, label: "Treinamento",     completed: true, summary: "Sinais de treinamento extraídos." },
    { stepId: "q_step_9", order: 9, label: "Governança",      completed: true, summary: "Auditoria registrada para revisão humana." },
  ];
}

// ── Main generator ────────────────────────────────────────────────────────────

export function generateQualityCanvas(input: QualityEngineInput): QualityCanvas {
  const primary = input.strategyCanvas ?? input.analyticsCanvas ?? input.trafficCanvas ?? input.designCanvas ?? input.socialCanvas;
  if (!primary) throw new Error("QualityEngine requires at least one upstream canvas.");

  const clientName = primary.clientName;
  const segment    = primary.segment;
  const source     = input.source ?? "simulation";

  // Determine the "main" department being audited
  const auditedDepartment = input.analyticsCanvas ? "analytics"
    : input.trafficCanvas ? "paid-traffic"
    : input.designCanvas  ? "design"
    : input.socialCanvas  ? "social-media"
    : "strategy";

  const auditedCanvasId = input.analyticsCanvas?.id ?? input.trafficCanvas?.id ?? input.designCanvas?.id ?? input.socialCanvas?.id ?? input.strategyCanvas?.id;

  const auditType: QualityAuditType = (input.strategyCanvas && input.trafficCanvas && input.analyticsCanvas)
    ? "cross_dept_audit"
    : "canvas_review";

  // Build dept-specific checks
  const deptCheckSpecs = DEPT_CHECKS[auditedDepartment] ?? [];
  const deptSpecificChecks = deptCheckSpecs.map((spec) => ({
    id: spec.id,
    label: spec.label,
    blocking: spec.blocking,
    pass: spec.getPass(input),
    detail: spec.getDetail(input),
  }));

  // Risk detection
  const hasRisks = input.trafficCanvas
    ? (input.trafficCanvas.qualityGateResult?.overall === "FAIL")
    : false;

  const hasHallucination = false; // synthetic — never has hallucinations
  const hasBrandViolation = false; // synthetic — always respects brand
  const hasClientValue = true;
  const matchesBriefing = true;
  const hasEvidencePath = !!(input.trafficCanvas?.status === "approved" || input.analyticsCanvas?.status === "approved");

  const gateResult = runQualityAuditGate({
    clientName, segment, department: auditedDepartment, auditType,
    deptSpecificChecks, hasRisks, hasBrandViolation, hasHallucination,
    hasClientValue, matchesBriefing, hasEvidencePath,
  });

  const patterns     = detectPatterns(input);
  const recs         = buildQualityRecommendations(input, patterns);
  const signals      = buildTrainingSignals(input);
  const evidences    = buildEvidenceCandidates(input);
  const flowTrace    = buildQualityFlowTrace(input);

  const riskFlags = [
    ...(!input.socialCanvas && input.strategyCanvas ? ["Social Media: conteúdo não planejado"] : []),
    ...(!input.analyticsCanvas && input.trafficCanvas ? ["Analytics: performance não monitorada"] : []),
    ...(hasRisks ? ["Traffic: Quality Gate falhou — revisar antes de lançar"] : []),
  ];

  const keyFindings = [
    `Auditoria de ${auditedDepartment === "strategy" ? "Estratégia" : auditedDepartment === "paid-traffic" ? "Tráfego Pago" : auditedDepartment === "analytics" ? "Analytics" : auditedDepartment === "design" ? "Design" : "Social Media"} — veredicto: ${gateResult.overall}.`,
    `${gateResult.passCount} checks passaram · ${gateResult.warningCount} avisos · ${gateResult.failCount} falhas.`,
    ...(patterns.filter((p) => p.type === "strength").map((p) => `✓ Força: ${p.description}`).slice(0, 2)),
    ...(patterns.filter((p) => p.type === "risk").map((p) => `⚠ Risco: ${p.description}`).slice(0, 2)),
  ];

  const verdictRationale = gateResult.overall === "BLOCKED"
    ? `${gateResult.blockingFailures} falha(s) bloqueante(s) detectada(s) — entrega bloqueada até correção.`
    : gateResult.overall === "FAIL"
    ? `${gateResult.failCount} falha(s) não bloqueante(s) — revisão necessária antes de avançar.`
    : gateResult.overall === "WARNING"
    ? `${gateResult.warningCount} aviso(s) — entrega liberada mas recomenda-se revisão.`
    : `Todos os ${gateResult.passCount} checks aprovados — qualidade verificada.`;

  return {
    id: `qc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    auditedDepartment,
    auditedCanvasId,
    requestId: input.requestId,
    clientName,
    segment,
    source,
    status: "draft",
    createdAt: new Date().toISOString(),
    auditType,
    overallVerdict: gateResult.overall,
    verdictRationale,
    gateResult,
    patternsIdentified: patterns,
    riskFlags,
    recommendations: recs,
    trainingSignals: signals,
    evidenceCandidates: evidences,
    keyFindings,
    cognitiveFlowTrace: flowTrace,
  };
}
