// ─── Reporting V1 — Project & Client Progress Helpers ────────────────────────
//
// Pure functions — no store access. Pass slices of state in.
// Used by:
//   - Project Detail "Relatório" tab (internal)
//   - Client Portal "Resumo do Projeto" section (client-facing)
//   - Client Workspace internal progress panel
// ─────────────────────────────────────────────────────────────────────────────

import type { Deliverable, Project, Task } from "@/lib/agency/mock-data";
import type { StrategyRoom } from "@/lib/agency/mock-data";
import type { MaterialRequest } from "@/lib/agency/workspace";
import { needsRevision } from "@/lib/agency/deliverables";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DeptProgress {
  key: string;
  name: string;
  color: string; // Tailwind classes for accent
  accentHex: string;
  total: number;
  draft: number;
  inReview: number;
  approved: number;
  delivered: number;
  revisionNeeded: number;
  active: boolean; // has any deliverables at all
}

export interface ProjectProgress {
  projectId: string;
  proposalStatus: string | undefined;
  proposalApproved: boolean;
  strategyRoomReady: boolean;

  // Deliverable counts
  totalDeliverables: number;
  draft: number;
  inReview: number;
  approved: number;
  delivered: number;
  revisionNeeded: number;

  // Task counts
  totalTasks: number;
  doneTasks: number;
  blockedTasks: number;

  // Materials
  pendingMaterialRequests: number;

  // Per-department breakdown
  departments: DeptProgress[];

  // Synthesized
  readinessScore: number; // 0–100
  healthStatus: "on_track" | "needs_attention" | "at_risk";
  nextAction: string;
}

export interface ClientProgress {
  clientId: string;
  activeProjects: number;
  pendingApprovals: number;    // in_review deliverables
  revisionsNeeded: number;     // needsRevision()
  pendingMaterialRequests: number;
  approvedDeliverables: number;
  deliveredDeliverables: number;
  totalDeliverables: number;
  healthStatus: "on_track" | "needs_attention" | "at_risk";
}

// ─── Project Health Score ───────────────────────────────────────────────────
// Operational readiness signal for the Dashboard & Client Hub.
// Four levels: Excellent · Good · Attention · Blocked.

export type HealthLevel = "excellent" | "good" | "attention" | "blocked";

export interface HealthSignal {
  label: string;
  status: "ok" | "warn" | "bad";
  detail: string;
}

export interface ProjectHealth {
  level: HealthLevel;
  label: string;     // pt-BR display label
  color: string;     // Tailwind classes (bg + text)
  dotColor: string;  // hex for the status dot
  signals: HealthSignal[];
  overdue: boolean;
  daysToDeadline: number;
}

const HEALTH_META: Record<HealthLevel, { label: string; color: string; dotColor: string }> = {
  excellent: { label: "Excelente", color: "bg-[#DCFCE7] text-[#16A34A]", dotColor: "#16A34A" },
  good:      { label: "Bom",       color: "bg-[#EEF0FF] text-[#5B5BD6]", dotColor: "#5B5BD6" },
  attention: { label: "Atenção",   color: "bg-[#FEF3C7] text-[#D97706]", dotColor: "#D97706" },
  blocked:   { label: "Bloqueado", color: "bg-[#FEE2E2] text-[#DC2626]", dotColor: "#DC2626" },
};

