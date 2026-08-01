import type { SimulationRun, SimulationScenario, SimulationIssue } from "./types";

interface CriterionResult {
  id:            string;
  pass:          boolean;
  partial?:      boolean;
  pointsEarned:  number;
  maxPoints:     number;
  issue?:        SimulationIssue;
}

// ── Criteria ──────────────────────────────────────────────────────────────────

function evalIdentityCaptured(run: SimulationRun): CriterionResult {
  const scope = run.finalScope;
  const pass = !!(scope?.prospectEmail && scope?.prospectPhone);
  return {
    id: "identity_captured",
    pass,
    pointsEarned: pass ? 10 : 0,
    maxPoints: 10,
    issue: pass ? undefined : {
      criterion: "identity_captured",
      description: "SDR não capturou e-mail e WhatsApp do prospect",
      severity: "error",
    },
  };
}

function evalServiceIdentified(run: SimulationRun): CriterionResult {
  const scope = run.finalScope;
  const pass = !!(scope?.wantsSocialMedia || scope?.wantsPaidTraffic || scope?.branding?.requested);
  return {
    id: "service_identified",
    pass,
    pointsEarned: pass ? 10 : 0,
    maxPoints: 10,
    issue: pass ? undefined : {
      criterion: "service_identified",
      description: "SDR não identificou o serviço desejado pelo prospect",
      severity: "error",
    },
  };
}

function evalQualifyingComplete(run: SimulationRun): CriterionResult {
  const scope = run.finalScope;
  const sdr   = run.finalSdrState;
  if (!scope) {
    return {
      id: "qualifying_complete",
      pass: false,
      pointsEarned: 0,
      maxPoints: 15,
      issue: { criterion: "qualifying_complete", description: "Escopo final ausente", severity: "error" },
    };
  }
  let fulfilled = 0;
  if (scope.wantsSocialMedia && scope.social?.postsPerWeek !== undefined) fulfilled++;
  if (scope.objectives.length > 0 || scope.segment) fulfilled++;
  if (scope.budgetRange || (sdr?.budgetSignal.amount !== undefined)) fulfilled++;
  if (scope.prospectName && scope.businessName) fulfilled++;

  const pass    = fulfilled >= 3;
  const partial = !pass && fulfilled >= 2;
  return {
    id: "qualifying_complete",
    pass,
    partial,
    pointsEarned: pass ? 15 : partial ? 8 : 0,
    maxPoints: 15,
    issue: pass ? undefined : {
      criterion: "qualifying_complete",
      description: `SDR não qualificou suficientemente — ${fulfilled}/4 critérios preenchidos`,
      severity: partial ? "warning" : "error",
    },
  };
}

function evalObjectionHandled(run: SimulationRun, scenario: SimulationScenario): CriterionResult {
  if (!scenario.objectionMessage) {
    return { id: "objection_handled", pass: true, pointsEarned: 10, maxPoints: 10 };
  }
  const sdr      = run.finalSdrState;
  const resolved = !!(sdr?.objection.resolvedAt);
  return {
    id: "objection_handled",
    pass: resolved,
    pointsEarned: resolved ? 10 : 0,
    maxPoints: 10,
    issue: resolved ? undefined : {
      criterion: "objection_handled",
      description: "SDR não resolveu a objeção de preço do prospect",
      severity: "error",
    },
  };
}

function evalNoUnresolvedObjection(run: SimulationRun): CriterionResult {
  const active = run.finalSdrState?.objection.active ?? false;
  return {
    id: "no_unresolved_objection",
    pass: !active,
    pointsEarned: !active ? 15 : 0,
    maxPoints: 15,
    issue: !active ? undefined : {
      criterion: "no_unresolved_objection",
      description: "Conversa encerrada com objeção ativa — proposta bloqueada",
      severity: "error",
    },
  };
}

