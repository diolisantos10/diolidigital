// ─── Reporting V1 — Project & Client Progress Helpers ────────────────────────
//
// Pure functions — no store access. Pass slices of state in.
// Used by:
//   - Project Detail "Relatório" tab (internal)
//   - Client Portal "Resumo do Projeto" section (client-facing)
//   - Client Workspace internal progress panel
// ─────────────────────────────────────────────────────────────────────────────

import type { Deliverable, Project, Task, Client, Briefing } from "@/lib/agency/mock-data";
import type { StrategyRoom } from "@/lib/agency/mock-data";
import type { MaterialRequest } from "@/lib/agency/workspace";
import { needsRevision, getVersion } from "@/lib/agency/deliverables";

// ─── Proposal pricing validation ─────────────────────────────────────────────
// Single source of truth for "is this a real, sendable price?".
// Used by the store (sendProposal guard), the Proposal tab UI, the pilot audit,
// and the next-action engine. A proposal must never reach the client without it.

export const INVALID_PRICING_MESSAGE =
  "Defina o investimento antes de enviar a proposta ao cliente.";

export function isValidProposalPricing(pricing?: string): boolean {
  if (!pricing) return false;
  const norm = pricing.trim().toLowerCase();
  if (norm.length === 0) return false;
  // Phrase placeholders — block if they appear anywhere in the value.
  if (norm.includes("a definir") || norm.includes("tbd") || norm.includes("to be defined")) return false;
  // Exact-token placeholders (dashes / bare zero with optional currency symbol).
  const compact = norm.replace(/\s/g, "");
  if (["-", "–", "—", "0", "€0", "r$0", "$0"].includes(compact)) return false;
  // Any pure-zero amount, e.g. "0", "0,00", "r$ 0,00", "€0.00".
  if (/^(r\$|€|\$)?0+([.,]0+)?$/.test(compact)) return false;
  return true;
}

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
    proposalPricingValid: isValidProposalPricing(project.proposal?.pricing),
    proposalSentOrApproved: proposalStatus === "sent" || proposalStatus === "approved",
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
  proposalPricingValid: boolean;
  proposalSentOrApproved: boolean;
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
  // Pricing must be settled before the proposal can go out the door.
  if (!input.proposalSentOrApproved && !input.proposalPricingValid) return INVALID_PRICING_MESSAGE;
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

// ─────────────────────────────────────────────────────────────────────────────
// Pilot Execution V1 — operational layer for the first real client.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Department detection (shared) ────────────────────────────────────────────
// Infers which operational tracks a project runs, from agents + type + proposal.

export interface DeptFlags {
  social: boolean;
  design: boolean;
  ads: boolean;
}

export function detectDepartments(project: Project): DeptFlags {
  const hay = `${project.type} ${project.goal} ${project.proposal?.scope ?? ""} ${(project.proposal?.deliverables ?? []).join(" ")}`.toLowerCase();
  const agents = project.agents ?? [];
  return {
    social: agents.includes("a3") || /social|rede|instagram|conteúdo|content|post/.test(hay),
    design: agents.includes("a2") || /design|identidade|visual|template|criativo|brand/.test(hay),
    ads: agents.includes("a4") || /ads|tráfego|trafego|anúncio|anuncio|campanha|paid|meta|google/.test(hay),
  };
}

// ─── Brand Brain completeness (shared) ────────────────────────────────────────

const BRAND_BRAIN_FIELDS: (keyof NonNullable<Client["brandBrain"]>)[] = [
  "businessSummary", "positioning", "targetAudience", "toneOfVoice", "visualStyle",
  "brandRules", "productsToHighlight", "thingsToAvoid", "preferredChannels", "strategicNotes",
];

export function getBrandBrainScore(client: Client | undefined): { filled: number; total: number; complete: boolean } {
  const brain = client?.brandBrain;
  const filled = brain
    ? BRAND_BRAIN_FIELDS.filter((k) => brain[k] && (brain[k] as string).trim().length > 0).length
    : 0;
  return { filled, total: BRAND_BRAIN_FIELDS.length, complete: filled >= 8 };
}

