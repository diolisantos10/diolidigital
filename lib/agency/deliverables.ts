// ─── Deliverable Review Lifecycle — owner inference & helpers ─────────────────
//
// Pure, tolerant helpers for the Deliverable Review System V1.
// Every helper safely defaults when legacy deliverables lack the new fields:
//   - version  → 1
//   - history  → []
//   - owner    → inferred from the deliverable type
//
// No store access here — these are used by both internal views and selectors.
// ─────────────────────────────────────────────────────────────────────────────

import { Deliverable, RevisionEntry, MOCK_AGENTS } from "./mock-data";

export interface DeliverableOwner {
  id: string;
  name: string;
}

// The Project Manager is a role, not a MOCK_AGENT — used as the fallback owner.
export const PROJECT_MANAGER: DeliverableOwner = { id: "pm", name: "Gerente de Projeto" };

function agentOwner(id: string): DeliverableOwner {
  const a = MOCK_AGENTS.find((x) => x.id === id);
  return a ? { id: a.id, name: a.name } : PROJECT_MANAGER;
}

// Infer the responsible owner purely from the deliverable type.
//   Content Strategy / Content Calendar / Posts / Stories → Social Media Agent (a3)
//   Design Requests / Design                              → Design Agent (a2)
//   Proposal                                              → Project Manager
//   fallback                                              → Project Manager
export function inferOwnerAgent(type: string): DeliverableOwner {
  const t = type.toLowerCase();
  if (
    t.includes("content strategy") ||
    t.includes("content calendar") ||
    t.includes("post") ||
    t.includes("stories") ||
    t.includes("story") ||
    t.includes("social") ||
    t.includes("caption")
  ) {
    return agentOwner("a3");
  }
  if (
    t.includes("design") ||
    t.includes("visual") ||
    t.includes("asset") ||
    t.includes("identity") ||
    t.includes("brand")
  ) {
    return agentOwner("a2");
  }
  // Proposal and everything else fall to the Project Manager.
  return PROJECT_MANAGER;
}

// Resolve the owner from a deliverable, inferring if not yet stored.
export function getOwner(d: Deliverable): DeliverableOwner {
  if (d.ownerAgentId) {
    if (d.ownerAgentId === PROJECT_MANAGER.id) return PROJECT_MANAGER;
    const a = MOCK_AGENTS.find((x) => x.id === d.ownerAgentId);
    if (a) return { id: a.id, name: a.name };
  }
  return inferOwnerAgent(d.type);
}

export function getVersion(d: Deliverable): number {
  return d.version ?? 1;
}

export function getRevisionHistory(d: Deliverable): RevisionEntry[] {
  return d.revisionHistory ?? [];
}

// Whether the deliverable currently needs internal revision work.
// Backward-compatible: legacy "draft + clientFeedback" counts as revision-needed.
export function needsRevision(d: Deliverable): boolean {
  if (d.revisionStatus === "revision_requested" || d.revisionStatus === "in_revision") return true;
  return d.status === "draft" && !!d.clientFeedback;
}

// Whether the deliverable is sitting with the client for approval.
export function isAwaitingClient(d: Deliverable): boolean {
  return d.status === "in_review";
}

// The single most recent feedback captured on the deliverable.
export function getLastFeedback(d: Deliverable): string | undefined {
  return d.lastFeedback ?? d.clientFeedback;
}

// A short excerpt of the last feedback, for compact table/list rows.
export function getFeedbackExcerpt(d: Deliverable, max = 80): string | undefined {
  const fb = getLastFeedback(d);
  if (!fb) return undefined;
  return fb.length > max ? `${fb.slice(0, max).trim()}…` : fb;
}

// Human, internal-facing "next action" string for a deliverable.
export function getDeliverableNextAction(d: Deliverable): string {
  if (needsRevision(d)) {
    const owner = getOwner(d);
    return `Revisão necessária por ${owner.name}`;
  }
  if (d.status === "in_review") return "Aguardando aprovação do cliente";
  if (d.status === "approved") return "Aprovado — pronto para entrega final";
  if (d.status === "delivered") return "Entregue ao cliente";
  return "Pronto para enviar à revisão do cliente";
}

// Label for the revision status chip.
export const REVISION_STATUS_LABEL: Record<NonNullable<Deliverable["revisionStatus"]>, string> = {
  none: "Sem revisão",
  revision_requested: "Revisão solicitada",
  in_revision: "Em revisão",
  resolved: "Revisão concluída",
};

export const REVISION_AUTHOR_LABEL: Record<RevisionEntry["author"], string> = {
  client: "Cliente",
  internal: "Equipe",
  agent: "Agente",
};
