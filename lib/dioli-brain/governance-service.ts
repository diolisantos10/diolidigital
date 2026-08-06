// Dioli Brain — Governance Service
// Server-side service for the Brain Director governance queue.
// Lifecycle: draft → pending_review → approved/rejected → applied → archived
// Rules:
//   - No agent modifies the Brain directly — everything passes through here.
//   - Approval never auto-applies. Apply is a separate, explicit transition.
//   - Every applied change creates a BrainVersion entry (governance only — no runtime mutation).
//   - Structural categories require CEO approval (see brain-director.ts).

import { prisma } from "@/lib/db/client";
import { workspaceUnico } from "@/lib/auth/posse-de-workspace";
import type {
  BrainChangeSource,
  BrainChangeStatus,
  BrainChangeCategory,
  BrainChangeRiskLevel,
  BrainRoleId,
} from "./types";
import { getRequiredApproversForChange } from "./brain-director";
import { BRAIN_VERSION } from "./brain-config";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GovernanceChangeRequest {
  id: string;
  agentId: string;
  title: string;
  description: string;
  rationale: string;
  expectedImpact: string;
  proposedChange: string;
  source: BrainChangeSource;
  department: string;
  category: BrainChangeCategory;
  riskLevel: BrainChangeRiskLevel;
  requestedBy: string;
  approvalRequiredBy: BrainRoleId[];
  status: BrainChangeStatus;
  sourceSuggestionIds: string[];
  createdAt: string;
  reviewedAt: string | null;
  approvedAt: string | null;
  appliedAt: string | null;
  reviewNote: string | null;
  requiresCeoApproval: boolean;
}

export interface BrainVersionEntry {
  id: string;
  version: string;
  summary: string;
  changeRequestId: string | null;
  createdAt: string;
}

export interface GovernanceSummary {
  counts: {
    draft: number;
    pending_review: number;
    approved: number;
    rejected: number;
    applied: number;
    archived: number;
  };
  currentVersion: string;
  requests: GovernanceChangeRequest[];
  versions: BrainVersionEntry[];
}

export interface CreateChangeRequestInput {
  title: string;
  description?: string;
  rationale?: string;
  expectedImpact?: string;
  proposedChange: string;
  source?: BrainChangeSource;
  department?: string;
  category?: BrainChangeCategory;
  riskLevel?: BrainChangeRiskLevel;
  requestedBy?: string;
  agentId?: string;
  sourceSuggestionIds?: string[];
  status?: "draft" | "pending_review";
  /** O DONO. Derivado da sessão de quem abriu ou herdado da sugestão de origem
   *  — nunca lido do corpo da requisição. Ausente = linha órfã, e órfã é
   *  julgada pela política fail-closed de `lib/auth/posse-de-workspace.ts`. */
  workspaceId?: string;
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

export type GovernanceAction = "submit" | "approve" | "reject" | "apply" | "archive";

// Legacy rows created before the governance layer use status "pending".
function normalizeStatus(status: string): BrainChangeStatus {
  if (status === "pending") return "pending_review";
  return status as BrainChangeStatus;
}

const VALID_TRANSITIONS: Record<GovernanceAction, { from: BrainChangeStatus[]; to: BrainChangeStatus }> = {
  submit:  { from: ["draft"],                          to: "pending_review" },
  approve: { from: ["pending_review"],                 to: "approved" },
  reject:  { from: ["pending_review"],                 to: "rejected" },
  apply:   { from: ["approved"],                       to: "applied" },
  archive: { from: ["rejected", "applied", "approved", "draft"], to: "archived" },
};

// CEO-approval categories — structural Brain changes.
export const CEO_APPROVAL_CATEGORIES: BrainChangeCategory[] = [
  "cognitive_flow",
  "quality_gate",
  "department_permissions",
  "routing",
  "knowledge_policy",
];

export function requiresCeoApproval(category: BrainChangeCategory): boolean {
  return CEO_APPROVAL_CATEGORIES.includes(category);
}

// ── Serialisation ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deserialize(row: any): GovernanceChangeRequest {
  const category = (row.category ?? "department_logic") as BrainChangeCategory;
  let approvers: BrainRoleId[];
  try {
    const parsed = JSON.parse(row.approvalRequiredBy);
    approvers = Array.isArray(parsed) ? parsed : [row.approvalRequiredBy];
  } catch {
    approvers = [row.approvalRequiredBy as BrainRoleId];
  }
  const toIso = (v: Date | string | null) =>
    v == null ? null : v instanceof Date ? v.toISOString() : String(v);

