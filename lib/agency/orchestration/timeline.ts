// ─── Project Execution Timeline ───────────────────────────────────────────────
//
// Builds a chronological event sequence for a project from available signals:
// activity log, deliverable history, strategy rooms, proposal state.
// Pure function — no store access, no side effects.
// ─────────────────────────────────────────────────────────────────────────────

import type { Project, Deliverable, ActivityEvent, StrategyRoom, Client } from "@/lib/agency/mock-data";
import type { MaterialRequest } from "@/lib/agency/workspace";

export type TimelineEventType =
  | "project_created"
  | "brand_brain_ready"
  | "strategy_generated"
  | "proposal_sent"
  | "proposal_approved"
  | "execution_started"
  | "social_generated"
  | "design_generated"
  | "ads_generated"
  | "deliverable_sent_review"
  | "deliverable_approved"
  | "revision_requested"
  | "revision_resolved"
  | "material_request"
  | "material_received"
  | "project_completed";

export type TimelineEventDept = "social" | "design" | "ads" | "pm" | "client";

export interface ProjectTimelineEvent {
  id: string;
  type: TimelineEventType;
  label: string;
  dept: TimelineEventDept;
  timestamp: string;         // ISO string
  detail?: string;
}

// ─── Department type sets ──────────────────────────────────────────────────────

const SOCIAL_TYPES = new Set(["Content Strategy", "Content Calendar", "Posts", "Stories"]);
const DESIGN_TYPES = new Set(["Design", "Visual Identity", "Brand Assets"]);
const ADS_TYPES = new Set(["Ads Strategy", "Campaign Structure", "Audience Plan", "Ad Copy", "Creative Requirements", "Optimization Notes"]);

// ─── Core builder ─────────────────────────────────────────────────────────────

