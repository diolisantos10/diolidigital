// ─── Auto Task Generator ──────────────────────────────────────────────────────
//
// PM Agent generates suggested operational tasks from project state.
// Tasks are ephemeral — computed on every render, never stored to DB.
// Each task has a title, priority, owner, and source so the PM can act immediately.
// ─────────────────────────────────────────────────────────────────────────────

import type { Project, Deliverable, Task, StrategyRoom, Client } from "@/lib/agency/mock-data";
import type { MaterialRequest } from "@/lib/agency/workspace";
import { needsRevision } from "@/lib/agency/deliverables";

export type AutoTaskPriority = "critical" | "high" | "medium" | "low";
export type AutoTaskOwner = "PM" | "Social" | "Design" | "Ads" | "Cliente";
export type AutoTaskSource =
  | "proposal_gate"
  | "strategy_gate"
  | "material_follow_up"
  | "revision_queue"
  | "execution_gap"
  | "deadline_risk"
  | "review_pending"
  | "dependency_violation";

export interface AutoTask {
  id: string;
  projectId: string;
  projectName: string;
  clientId: string;
  title: string;
  description: string;
  priority: AutoTaskPriority;
  owner: AutoTaskOwner;
  source: AutoTaskSource;
  route: string;
}

// ─── Per-project task generation ─────────────────────────────────────────────

export function generateAutoTasksForProject(input: {
  project: Project;
  client?: Client;
  deliverables: Deliverable[];
  tasks: Task[];
  materialRequests: MaterialRequest[];
  strategyRooms: StrategyRoom[];
}): AutoTask[] {
  const { project, client, deliverables, tasks, materialRequests, strategyRooms } = input;
  const generated: AutoTask[] = [];
  let seq = 0;

  const id = () => `auto-${project.id}-${++seq}`;
  const base = { projectId: project.id, projectName: project.name, clientId: project.clientId };

  const pd = deliverables.filter((d) => d.projectId === project.id);
  const pt = tasks.filter((t) => t.projectId === project.id);
  const pendingMat = materialRequests.filter((r) => r.projectId === project.id && r.status === "pending");
  const hasStrategyRoom = strategyRooms.some((r) => r.projectId === project.id);
  const proposalApproved = project.proposal?.status === "approved";
  const proposalSent = project.proposal?.status === "sent";
  const daysToDeadline = Math.ceil((new Date(project.deadline).getTime() - Date.now()) / 86400000);

  // ── Rule 1: No proposal ────────────────────────────────────────────────────
  if (!project.proposal || project.proposal.status === "draft") {
    generated.push({
      ...base, id: id(),
      title: "Enviar proposta ao cliente",
      description: "Projeto sem proposta enviada. Finalizar escopo e valor antes de qualquer execução.",
      priority: "critical",
      owner: "PM",
      source: "proposal_gate",
      route: `/agency/projects/${project.id}?tab=proposal`,
    });
    return generated; // no point listing other tasks if proposal is missing
  }

  // ── Rule 2: Proposal sent, not yet approved ───────────────────────────────
  if (proposalSent) {
    generated.push({
      ...base, id: id(),
      title: "Acompanhar aprovação da proposta",
      description: "Proposta enviada mas ainda não aprovada. Fazer follow-up com o cliente.",
      priority: "high",
      owner: "PM",
      source: "proposal_gate",
      route: `/agency/projects/${project.id}?tab=proposal`,
    });
    return generated;
  }

  // ── Rule 3: Approved, no strategy room ────────────────────────────────────
  if (proposalApproved && !hasStrategyRoom) {
    generated.push({
      ...base, id: id(),
      title: "Gerar Strategy Room",
      description: "Proposta aprovada mas sem contexto estratégico. Agentes precisam da sala de estratégia para executar.",
      priority: "high",
      owner: "PM",
      source: "strategy_gate",
      route: "/agency/orchestrator",
    });
  }

  // ── Rule 4: Pending materials ─────────────────────────────────────────────
  if (pendingMat.length > 0) {
    generated.push({
      ...base, id: id(),
      title: `Coletar ${pendingMat.length} material(is) do cliente`,
      description: `${pendingMat.map((m) => `"${m.description ?? m.title}"`).slice(0, 2).join(", ")}${pendingMat.length > 2 ? ` e mais ${pendingMat.length - 2}` : ""} ainda pendentes.`,
      priority: pendingMat.length >= 3 ? "high" : "medium",
      owner: "PM",
      source: "material_follow_up",
      route: `/agency/projects/${project.id}`,
    });
  }

  // ── Rule 5: Revisions needed ──────────────────────────────────────────────
  const revisions = pd.filter((d) => needsRevision(d));
  if (revisions.length > 0) {
    const firstOwner = revisions[0].ownerAgentId;
    const ownerMap: Record<string, AutoTaskOwner> = { a2: "Design", a3: "Social", a4: "Ads" };
    generated.push({
      ...base, id: id(),
      title: `Resolver ${revisions.length} revisão(ões) solicitada(s)`,
      description: `"${revisions[0].name}"${revisions.length > 1 ? ` e mais ${revisions.length - 1}` : ""} — cliente pediu alterações.`,
      priority: "high",
      owner: ownerMap[firstOwner ?? ""] ?? "PM",
      source: "revision_queue",
      route: "/agency/deliverables",
    });
  }

  // ── Rule 6: Drafts ready to send to client ────────────────────────────────
  const drafts = pd.filter((d) => d.status === "draft" && !needsRevision(d));
  if (drafts.length > 0) {
    generated.push({
      ...base, id: id(),
      title: `Enviar ${drafts.length} entrega(s) para revisão do cliente`,
      description: `${drafts.length} entrega(s) em rascunho pronta(s) para envio ao portal.`,
      priority: "medium",
      owner: "PM",
      source: "review_pending",
      route: "/agency/deliverables",
    });
  }

  // ── Rule 7: Blocked tasks ─────────────────────────────────────────────────
  const blocked = pt.filter((t) => t.status === "blocked");
  if (blocked.length > 0) {
    generated.push({
      ...base, id: id(),
      title: `Desbloquear ${blocked.length} tarefa(s)`,
      description: `${blocked.map((t) => `"${t.title}"`).slice(0, 2).join(", ")}${blocked.length > 2 ? ` e mais ${blocked.length - 2}` : ""}.`,
      priority: "high",
      owner: "PM",
      source: "dependency_violation",
      route: "/agency/tasks",
    });
  }

  // ── Rule 8: Production with no deliverables ────────────────────────────────
  if (proposalApproved && project.stage === "production" && pd.length === 0) {
    const agentPriority = ["a3", "a2", "a4"];
    const firstAgent = agentPriority.find((a) => project.agents.includes(a));
    const agentLabel: Record<string, AutoTaskOwner> = { a3: "Social", a2: "Design", a4: "Ads" };
    const agentRoute: Record<string, string> = {
      a3: "/agency/social-media-agent",
      a2: "/agency/design-agent",
      a4: "/agency/ads-agent",
    };
    generated.push({
      ...base, id: id(),
      title: "Iniciar produção — nenhuma entrega gerada",
      description: "Projeto em produção mas agentes ainda não geraram entregas. Rodar o primeiro agente.",
      priority: "high",
      owner: agentLabel[firstAgent ?? "a3"],
      source: "execution_gap",
      route: agentRoute[firstAgent ?? "a3"],
    });
  }

  // ── Rule 9: Deadline risk ─────────────────────────────────────────────────
  const pendingDelivs = pd.filter((d) => d.status !== "approved" && d.status !== "delivered");
  if (daysToDeadline <= 7 && daysToDeadline >= 0 && pendingDelivs.length > 0) {
    generated.push({
      ...base, id: id(),
      title: `⚑ Prazo crítico — ${daysToDeadline} dia(s)`,
      description: `${pendingDelivs.length} entrega(s) ainda não aprovadas. Priorizar execução imediata.`,
      priority: daysToDeadline <= 3 ? "critical" : "high",
      owner: "PM",
      source: "deadline_risk",
      route: `/agency/projects/${project.id}`,
    });
  }

  // ── Rule 10: Missing agents at production stage ───────────────────────────
  if (project.stage === "production" && project.agents.length === 0) {
    generated.push({
      ...base, id: id(),
      title: "Atribuir agentes ao projeto",
      description: "Projeto em produção sem nenhum agente atribuído. Atualizar no cadastro do projeto.",
      priority: "high",
      owner: "PM",
      source: "execution_gap",
      route: `/agency/projects/${project.id}`,
    });
  }

  return generated;
}