// ─── PART 1 — Pilot Audit ─────────────────────────────────────────────────────
// Audits the readiness of a single project's inputs and emits warnings.

export type WarningSeverity = "high" | "medium" | "low";

export interface PilotWarning {
  area: string;
  severity: WarningSeverity;
  message: string;
}

export interface PilotAudit {
  warnings: PilotWarning[];
  highCount: number;
  mediumCount: number;
  passed: boolean; // no high-severity warnings
  brandBrain: { filled: number; total: number; complete: boolean };
}

export function getPilotAudit(input: {
  project: Project;
  client?: Client;
  briefing?: Briefing;
  strategyRoom?: StrategyRoom;
  materialRequests: MaterialRequest[];
}): PilotAudit {
  const { project, client, briefing, strategyRoom, materialRequests } = input;
  const warnings: PilotWarning[] = [];
  const brandBrain = getBrandBrainScore(client);

  // Brand Brain
  if (brandBrain.filled === 0) {
    warnings.push({ area: "Brand Brain", severity: "high", message: "Brand Brain vazio — preencha o contexto da marca antes de executar." });
  } else if (brandBrain.filled < 5) {
    warnings.push({ area: "Brand Brain", severity: "high", message: `Brand Brain incompleto (${brandBrain.filled}/10 campos) — execução gerará conteúdo genérico.` });
  } else if (!brandBrain.complete) {
    warnings.push({ area: "Brand Brain", severity: "low", message: `Brand Brain quase completo (${brandBrain.filled}/10) — preencha os campos restantes para mais precisão.` });
  }

  // Briefing
  if (!briefing) {
    warnings.push({ area: "Briefing", severity: "medium", message: "Sem briefing registrado — capture o briefing pelo Orquestrador." });
  } else {
    const missing = (["goal", "audience", "keyMessage", "deliverables", "successCriteria"] as const)
      .filter((k) => !briefing[k] || briefing[k].trim().length === 0);
    if (missing.length > 0) {
      warnings.push({ area: "Briefing", severity: "medium", message: `Briefing incompleto — campos faltando: ${missing.join(", ")}.` });
    } else if (briefing.status === "pending_analysis") {
      warnings.push({ area: "Briefing", severity: "low", message: "Briefing ainda não analisado — revise e marque como analisado." });
    }
  }

  // Strategy Room
  if (!strategyRoom || strategyRoom.status !== "ready") {
    warnings.push({ area: "Strategy Room", severity: "medium", message: "Strategy Room não gerado — rode a sala de estratégia para orientar a execução." });
  }

  // Proposal
  const prop = project.proposal;
  if (!prop) {
    warnings.push({ area: "Proposta", severity: "high", message: "Nenhuma proposta criada — crie e envie a proposta ao cliente." });
  } else {
    if (!isValidProposalPricing(prop.pricing)) {
      warnings.push({ area: "Proposta", severity: "high", message: "Preço da proposta pendente — defina o investimento antes de enviar ao cliente." });
    }
    if (!prop.deliverables || prop.deliverables.length < 2) {
      warnings.push({ area: "Proposta", severity: "medium", message: "Proposta com poucas entregas — detalhe o escopo." });
    }
    if (!prop.timeline || prop.timeline.trim().length === 0) {
      warnings.push({ area: "Proposta", severity: "low", message: "Proposta sem prazo definido." });
    }
    if (prop.status === "draft") {
      warnings.push({ area: "Proposta", severity: "medium", message: "Proposta em rascunho — envie ao cliente para aprovação." });
    }
  }

  // Material requests
  const pending = materialRequests.filter((r) => r.projectId === project.id && r.status === "pending").length;
  if (pending > 0) {
    warnings.push({ area: "Materiais", severity: pending > 2 ? "medium" : "low", message: `${pending} solicitação(ões) de material pendente(s) do cliente.` });
  }

  const highCount = warnings.filter((w) => w.severity === "high").length;
  const mediumCount = warnings.filter((w) => w.severity === "medium").length;
  return { warnings, highCount, mediumCount, passed: highCount === 0, brandBrain };
}

// ─── PART 4 — Pilot Timeline ──────────────────────────────────────────────────
// A 4-week execution timeline derived from active departments.