export function buildProjectTimeline(input: {
  project: Project;
  client?: Client;
  deliverables: Deliverable[];
  activity: ActivityEvent[];
  materialRequests: MaterialRequest[];
  strategyRooms: StrategyRoom[];
}): ProjectTimelineEvent[] {
  const { project, client, deliverables, activity, materialRequests, strategyRooms } = input;
  const pd = deliverables.filter((d) => d.projectId === project.id);
  const pa = activity.filter((e) => e.projectId === project.id);
  const pm = materialRequests.filter((r) => r.projectId === project.id);
  const strategyRoom = strategyRooms.find((r) => r.projectId === project.id);

  const events: ProjectTimelineEvent[] = [];

  // ── 1. Project created ────────────────────────────────────────────────────
  events.push({
    id: "project-created",
    type: "project_created",
    label: "Projeto criado",
    dept: "pm",
    timestamp: project.createdAt + "T00:00:00.000Z",
    detail: project.type ?? undefined,
  });

  // ── 2. Brand Brain ready ──────────────────────────────────────────────────
  const hasBrandBrain = !!client?.brandBrain?.businessSummary;
  if (hasBrandBrain) {
    events.push({
      id: "brand-brain-ready",
      type: "brand_brain_ready",
      label: "Brand Brain configurado",
      dept: "pm",
      timestamp: project.createdAt + "T00:01:00.000Z",
    });
  }

  // ── 3. Strategy Room generated ────────────────────────────────────────────
  if (strategyRoom) {
    const actEvent = pa.find((e) => e.type === "strategy_room_generated");
    events.push({
      id: "strategy-generated",
      type: "strategy_generated",
      label: "Strategy Room gerado",
      dept: "pm",
      timestamp: actEvent?.timestamp ?? strategyRoom.generatedAt ?? project.createdAt + "T01:00:00.000Z",
    });
  }

  // ── 4. Proposal sent ──────────────────────────────────────────────────────
  const proposalSentAct = pa.find((e) => e.type === "proposal_sent");
  const proposalStatus = project.proposal?.status;
  if (proposalStatus && proposalStatus !== "draft") {
    events.push({
      id: "proposal-sent",
      type: "proposal_sent",
      label: "Proposta enviada ao cliente",
      dept: "pm",
      timestamp: proposalSentAct?.timestamp ?? project.createdAt + "T02:00:00.000Z",
      detail: project.proposal?.pricing ?? undefined,
    });
  }

  // ── 5. Proposal approved ─────────────────────────────────────────────────
  const proposalApprovedAct = pa.find((e) => e.type === "proposal_approved");
  if (proposalStatus === "approved") {
    events.push({
      id: "proposal-approved",
      type: "proposal_approved",
      label: "Proposta aprovada",
      dept: "client",
      timestamp: proposalApprovedAct?.timestamp ?? project.createdAt + "T03:00:00.000Z",
    });
  }

  // ── 6. Social Media generated ─────────────────────────────────────────────
  const socialDelivs = pd.filter((d) => SOCIAL_TYPES.has(d.type));
  if (socialDelivs.length > 0) {
    const earliest = socialDelivs.reduce((a, b) => a.createdAt < b.createdAt ? a : b);
    events.push({
      id: "social-generated",
      type: "social_generated",
      label: "Redes Sociais geradas",
      dept: "social",
      timestamp: earliest.createdAt + (earliest.createdAt.includes("T") ? "" : "T08:00:00.000Z"),
      detail: `${socialDelivs.length} entrega(s)`,
    });
  }

  // ── 7. Design generated ───────────────────────────────────────────────────
  const designDelivs = pd.filter((d) => DESIGN_TYPES.has(d.type));
  if (designDelivs.length > 0) {
    const earliest = designDelivs.reduce((a, b) => a.createdAt < b.createdAt ? a : b);
    events.push({
      id: "design-generated",
      type: "design_generated",
      label: "Design gerado",
      dept: "design",
      timestamp: earliest.createdAt + (earliest.createdAt.includes("T") ? "" : "T09:00:00.000Z"),
      detail: `${designDelivs.length} entrega(s)`,
    });
  }

  // ── 8. Ads generated ──────────────────────────────────────────────────────
  const adsDelivs = pd.filter((d) => ADS_TYPES.has(d.type));
  if (adsDelivs.length > 0) {
    const earliest = adsDelivs.reduce((a, b) => a.createdAt < b.createdAt ? a : b);
    events.push({
      id: "ads-generated",
      type: "ads_generated",
      label: "Tráfego Pago gerado",
      dept: "ads",
      timestamp: earliest.createdAt + (earliest.createdAt.includes("T") ? "" : "T10:00:00.000Z"),
      detail: `${adsDelivs.length} entrega(s)`,
    });
  }

  // ── 9. First deliverable sent to client ───────────────────────────────────
  const firstInReview = pd
    .filter((d) => d.revisionHistory?.some((r) => r.status === "in_review") || d.status === "in_review")
    .sort((a, b) => (a.updatedAt ?? a.createdAt).localeCompare(b.updatedAt ?? b.createdAt))[0];
  if (firstInReview) {
    const ts = firstInReview.revisionHistory?.find((r) => r.status === "in_review")?.timestamp ?? firstInReview.updatedAt ?? firstInReview.createdAt;
    events.push({
      id: "first-review",
      type: "deliverable_sent_review",
      label: "Primeira entrega enviada para revisão",
      dept: "client",
      timestamp: ts,
      detail: firstInReview.name,
    });
  }

  // ── 10. Revision requested ────────────────────────────────────────────────
  const revisionActs = pa.filter((e) => e.type === "change_requested");
  for (const act of revisionActs.slice(0, 2)) {
    events.push({
      id: `revision-${act.id}`,
      type: "revision_requested",
      label: "Revisão solicitada pelo cliente",
      dept: "client",
      timestamp: act.timestamp,
      detail: act.message,
    });
  }

  // ── 11. Revision resolved ─────────────────────────────────────────────────
  const resolvedActs = pa.filter((e) => e.type === "revision_resolved");
  for (const act of resolvedActs.slice(0, 2)) {
    events.push({
      id: `resolved-${act.id}`,
      type: "revision_resolved",
      label: "Revisão concluída",
      dept: "pm",
      timestamp: act.timestamp,
    });
  }

  // ── 12. First approval ────────────────────────────────────────────────────
  const firstApproved = pd
    .filter((d) => d.status === "approved" || d.status === "delivered")
    .sort((a, b) => (a.updatedAt ?? a.createdAt).localeCompare(b.updatedAt ?? b.createdAt))[0];
  if (firstApproved) {
    events.push({
      id: "first-approved",
      type: "deliverable_approved",
      label: "Primeira entrega aprovada",
      dept: "client",
      timestamp: firstApproved.updatedAt ?? firstApproved.createdAt + "T00:00:00.000Z",
      detail: firstApproved.name,
    });
  }

  // ── 13. Material requests ─────────────────────────────────────────────────
  for (const mr of pm.slice(0, 2)) {
    events.push({
      id: `mr-${mr.id}`,
      type: "material_request",
      label: "Material solicitado ao cliente",
      dept: "pm",
      timestamp: mr.requestedAt ?? project.createdAt + "T00:30:00.000Z",
      detail: mr.title,
    });
    if (mr.status === "received") {
      events.push({
        id: `mr-resolved-${mr.id}`,
        type: "material_received",
        label: "Material recebido",
        dept: "client",
        timestamp: mr.requestedAt ?? project.createdAt + "T00:30:00.000Z",
        detail: mr.title,
      });
    }
  }

  // ── 14. Project completed ─────────────────────────────────────────────────
  if (project.stage === "completed") {
    events.push({
      id: "project-completed",
      type: "project_completed",
      label: "Projeto concluído",
      dept: "pm",
      timestamp: project.deadline + "T23:59:00.000Z",
    });
  }

  // Sort chronologically
  return events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

// ─── Style helpers ─────────────────────────────────────────────────────────────

export const TIMELINE_DEPT_STYLE: Record<TimelineEventDept, { dot: string; label: string }> = {
  pm:     { dot: "#1A1A1A", label: "PM" },
  social: { dot: "#5B5BD6", label: "Social" },
  design: { dot: "#C2530A", label: "Design" },
  ads:    { dot: "#0E7490", label: "Ads" },
  client: { dot: "#7C3AED", label: "Cliente" },
};
