// ─── PM Agent — Rule-Based Next-Action Engine ─────────────────────────────────
//
// Analyzes the current state of a project and emits a single PMDirective
// describing the most important next step, who should take it, and why.
// Pure function — no side effects, no async, no external calls.
// ─────────────────────────────────────────────────────────────────────────────

import type { Project, Deliverable, Task, StrategyRoom } from "@/lib/agency/mock-data";
import type { MaterialRequest } from "@/lib/agency/workspace";
import type { BrandUpdate } from "@/store/agency-store";

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
