// ─── Department Health Engine ─────────────────────────────────────────────────
//
// Computes per-department operational health across all active projects.
// Answers: "Which department is overloaded? Which is idle? What needs attention?"
// Pure function — no store access, no side effects.
// ─────────────────────────────────────────────────────────────────────────────

import type { Project, Deliverable, Task } from "@/lib/agency/mock-data";
import { needsRevision } from "@/lib/agency/deliverables";

export type DeptHealthLevel = "healthy" | "attention" | "overloaded" | "idle";

export interface DeptHealthMetrics {
  generated: number;       // total deliverables produced
  pendingReview: number;   // in_review with the client
  revisionsOpen: number;   // revision_requested or in_revision
  approved: number;        // approved or delivered
  draft: number;           // still in draft
  activeTasks: number;     // tasks in_progress
  pendingTasks: number;    // tasks pending
  blockedTasks: number;    // tasks blocked
}

export interface DeptHealthSummary {
  dept: string;            // "social" | "design" | "ads"
  label: string;
  agentId: string;
  accentHex: string;
  level: DeptHealthLevel;
  metrics: DeptHealthMetrics;
  statusText: string;
  recommendation?: string;
}

export interface WorkspaceHealthSummary {
  departments: DeptHealthSummary[];
  mostOverloaded?: DeptHealthSummary;
  mostIdle?: DeptHealthSummary;
  totalPendingReview: number;
  totalRevisions: number;
  totalDraftDelivs: number;
  hasAnyIssue: boolean;
}

// ─── Department definitions ────────────────────────────────────────────────────

const DEPT_DEFS = [
  {
    dept: "social",
    label: "Redes Sociais",
    agentId: "a3",
    accentHex: "#5B5BD6",
    types: ["Content Strategy", "Content Calendar", "Posts", "Stories", "Design Requests"],
  },
  {
    dept: "design",
    label: "Design",
    agentId: "a2",
    accentHex: "#C2530A",
    types: ["Design", "Visual Identity", "Brand Assets"],
  },
  {
    dept: "ads",
    label: "Tráfego Pago",
    agentId: "a4",
    accentHex: "#0E7490",
    types: ["Ads Strategy", "Campaign Structure", "Audience Plan", "Ad Copy", "Creative Requirements", "Optimization Notes"],
  },
] as const;

// ─── Core computation ─────────────────────────────────────────────────────────

export function computeWorkspaceHealth(input: {
  projects: Project[];
  deliverables: Deliverable[];
  tasks: Task[];
}): WorkspaceHealthSummary {
  const { projects, deliverables, tasks } = input;
  const activeProjects = projects.filter((p) => p.stage !== "completed");
  const activeIds = new Set(activeProjects.map((p) => p.id));

  const activeDelivs = deliverables.filter((d) => activeIds.has(d.projectId));
  const activeTasks = tasks.filter((t) => activeIds.has(t.projectId));

  const departments: DeptHealthSummary[] = DEPT_DEFS.map((cfg) => {
    const typeSet = new Set(cfg.types);
    const dds = activeDelivs.filter((d) => typeSet.has(d.type as never));
    const dts = activeTasks.filter((t) => t.agentId === cfg.agentId);

    const generated = dds.length;
    const pendingReview = dds.filter((d) => d.status === "in_review").length;
    const revisionsOpen = dds.filter((d) => needsRevision(d)).length;
    const approved = dds.filter((d) => d.status === "approved" || d.status === "delivered").length;
    const draft = dds.filter((d) => d.status === "draft").length;
    const agentActiveTasks = dts.filter((t) => t.status === "in_progress").length;
    const agentPendingTasks = dts.filter((t) => t.status === "pending").length;
    const agentBlockedTasks = dts.filter((t) => t.status === "blocked").length;

    const assignedProjects = activeProjects.filter((p) => p.agents.includes(cfg.agentId));
    const approvedProjects = assignedProjects.filter((p) => p.proposal?.status === "approved");

    let level: DeptHealthLevel;
    let statusText: string;
    let recommendation: string | undefined;

    if (revisionsOpen >= 3 || (pendingReview >= 4 && revisionsOpen > 0) || agentBlockedTasks >= 2) {
      level = "overloaded";
      statusText = [
        revisionsOpen > 0 && `${revisionsOpen} revisão(ões) aberta(s)`,
        pendingReview > 0 && `${pendingReview} aguardando cliente`,
        agentBlockedTasks > 0 && `${agentBlockedTasks} tarefa(s) bloqueada(s)`,
      ].filter(Boolean).join(" · ");
      recommendation = "Priorizar resolução de revisões antes de novas produções.";
    } else if (revisionsOpen > 0 || pendingReview > 0 || agentBlockedTasks > 0) {
      level = "attention";
      statusText = [
        revisionsOpen > 0 && `${revisionsOpen} revisão(ões)`,
        pendingReview > 0 && `${pendingReview} em aprovação`,
      ].filter(Boolean).join(", ");
    } else if (generated === 0 && approvedProjects.length > 0) {
      level = "idle";
      statusText = `${approvedProjects.length} projeto(s) aprovado(s) sem execução`;
      recommendation = `Iniciar ${cfg.label} nos projetos aprovados.`;
    } else if (generated === 0) {
      level = "idle";
      statusText = "Nenhum projeto ativo neste departamento";
    } else {
      level = "healthy";
      statusText = generated > 0
        ? `${approved}/${generated} entregas aprovadas`
        : "Aguardando projetos";
    }

    return {
      dept: cfg.dept,
      label: cfg.label,
      agentId: cfg.agentId,
      accentHex: cfg.accentHex,
      level,
      metrics: { generated, pendingReview, revisionsOpen, approved, draft, activeTasks: agentActiveTasks, pendingTasks: agentPendingTasks, blockedTasks: agentBlockedTasks },
      statusText,
      recommendation,
    };
  });

  const overloadedList = departments.filter((d) => d.level === "overloaded");
  const idleList = departments.filter((d) => d.level === "idle");

  return {
    departments,
    mostOverloaded: overloadedList.length > 0 ? overloadedList[0] : undefined,
    mostIdle: idleList.length > 0 ? idleList[0] : undefined,
    totalPendingReview: departments.reduce((s, d) => s + d.metrics.pendingReview, 0),
    totalRevisions: departments.reduce((s, d) => s + d.metrics.revisionsOpen, 0),
    totalDraftDelivs: departments.reduce((s, d) => s + d.metrics.draft, 0),
    hasAnyIssue: departments.some((d) => d.level === "overloaded" || d.level === "attention"),
  };
}

// ─── Style helpers ────────────────────────────────────────────────────────────

export const DEPT_HEALTH_STYLE: Record<DeptHealthLevel, { dot: string; bg: string; text: string; label: string }> = {
  healthy:    { dot: "#16A34A", bg: "bg-[#DCFCE7]", text: "text-[#16A34A]", label: "Saudável" },
  attention:  { dot: "#D97706", bg: "bg-[#FEF3C7]", text: "text-[#D97706]", label: "Atenção" },
  overloaded: { dot: "#DC2626", bg: "bg-[#FEE2E2]", text: "text-[#DC2626]", label: "Sobrecarregado" },
  idle:       { dot: "#9B9B95", bg: "bg-[#F0F0ED]", text: "text-[#9B9B95]", label: "Ocioso" },
};
