// Dioli Brain — Current System Map
// Maps every existing module to its Brain layer.
// This is the adapter reference — use it to gradually connect existing code to Brain logic.

export interface SystemModuleMapping {
  moduleId: string;
  label: string;
  currentPath: string;
  brainLayer: "intake" | "knowledge_base" | "cognitive_flow" | "department_scope" | "training" | "quality" | "evidence" | "governance";
  brainDepartmentId: string | null;
  status: "mapped" | "partial" | "unmapped" | "needs_refactor";
  notes: string;
}

export const CURRENT_SYSTEM_MAP: SystemModuleMapping[] = [
  {
    moduleId: "briefing_room",
    label: "Briefing Room",
    currentPath: "/briefing + components/agency/briefing/BriefingRoomV2.tsx",
    brainLayer: "intake",
    brainDepartmentId: "client-service-sdr",
    status: "mapped",
    notes:
      "Briefing Room is the intake layer for the SDR department. " +
      "Feeds Knowledge Base (Briefings) and creates Client Requests. " +
      "Must explicitly adopt Dioli Cognitive Flow steps 1–5 in v2.",
  },
  {
    moduleId: "sdr_agent",
    label: "SDR Agent",
    currentPath: "lib/agency/sdr-agent.ts",
    brainLayer: "department_scope",
    brainDepartmentId: "client-service-sdr",
    status: "mapped",
    notes:
      "First pilot department agent. " +
      "Already has training, evaluator, simulator and handoff model. " +
      "Must add brainReasoningOutput field to SDRHandoff in v2.",
  },
  {
    moduleId: "training_center",
    label: "Training Center (SDR)",
    currentPath: "/agency/simulations/training + lib/agency/training/*",
    brainLayer: "training",
    brainDepartmentId: "client-service-sdr",
    status: "mapped",
    notes:
      "Fully operational. Daily cap enforced. Cron endpoint ready. " +
      "Training signals must flow into BrainChangeRequest governance queue in v2.",
  },
  {
    moduleId: "lab_simulations",
    label: "Laboratório / Simulações",
    currentPath: "/agency/simulations",
    brainLayer: "quality",
    brainDepartmentId: null,
    status: "partial",
    notes:
      "Maps to Quality & Simulation layer. Currently only SDR simulation active. " +
      "Future: all departments have simulators.",
  },
  {
    moduleId: "brand_brain",
    label: "Brand Brain (por cliente)",
    currentPath: "prisma: BrandBrain + /agency/clients/[id]",
    brainLayer: "knowledge_base",
    brainDepartmentId: null,
    status: "mapped",
    notes:
      "Central knowledge node per client. Already feeds SDR, Strategy, Design, Social. " +
      "Maps directly to knowledge_source: client_brand_brain.",
  },
  {
    moduleId: "brand_assets",
    label: "Brand Assets",
    currentPath: "/agency/brand-assets + lib/agency/brand-parser.ts",
    brainLayer: "knowledge_base",
    brainDepartmentId: "design",
    status: "mapped",
    notes:
      "Maps to Knowledge Base source: brand_assets. " +
      "Owned by Design/Brand Hub departments.",
  },
  {
    moduleId: "strategy_room",
    label: "Strategy Room",
    currentPath: "/agency/orchestrator + prisma: StrategyRoom",
    brainLayer: "cognitive_flow",
    brainDepartmentId: "strategy",
    status: "partial",
    notes:
      "Multi-specialist reasoning output. Stored as JSON. " +
      "Currently triggered manually — must become output of Cognitive Flow steps 5–8 in v2.",
  },
  {
    moduleId: "client_requests",
    label: "Solicitações do Cliente",
    currentPath: "/agency/requests + lib/agency/client-requests.ts",
    brainLayer: "intake",
    brainDepartmentId: "project-management",
    status: "mapped",
    notes:
      "Maps to PM intake queue. Receives Brain output from Briefing Room.",
  },
  {
    moduleId: "projects_pipeline",
    label: "Projetos / Pipeline / Tarefas",
    currentPath: "/agency/projects + /agency/pipeline + /agency/tasks",
    brainLayer: "department_scope",
    brainDepartmentId: "project-management",
    status: "mapped",
    notes:
      "Maps to PM execution layer. Auto-task generation already exists. " +
      "Handoff contracts defined in operating-model.ts.",
  },
  {
    moduleId: "departments",
    label: "Departamentos (shells)",
    currentPath: "lib/agency/departments.ts + /agency/departments/*",
    brainLayer: "department_scope",
    brainDepartmentId: null,
    status: "needs_refactor",
    notes:
      "Existing shells must be remapped under Brain department definitions. " +
      "Use department-adapter.ts to bridge old → new without breaking UI.",
  },
  {
    moduleId: "department_blueprint",
    label: "Department Blueprint",
    currentPath: "lib/agency/department-blueprint.ts",
    brainLayer: "department_scope",
    brainDepartmentId: null,
    status: "partial",
    notes:
      "Design = gold standard (fully configured). Others = shells. " +
      "Blueprint quality checklists must become Brain Quality Gates in v2.",
  },
  {
    moduleId: "operating_model",
    label: "Operating Model",
    currentPath: "lib/agency/operating-model.ts",
    brainLayer: "department_scope",
    brainDepartmentId: null,
    status: "partial",
    notes:
      "Input/Output/Handoff contracts for Strategy, Social, Design, Paid Traffic. " +
      "Maps to BrainDepartment.allowedKnowledgeSources and humanApprovalTriggers.",
  },
  {
    moduleId: "intelligence_engines",
    label: "Intelligence Engines (por departamento)",
    currentPath: "lib/agency/intelligence/*.ts",
    brainLayer: "cognitive_flow",
    brainDepartmentId: null,
    status: "needs_refactor",
    notes:
      "Rule-based engines per department. Currently operate independently. " +
      "Must be wrapped in Cognitive Flow steps in v2 — they become the execution layer of steps 5–8.",
  },
  {
    moduleId: "system_doctor",
    label: "System Doctor",
    currentPath: "lib/agency/system-doctor.ts + /agency/settings",
    brainLayer: "quality",
    brainDepartmentId: "quality",
    status: "mapped",
    notes:
      "Maps to Quality Gate / operational health. " +
      "Future: integrates with Brain Director alert queue.",
  },
  {
    moduleId: "brain_change_request",
    label: "BrainChangeRequest",
    currentPath: "prisma: BrainChangeRequest",
    brainLayer: "governance",
    brainDepartmentId: null,
    status: "partial",
    notes:
      "Model exists. Not yet surfaced in UI as the central governance queue. " +
      "Must become the primary interface for Brain Director review in v2.",
  },
  {
    moduleId: "onboarding",
    label: "Onboarding",
    currentPath: "lib/onboarding/* + components/agency/onboarding/*",
    brainLayer: "intake",
    brainDepartmentId: null,
    status: "unmapped",
    notes:
      "Usability/enablement layer. Not part of Brain core. " +
      "Maps to future 'enablement' layer outside Brain architecture.",
  },
];

export function getModulesByBrainLayer(layer: SystemModuleMapping["brainLayer"]): SystemModuleMapping[] {
  return CURRENT_SYSTEM_MAP.filter((m) => m.brainLayer === layer);
}

export function getMappedModules(): SystemModuleMapping[] {
  return CURRENT_SYSTEM_MAP.filter((m) => m.status === "mapped");
}

export function getModulesNeedingRefactor(): SystemModuleMapping[] {
  return CURRENT_SYSTEM_MAP.filter((m) => m.status === "needs_refactor");
}

export function getModulesByDepartment(departmentId: string): SystemModuleMapping[] {
  return CURRENT_SYSTEM_MAP.filter((m) => m.brainDepartmentId === departmentId);
}