export interface TimelineTrack {
  dept: string;
  accentHex: string;
  items: string[];
}

export interface TimelineWeek {
  week: number;
  theme: string;
  tracks: TimelineTrack[];
}

const TL_SOCIAL = "#5B5BD6";
const TL_DESIGN = "#C2530A";
const TL_ADS = "#0E7490";

export function getPilotTimeline(project: Project): TimelineWeek[] {
  const dept = detectDepartments(project);

  const plan: Record<string, { social: string; design: string; ads: string }> = {
    "1": {
      social: "Estratégia de redes sociais, persona e pilares de conteúdo",
      design: "Sistema de templates e identidade visual aplicada",
      ads: "Estrutura de campanha, objetivos e mapeamento de públicos",
    },
    "2": {
      social: "Calendário editorial de 30 dias e primeiras legendas",
      design: "Criativos-base e variações dos templates aprovados",
      ads: "Copy de anúncios e requisitos de criativos por estágio do funil",
    },
    "3": {
      social: "Batch inicial de conteúdo e revisão interna",
      design: "Ajustes finos, versões e pacote de assets",
      ads: "Setup de campanha, segmentações e revisão de criativos",
    },
    "4": {
      social: "Publicação, agendamento e relatório de lançamento",
      design: "Entrega final do pacote visual e handoff",
      ads: "Lançamento das campanhas e otimização inicial",
    },
  };

  const themes: Record<string, string> = {
    "1": "Fundação & Estratégia",
    "2": "Produção",
    "3": "Revisão & Refinamento",
    "4": "Lançamento & Otimização",
  };

  return [1, 2, 3, 4].map((w) => {
    const key = String(w);
    const tracks: TimelineTrack[] = [];
    if (dept.social) tracks.push({ dept: "Redes Sociais", accentHex: TL_SOCIAL, items: [plan[key].social] });
    if (dept.design) tracks.push({ dept: "Design", accentHex: TL_DESIGN, items: [plan[key].design] });
    if (dept.ads) tracks.push({ dept: "Tráfego Pago", accentHex: TL_ADS, items: [plan[key].ads] });
    return { week: w, theme: themes[key], tracks };
  });
}

// ─── PART 5 — Deliverable Quality Score ───────────────────────────────────────
// Internal-only 0–100 score for a deliverable, from contextual + lifecycle signals.

export interface QualitySignal {
  label: string;
  points: number;
  max: number;
  met: boolean;
}

export interface DeliverableQuality {
  score: number; // 0–100
  level: "high" | "medium" | "low";
  signals: QualitySignal[];
}

export function getDeliverableQuality(
  deliverable: Deliverable,
  ctx: { brandBrainComplete: boolean; strategyRoomReady: boolean }
): DeliverableQuality {
  const version = getVersion(deliverable);
  const revisionCount = (deliverable.revisionHistory?.length ?? 0) + (version > 1 ? version - 1 : 0);
  const status = deliverable.status;

  const signals: QualitySignal[] = [];

  // 1. Brand Brain used — 20
  signals.push({ label: "Brand Brain aplicado", max: 20, met: ctx.brandBrainComplete, points: ctx.brandBrainComplete ? 20 : 0 });

  // 2. Strategy Room used — 15
  signals.push({ label: "Strategy Room aplicado", max: 15, met: ctx.strategyRoomReady, points: ctx.strategyRoomReady ? 15 : 0 });

  // 3. Completeness (left draft? reached review?) — 25
  const completePts = status === "delivered" || status === "approved" ? 25 : status === "in_review" ? 18 : 8;
  signals.push({ label: "Completude", max: 25, met: status !== "draft", points: completePts });

  // 4. Approval — 25
  const approvalPts = status === "delivered" || status === "approved" ? 25 : status === "in_review" ? 12 : 0;
  signals.push({ label: "Aprovação", max: 25, met: status === "approved" || status === "delivered", points: approvalPts });

  // 5. Revision economy (fewer reworks is better) — 15
  const revPts = revisionCount === 0 ? 15 : revisionCount === 1 ? 9 : revisionCount === 2 ? 4 : 0;
  signals.push({ label: "Eficiência de revisão", max: 15, met: revisionCount <= 1, points: revPts });

  const score = Math.min(100, signals.reduce((sum, s) => sum + s.points, 0));
  const level: DeliverableQuality["level"] = score >= 75 ? "high" : score >= 45 ? "medium" : "low";
  return { score, level, signals };
}

