// Dioli Brain — Core Types
// Pure TypeScript definitions. No runtime effects, no store access, no side effects.

// ─── Roles ────────────────────────────────────────────────────────────────────

export type BrainRoleId = "ceo" | "brain_director" | "department_owner" | "quality";

export interface BrainRole {
  id: BrainRoleId;
  label: string;
  description: string;
  canModifyBrain: boolean;
  canApproveBrainChange: boolean;
  canRejectBrainChange: boolean;
  canViewAllDepartments: boolean;
}

// ─── AI Engine ────────────────────────────────────────────────────────────────

export type CapabilityRequired =
  | "fast_commercial"
  | "reasoning"
  | "creative_copy"
  | "multimodal"
  | "analytical"
  | "operational"
  | "data_reasoning"
  | "multi_model_audit"
  | "rule_based";

export type CostTier   = "low" | "medium" | "high";
export type LatencyTier = "realtime" | "fast" | "moderate" | "slow";
export type QualityTier = "standard" | "professional" | "premium";

export interface EngineRouteConfig {
  departmentId: string;
  preferredProvider: string;
  fallbackProvider: string;
  capabilityRequired: CapabilityRequired;
  costTier: CostTier;
  latencyTier: LatencyTier;
  qualityTier: QualityTier;
  notes?: string;
}

// ─── Knowledge Base ───────────────────────────────────────────────────────────

export type KnowledgeSensitivity = "public" | "internal" | "confidential" | "client_only";
export type UpdateTrigger =
  | "client_upload"
  | "approved_deliverable"
  | "briefing_submitted"
  | "training_batch"
  | "human_edit"
  | "cron_sync"
  | "system_event";

export interface KnowledgeSource {
  sourceId: string;
  label: string;
  description: string;
  owner: string;
  allowedDepartments: string[];
  sensitivity: KnowledgeSensitivity;
  updateTrigger: UpdateTrigger[];
  currentSystemMapping: string | null;
}

// ─── Brain Department ─────────────────────────────────────────────────────────

export type DepartmentFirstVersionStatus =
  | "existing"
  | "partial"
  | "missing"
  | "needs_refactor";

export interface BrainDepartment {
  id: string;
  name: string;
  mission: string;
  responsibilities: string[];
  permissions: string[];
  forbiddenActions: string[];
  tools: string[];
  suggestedAIEngine: CapabilityRequired;
  allowedKnowledgeSources: string[];
  qualityGate: string[];
  simulator: string | null;
  trainingCenter: string | null;
  evidenceTypes: string[];
  humanApprovalTriggers: string[];
  firstVersionStatus: DepartmentFirstVersionStatus;
}

// ─── Cognitive Flow ───────────────────────────────────────────────────────────

export interface CognitiveFlowStep {
  id: string;
  order: number;
  label: string;
  guidingQuestion: string;
  requiredInputs: string[];
  output: string;
  riskFlags: string[];
  humanApprovalTriggers: string[];
}

// ─── Quality Gate ─────────────────────────────────────────────────────────────

export type QualityGateScope = "global" | DepartmentFirstVersionStatus;

export interface QualityGateCheck {
  id: string;
  label: string;
  description: string;
  scope: "global" | string;
  blocking: boolean;
  autoCheckable: boolean;
}

// ─── Evidence ─────────────────────────────────────────────────────────────────

export type EvidenceType =
  | "campaign_reach"
  | "engagement_increase"
  | "conversion_improvement"
  | "first_round_approval"
  | "delivery_time_reduction"
  | "client_praise"
  | "brand_before_after"
  | "revenue_leads_increase"
  | "briefing_completed"
  | "qualified_lead"
  | "proposal_generated"
  | "objection_resolved"
  | "budget_aligned"
  | "request_converted"
  | "strategy_approved"
  | "positioning_created"
  | "content_territory_defined"
  | "roadmap_created"
  | "opportunity_identified"
  | "content_plan_created"
  | "calendar_generated"
  | "territory_executed"
  | "engagement_improved"
  | "content_approved"
  | "content_published"
  | "social_strategy_executed"
  | "other";

export type EvidenceApprovalStatus = "draft" | "pending_approval" | "approved" | "rejected";

export interface EvidenceItem {
  id: string;
  type: EvidenceType;
  clientId: string;
  context: string;
  actionTaken: string;
  result: string;
  metric: string;
  source: string;
  evidenceFile?: string;
  approvalStatus: EvidenceApprovalStatus;
  canUseCommercially: boolean;
  createdAt: string;
}

// ─── Brain Change Request ─────────────────────────────────────────────────────

export type BrainChangeSource =
  | "training_simulation"
  | "real_client"
  | "approved_delivery"
  | "rejected_delivery"
  | "quality_review"
  | "performance_result"
  | "ceo_instruction"
  | "manual";

export type BrainChangeStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "rejected"
  | "applied"
  | "archived";

// Categories that determine the approval chain.
// Structural categories require CEO approval (see brain-director.ts).
export type BrainChangeCategory =
  | "cognitive_flow"
  | "quality_gate"
  | "department_permissions"
  | "routing"
  | "knowledge_policy"
  | "department_logic";

export type BrainChangeRiskLevel = "low" | "medium" | "high" | "critical";

export interface BrainChangeGovernance {
  source: BrainChangeSource;
  status: BrainChangeStatus;
  approvalRequiredBy: BrainRoleId[];
  autoApplyAllowed: false;
  requiresQualityGate: boolean;
  versionsBrainOnApply: boolean;
}

// ─── Brain Config ─────────────────────────────────────────────────────────────

export interface BrainConfig {
  version: string;
  name: string;
  tagline: string;
  pilotDepartmentId: string;
  roles: BrainRole[];
  engineRoutes: EngineRouteConfig[];
  knowledgeSources: KnowledgeSource[];
  departments: BrainDepartment[];
  cognitiveFlow: CognitiveFlowStep[];
  qualityGates: QualityGateCheck[];
  changeGovernance: BrainChangeGovernance;
}
