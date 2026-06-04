// ─── PM Agent — Rule-Based Next-Action + Orchestration Engine ─────────────────
//
// Analyzes the current state of a project and emits PMDirectives and
// an OrchestrationSummary describing the full execution state, blockers,
// department readiness, and next steps across all active projects.
// Pure function — no side effects, no async, no external calls.
// ─────────────────────────────────────────────────────────────────────────────

import type { Project, Deliverable, Task, StrategyRoom, Client } from "@/lib/agency/mock-data";
import type { MaterialRequest } from "@/lib/agency/workspace";
import type { BrandUpdate } from "@/store/agency-store";
import { needsRevision } from "@/lib/agency/deliverables";

export type PMUrgency = "critical" | "high" | "normal" | "low";

export interface PMDirective {
  projectId: string;
  projectName: string;
  phase: string;
  blocker: boolean;
  nextAction: string;
  role: string;
  route: string;
  urgency: PMUrgency;
  reason: string;
}

interface PMInput {
  project: Project;
  deliverables: Deliverable[];
  tasks: Task[];
  materialRequests: MaterialRequest[];
  strategyRooms: StrategyRoom[];
  brandUpdates: BrandUpdate[];
}

export function computePMDirective(input: PMInput): PMDirective {
  const { project, deliverables, tasks, materialRequests, strategyRooms } = input;

  const base = {
    projectId: project.id,
    projectName: project.name,
    blocker: false,
    route: `/agency/projects/${project.id}`,
  };

  // ── Rule 1: Proposal not sent yet ────────────────────────────────────────
  if (!project.proposal || project.proposal.status === "draft") {
    return {
      ...base,
      phase: "Proposta",
      blocker: true,
      nextAction: "Enviar proposta ao cliente",
      role: "PM",
      route: `/agency/projects/${project.id}`,
      urgency: "critical",
      reason: "Projeto não pode avançar sem proposta aprovada.",
    };
  }

  // ── Rule 2: Proposal sent, awaiting client approval ───────────────────────
  if (project.proposal.status === "sent") {
    return {
      ...base,
      phase: "Proposta Enviada",
      blocker: false,
      nextAction: "Aguardar aprovação da proposta pelo cliente",
      role: "PM",
      route: `/agency/projects/${project.id}`,
      urgency: "normal",
      reason: "Proposta enviada — aguardando resposta do cliente.",
    };
  }

  // ── Rule 3: No strategy room generated ───────────────────────────────────
  const hasStrategyRoom = strategyRooms.some((r) => r.projectId === project.id);
  if (!hasStrategyRoom && project.proposal.status === "approved") {
    return {
      ...base,
      phase: "Planejamento",
      blocker: true,
      nextAction: "Gerar Strategy Room",
      role: "PM",
      route: `/agency/projects/${project.id}`,
      urgency: "high",
      reason: "Sem plano estratégico gerado — agentes não podem executar sem contexto.",
    };
  }

  // ── Rule 4: Pending material requests ────────────────────────────────────
  const pendingMaterials = materialRequests.filter(
    (r) => r.projectId === project.id && r.status === "pending"
  );
  if (pendingMaterials.length > 0) {
    return {
      ...base,
      phase: "Coleta de Materiais",
      blocker: true,
      nextAction: `Coletar ${pendingMaterials.length} material(is) pendente(s)`,
      role: "PM",
      route: `/agency/projects/${project.id}`,
      urgency: "high",
      reason: `${pendingMaterials.length} solicitação(ões) de material sem resposta do cliente.`,
    };
  }

  // ── Rule 5: Deliverables with client feedback (change_requested) ──────────
  const delivsWithFeedback = deliverables.filter(
    (d) =>
      d.projectId === project.id &&
      d.clientFeedback &&
      (d.status === "draft" || d.revisionStatus === "revision_requested" || d.revisionStatus === "in_revision")
  );
  if (delivsWithFeedback.length > 0) {
    const d = delivsWithFeedback[0];
    const agentType = d.type ?? "content";
    const roleMap: Record<string, string> = {
      copy: "Agente de Copy",
      design: "Agente de Design",
      social: "Agente de Social Media",
      ads: "Agente de Tráfego",
      strategy: "Agente de Estratégia",
      video: "Agente de Design",
      branding: "Agente de Design",
    };
    const role = roleMap[agentType] ?? "Agente";
    return {
      ...base,
      phase: "Revisão",
      blocker: false,
      nextAction: `Atender feedback do cliente em "${d.name}"`,
      role,
      route: `/agency/deliverables`,
      urgency: "high",
      reason: `Cliente solicitou alterações — ${delivsWithFeedback.length} entrega(s) aguardando revisão.`,
    };
  }

  // ── Rule 6: Deliverables in_review (awaiting client approval) ────────────
  const inReviewDelivs = deliverables.filter(
    (d) => d.projectId === project.id && d.status === "in_review"
  );
  if (inReviewDelivs.length > 0) {
    return {
      ...base,
      phase: "Revisão do Cliente",
      blocker: false,
      nextAction: `${inReviewDelivs.length} entrega(s) aguardando aprovação do cliente`,
      role: "PM",
      route: `/agency/deliverables`,
      urgency: "normal",
      reason: "Entregas enviadas ao cliente para revisão — acompanhe a resposta.",
    };
  }

  // ── Rule 7: Blocked tasks ─────────────────────────────────────────────────
  const blockedTasks = tasks.filter(
    (t) => t.projectId === project.id && t.status === "blocked"
  );
  if (blockedTasks.length > 0) {
    return {
      ...base,
      phase: "Execução",
      blocker: true,
      nextAction: `Desbloquear ${blockedTasks.length} tarefa(s) bloqueada(s)`,
      role: "PM",
      route: `/agency/tasks`,
      urgency: "high",
      reason: `${blockedTasks.length} tarefa(s) bloqueadas — progresso parado.`,
    };
  }

  // ── Rule 8: Draft deliverables (work in progress) ─────────────────────────
  const draftDelivs = deliverables.filter(
    (d) => d.projectId === project.id && d.status === "draft"
  );
  if (draftDelivs.length > 0) {
    return {
      ...base,
      phase: "Execução",
      blocker: false,
      nextAction: `Avançar ${draftDelivs.length} entrega(s) em desenvolvimento`,
      role: "Agentes",
      route: `/agency/deliverables`,
      urgency: "normal",
      reason: `${draftDelivs.length} entrega(s) em rascunho — enviar para revisão do cliente.`,
    };
  }

  // ── Rule 9: All deliverables approved — project likely done ──────────────
  const approvedDelivs = deliverables.filter(
    (d) => d.projectId === project.id && (d.status === "approved" || d.status === "delivered")
  );
  if (approvedDelivs.length > 0 && draftDelivs.length === 0 && inReviewDelivs.length === 0) {
    return {
      ...base,
      phase: "Finalização",
      blocker: false,
      nextAction: "Revisar encerramento do projeto",
      role: "PM",
      route: `/agency/projects/${project.id}`,
      urgency: "low",
      reason: `${approvedDelivs.length} entrega(s) aprovadas — verifique se há pendências finais.`,
    };
  }

  // ── Default: no specific action identified ────────────────────────────────
  return {
    ...base,
    phase: "Em andamento",
    blocker: false,
    nextAction: "Revisar status do projeto",
    role: "PM",
    route: `/agency/projects/${project.id}`,
    urgency: "low",
    reason: "Nenhuma ação urgente identificada.",
  };
}

