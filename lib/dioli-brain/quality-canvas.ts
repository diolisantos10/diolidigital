// Dioli Brain — Quality Canvas
// Primary output of the Quality Department.
// Audits all upstream canvases against global + department-specific quality gates.
// Pure types + quality gate. No store access, no side effects.
//
// ─── O RELATÓRIO PAROU DE MENTIR (05/08/2026) ────────────────────────────────
//
// Até aqui este gate só sabia dizer PASS. As cinco checagens globais
// BLOQUEANTES — inclusive `no_hallucination` — chegavam como constantes
// verdadeiras vindas do motor (`quality-engine.ts`: `const hasHallucination =
// false; // synthetic — never has hallucinations`). O resultado era um
// `overallVerdict: "PASS"` com a frase "Todos os N checks aprovados — qualidade
// verificada", persistido como `BrainArtifact` para TODO cliente, afirmando
// verificação de algo que ninguém verificou. Fail-open na forma mais pura: não
// é um gate frouxo, é um gate que não existe se dizendo aprovado.
//
// Duas mudanças, nesta ordem — **primeiro parar de mentir, depois conferir**:
//
//   1. Existe o estado `UNVERIFIED`. Checagem sem mecanismo NÃO diz PASS: diz
//      "não verificado", com o motivo escrito no `detail`. Ausência de
//      informação não é informação.
//   2. O veredito global reflete isso: **enquanto houver checagem BLOQUEANTE
//      não verificada, o veredito nunca é PASS.**
//
// Por que WARNING e não BLOCKED quando há não-verificado: cinco das sete
// checagens globais são estruturalmente não-automatizáveis hoje (marca,
// briefing, valor ao cliente). BLOQUEAR 100% das entregas por isso produz um
// freio que é desligado na primeira semana — e freio desligado protege menos
// que freio nenhum, porque some do radar. O BLOCKED fica para violação
// DETECTADA, e agora existe detecção de verdade: `no_hallucination` passou a
// rodar `conferirPisoDeVerdade` contra a `VerdadeDoCliente` lida do banco.
// O que se perdeu foi o carimbo verde falso, que era o dano real.

export type QualityAuditType =
  | "canvas_review"
  | "cross_dept_audit"
  | "quality_gate_run"
  | "pattern_analysis";

export type QualityCanvasStatus = "draft" | "approved" | "rejected";

export type QualityVerdict = "PASS" | "WARNING" | "FAIL" | "BLOCKED";

// ── Gate check result ─────────────────────────────────────────────────────────

/**
 * O estado de UMA checagem.
 *
 * `UNVERIFIED` não é um PASS educado nem um FAIL suave — é a recusa a afirmar.
 * Existe porque a alternativa que estava no ar era pior: dizer PASS sobre o que
 * ninguém olhou. Quem lê o relatório precisa conseguir separar "conferi e está
 * certo" de "não tenho como conferir".
 */
export type CheckStatus = "PASS" | "WARNING" | "FAIL" | "UNVERIFIED";