// ─── Workspace-level task generation ─────────────────────────────────────────

const PRIORITY_ORDER: Record<AutoTaskPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function generateAllAutoTasks(input: {
  projects: Project[];
  clients: Client[];
  deliverables: Deliverable[];
  tasks: Task[];
  materialRequests: MaterialRequest[];
  strategyRooms: StrategyRoom[];
}): AutoTask[] {
  const clientMap = Object.fromEntries(input.clients.map((c) => [c.id, c]));
  const active = input.projects.filter((p) => p.stage !== "completed");

  return active
    .flatMap((project) =>
      generateAutoTasksForProject({
        project,
        client: clientMap[project.clientId],
        deliverables: input.deliverables,
        tasks: input.tasks,
        materialRequests: input.materialRequests,
        strategyRooms: input.strategyRooms,
      })
    )
    .sort((a, b) => {
      const pd = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (pd !== 0) return pd;
      return a.projectName.localeCompare(b.projectName);
    });
}

// ─── Style helpers ────────────────────────────────────────────────────────────

export const AUTO_TASK_PRIORITY_STYLE: Record<AutoTaskPriority, { bg: string; text: string; label: string }> = {
  critical: { bg: "bg-[#FEE2E2]", text: "text-[#DC2626]", label: "Crítico" },
  high:     { bg: "bg-[#FEF3C7]", text: "text-[#D97706]", label: "Alto" },
  medium:   { bg: "bg-[#E6FBFA]", text: "text-[#070A1F]", label: "Médio" },
  low:      { bg: "bg-[#F0F0ED]", text: "text-[#9B9B95]", label: "Baixo" },
};

export const AUTO_TASK_OWNER_STYLE: Record<AutoTaskOwner, { color: string }> = {
  PM:      { color: "#1A1A1A" },
  Social:  { color: "#070A1F" },
  Design:  { color: "#0E7C75" },
  Ads:     { color: "#0E7490" },
  Cliente: { color: "#0057FF" },
};