export function getProjectHealth(project: Project, progress: ProjectProgress): ProjectHealth {
  const daysToDeadline = Math.ceil((new Date(project.deadline).getTime() - Date.now()) / 86400000);
  const overdue = daysToDeadline < 0 && project.stage !== "completed";

  const completion = progress.totalDeliverables > 0
    ? (progress.approved + progress.delivered) / progress.totalDeliverables
    : 0;

  // ── Determine level (simple rules, worst signal wins) ──
  let level: HealthLevel;
  if (overdue || progress.blockedTasks > 0 || progress.revisionNeeded > 2) {
    level = "blocked";
  } else if (
    !progress.proposalApproved ||
    progress.revisionNeeded > 0 ||
    progress.pendingMaterialRequests > 0
  ) {
    level = "attention";
  } else if (
    progress.proposalApproved &&
    progress.totalDeliverables > 0 &&
    completion >= 0.75 &&
    progress.inReview === 0
  ) {
    level = "excellent";
  } else {
    level = "good";
  }

  // ── Signals (always reported, in priority order) ──
  const signals: HealthSignal[] = [
    {
      label: "Proposta aprovada",
      status: progress.proposalApproved ? "ok" : "warn",
      detail: progress.proposalApproved ? "Execução liberada" : "Aguardando aprovação da proposta",
    },
    {
      label: "Materiais do cliente",
      status: progress.pendingMaterialRequests === 0 ? "ok" : "warn",
      detail: progress.pendingMaterialRequests === 0
        ? "Tudo recebido"
        : `${progress.pendingMaterialRequests} material(is) pendente(s)`,
    },
    {
      label: "Revisões pendentes",
      status: progress.revisionNeeded === 0 ? "ok" : progress.revisionNeeded > 2 ? "bad" : "warn",
      detail: progress.revisionNeeded === 0
        ? "Nenhuma revisão aberta"
        : `${progress.revisionNeeded} entrega(s) requer(em) revisão`,
    },
    {
      label: "Prazo",
      status: overdue ? "bad" : daysToDeadline <= 3 ? "warn" : "ok",
      detail: overdue
        ? `${Math.abs(daysToDeadline)} dia(s) de atraso`
        : `${daysToDeadline} dia(s) para o prazo`,
    },
    {
      label: "Entregas aprovadas",
      status: progress.approved + progress.delivered > 0 ? "ok" : "warn",
      detail: progress.totalDeliverables > 0
        ? `${progress.approved + progress.delivered}/${progress.totalDeliverables} aprovadas/entregues`
        : "Nenhuma entrega gerada",
    },
  ];

  const meta = HEALTH_META[level];
  return { level, label: meta.label, color: meta.color, dotColor: meta.dotColor, signals, overdue, daysToDeadline };
}

// ─── Pilot Readiness Checklist ────────────────────────────────────────────────
// Two-phase operational checklist for the first real client.

export interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
  hint: string;
}

export interface PilotChecklist {
  beforeExecution: ChecklistItem[];
  beforeDelivery: ChecklistItem[];
  readyToExecute: boolean;
  readyToDeliver: boolean;
}

export function getPilotChecklist(
  progress: ProjectProgress,
  brandBrainComplete: boolean
): PilotChecklist {
  const beforeExecution: ChecklistItem[] = [
    { key: "brand_brain", label: "Brand Brain completo", done: brandBrainComplete, hint: "Contexto da marca preenchido no perfil do cliente." },
    { key: "strategy_room", label: "Strategy Room concluído", done: progress.strategyRoomReady, hint: "Gerar a sala de estratégia na aba Estratégia." },
    { key: "proposal", label: "Proposta aprovada", done: progress.proposalApproved, hint: "Cliente aprovou a proposta no portal." },
    { key: "materials", label: "Materiais necessários recebidos", done: progress.pendingMaterialRequests === 0, hint: "Sem materiais pendentes do cliente." },
  ];

  const beforeDelivery: ChecklistItem[] = [
    { key: "generated", label: "Entregas geradas", done: progress.totalDeliverables > 0, hint: "Rodar os agentes (Social, Design, Tráfego Pago)." },
    { key: "internal_review", label: "Revisão interna concluída", done: progress.totalDeliverables > 0 && progress.draft === 0 && progress.revisionNeeded === 0, hint: "Nenhum rascunho ou revisão interna em aberto." },
    { key: "client_review", label: "Revisão do cliente solicitada", done: progress.inReview > 0 || progress.approved > 0 || progress.delivered > 0, hint: "Entregas enviadas ao portal do cliente." },
  ];

  return {
    beforeExecution,
    beforeDelivery,
    readyToExecute: beforeExecution.every((i) => i.done),
    readyToDeliver: beforeDelivery.every((i) => i.done),
  };
}

// ─── Department definitions ───────────────────────────────────────────────────

const DEPT_DEFS: Array<{ key: string; name: string; types: string[]; color: string; accentHex: string }> = [
  {
    key: "social",
    name: "Redes Sociais",
    types: ["Content Strategy", "Content Calendar", "Posts", "Stories", "Design Requests"],
    color: "bg-[#EEF0FF] text-[#5B5BD6]",
    accentHex: "#5B5BD6",
  },
  {
    key: "design",
    name: "Design",
    types: ["Design", "Visual Identity", "Brand Assets"],
    color: "bg-[#FFF4ED] text-[#C2530A]",
    accentHex: "#C2530A",
  },
  {
    key: "ads",
    name: "Tráfego Pago",
    types: ["Ads Strategy", "Campaign Structure", "Audience Plan", "Ad Copy", "Creative Requirements", "Optimization Notes"],
    color: "bg-[#ECFEFF] text-[#0E7490]",
    accentHex: "#0E7490",
  },
];