function evalViableScope(run: SimulationRun): CriterionResult {
  const conf    = run.finalEstimate?.confidence;
  const pass    = conf === "high" || conf === "medium";
  const partial = conf === "low";
  return {
    id: "viable_scope",
    pass,
    partial: !pass && partial,
    pointsEarned: pass ? 15 : partial ? 7 : 0,
    maxPoints: 15,
    issue: pass ? undefined : {
      criterion: "viable_scope",
      description: `Escopo final com confiança "${conf ?? "none"}" — proposta pode não ser viável`,
      severity: partial ? "warning" : "error",
    },
  };
}

function evalCoherentEstimate(run: SimulationRun): CriterionResult {
  const est = run.finalEstimate;
  if (!est || est.totalMin === 0) {
    return {
      id: "coherent_estimate",
      pass: false,
      pointsEarned: 0,
      maxPoints: 5,
      issue: { criterion: "coherent_estimate", description: "Estimativa não gerada", severity: "warning" },
    };
  }
  const pass = est.totalMin <= est.totalMax;
  return {
    id: "coherent_estimate",
    pass,
    pointsEarned: pass ? 5 : 0,
    maxPoints: 5,
    issue: pass ? undefined : {
      criterion: "coherent_estimate",
      description: "Estimativa incoerente: totalMin > totalMax",
      severity: "error",
    },
  };
}

function evalRestaurantSpecifics(run: SimulationRun): CriterionResult {
  const isRestaurant = run.finalSdrState?.isRestaurant ?? false;
  if (!isRestaurant) {
    return { id: "restaurant_specifics", pass: true, pointsEarned: 5, maxPoints: 5 };
  }
  const askedFrequency = run.finalScope?.social?.postsPerWeek !== undefined;
  return {
    id: "restaurant_specifics",
    pass: askedFrequency,
    pointsEarned: askedFrequency ? 5 : 2,
    maxPoints: 5,
    issue: askedFrequency ? undefined : {
      criterion: "restaurant_specifics",
      description: "SDR não perguntou sobre frequência de posts para segmento restaurante",
      severity: "warning",
    },
  };
}

// ── Exported evaluator ────────────────────────────────────────────────────────

export interface EvaluationResult {
  score:           number;
  verdict:         SimulationRun["verdict"];
  issues:          SimulationIssue[];
  recommendations: string[];
}

export function evaluateSDRRun(run: SimulationRun, scenario: SimulationScenario): EvaluationResult {
  const results: CriterionResult[] = [
    evalIdentityCaptured(run),
    evalServiceIdentified(run),
    evalQualifyingComplete(run),
    evalObjectionHandled(run, scenario),
    evalNoUnresolvedObjection(run),
    evalViableScope(run),
    evalCoherentEstimate(run),
    evalRestaurantSpecifics(run),
  ];

  const totalMax    = results.reduce((a, r) => a + r.maxPoints, 0);
  const totalEarned = results.reduce((a, r) => a + r.pointsEarned, 0);
  const score       = Math.round((totalEarned / totalMax) * 100);
  const issues      = results.filter((r) => r.issue).map((r) => r.issue!);

  const recommendations: string[] = [];
  if (!results.find((r) => r.id === "identity_captured")?.pass)
    recommendations.push("Priorizar captura de e-mail e telefone antes de avançar para serviços.");
  if (!results.find((r) => r.id === "objection_handled")?.pass)
    recommendations.push("Quando detectar objeção de preço, perguntar budget máximo antes de ajustar escopo.");
  if (!results.find((r) => r.id === "viable_scope")?.pass)
    recommendations.push("Fazer mais perguntas de qualificação antes de encerrar a conversa.");
  if (!results.find((r) => r.id === "no_unresolved_objection")?.pass)
    recommendations.push("Não encerrar conversa com objeção ativa — resolver ou escalar para PM.");

  const verdict: SimulationRun["verdict"] = score >= 80 ? "pass" : score >= 60 ? "warning" : "fail";
  return { score, verdict, issues, recommendations };
}

export function applyEvaluation(run: SimulationRun, scenario: SimulationScenario): SimulationRun {
  const ev = evaluateSDRRun(run, scenario);
  return { ...run, score: ev.score, verdict: ev.verdict, issues: ev.issues, recommendations: ev.recommendations };
}
