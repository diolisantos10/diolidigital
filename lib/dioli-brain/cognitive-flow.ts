// Dioli Brain — Mandatory Cognitive Flow
// Every department uses this shared reasoning flow.
// Department scope and tools differ; the logic does not.

import type { CognitiveFlowStep } from "./types";

export const DIOLI_COGNITIVE_FLOW: CognitiveFlowStep[] = [
  {
    id: "intention",
    order: 1,
    label: "Intenção Real do Cliente",
    guidingQuestion: "Qual é a intenção real do cliente — não apenas o que ele pediu?",
    requiredInputs: ["client_message", "conversation_history", "client_profile"],
    output: "client_intention_statement",
    riskFlags: ["ambiguous_request", "scope_inflation", "urgency_mismatch"],
    humanApprovalTriggers: [],
  },
  {
    id: "context",
    order: 2,
    label: "Contexto Necessário",
    guidingQuestion: "Que contexto preciso buscar antes de agir?",
    requiredInputs: ["brand_brain", "previous_deliverables", "project_history"],
    output: "context_summary",
    riskFlags: ["brand_brain_incomplete", "no_previous_context"],
    humanApprovalTriggers: ["brand_brain_missing"],
  },
  {
    id: "certainty",
    order: 3,
    label: "O Que Sei com Certeza",
    guidingQuestion: "O que posso afirmar com certeza baseado no contexto disponível?",
    requiredInputs: ["context_summary", "knowledge_base"],
    output: "certainty_map",
    riskFlags: ["low_confidence_claim"],
    humanApprovalTriggers: [],
  },
  {
    id: "unknowns",
    order: 4,
    label: "O Que Não Sei",
    guidingQuestion: "Quais são as lacunas de informação que podem comprometer a execução?",
    requiredInputs: ["certainty_map", "brief"],
    output: "unknowns_list",
    riskFlags: ["critical_unknowns_present", "scope_unclear"],
    humanApprovalTriggers: ["critical_unknowns_present"],
  },
  {
    id: "routing",
    order: 5,
    label: "Escopo e Departamento",
    guidingQuestion: "Qual departamento deve agir? O escopo está claro e dentro da competência?",
    requiredInputs: ["intention_statement", "unknowns_list", "department_definitions"],
    output: "routing_decision",
    riskFlags: ["scope_outside_department", "cross_department_dependency"],
    humanApprovalTriggers: ["multi_department_coordination_required"],
  },
  {
    id: "permission",
    order: 6,
    label: "Ação Permitida",
    guidingQuestion: "A ação planejada está dentro das permissões do departamento?",
    requiredInputs: ["routing_decision", "department_permissions"],
    output: "permitted_action",
    riskFlags: ["forbidden_action_attempted", "escalation_required"],
    humanApprovalTriggers: ["forbidden_action_attempted"],
  },
  {
    id: "brand",
    order: 7,
    label: "Respeito à Marca",
    guidingQuestion: "A ação respeita a identidade, tom e valores da marca do cliente?",
    requiredInputs: ["permitted_action", "brand_brain"],
    output: "brand_validation",
    riskFlags: ["brand_voice_deviation", "visual_inconsistency", "tone_mismatch"],
    humanApprovalTriggers: ["brand_voice_deviation"],
  },
  {
    id: "objective",
    order: 8,
    label: "Alinhamento com Objetivo",
    guidingQuestion: "Esta ação realmente melhora o objetivo de negócio do cliente?",
    requiredInputs: ["permitted_action", "client_objective", "strategy_room"],
    output: "objective_alignment",
    riskFlags: ["misaligned_with_objective", "no_strategy_room"],
    humanApprovalTriggers: ["objective_misalignment_critical"],
  },
  {
    id: "risk",
    order: 9,
    label: "Verificação de Risco",
    guidingQuestion: "Há riscos para o cliente, para a agência ou para a marca nesta ação?",
    requiredInputs: ["permitted_action", "brand_validation", "objective_alignment"],
    output: "risk_assessment",
    riskFlags: ["legal_risk", "financial_risk", "reputational_risk", "false_promise"],
    humanApprovalTriggers: ["legal_risk", "financial_risk", "reputational_risk"],
  },
  {
    id: "approval",
    order: 10,
    label: "Necessidade de Aprovação Humana",
    guidingQuestion: "Esta ação precisa de aprovação humana antes de prosseguir?",
    requiredInputs: ["risk_assessment", "action_type"],
    output: "approval_requirement",
    riskFlags: ["high_impact_action", "budget_commitment", "external_publication"],
    humanApprovalTriggers: [
      "high_impact_action",
      "budget_commitment",
      "external_publication",
      "client_facing_output",
    ],
  },
  {
    id: "training",
    order: 11,
    label: "Potencial de Aprendizado",
    guidingQuestion: "Este caso deve virar material de treinamento para melhorar o Brain?",
    requiredInputs: ["full_execution_trace", "outcome"],
    output: "training_signal",
    riskFlags: [],
    humanApprovalTriggers: ["brain_change_proposed"],
  },
  {
    id: "measurement",
    order: 12,
    label: "Medição do Resultado",
    guidingQuestion: "Como vamos medir se esta ação gerou valor para o cliente?",
    requiredInputs: ["objective_alignment", "deliverable"],
    output: "success_metric",
    riskFlags: ["no_measurable_outcome", "metric_undefined"],
    humanApprovalTriggers: [],
  },
];

export function getCognitiveFlowStep(id: string): CognitiveFlowStep | undefined {
  return DIOLI_COGNITIVE_FLOW.find((s) => s.id === id);
}

export function getCognitiveFlowStepsWithApprovalRequired(): CognitiveFlowStep[] {
  return DIOLI_COGNITIVE_FLOW.filter((s) => s.humanApprovalTriggers.length > 0);
}
