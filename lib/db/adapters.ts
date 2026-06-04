// ─── DB → Mock-data Type Adapters ────────────────────────────────────────────
//
// Pure functions that convert Prisma record shapes to the UI types defined in
// lib/agency/mock-data.ts. No side effects, no imports from @prisma/client
// (keeps this usable in client components).
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Client, Project, Deliverable, Task,
  ProjectProposal, RevisionEntry,
} from "@/lib/agency/mock-data";

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
