// Dioli Brain — Training Policy
// Governance rules for how training signals become Brain improvements.

export const TRAINING_POLICY = {
  // Suggestions generated from simulation results are always status=pending.
  // They never auto-apply to the Brain.
  autoApplyAllowed: false as const,

  // A suggestion must pass the Quality Gate before it can be approved.
  requiresQualityGateBeforeApproval: true,

  // Every applied change gets a semantic version tag.
  versionsBrainOnApply: true,

  // If a suggestion is rejected, the rejection reason is logged for future training.
  logRejectionReason: true,

  // Maximum number of pending suggestions before the Brain Director is alerted.
  maxPendingSuggestionsBeforeAlert: 10,

  // Training is currently only available for the SDR department (pilot).
  activeDepartments: ["client-service-sdr"] as string[],

  // Future departments will be added here as they complete their simulation setup.
  plannedDepartments: ["strategy", "social-media", "design", "paid-traffic"] as string[],
} as const;

// Source labels for BrainChangeRequest
export const BRAIN_CHANGE_SOURCE_LABELS = {
  real_client:           "Cliente Real",
  training_simulation:   "Simulação de Treinamento",
  rejected_deliverable:  "Entrega Rejeitada",
  approved_deliverable:  "Entrega Aprovada",
  performance_result:    "Resultado de Performance",
  ceo_instruction:       "Instrução do CEO",
} as const;

// Status labels for BrainChangeRequest
export const BRAIN_CHANGE_STATUS_LABELS = {
  draft:          "Rascunho",
  pending_review: "Aguardando Revisão",
  approved:       "Aprovado",
  rejected:       "Rejeitado",
  applied:        "Aplicado",
  archived:       "Arquivado",
} as const;

export const TRAINING_RULES = [
  "Sugestões geradas automaticamente ficam sempre em status 'pending_review'.",
  "Nenhuma sugestão é aplicada automaticamente ao Brain.",
  "A aplicação deve passar pelo Quality Gate antes da aprovação.",
  "Toda mudança aplicada versiona o Brain com tag semântica.",
  "Rejeições são registradas com justificativa para uso em treinamento futuro.",
  "O Brain Director é alertado quando há mais de 10 sugestões pendentes.",
] as const;
