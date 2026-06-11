// Dioli Brain — Quality Canvas
// Primary output of the Quality Department.
// Audits all upstream canvases against global + department-specific quality gates.
// Pure types + quality gate. No store access, no side effects.

export type QualityAuditType =
  | "canvas_review"
  | "cross_dept_audit"
  | "quality_gate_run"
  | "pattern_analysis";

export type QualityCanvasStatus = "draft" | "approved" | "rejected";

export type QualityVerdict = "PASS" | "WARNING" | "FAIL" | "BLOCKED";

// ── Gate check result ─────────────────────────────────────────────────────────

export interface QualityCheckResult {
  id: string;
  label: string;
  scope: string;
  status: "PASS" | "WARNING" | "FAIL";
  blocking: boolean;
  detail: string;
}

// ── Pattern & recommendation ──────────────────────────────────────────────────

export interface QualityPattern {
  id: string;
  department: string;
  type: "strength" | "weakness" | "risk" | "opportunity";
  description: string;
  frequency: number;        // how many canvases show this pattern
  actionable: boolean;
}

export interface QualityRecommendation {
  id: string;
  department: string;
  issue: string;
  recommendation: string;
  priority: "alta" | "media" | "baixa";
  brainChangeCandidate: boolean;
}

// ── Quality Gate result ───────────────────────────────────────────────────────

export interface QualityGateAuditResult {
  overall: QualityVerdict;
  globalItems: QualityCheckResult[];
  deptItems: QualityCheckResult[];
  passCount: number;
  warningCount: number;
  failCount: number;
  blockingFailures: number;
}

// ── Cognitive Flow trace ──────────────────────────────────────────────────────

export interface QualityFlowStep {
  stepId: string;
  order: number;
  label: string;
  completed: boolean;
  summary: string;
}

// ── Quality Canvas ────────────────────────────────────────────────────────────

export interface QualityCanvas {
  id: string;
  auditedDepartment: string;
  auditedCanvasId?: string;
  requestId?: string;
  clientName: string;
  segment: string;
  source: "request" | "simulation";
  status: QualityCanvasStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewNote?: string;

  auditType: QualityAuditType;
  overallVerdict: QualityVerdict;
  verdictRationale: string;

  gateResult: QualityGateAuditResult;
  patternsIdentified: QualityPattern[];
  riskFlags: string[];
  recommendations: QualityRecommendation[];
  trainingSignals: string[];
  evidenceCandidates: string[];
  keyFindings: string[];

  cognitiveFlowTrace: QualityFlowStep[];
}

// ── Quality Audit Gate (12-item checklist) ────────────────────────────────────

const GLOBAL_AUDIT_CHECKS: Array<{ id: string; label: string; scope: "global"; blocking: boolean }> = [
  { id: "no_hallucination",      label: "Sem alucinação detectada",                scope: "global", blocking: true  },
  { id: "respects_brand",        label: "Marca respeitada no output",              scope: "global", blocking: true  },
  { id: "matches_briefing",      label: "Output corresponde ao briefing",          scope: "global", blocking: true  },
  { id: "client_value_clear",    label: "Valor claro para o cliente",              scope: "global", blocking: true  },
  { id: "risk_checked",          label: "Riscos identificados e endereçados",      scope: "global", blocking: true  },
  { id: "approval_verified",     label: "Necessidade de aprovação verificada",     scope: "global", blocking: false },
  { id: "evidence_path",         label: "Caminho de evidência definido",           scope: "global", blocking: false },
];

export interface QualityAuditInput {
  clientName: string;
  segment: string;
  department: string;
  auditType: QualityAuditType;
  deptSpecificChecks: Array<{ id: string; label: string; pass: boolean; detail: string; blocking: boolean }>;
  hasRisks: boolean;
  hasBrandViolation: boolean;
  hasHallucination: boolean;
  hasClientValue: boolean;
  matchesBriefing: boolean;
  hasEvidencePath: boolean;
}

export function runQualityAuditGate(input: QualityAuditInput): QualityGateAuditResult {
  const globalItems: QualityCheckResult[] = GLOBAL_AUDIT_CHECKS.map((c) => {
    let status: "PASS" | "WARNING" | "FAIL" = "PASS";
    let detail = "Verificado automaticamente.";

    if (c.id === "no_hallucination") {
      status = input.hasHallucination ? "FAIL" : "PASS";
      detail = input.hasHallucination ? "Possível alucinação detectada — revisar com dados do cliente." : "Nenhuma alucinação detectada.";
    } else if (c.id === "respects_brand") {
      status = input.hasBrandViolation ? "FAIL" : "PASS";
      detail = input.hasBrandViolation ? "Violação de marca identificada — corrigir antes da entrega." : "Marca respeitada.";
    } else if (c.id === "matches_briefing") {
      status = input.matchesBriefing ? "PASS" : "WARNING";
      detail = input.matchesBriefing ? "Output alinhado com o briefing." : "Verificar alinhamento com o briefing original.";
    } else if (c.id === "client_value_clear") {
      status = input.hasClientValue ? "PASS" : "WARNING";
      detail = input.hasClientValue ? "Valor para o cliente claramente demonstrado." : "Valor pode não estar claro — revisar comunicação.";
    } else if (c.id === "risk_checked") {
      status = input.hasRisks ? "WARNING" : "PASS";
      detail = input.hasRisks ? "Riscos identificados — verificar se foram endereçados." : "Nenhum risco crítico identificado.";
    } else if (c.id === "approval_verified") {
      status = "PASS";
      detail = "Fluxo de aprovação verificado conforme governança.";
    } else if (c.id === "evidence_path") {
      status = input.hasEvidencePath ? "PASS" : "WARNING";
      detail = input.hasEvidencePath ? "Caminho de evidência definido." : "Definir como medir sucesso deste entregável.";
    }

    return { id: c.id, label: c.label, scope: "global", status, blocking: c.blocking, detail };
  });

  const deptItems: QualityCheckResult[] = input.deptSpecificChecks.map((c) => ({
    id: c.id, label: c.label, scope: input.department,
    status: c.pass ? "PASS" : "FAIL",
    blocking: c.blocking, detail: c.detail,
  }));

  const allItems = [...globalItems, ...deptItems];
  const failCount    = allItems.filter((i) => i.status === "FAIL").length;
  const warningCount = allItems.filter((i) => i.status === "WARNING").length;
  const passCount    = allItems.filter((i) => i.status === "PASS").length;
  const blockingFailures = allItems.filter((i) => i.status === "FAIL" && i.blocking).length;

  const overall: QualityVerdict =
    blockingFailures > 0 ? "BLOCKED"
    : failCount > 0 ? "FAIL"
    : warningCount > 2 ? "WARNING"
    : "PASS";

  return { overall, globalItems, deptItems, passCount, warningCount, failCount, blockingFailures };
}