export function computeAllDirectives(input: {
  projects: Project[];
  deliverables: Deliverable[];
  tasks: Task[];
  materialRequests: MaterialRequest[];
  strategyRooms: StrategyRoom[];
  brandUpdates: BrandUpdate[];
}): PMDirective[] {
  const activeProjects = input.projects.filter(
    (p) => p.stage !== "completed"
  );
  return activeProjects
    .map((project) =>
      computePMDirective({
        project,
        deliverables: input.deliverables,
        tasks: input.tasks,
        materialRequests: input.materialRequests,
        strategyRooms: input.strategyRooms,
        brandUpdates: input.brandUpdates,
      })
    )
    .sort((a, b) => {
      const urgencyOrder: Record<PMUrgency, number> = { critical: 0, high: 1, normal: 2, low: 3 };
      return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    });
}

// ─── Orchestration Summary ────────────────────────────────────────────────────
// Full workspace-level orchestration intelligence: blockers, department states,
// execution gaps, stalled approvals, and a synthesized top-line summary.

export interface OrchestrationBlocker {
  projectId: string;
  projectName: string;
  severity: "critical" | "high" | "medium";
  type: "no_proposal" | "no_strategy" | "pending_materials" | "revision_queue" | "blocked_tasks" | "dependency_violation" | "stalled_approval";
  message: string;
  route: string;
}

