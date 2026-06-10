// Dioli Brain — Brain Director
// Role definition and governance functions for Brain change management.
// The Brain Director is the quality gatekeeper — no agent bypasses this layer.

import { BRAIN_ROLES } from "./brain-config";
import type { BrainRoleId, BrainChangeCategory } from "./types";

export const BRAIN_DIRECTOR_ROLE = BRAIN_ROLES.find((r) => r.id === "brain_director")!;

export const BRAIN_DIRECTOR_RESPONSIBILITIES = [
  "Transformar comandos do CEO em mudanças de arquitetura concretas",
  "Auditar o raciocínio dos agentes para consistência com a lógica do Brain",
  "Aprovar, rejeitar ou arquivar BrainChangeRequests",
  "Impedir auto-modificação direta — nenhum agente altera o Brain sem revisão",
  "Enforçar o Quality Gate em todos os departamentos",
  "Manter consistência de raciocínio entre as fronteiras de departamentos",
  "Versionar o Brain quando mudanças aprovadas são aplicadas",
] as const;

export const BRAIN_DIRECTOR_RULES = [
  "Nenhum agente modifica o Brain diretamente. Sem exceções.",
  "Toda sugestão passa por BrainChangeRequest → revisão → aprovação → aplicação versionada.",
  "A rejeição é registrada com justificativa para uso em treinamento futuro.",
  "O Brain Director pode delegar revisões ao Quality role, mas não pode delegar aprovação final.",
  "Mudanças que alteram o Cognitive Flow requerem aprovação do CEO.",
] as const;

export interface BrainChangeReviewDecision {
  requestId: string;
  decision: "approved" | "rejected" | "archived";
  reviewedBy: BrainRoleId;
  rationale: string;
  qualityGatePassed: boolean;
  brainVersionAfterApply?: string;
  reviewedAt: string;
}

export function canRoleApprove(roleId: BrainRoleId): boolean {
  const role = BRAIN_ROLES.find((r) => r.id === roleId);
  return role?.canApproveBrainChange ?? false;
}

export function canRoleModifyBrain(roleId: BrainRoleId): boolean {
  const role = BRAIN_ROLES.find((r) => r.id === roleId);
  return role?.canModifyBrain ?? false;
}

// Approval chain per change category.
// Structural categories (cognitive flow, quality gates, department permissions,
// routing, knowledge policies) require CEO approval.
export function getRequiredApproversForChange(category: BrainChangeCategory): BrainRoleId[] {
  switch (category) {
    case "cognitive_flow":
      return ["ceo", "brain_director"];
    case "quality_gate":
      return ["ceo", "brain_director", "quality"];
    case "department_permissions":
      return ["ceo", "brain_director"];
    case "routing":
      return ["ceo", "brain_director"];
    case "knowledge_policy":
      return ["ceo", "brain_director"];
    case "department_logic":
      return ["brain_director"];
    default:
      return ["brain_director"];
  }
}