// ─── getProjectProgress ───────────────────────────────────────────────────────

export function getProjectProgress(
  project: Project,
  deliverables: Deliverable[],
  tasks: Task[],
  materialRequests: MaterialRequest[],
  strategyRooms: StrategyRoom[]
): ProjectProgress {
  const projectId = project.id;

  const pd = deliverables.filter((d) => d.projectId === projectId);
  const pt = tasks.filter((t) => t.projectId === projectId);
  const pm = materialRequests.filter((r) => r.projectId === projectId && r.status === "pending");
  const strategyRoom = strategyRooms.find((r) => r.projectId === projectId);

  const proposalStatus = project.proposal?.status;
  const proposalApproved = proposalStatus === "approved";

  // Deliverable breakdowns
  const draft = pd.filter((d) => d.status === "draft").length;
  const inReview = pd.filter((d) => d.status === "in_review").length;
  const approved = pd.filter((d) => d.status === "approved").length;
  const delivered = pd.filter((d) => d.status === "delivered").length;
  const revisionNeeded = pd.filter((d) => needsRevision(d)).length;

  // Task breakdowns
  const totalTasks = pt.length;
  const doneTasks = pt.filter((t) => t.status === "done").length;
  const blockedTasks = pt.filter((t) => t.status === "blocked").length;

  // Department breakdowns
  const departments: DeptProgress[] = DEPT_DEFS.map((def) => {
    const dds = pd.filter((d) => def.types.includes(d.type));
    return {
      key: def.key,
      name: def.name,
      color: def.color,
      accentHex: def.accentHex,
      total: dds.length,
      draft: dds.filter((d) => d.status === "draft").length,
      inReview: dds.filter((d) => d.status === "in_review").length,
      approved: dds.filter((d) => d.status === "approved").length,
      delivered: dds.filter((d) => d.status === "delivered").length,
      revisionNeeded: dds.filter((d) => needsRevision(d)).length,
      active: dds.length > 0,
    };
  });

  // Readiness score (0–100): weighted based on what's complete
  let score = 0;
  if (proposalApproved) score += 25;
  if (strategyRoom?.status === "ready") score += 10;
  const total = pd.length;
  if (total > 0) {
    const completedFraction = (approved + delivered) / total;
    score += Math.round(completedFraction * 50);
    const pendingClientFraction = inReview / total;
    score += Math.round(pendingClientFraction * 10);
  }
  if (totalTasks > 0 && doneTasks / totalTasks >= 0.5) score += 5;
  if (pm.length === 0) score += 10; // all materials received
  score = Math.min(100, score);

  const healthStatus: ProjectProgress["healthStatus"] =
    blockedTasks > 0 || revisionNeeded > 2 ? "at_risk"
    : revisionNeeded > 0 || pm.length > 0 || inReview > 0 ? "needs_attention"
    : "on_track";

  const nextAction = getNextProjectAction({
    proposalApproved,
    strategyRoomReady: !!strategyRoom,
    inReview,
    revisionNeeded,
    pendingMaterialRequests: pm.length,
    approved,
    delivered,
    totalDeliverables: total,
    blockedTasks,
  });

  return {
    projectId,
    proposalStatus,
    proposalApproved,
    strategyRoomReady: !!strategyRoom,
    totalDeliverables: total,
    draft,
    inReview,
    approved,
    delivered,
    revisionNeeded,
    totalTasks,
    doneTasks,
    blockedTasks,
    pendingMaterialRequests: pm.length,
    departments,
    readinessScore: score,
    healthStatus,
    nextAction,
  };
}

// ─── getNextProjectAction ─────────────────────────────────────────────────────

interface ActionInput {
  proposalApproved: boolean;
  strategyRoomReady: boolean;
  inReview: number;
  revisionNeeded: number;
  pendingMaterialRequests: number;
  approved: number;
  delivered: number;
  totalDeliverables: number;
  blockedTasks: number;
}