export interface OrchestrationDeptSummary {
  dept: string;
  label: string;
  agentId: string;
  projectsAssigned: number;
  deliverablesDraft: number;
  deliverablesPendingReview: number;
  deliverablesApproved: number;
  revisionsOpen: number;
  isIdle: boolean;       // assigned to approved projects but no output yet
  isOverloaded: boolean; // multiple revisions open simultaneously
}

export interface OrchestrationSummary {
  activeProjectCount: number;
  blockers: OrchestrationBlocker[];
  criticalBlockerCount: number;
  departments: OrchestrationDeptSummary[];
  stalledApprovals: { projectId: string; projectName: string; deliverableName: string; daysSent: number }[];
  orphanDeliverables: { id: string; name: string; projectId: string }[];  // deliverables with no project
  topQuestion: string;   // "What should I work on right now?"
}

const SOCIAL_TYPES = new Set(["Content Strategy", "Content Calendar", "Posts", "Stories"]);
const DESIGN_TYPES = new Set(["Design", "Visual Identity", "Brand Assets"]);
const ADS_TYPES = new Set(["Ads Strategy", "Campaign Structure", "Audience Plan", "Ad Copy", "Creative Requirements", "Optimization Notes"]);

export function computeOrchestrationSummary(input: {
  projects: Project[];
  clients: Client[];
  deliverables: Deliverable[];
  tasks: Task[];
  materialRequests: MaterialRequest[];
  strategyRooms: StrategyRoom[];
}): OrchestrationSummary {
  const { projects, clients, deliverables, tasks, materialRequests, strategyRooms } = input;
  const activeProjects = projects.filter((p) => p.stage !== "completed");
  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p]));
  const clientMap = Object.fromEntries(clients.map((c) => [c.id, c]));
  const activeIds = new Set(activeProjects.map((p) => p.id));

  const blockers: OrchestrationBlocker[] = [];

  for (const project of activeProjects) {
    const pd = deliverables.filter((d) => d.projectId === project.id);
    const pt = tasks.filter((t) => t.projectId === project.id);
    const pendingMat = materialRequests.filter((r) => r.projectId === project.id && r.status === "pending");
    const hasStrategy = strategyRooms.some((r) => r.projectId === project.id);
    const proposalApproved = project.proposal?.status === "approved";

    if (!project.proposal || project.proposal.status === "draft") {
      blockers.push({ projectId: project.id, projectName: project.name, severity: "critical", type: "no_proposal", message: "Sem proposta — execução bloqueada", route: `/agency/projects/${project.id}?tab=proposal` });
    }

    if (proposalApproved && !hasStrategy) {
      blockers.push({ projectId: project.id, projectName: project.name, severity: "high", type: "no_strategy", message: "Strategy Room ausente — agentes sem contexto", route: "/agency/orchestrator" });
    }

    if (pendingMat.length > 0) {
      blockers.push({ projectId: project.id, projectName: project.name, severity: pendingMat.length >= 3 ? "high" : "medium", type: "pending_materials", message: `${pendingMat.length} material(is) pendente(s) do cliente`, route: `/agency/projects/${project.id}` });
    }

    const revisions = pd.filter((d) => needsRevision(d));
    if (revisions.length > 0) {
      blockers.push({ projectId: project.id, projectName: project.name, severity: "high", type: "revision_queue", message: `${revisions.length} entrega(s) com revisão solicitada`, route: "/agency/deliverables" });
    }

    const blockedTasks = pt.filter((t) => t.status === "blocked");
    if (blockedTasks.length > 0) {
      blockers.push({ projectId: project.id, projectName: project.name, severity: "high", type: "blocked_tasks", message: `${blockedTasks.length} tarefa(s) bloqueada(s)`, route: "/agency/tasks" });
    }

    // Stalled Social → Design dependency
    const hasSocialAgent = project.agents.includes("a3");
    const hasDesignAgent = project.agents.includes("a2");
    const socialContent = pd.filter((d) => SOCIAL_TYPES.has(d.type));
    if (hasDesignAgent && hasSocialAgent && socialContent.length === 0 && proposalApproved) {
      blockers.push({ projectId: project.id, projectName: project.name, severity: "medium", type: "dependency_violation", message: "Design aguarda Social gerar Content Strategy", route: "/agency/social-media-agent" });
    }
  }

  // Stalled approvals (in_review > 5 days)
  const stalledApprovals: OrchestrationSummary["stalledApprovals"] = [];
  for (const d of deliverables.filter((d) => d.status === "in_review" && activeIds.has(d.projectId))) {
    const daysSent = Math.floor((Date.now() - new Date(d.updatedAt ?? d.createdAt).getTime()) / 86400000);
    if (daysSent >= 5) {
      const p = projectMap[d.projectId];
      if (p) stalledApprovals.push({ projectId: d.projectId, projectName: p.name, deliverableName: d.name, daysSent });
    }
  }

  // Orphan deliverables (deliverables whose projectId no longer exists)
  const orphans = deliverables.filter((d) => !projectMap[d.projectId]);

  // Department summaries
  const deptDefs = [
    { dept: "social", label: "Redes Sociais", agentId: "a3", types: SOCIAL_TYPES },
    { dept: "design", label: "Design", agentId: "a2", types: DESIGN_TYPES },
    { dept: "ads", label: "Tráfego Pago", agentId: "a4", types: ADS_TYPES },
  ];

  const departments: OrchestrationDeptSummary[] = deptDefs.map((cfg) => {
    const dds = deliverables.filter((d) => activeIds.has(d.projectId) && cfg.types.has(d.type));
    const assignedProjects = activeProjects.filter((p) => p.agents.includes(cfg.agentId));
    const approvedProjects = assignedProjects.filter((p) => p.proposal?.status === "approved");
    const revisionsOpen = dds.filter((d) => needsRevision(d)).length;

    return {
      dept: cfg.dept,
      label: cfg.label,
      agentId: cfg.agentId,
      projectsAssigned: assignedProjects.length,
      deliverablesDraft: dds.filter((d) => d.status === "draft").length,
      deliverablesPendingReview: dds.filter((d) => d.status === "in_review").length,
      deliverablesApproved: dds.filter((d) => d.status === "approved" || d.status === "delivered").length,
      revisionsOpen,
      isIdle: dds.length === 0 && approvedProjects.length > 0,
      isOverloaded: revisionsOpen >= 3,
    };
  });

  const criticalBlockerCount = blockers.filter((b) => b.severity === "critical").length;

  // Top-line answer to "What should I work on right now?"
  let topQuestion: string;
  if (criticalBlockerCount > 0) {
    const first = blockers.find((b) => b.severity === "critical")!;
    topQuestion = `${first.projectName}: ${first.message}`;
  } else if (stalledApprovals.length > 0) {
    topQuestion = `"${stalledApprovals[0].deliverableName}" aguarda aprovação há ${stalledApprovals[0].daysSent} dias`;
  } else if (departments.some((d) => d.isIdle)) {
    const idle = departments.find((d) => d.isIdle)!;
    topQuestion = `${idle.label} ocioso — iniciar execução nos projetos aprovados`;
  } else {
    const highBlocker = blockers.find((b) => b.severity === "high");
    topQuestion = highBlocker ? `${highBlocker.projectName}: ${highBlocker.message}` : "Execução em andamento — sem bloqueios críticos";
  }

  return {
    activeProjectCount: activeProjects.length,
    blockers,
    criticalBlockerCount,
    departments,
    stalledApprovals,
    orphanDeliverables: orphans.slice(0, 5),
    topQuestion,
  };
}
