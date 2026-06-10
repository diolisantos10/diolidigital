// Dioli Brain — Department Adapter
// Bridges existing DepartmentDef (operational shell) to BrainDepartment (cognitive layer).
// Existing department UI remains unchanged.
// This adapter is the progressive migration path — use it to gradually consume Brain definitions.

import type { DepartmentDef } from "@/lib/agency/departments";
import type { BrainDepartment } from "./types";
import { BRAIN_DEPARTMENTS } from "./departments";

// Maps existing DepartmentId to BrainDepartment id.
// Some department IDs differ between the two systems (e.g. sdr wasn't in the original).
const DEPT_ID_BRIDGE: Record<string, string> = {
  "project-management": "project-management",
  strategy:             "strategy",
  "brand-hub":          "design",
  "social-media":       "social-media",
  design:               "design",
  "paid-traffic":       "paid-traffic",
  operations:           "quality",
};

export function getBrainDepartmentForExisting(legacyDeptId: string): BrainDepartment | undefined {
  const brainId = DEPT_ID_BRIDGE[legacyDeptId];
  if (!brainId) return undefined;
  return BRAIN_DEPARTMENTS.find((d) => d.id === brainId);
}

// Returns a merged view — legacy operational data + Brain governance data.
// Safe to call even when Brain department is not yet defined (returns null for brain fields).
export interface MergedDepartmentView {
  // From DepartmentDef (operational shell — always present)
  legacyId: string;
  name: string;
  mission: string;
  color: string;
  accentBg: string;
  iconKey: string;
  generatorRoute?: string;
  generatorLabel?: string;

  // From BrainDepartment (cognitive layer — may be null)
  brainId: string | null;
  brainStatus: BrainDepartment["firstVersionStatus"] | null;
  qualityGate: string[];
  humanApprovalTriggers: string[];
  suggestedAIEngine: BrainDepartment["suggestedAIEngine"] | null;
  evidenceTypes: BrainDepartment["evidenceTypes"];
  allowedKnowledgeSources: string[];
}

export function mergeDepartmentView(legacyDept: DepartmentDef): MergedDepartmentView {
  const brain = getBrainDepartmentForExisting(legacyDept.id);

  return {
    // Operational shell — always present
    legacyId:       legacyDept.id,
    name:           legacyDept.name,
    mission:        legacyDept.mission,
    color:          legacyDept.color,
    accentBg:       legacyDept.accentBg,
    iconKey:        legacyDept.iconKey,
    generatorRoute: legacyDept.generatorRoute,
    generatorLabel: legacyDept.generatorLabel,

    // Cognitive layer — from Brain definition
    brainId:                  brain?.id ?? null,
    brainStatus:              brain?.firstVersionStatus ?? null,
    qualityGate:              brain?.qualityGate ?? [],
    humanApprovalTriggers:    brain?.humanApprovalTriggers ?? [],
    suggestedAIEngine:        brain?.suggestedAIEngine ?? null,
    evidenceTypes:            brain?.evidenceTypes ?? [],
    allowedKnowledgeSources:  brain?.allowedKnowledgeSources ?? [],
  };
}

// Status badge helpers for UI
export const BRAIN_STATUS_LABELS: Record<BrainDepartment["firstVersionStatus"], string> = {
  existing:       "Existente",
  partial:        "Parcial",
  missing:        "Ausente",
  needs_refactor: "Refatorar",
};

export const BRAIN_STATUS_COLORS: Record<BrainDepartment["firstVersionStatus"], string> = {
  existing:       "#16A34A",
  partial:        "#D97706",
  missing:        "#DC2626",
  needs_refactor: "#7C3AED",
};