export interface QualityCheckResult {
  id: string;
  label: string;
  scope: string;
  status: CheckStatus;
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
  /** Quantas checagens não puderam ser conferidas. Zero é a meta; qualquer
   *  número acima disso é a medida honesta do quanto este gate ainda não é
   *  gate. É o número que a escada cobra. */
  unverifiedCount: number;
  /** Destas, quantas eram BLOQUEANTES — a que impede o veredito de ser PASS. */
  unverifiedBlocking: number;
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

// ── Quality Audit Gate (8 checagens globais + as do departamento) ────────────

export const GLOBAL_AUDIT_CHECKS: Array<{ id: GlobalCheckId; label: string; scope: "global"; blocking: boolean }> = [
  { id: "no_hallucination",      label: "Sem alucinação detectada",                scope: "global", blocking: true  },
  { id: "respects_brand",        label: "Marca respeitada no output",              scope: "global", blocking: true  },
  { id: "matches_briefing",      label: "Output corresponde ao briefing",          scope: "global", blocking: true  },
  { id: "client_value_clear",    label: "Valor claro para o cliente",              scope: "global", blocking: true  },
  { id: "risk_checked",          label: "Riscos identificados e endereçados",      scope: "global", blocking: true  },
  { id: "projections_anchored",  label: "Números projetados com origem declarada", scope: "global", blocking: true  },
  { id: "approval_verified",     label: "Necessidade de aprovação verificada",     scope: "global", blocking: false },
  { id: "evidence_path",         label: "Caminho de evidência definido",           scope: "global", blocking: false },
];

export type GlobalCheckId =
  | "no_hallucination"
  | "respects_brand"
  | "matches_briefing"
  | "client_value_clear"
  | "risk_checked"
  | "projections_anchored"
  | "approval_verified"
  | "evidence_path";

/** O que o motor CONSEGUIU apurar sobre uma checagem. Não mandar nada é
 *  legítimo e significa exatamente uma coisa: não foi verificado. */
export interface GlobalFinding {
  status: CheckStatus;
  detail: string;
}

/**
 * O texto de um `UNVERIFIED` que ninguém apurou. Genérico de propósito: quem
 * tem um motivo específico manda o seu `GlobalFinding`; quem não manda nada
 * recebe esta frase, que não afirma nem nega nada sobre o entregável.
 */
const SEM_MECANISMO =
  "NÃO VERIFICADO — não existe checagem automática para este item, e esta casa não tem revisor humano. Trate como desconhecido, não como aprovado.";

export interface QualityAuditInput {
  clientName: string;
  segment: string;
  department: string;
  auditType: QualityAuditType;
  /** `pass: null` = não foi possível conferir (vira `UNVERIFIED`). Booleano só
   *  quando existe mecanismo de verdade por trás. */
  deptSpecificChecks: Array<{ id: string; label: string; pass: boolean | null; detail: string; blocking: boolean }>;
  /** O que o motor apurou. Checagem ausente daqui é `UNVERIFIED` — o default
   *  do registry é desconfiança, não aprovação. */
  globalFindings?: Partial<Record<GlobalCheckId, GlobalFinding>>;
}

export function runQualityAuditGate(input: QualityAuditInput): QualityGateAuditResult {
  const globalItems: QualityCheckResult[] = GLOBAL_AUDIT_CHECKS.map((c) => {
    const apurado = input.globalFindings?.[c.id];
    return {
      id: c.id,
      label: c.label,
      scope: "global",
      status: apurado?.status ?? "UNVERIFIED",
      blocking: c.blocking,
      detail: apurado?.detail ?? SEM_MECANISMO,
    };
  });

  const deptItems: QualityCheckResult[] = input.deptSpecificChecks.map((c) => ({
    id: c.id, label: c.label, scope: input.department,
    status: c.pass === null ? "UNVERIFIED" : c.pass ? "PASS" : "FAIL",
    blocking: c.blocking, detail: c.detail,
  }));

  const allItems = [...globalItems, ...deptItems];
  const failCount    = allItems.filter((i) => i.status === "FAIL").length;
  const warningCount = allItems.filter((i) => i.status === "WARNING").length;
  const passCount    = allItems.filter((i) => i.status === "PASS").length;
  const blockingFailures = allItems.filter((i) => i.status === "FAIL" && i.blocking).length;
  const unverifiedCount    = allItems.filter((i) => i.status === "UNVERIFIED").length;
  const unverifiedBlocking = allItems.filter((i) => i.status === "UNVERIFIED" && i.blocking).length;

  // A ordem importa e é fail-closed: violação DETECTADA bloqueia; depois falha
  // não bloqueante; e só então o não-verificado — que nunca vira PASS, porque
  // "não olhei" jamais pode sair do sistema como "está certo".
  const overall: QualityVerdict =
    blockingFailures > 0 ? "BLOCKED"
    : failCount > 0 ? "FAIL"
    : unverifiedBlocking > 0 ? "WARNING"
    : warningCount > 2 ? "WARNING"
    : "PASS";

  return {
    overall, globalItems, deptItems,
    passCount, warningCount, failCount, blockingFailures,
    unverifiedCount, unverifiedBlocking,
  };
}
