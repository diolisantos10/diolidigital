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

// ── Shared maturity computation ───────────────────────────────────────────────

function deriveMaturity(departmentId: string, criteria: MaturityCriterion[]): DepartmentMaturityInfo {
  const metCount = criteria.filter((c) => c.met).length;
  const completionPct = Math.round((metCount / criteria.length) * 100);

  const stageMet = (stage: DepartmentMaturity) =>
    criteria.filter((c) => c.stage === stage).every((c) => c.met);

  let current: DepartmentMaturity = "draft";
  if (stageMet("draft") && stageMet("partial") && stageMet("operational") && stageMet("optimizing") && stageMet("autonomous")) current = "autonomous";
  else if (stageMet("draft") && stageMet("partial") && stageMet("operational") && stageMet("optimizing")) current = "optimizing";
  else if (stageMet("draft") && stageMet("partial") && stageMet("operational")) current = "operational";
  else if (stageMet("draft") && stageMet("partial")) current = "partial";

  return {
    departmentId,
    current,
    label:       MATURITY_LABELS[current],
    color:       MATURITY_COLORS[current],
    description: MATURITY_DESCRIPTIONS[current],
    criteria,
    completionPct,
  };
}

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

  return deriveMaturity("client-service-sdr", criteria);
}

// ── Strategy Department maturity ──────────────────────────────────────────────

export interface StrategyMaturityInput {
  hasStrategyEngine: boolean;
  hasWorkspace: boolean;
  hasQualityGate: boolean;
  hasSimulator: boolean;
  hasTrainingStructure: boolean;
  hasGovernanceIntegration: boolean;
  hasEvidenceTypes: boolean;
  strategiesCreated: number;
  strategiesApproved: number;
  brainChangeRequestsGenerated: number;
  qualityGatePassRate: number;
}

export function computeStrategyMaturity(input: StrategyMaturityInput): DepartmentMaturityInfo {
  const criteria: MaturityCriterion[] = [
    { id: "types_defined",   label: "Departamento e Canvas definidos no Brain",     met: true,                                stage: "draft" },
    { id: "engine",          label: "Strategy Engine com Fluxo Cognitivo",          met: input.hasStrategyEngine,             stage: "partial" },
    { id: "workspace",       label: "Workspace /agency/strategy ativo",             met: input.hasWorkspace,                  stage: "partial" },
    { id: "quality_gate",    label: "Quality Gate de 8 itens implementado",         met: input.hasQualityGate,                stage: "operational" },
    { id: "simulator",       label: "Simulador de Estratégia no Laboratório",       met: input.hasSimulator,                  stage: "operational" },
    { id: "training",        label: "Estrutura de treinamento definida",            met: input.hasTrainingStructure,          stage: "operational" },
    { id: "governance",      label: "Integração com governança Brain ativa",        met: input.hasGovernanceIntegration,      stage: "operational" },
    { id: "evidence",        label: "Evidence Layer com tipos de Estratégia",       met: input.hasEvidenceTypes,              stage: "operational" },
    { id: "strategies",      label: "Estratégias aprovadas (≥ 3)",                  met: input.strategiesApproved >= 3,       stage: "optimizing" },
    { id: "change_requests", label: "Brain Change Requests gerados (≥ 1)",          met: input.brainChangeRequestsGenerated >= 1, stage: "optimizing" },
    { id: "qg_pass_rate",    label: "Quality Gate pass rate ≥ 70%",                met: input.qualityGatePassRate >= 70 && input.strategiesCreated >= 5, stage: "autonomous" },
  ];

  return deriveMaturity("strategy", criteria);
}

// ── Social Media Department maturity ──────────────────────────────────────────

export interface SocialMaturityInput {
  hasSocialEngine: boolean;
  hasWorkspace: boolean;
  hasQualityGate: boolean;
  hasCalendar: boolean;
  hasSimulator: boolean;
  hasTrainingStructure: boolean;
  hasGovernanceIntegration: boolean;
  hasEvidenceTypes: boolean;
  plansCreated: number;
  plansApproved: number;
  brainChangeRequestsGenerated: number;
  qualityGatePassRate: number;
}