  return {
    id:                  row.id,
    agentId:             row.agentId,
    title:               row.title,
    description:         row.description ?? "",
    rationale:           row.rationale ?? "",
    expectedImpact:      row.expectedImpact ?? "",
    proposedChange:      row.proposedChange,
    source:              (row.source ?? "manual") as BrainChangeSource,
    department:          row.department ?? "client-service-sdr",
    category,
    riskLevel:           (row.riskLevel ?? "medium") as BrainChangeRiskLevel,
    requestedBy:         row.requestedBy ?? "system",
    approvalRequiredBy:  approvers,
    status:              normalizeStatus(row.status),
    sourceSuggestionIds: (() => { try { return JSON.parse(row.sourceSuggestionIds) as string[]; } catch { return []; } })(),
    createdAt:           toIso(row.createdAt)!,
    reviewedAt:          toIso(row.reviewedAt),
    approvedAt:          toIso(row.approvedAt),
    appliedAt:           toIso(row.appliedAt),
    reviewNote:          row.reviewNote ?? null,
    requiresCeoApproval: requiresCeoApproval(category),
  };
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createChangeRequest(input: CreateChangeRequestInput): Promise<GovernanceChangeRequest> {
  const category = input.category ?? "department_logic";
  const finalApprovers: BrainRoleId[] = getRequiredApproversForChange(category);

  const row = await prisma.brainChangeRequest.create({
    data: {
      workspaceId:         input.workspaceId ?? null,
      agentId:             input.agentId ?? "brain",
      title:               input.title,
      description:         input.description ?? "",
      rationale:           input.rationale ?? "",
      expectedImpact:      input.expectedImpact ?? "",
      proposedChange:      input.proposedChange,
      source:              input.source ?? "manual",
      department:          input.department ?? "client-service-sdr",
      category,
      riskLevel:           input.riskLevel ?? "medium",
      requestedBy:         input.requestedBy ?? "system",
      approvalRequiredBy:  JSON.stringify(finalApprovers),
      status:              input.status ?? "pending_review",
      sourceSuggestionIds: JSON.stringify(input.sourceSuggestionIds ?? []),
    },
  });
  return deserialize(row);
}

// ── Transition ────────────────────────────────────────────────────────────────

export async function transitionChangeRequest(
  id: string,
  action: GovernanceAction,
  reviewNote?: string,
): Promise<GovernanceChangeRequest> {
  const row = await prisma.brainChangeRequest.findUnique({ where: { id } });
  if (!row) throw new Error(`BrainChangeRequest ${id} not found`);

  const current = normalizeStatus(row.status);
  const transition = VALID_TRANSITIONS[action];
  if (!transition) throw new Error(`Invalid action: ${action}`);
  if (!transition.from.includes(current)) {
    throw new Error(
      `Invalid transition: cannot ${action} a request in status "${current}". ` +
      `Allowed from: ${transition.from.join(", ")}`,
    );
  }

  const now = new Date();
  const data: Record<string, unknown> = { status: transition.to };
  if (action === "approve") { data.approvedAt = now; data.reviewedAt = now; }
  if (action === "reject")  { data.reviewedAt = now; }
  if (action === "apply")   { data.appliedAt  = now; }
  if (reviewNote)           { data.reviewNote = reviewNote; }

  const updated = await prisma.brainChangeRequest.update({ where: { id }, data });

  // Applied changes increment the Brain version history.
  // Governance only — no runtime mutation of Brain logic.
  if (action === "apply") {
    const nextVersion = await computeNextVersion();
    await prisma.brainVersion.create({
      data: {
        version:         nextVersion,
        summary:         updated.title,
        changeRequestId: updated.id,
      },
    });
  }

  return deserialize(updated);
}

// ── Versioning ────────────────────────────────────────────────────────────────

// Brain v1 → v1.1 → v1.2 … minor increments per applied change.
async function computeNextVersion(): Promise<string> {
  const latest = await prisma.brainVersion.findFirst({ orderBy: { createdAt: "desc" } });
  const base = latest?.version ?? BRAIN_VERSION; // "1.0.0"
  const parts = base.split(".").map((n) => parseInt(n, 10) || 0);
  const [major, minor] = [parts[0] ?? 1, parts[1] ?? 0];
  return `${major}.${minor + 1}.0`;
}

export async function getCurrentBrainVersion(): Promise<string> {
  const latest = await prisma.brainVersion.findFirst({ orderBy: { createdAt: "desc" } });
  return latest?.version ?? BRAIN_VERSION;
}

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * `workspaceId` fecha a LISTAGEM na mesma fronteira que a transição. Sem ele, a
 * tela de governança do workspace A mostrava a fila inteira do banco — a metade
 * de LEITURA do mesmo furo que o raio-x pescou na metade de escrita.
 *
 * O filtro vai no WHERE (defesa no banco, não só no `if`), e a órfã entra pelo
 * `OR` para ser julgada pela política única.
 */
export async function getGovernanceSummary(workspaceId?: string): Promise<GovernanceSummary> {
  const unico = workspaceId ? await workspaceUnico() : { id: null, ambiguo: false };
  const [linhas, versions, currentVersion] = await Promise.all([
    prisma.brainChangeRequest.findMany({
      where: workspaceId ? { OR: [{ workspaceId }, { workspaceId: null }] } : undefined,
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.brainVersion.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    getCurrentBrainVersion(),
  ]);

  const rows = workspaceId
    ? linhas.filter((l) => (l.workspaceId ? l.workspaceId === workspaceId : unico.id === workspaceId))
    : linhas;

  const requests = rows.map(deserialize);
  const counts = {
    draft:          0,
    pending_review: 0,
    approved:       0,
    rejected:       0,
    applied:        0,
    archived:       0,
  };
  for (const r of requests) counts[r.status] += 1;

  return {
    counts,
    currentVersion,
    requests,
    versions: versions.map((v) => ({
      id:              v.id,
      version:         v.version,
      summary:         v.summary,
      changeRequestId: v.changeRequestId,
      createdAt:       v.createdAt.toISOString(),
    })),
  };
}