// ─── PART 6 — First Client Playbook ───────────────────────────────────────────
// Four-phase operational playbook with a single "what next" answer.

export type PlaybookPhaseKey = "before_proposal" | "before_execution" | "before_client_review" | "before_delivery";

export interface PlaybookPhase {
  key: PlaybookPhaseKey;
  title: string;
  items: ChecklistItem[];
  complete: boolean;
  current: boolean;
}

export interface OperatorPlaybook {
  phases: PlaybookPhase[];
  currentPhaseKey: PlaybookPhaseKey;
  currentPhaseTitle: string;
  nextAction: string;
}

export function getOperatorPlaybook(
  progress: ProjectProgress,
  brandBrainComplete: boolean
): OperatorPlaybook {
  const proposalSent = progress.proposalStatus === "sent" || progress.proposalApproved;

  const beforeProposal: ChecklistItem[] = [
    { key: "bb", label: "Brand Brain preenchido", done: brandBrainComplete, hint: "Complete o contexto da marca no perfil do cliente." },
    { key: "strategy", label: "Strategy Room gerado", done: progress.strategyRoomReady, hint: "Rode a sala de estratégia na aba Estratégia." },
    { key: "proposal_sent", label: "Proposta enviada ao cliente", done: proposalSent, hint: "Crie e envie a proposta na aba Proposta." },
  ];

  const beforeExecution: ChecklistItem[] = [
    { key: "proposal_approved", label: "Proposta aprovada", done: progress.proposalApproved, hint: "Cliente aprova a proposta no portal." },
    { key: "materials", label: "Materiais necessários recebidos", done: progress.pendingMaterialRequests === 0, hint: "Sem materiais pendentes do cliente." },
  ];

  const beforeClientReview: ChecklistItem[] = [
    { key: "generated", label: "Entregas geradas pelos agentes", done: progress.totalDeliverables > 0, hint: "Rode Social, Design e Tráfego Pago." },
    { key: "internal_ok", label: "Revisão interna concluída", done: progress.totalDeliverables > 0 && progress.draft === 0 && progress.revisionNeeded === 0, hint: "Nenhum rascunho ou revisão interna pendente." },
  ];

  const beforeDelivery: ChecklistItem[] = [
    { key: "client_review", label: "Revisão do cliente solicitada", done: progress.inReview > 0 || progress.approved > 0 || progress.delivered > 0, hint: "Envie as entregas ao portal do cliente." },
    { key: "approved", label: "Entregas aprovadas pelo cliente", done: progress.approved > 0 || progress.delivered > 0, hint: "Cliente aprova as entregas no portal." },
  ];

  const phaseDefs: { key: PlaybookPhaseKey; title: string; items: ChecklistItem[] }[] = [
    { key: "before_proposal", title: "Antes da proposta", items: beforeProposal },
    { key: "before_execution", title: "Antes da execução", items: beforeExecution },
    { key: "before_client_review", title: "Antes da revisão do cliente", items: beforeClientReview },
    { key: "before_delivery", title: "Antes da entrega", items: beforeDelivery },
  ];

  const phasesComputed = phaseDefs.map((p) => ({ ...p, complete: p.items.every((i) => i.done) }));
  const currentIdx = phasesComputed.findIndex((p) => !p.complete);
  const currentPhaseKey = (currentIdx === -1 ? phasesComputed[3] : phasesComputed[currentIdx]).key;

  const phases: PlaybookPhase[] = phasesComputed.map((p) => ({
    ...p,
    current: p.key === currentPhaseKey,
  }));

  return {
    phases,
    currentPhaseKey,
    currentPhaseTitle: (currentIdx === -1 ? phasesComputed[3] : phasesComputed[currentIdx]).title,
    nextAction: progress.nextAction,
  };
}