export function getNextProjectAction(input: ActionInput): string {
  if (!input.proposalApproved)       return "Enviar e aprovar a proposta antes de iniciar a execução.";
  if (input.blockedTasks > 0)        return `${input.blockedTasks} tarefa(s) bloqueada(s) — resolver antes de continuar.`;
  if (input.pendingMaterialRequests > 0) return `${input.pendingMaterialRequests} material(is) pendente(s) do cliente — aguardar recebimento.`;
  if (input.revisionNeeded > 0)     return `${input.revisionNeeded} entrega(s) em revisão — agentes precisam refazer.`;
  if (input.inReview > 0)           return `${input.inReview} entrega(s) aguardando aprovação do cliente no portal.`;
  if (!input.strategyRoomReady)      return "Gerar Strategy Room na aba Estratégia para orientar a execução.";
  if (input.totalDeliverables === 0) return "Nenhuma entrega gerada — rodar agentes (Social, Design, Ads) para começar.";
  if (input.approved > 0 && input.delivered === 0) return `${input.approved} entrega(s) aprovada(s) — marcar como entregue quando concluído.`;
  if (input.delivered > 0 && input.delivered === input.totalDeliverables) return "Todas as entregas concluídas. Projeto pronto para encerramento.";
  return "Execução em andamento. Continuar gerando entregas pelos agentes.";
}

// ─── getClientProgress ────────────────────────────────────────────────────────

export function getClientProgress(
  clientId: string,
  projects: Project[],
  deliverables: Deliverable[],
  materialRequests: MaterialRequest[]
): ClientProgress {
  const clientProjects = projects.filter((p) => p.clientId === clientId);
  const clientProjectIds = new Set(clientProjects.map((p) => p.id));

  const cd = deliverables.filter((d) => clientProjectIds.has(d.projectId));
  const cm = materialRequests.filter((r) => r.clientId === clientId && r.status === "pending");

  const pendingApprovals = cd.filter((d) => d.status === "in_review").length;
  const revisionsNeeded  = cd.filter((d) => needsRevision(d)).length;
  const approvedDeliverables = cd.filter((d) => d.status === "approved").length;
  const deliveredDeliverables = cd.filter((d) => d.status === "delivered").length;
  const activeProjects = clientProjects.filter((p) => p.stage !== "completed").length;

  const healthStatus: ClientProgress["healthStatus"] =
    revisionsNeeded > 2 ? "at_risk"
    : revisionsNeeded > 0 || cm.length > 1 ? "needs_attention"
    : "on_track";

  return {
    clientId,
    activeProjects,
    pendingApprovals,
    revisionsNeeded,
    pendingMaterialRequests: cm.length,
    approvedDeliverables,
    deliveredDeliverables,
    totalDeliverables: cd.length,
    healthStatus,
  };
}

// ─── getProjectReportText ─────────────────────────────────────────────────────
// Returns a plain-text progress report suitable for WhatsApp/email.

export function getProjectReportText(
  projectName: string,
  clientName: string,
  progress: ProjectProgress,
  today: string = new Date().toLocaleDateString("pt-BR")
): string {
  const { proposalStatus, totalDeliverables, inReview, approved, delivered, draft, revisionNeeded, pendingMaterialRequests, departments, readinessScore, nextAction } = progress;

  const proposalLabel =
    proposalStatus === "approved" ? "✅ Aprovada"
    : proposalStatus === "sent" ? "⏳ Enviada — aguardando aprovação"
    : proposalStatus === "changes_requested" ? "🔁 Alterações solicitadas"
    : proposalStatus === "rejected" ? "❌ Rejeitada"
    : "📝 Rascunho";

  const deptLines = departments
    .filter((d) => d.active)
    .map((d) => `  • ${d.name}: ${d.total} entrega(s) — ${d.approved} aprovada(s), ${d.inReview} em revisão${d.revisionNeeded > 0 ? `, ${d.revisionNeeded} requer revisão` : ""}`)
    .join("\n");

  const lines = [
    `📊 *Atualização do Projeto — ${projectName}*`,
    `Cliente: ${clientName}`,
    `Data: ${today}`,
    ``,
    `*Proposta:* ${proposalLabel}`,
    ``,
    `*Entregas (${totalDeliverables} total):*`,
    `  ✅ Aprovadas: ${approved}`,
    `  📬 Entregues: ${delivered}`,
    `  👀 Em revisão do cliente: ${inReview}`,
    `  🔁 Em revisão interna: ${revisionNeeded}`,
    `  📝 Rascunho: ${draft}`,
    ``,
    ...(deptLines ? [`*Por departamento:*`, deptLines, ``] : []),
    ...(pendingMaterialRequests > 0 ? [`⚠️ Materiais pendentes do cliente: ${pendingMaterialRequests}`, ``] : []),
    `*Próximo passo:* ${nextAction}`,
    ``,
    `_Progresso geral: ${readinessScore}%_`,
  ];

  return lines.join("\n");
}