export function computeSocialMaturity(input: SocialMaturityInput): DepartmentMaturityInfo {
  const criteria: MaturityCriterion[] = [
    { id: "types_defined",   label: "Departamento e SocialCanvas definidos no Brain", met: true,                                stage: "draft" },
    { id: "engine",          label: "Social Engine com Fluxo Cognitivo",              met: input.hasSocialEngine,               stage: "partial" },
    { id: "workspace",       label: "Workspace /agency/social ativo",                 met: input.hasWorkspace,                  stage: "partial" },
    { id: "quality_gate",    label: "Quality Gate de 12 itens implementado",          met: input.hasQualityGate,                stage: "operational" },
    { id: "calendar",        label: "Calendário editorial gerado pelo engine",        met: input.hasCalendar,                   stage: "operational" },
    { id: "simulator",       label: "Simulador Social no Laboratório",                met: input.hasSimulator,                  stage: "operational" },
    { id: "training",        label: "Estrutura de treinamento definida",              met: input.hasTrainingStructure,          stage: "operational" },
    { id: "governance",      label: "Integração com governança Brain ativa",          met: input.hasGovernanceIntegration,      stage: "operational" },
    { id: "evidence",        label: "Evidence Layer com tipos de Social",             met: input.hasEvidenceTypes,              stage: "operational" },
    { id: "plans",           label: "Planos de conteúdo aprovados (≥ 3)",             met: input.plansApproved >= 3,            stage: "optimizing" },
    { id: "change_requests", label: "Brain Change Requests gerados (≥ 1)",            met: input.brainChangeRequestsGenerated >= 1, stage: "optimizing" },
    { id: "qg_pass_rate",    label: "Quality Gate pass rate ≥ 70%",                  met: input.qualityGatePassRate >= 70 && input.plansCreated >= 5, stage: "autonomous" },
  ];

  return deriveMaturity("social-media", criteria);
}

// ── Design Department maturity ────────────────────────────────────────────────

export interface DesignMaturityInput {
  hasDesignEngine: boolean;
  hasWorkspace: boolean;
  hasQualityGate: boolean;
  hasBriefGenerator: boolean;
  hasPromptSpecs: boolean;
  hasSimulator: boolean;
  hasTrainingStructure: boolean;
  hasGovernanceIntegration: boolean;
  hasEvidenceTypes: boolean;
  canvasesCreated: number;
  canvasesApproved: number;
  brainChangeRequestsGenerated: number;
  qualityGatePassRate: number;
}

export function computeDesignMaturity(input: DesignMaturityInput): DepartmentMaturityInfo {
  const criteria: MaturityCriterion[] = [
    { id: "types_defined",    label: "Departamento e DesignCanvas definidos no Brain",    met: true,                                    stage: "draft" },
    { id: "engine",           label: "Design Engine com Fluxo Cognitivo",                 met: input.hasDesignEngine,                   stage: "partial" },
    { id: "workspace",        label: "Workspace /agency/design ativo",                    met: input.hasWorkspace,                      stage: "partial" },
    { id: "quality_gate",     label: "Quality Gate de 10 itens implementado",             met: input.hasQualityGate,                    stage: "operational" },
    { id: "brief_generator",  label: "Gerador de Briefs Criativos ativo",                 met: input.hasBriefGenerator,                 stage: "operational" },
    { id: "prompt_specs",     label: "Specs de prompts de imagem geradas",                met: input.hasPromptSpecs,                    stage: "operational" },
    { id: "simulator",        label: "Simulador de Design no Laboratório",                met: input.hasSimulator,                      stage: "operational" },
    { id: "training",         label: "Estrutura de treinamento definida",                 met: input.hasTrainingStructure,              stage: "operational" },
    { id: "governance",       label: "Integração com governança Brain ativa",             met: input.hasGovernanceIntegration,          stage: "operational" },
    { id: "evidence",         label: "Evidence Layer com tipos de Design",                met: input.hasEvidenceTypes,                  stage: "operational" },
    { id: "canvases",         label: "Canvases de Design aprovados (≥ 3)",                met: input.canvasesApproved >= 3,             stage: "optimizing" },
    { id: "change_requests",  label: "Brain Change Requests gerados (≥ 1)",               met: input.brainChangeRequestsGenerated >= 1, stage: "optimizing" },
    { id: "qg_pass_rate",     label: "Quality Gate pass rate ≥ 70%",                     met: input.qualityGatePassRate >= 70 && input.canvasesCreated >= 5, stage: "autonomous" },
  ];

  return deriveMaturity("design", criteria);
}
