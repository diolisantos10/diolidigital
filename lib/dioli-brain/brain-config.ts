// Dioli Brain — Central Configuration
// Version, identity, governance policy, and role definitions.

import type { BrainRole, BrainChangeGovernance } from "./types";

export const BRAIN_VERSION = "1.0.0";

export const BRAIN_IDENTITY = {
  name: "Dioli Brain",
  tagline: "A IA não é o produto. O Brain é o produto.",
  description:
    "Camada de inteligência operacional central da Dioli Agência. " +
    "Não é um modelo de IA — é o framework de raciocínio compartilhado " +
    "que todos os departamentos usam para processar intenção de cliente, " +
    "tomar decisões e gerar evidência de valor.",
  pilotDepartmentId: "client-service-sdr",
  architectureDoc: "docs/dioli-brain-architecture-v1.md",
} as const;

export const BRAIN_ROLES: BrainRole[] = [
  {
    id: "ceo",
    label: "CEO / Dono do Negócio",
    description:
      "Autoridade estratégica. Define visão, padrão de qualidade e mudanças estruturais no Brain.",
    canModifyBrain: false,
    canApproveBrainChange: true,
    canRejectBrainChange: true,
    canViewAllDepartments: true,
  },
  {
    id: "brain_director",
    label: "Brain Director / Arquiteto",
    description:
      "Transforma comandos do CEO em arquitetura. Audita raciocínio dos agentes. " +
      "Aprova/rejeita/arquiva BrainChangeRequests. Impede auto-modificação direta.",
    canModifyBrain: true,
    canApproveBrainChange: true,
    canRejectBrainChange: true,
    canViewAllDepartments: true,
  },
  {
    id: "department_owner",
    label: "Dono de Departamento",
    description:
      "Responsável pela execução dentro do escopo do departamento. " +
      "Pode propor mudanças ao Brain — não pode aplicá-las diretamente.",
    canModifyBrain: false,
    canApproveBrainChange: false,
    canRejectBrainChange: false,
    canViewAllDepartments: false,
  },
  {
    id: "quality",
    label: "Quality Gate",
    description:
      "Auditoria imparcial de qualidade. Pode bloquear entregas que falham no Quality Gate.",
    canModifyBrain: false,
    canApproveBrainChange: false,
    canRejectBrainChange: true,
    canViewAllDepartments: true,
  },
];

export const BRAIN_CHANGE_GOVERNANCE: BrainChangeGovernance = {
  source: "training_simulation",
  status: "pending_review",
  approvalRequiredBy: ["brain_director"],
  autoApplyAllowed: false as const,
  requiresQualityGate: true,
  versionsBrainOnApply: true,
};

export const BRAIN_RULES = [
  "Nenhum agente modifica o Brain diretamente.",
  "Toda sugestão passa por BrainChangeRequest → revisão → aprovação → aplicação versionada.",
  "A rejeição é registrada com justificativa para uso futuro em treinamento.",
  "Mudanças aprovadas versionam o Brain com tag semântica.",
  "O modelo de IA pode mudar. O Brain não pode.",
  "Departamentos são escopos profissionais — não são Brains independentes.",
  "Qualidade é universal, não uma invenção por agente.",
] as const;
