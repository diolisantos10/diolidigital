// ─── DB → Mock-data Type Adapters ────────────────────────────────────────────
//
// Pure functions that convert Prisma record shapes to the UI types defined in
// lib/agency/mock-data.ts. No side effects, no imports from @prisma/client
// (keeps this usable in client components).
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Client, Project, Deliverable, Task,
  ProjectProposal, RevisionEntry, BrandBrain, ActivityEvent,
} from "@/lib/agency/mock-data";
import type { MaterialRequest } from "@/lib/agency/workspace";

// ─── Raw DB shapes (matches Prisma output without generated client import) ────

export interface DbClient {
  id: string;
  workspaceId: string;
  name: string;
  industry: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  portalToken: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface DbProject {
  id: string;
  workspaceId: string;
  clientId: string;
  name: string;
  goal: string | null;
  type: string | null;
  stage: string;
  priority: string;
  deadline: string | null;
  proposalStatus: string | null;
  proposalPricing: string | null;
  proposalScope: string | null;
  proposalSentAt: string | null;
  agents: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  client?: { id: string; name: string };
}

export interface DbDeliverable {
  id: string;
  projectId: string;
  name: string;
  type: string;
  status: string;
  revisionStatus: string | null;
  content: string | null;
  clientFeedback: string | null;
  lastFeedback: string | null;
  ownerAgentId: string | null;
  version: number;
  revisionHistory: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface DbTask {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  agentId: string | null;
  status: string;
  dueDate: string | null;
  deliverableId: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateStr(d: string | Date): string {
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

// ─── Adapters ─────────────────────────────────────────────────────────────────

export function dbClientToMock(db: DbClient): Client {
  return {
    id: db.id,
    name: db.name,
    industry: db.industry ?? "",
    website: db.website ?? undefined,
    status: "active",
    createdAt: toDateStr(db.createdAt),
  };
}

export function dbProjectToMock(db: DbProject): Project {
  let agents: string[] = [];
  try { agents = JSON.parse(db.agents); } catch { /* keep empty */ }

  let proposal: ProjectProposal | undefined;
  if (db.proposalStatus) {
    proposal = {
      status: db.proposalStatus as ProjectProposal["status"],
      scope: db.proposalScope ?? "",
      pricing: db.proposalPricing ?? "",
      deliverables: [],
      timeline: "",
    };
  }

  return {
    id: db.id,
    name: db.name,
    clientId: db.clientId,
    goal: db.goal ?? "",
    type: db.type ?? "",
    stage: db.stage as Project["stage"],
    priority: db.priority as Project["priority"],
    deadline: db.deadline ?? "",
    agents,
    createdAt: toDateStr(db.createdAt),
    proposal,
  };
}

export function dbDeliverableToMock(db: DbDeliverable): Deliverable {
  let revisionHistory: RevisionEntry[] = [];
  try { revisionHistory = JSON.parse(db.revisionHistory); } catch { /* keep empty */ }

  return {
    id: db.id,
    projectId: db.projectId,
    name: db.name,
    type: db.type,
    status: db.status as Deliverable["status"],
    version: db.version,
    createdAt: toDateStr(db.createdAt),
    ownerAgentId: db.ownerAgentId ?? undefined,
    revisionStatus: (db.revisionStatus as Deliverable["revisionStatus"]) ?? undefined,
    clientFeedback: db.clientFeedback ?? undefined,
    lastFeedback: db.lastFeedback ?? undefined,
    updatedAt: typeof db.updatedAt === "string" ? db.updatedAt : (db.updatedAt as Date).toISOString(),
    revisionHistory: revisionHistory.length > 0 ? revisionHistory : undefined,
  };
}

export interface DbMaterialRequest {
  id: string;
  projectId: string;
  type: string;          // stored as "type" in DB, maps to "title" in UI
  description: string;
  status: string;
  requestedAt: string | Date;
  resolvedAt?: string | Date | null;
}

export function dbMaterialRequestToMock(db: DbMaterialRequest, clientId: string): MaterialRequest {
  return {
    id: db.id,
    clientId,
    projectId: db.projectId,
    title: db.type,
    description: db.description,
    status: db.status as MaterialRequest["status"],
    requestedAt: typeof db.requestedAt === "string" ? db.requestedAt : (db.requestedAt as Date).toISOString(),
  };
}

// DB BrandBrain has a different schema from the UI BrandBrain.
// We do a best-effort partial mapping; existing fields not in DB are preserved.
export interface DbBrandBrain {
  id: string;
  clientId: string;
  brandName: string | null;
  tagline: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  typography: string | null;
  tone: string | null;
  values: string;        // JSON-encoded string[]
  targetAudience: string | null;
  positioning: string | null;
  updatedAt: string | Date;
}

export function dbBrandBrainToMock(db: DbBrandBrain, existing?: Partial<BrandBrain>): BrandBrain {
  let valuesArr: string[] = [];
  try { valuesArr = JSON.parse(db.values); } catch { /* keep empty */ }

  const colorsStr = [db.primaryColor, db.secondaryColor].filter(Boolean).join(" · ");

  return {
    businessSummary:    existing?.businessSummary    ?? "",
    positioning:        db.positioning               ?? existing?.positioning    ?? "",
    targetAudience:     db.targetAudience            ?? existing?.targetAudience ?? "",
    toneOfVoice:        db.tone                      ?? existing?.toneOfVoice    ?? "",
    visualStyle:        existing?.visualStyle        ?? "",
    brandRules:         valuesArr.length > 0 ? valuesArr.join("\n") : (existing?.brandRules ?? ""),
    productsToHighlight: existing?.productsToHighlight ?? "",
    thingsToAvoid:      existing?.thingsToAvoid      ?? "",
    preferredChannels:  existing?.preferredChannels  ?? "",
    strategicNotes:     existing?.strategicNotes     ?? "",
    colors:             colorsStr || existing?.colors || "",
    fonts:              db.typography                ?? existing?.fonts          ?? "",
    references:         existing?.references         ?? "",
  };
}

export interface DbActivityEvent {
  id: string;
  workspaceId: string;
  projectId: string | null;
  type: string;
  message: string;
  clientId: string | null;
  timestamp: string | Date;
}

export function dbActivityEventToMock(db: DbActivityEvent): ActivityEvent {
  return {
    id: db.id,
    type: db.type as ActivityEvent["type"],
    message: db.message,
    timestamp: typeof db.timestamp === "string" ? db.timestamp : (db.timestamp as Date).toISOString(),
    projectId: db.projectId ?? undefined,
    clientId: db.clientId ?? undefined,
  };
}

export function dbTaskToMock(db: DbTask): Task {
  return {
    id: db.id,
    projectId: db.projectId,
    title: db.title,
    description: db.description ?? "",
    agentId: db.agentId ?? "",
    status: db.status as Task["status"],
    dueDate: db.dueDate ?? toDateStr(db.createdAt),
    deliverableId: db.deliverableId ?? undefined,
  };
}
