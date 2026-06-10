// Dioli Brain — Department Maturity Model
// Draft → Partial → Operational → Optimizing → Autonomous
// Each stage requires specific capabilities to be present.

export type DepartmentMaturity = "draft" | "partial" | "operational" | "optimizing" | "autonomous";

export interface MaturityCriterion {
  id: string;
  label: string;
  met: boolean;
  stage: DepartmentMaturity;
}

export interface DepartmentMaturityInfo {
  departmentId: string;
  current: DepartmentMaturity;
  label: string;
  color: string;
  description: string;
  criteria: MaturityCriterion[];
  completionPct: number;
}

export const MATURITY_LABELS: Record<DepartmentMaturity, string> = {
  draft:       "Rascunho",
  partial:     "Parcial",
  operational: "Operacional",
  optimizing:  "Otimizando",
  autonomous:  "Autônomo",
};

export const MATURITY_COLORS: Record<DepartmentMaturity, string> = {
  draft:       "#6B6B65",
  partial:     "#D97706",
  operational: "#16A34A",
  optimizing:  "#5B5BD6",
  autonomous:  "#7C3AED",
};

export const MATURITY_DESCRIPTIONS: Record<DepartmentMaturity, string> = {
  draft:       "Departamento definido em tipos mas sem implementação funcional.",
  partial:     "Implementação parcial — algumas capacidades ativas mas sem loop completo.",
  operational: "Departamento operacional: simulador, treinamento, qualidade e governança ativos.",
  optimizing:  "Departamento otimizando: Brain Changes aplicados, evidências coletadas.",
  autonomous:  "Departamento autônomo: aprendizado contínuo sem intervenção manual.",
};

export interface SDRMaturityInput {
  hasSimulator: boolean;
  hasTrainingCenter: boolean;
  hasQualityGate: boolean;
  hasGovernanceIntegration: boolean;
  hasEvidenceLayer: boolean;
  hasBrainReasoningOutput: boolean;
  brainChangeRequestsGenerated: number;
  trainingSuggestionsGenerated: number;
  qualityGatePassRate: number;
}

export function computeSDRMaturity(input: SDRMaturityInput): DepartmentMaturityInfo {
  const criteria: MaturityCriterion[] = [
    { id: "types_defined",    label: "Tipos e escopos definidos no Brain",           met: true,                               stage: "draft" },
    { id: "simulator",        label: "Simulador SDR ativo",                          met: input.hasSimulator,                 stage: "partial" },
    { id: "training",         label: "Training Center com loop de sugestões",        met: input.hasTrainingCenter,            stage: "partial" },
    { id: "quality_gate",     label: "Quality Gate de 12 itens implementado",        met: input.hasQualityGate,               stage: "operational" },
    { id: "governance",       label: "Integração com governança Brain ativa",        met: input.hasGovernanceIntegration,     stage: "operational" },
    { id: "evidence",         label: "Evidence Layer com tipos SDR definidos",       met: input.hasEvidenceLayer,             stage: "operational" },
    { id: "brain_reasoning",  label: "Brain Reasoning Output em handoffs ativos",    met: input.hasBrainReasoningOutput,      stage: "operational" },
    { id: "change_requests",  label: "Brain Change Requests gerados (≥ 1)",          met: input.brainChangeRequestsGenerated >= 1, stage: "optimizing" },
    { id: "suggestions",      label: "Sugestões de treinamento geradas (≥ 3)",       met: input.trainingSuggestionsGenerated >= 3, stage: "optimizing" },
    { id: "qg_pass_rate",     label: "Quality Gate pass rate ≥ 70%",                met: input.qualityGatePassRate >= 70,    stage: "autonomous" },
  ];

  const metCount = criteria.filter((c) => c.met).length;
  const completionPct = Math.round((metCount / criteria.length) * 100);

  const draftMet    = criteria.filter((c) => c.stage === "draft").every((c) => c.met);
  const partialMet  = criteria.filter((c) => c.stage === "partial").every((c) => c.met);
  const opMet       = criteria.filter((c) => c.stage === "operational").every((c) => c.met);
  const optMet      = criteria.filter((c) => c.stage === "optimizing").every((c) => c.met);
  const autoMet     = criteria.filter((c) => c.stage === "autonomous").every((c) => c.met);

  let current: DepartmentMaturity = "draft";
  if (draftMet && partialMet && opMet && optMet && autoMet) current = "autonomous";
  else if (draftMet && partialMet && opMet && optMet) current = "optimizing";
  else if (draftMet && partialMet && opMet) current = "operational";
  else if (draftMet && partialMet) current = "partial";

  return {
    departmentId:  "client-service-sdr",
    current,
    label:         MATURITY_LABELS[current],
    color:         MATURITY_COLORS[current],
    description:   MATURITY_DESCRIPTIONS[current],
    criteria,
    completionPct,
  };
}
