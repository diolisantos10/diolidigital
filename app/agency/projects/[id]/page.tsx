"use client";

import { use, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAgencyStore } from "@/store/agency-store";
import { notFound } from "next/navigation";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import Badge from "@/components/agency/ui/Badge";
import Button from "@/components/agency/ui/Button";
import Modal from "@/components/agency/ui/Modal";
import Link from "next/link";
import { TaskStatus, DeliverableStatus, Priority, ProjectStage, MOCK_AGENTS, ProjectProposal } from "@/lib/agency/mock-data";

const STAGES: ProjectStage[] = ["briefing","diagnosis","planning","production","review","delivery","ongoing","completed"];
const TASK_CYCLE: Record<TaskStatus, TaskStatus> = {
  pending: "in_progress", in_progress: "done", done: "pending", blocked: "pending",
};
const DELIVERABLE_CYCLE: Record<DeliverableStatus, DeliverableStatus> = {
  draft: "in_review", in_review: "approved", approved: "delivered", delivered: "draft",
};

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { projects, clients, tasks, deliverables, briefings, materialRequests, updateTaskStatus, updateDeliverableStatus, updateProject, updateProposal, sendProposal, moveProjectStage, setPendingAgentInput } = useAgencyStore();

  type TabId = "overview" | "proposal" | "execution" | "pipeline" | "tasks" | "deliverables" | "briefing" | "strategy" | "assets" | "history";
  const VALID_TABS: TabId[] = ["overview", "proposal", "execution", "pipeline", "tasks", "deliverables", "briefing", "strategy", "assets", "history"];
  const [tab, setTab] = useState<TabId>(() => {
    const t = searchParams.get("tab") as TabId | null;
    return t && VALID_TABS.includes(t) ? t : "overview";
  });
  const [editOpen, setEditOpen] = useState(false);
  const [proposalDirty, setProposalDirty] = useState(false);

  const project = projects.find((p) => p.id === id);
  if (!project) return notFound();

  const client = clients.find((c) => c.id === project.clientId);
  const projectTasks = tasks.filter((t) => t.projectId === id);
  const projectDeliverables = deliverables.filter((d) => d.projectId === id);
  const briefing = briefings.find((b) => b.projectId === id);
  const projectMaterialRequests = materialRequests.filter((r) => r.projectId === id);
  const doneTasks = projectTasks.filter((t) => t.status === "done").length;
  const progress = projectTasks.length > 0 ? Math.round((doneTasks / projectTasks.length) * 100) : 0;

  const [editForm, setEditForm] = useState({
    name: project.name, goal: project.goal, type: project.type,
    deadline: project.deadline, priority: project.priority, stage: project.stage,
  });
  const handleSaveEdit = () => {
    updateProject(id, editForm);
    setEditOpen(false);
  };

  const [proposalForm, setProposalForm] = useState<Partial<ProjectProposal>>(() => ({
    objective: project?.proposal?.objective ?? "",
    scope: project?.proposal?.scope ?? "",
    deliverables: project?.proposal?.deliverables ?? [],
    timeline: project?.proposal?.timeline ?? "",
    pricing: project?.proposal?.pricing ?? "",
  }));
  const [deliverablesText, setDeliverablesText] = useState<string>(
    (project?.proposal?.deliverables ?? []).join("\n")
  );

  const handleSaveProposal = () => {
    const parsed = deliverablesText.split("\n").map((s) => s.trim()).filter(Boolean);
    updateProposal(id, { ...proposalForm, deliverables: parsed });
    setProposalDirty(false);
  };

  const handleSendProposal = () => {
    const parsed = deliverablesText.split("\n").map((s) => s.trim()).filter(Boolean);
    updateProposal(id, { ...proposalForm, deliverables: parsed });
    sendProposal(id);
    setProposalDirty(false);
  };

  const getAgent = (agentId: string) => MOCK_AGENTS.find((a) => a.id === agentId);

  const TABS = VALID_TABS;
  const TAB_LABELS: Record<TabId, string> = {
    overview: "Visão Geral",
    proposal: "Proposta",
    execution: "Execução",
    pipeline: "Pipeline",
    tasks: "Tarefas",
    deliverables: "Entregas",
    briefing: "Briefing",
    strategy: "Estratégia",
    assets: "Ativos",
    history: "Histórico",
  };

  // ── Execution helpers ──────────────────────────────────────────────────────
  function getAgentStatus(agentId: string): "not_started" | "in_progress" | "done" {
    const agentTasks = projectTasks.filter((t) => t.agentId === agentId);
    if (agentTasks.length === 0) return "not_started";
    if (agentTasks.every((t) => t.status === "done")) return "done";
    if (agentTasks.some((t) => t.status === "in_progress" || t.status === "done")) return "in_progress";
    return "not_started";
  }

  function getAgentRunUrl(agentName: string): string | null {
    const n = agentName.toLowerCase();
    if (n.includes("social")) return "/agency/social-media-agent";
    if (n.includes("design")) return "/agency/design-agent";
    return null;
  }

  function getDeliverableCategory(type: string): "posts" | "design" | "campaigns" | "other" {
    const t = type.toLowerCase();
    if (t.includes("social") || t.includes("post") || t.includes("caption") || t.includes("copy")) return "posts";
    if (t.includes("design") || t.includes("visual") || t.includes("asset") || t.includes("brand") || t.includes("identity")) return "design";
    if (t.includes("campaign") || t.includes("ad") || t.includes("paid") || t.includes("media")) return "campaigns";
    return "other";
  }

  const STATUS_LABEL: Record<"not_started" | "in_progress" | "done", string> = {
    not_started: "Não iniciado",
    in_progress: "Em andamento",
    done: "Concluído",
  };
  const STATUS_COLOR: Record<"not_started" | "in_progress" | "done", string> = {
    not_started: "bg-[#F0F0ED] text-[#9B9B95]",
    in_progress: "bg-[#FFF4ED] text-[#C2530A]",
    done: "bg-[#DCFCE7] text-[#16A34A]",
  };

  return (
    <>
      <div className="mb-2">
        <Link href="/agency/projects" className="text-[12px] text-[#9B9B95] hover:text-[#1A1A1A] transition-colors">
          ← Projetos
        </Link>
      </div>

      <AgencyHeader
        title={project.name}
        subtitle={`${client?.name ?? "Unknown"} · ${project.type}`}
        meta={
          <div className="flex items-center gap-2">
            <Badge variant={project.stage} size="md" />
            <Badge variant={project.priority} size="md" />
            <span className="text-[12px] text-[#9B9B95]">Due {project.deadline.slice(5)}</span>
          </div>
        }
        actions={<Button variant="secondary" onClick={() => setEditOpen(true)}>Editar Projeto</Button>}
      />

      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[12px] text-[#9B9B95]">Progresso das tarefas</span>
          <span className="text-[12px] text-[#6B6B65] font-medium mono-num">{doneTasks}/{projectTasks.length} tarefas concluídas</span>
        </div>
        <div className="h-1.5 bg-[#F0F0ED] rounded-full overflow-hidden">
          <div className="h-full bg-[#5B5BD6] rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-[#E5E5E2] mb-6 -mt-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`h-9 px-4 text-[13px] font-medium border-b-2 transition-colors ${
              tab === t
                ? "border-[#5B5BD6] text-[#5B5BD6]"
                : "border-transparent text-[#6B6B65] hover:text-[#1A1A1A]"
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Tab: Overview */}
      {tab === "overview" && (
        <div className="grid grid-cols-[1fr_280px] gap-6">
          <div className="space-y-5">
            {/* Client Approval status */}
            {projectDeliverables.length > 0 && (() => {
              const awaitingReview = projectDeliverables.filter((d) => d.status === "in_review").length;
              const approvedCount  = projectDeliverables.filter((d) => d.status === "approved").length;
              const revisionNeeded = projectDeliverables.filter((d) => d.status === "draft" && d.clientFeedback).length;
              if (awaitingReview === 0 && revisionNeeded === 0 && approvedCount === 0) return null;
              const reworkAgentId  = project.agents.find((a) => ["a2", "a1", "a3"].includes(a)) ?? project.agents[0];
              const reworkAgent    = reworkAgentId ? getAgent(reworkAgentId) : null;
              return (
                <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-3">Aprovação do Cliente</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {awaitingReview > 0 && (
                      <button
                        onClick={() => setTab("deliverables")}
                        className="flex items-center gap-1.5 h-7 px-3 rounded-full bg-[#FEF3C7] text-[#D97706] text-[12px] font-medium hover:opacity-80 transition-opacity"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-[#D97706]" />
                        {awaitingReview} aguardando revisão
                      </button>
                    )}
                    {revisionNeeded > 0 && (
                      <button
                        onClick={() => setTab("deliverables")}
                        className="flex items-center gap-1.5 h-7 px-3 rounded-full bg-[#FEE2E2] text-[#DC2626] text-[12px] font-medium hover:opacity-80 transition-opacity"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-[#DC2626]" />
                        {revisionNeeded} revisão necessária
                      </button>
                    )}
                    {approvedCount > 0 && (
                      <button
                        onClick={() => setTab("deliverables")}
                        className="flex items-center gap-1.5 h-7 px-3 rounded-full bg-[#DCFCE7] text-[#16A34A] text-[12px] font-medium hover:opacity-80 transition-opacity"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
                        {approvedCount} aprovado(s)
                      </button>
                    )}
                  </div>
                  {revisionNeeded > 0 && reworkAgent && (
                    <p className="text-[12px] text-[#9B9B95] mt-2.5">
                      Próxima ação: <span className="text-[#1A1A1A] font-medium">{reworkAgent.name}</span> deve revisar a entrega sinalizada.
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Project Manager — proposal gate + execution status */}
            {(() => {
              const prop = project.proposal;
              const isApproved = prop?.status === "approved";
              const isSent = prop?.status === "sent";
              const isDraft = prop?.status === "draft";
              const isRejected = prop?.status === "rejected";
              const isChangesRequested = prop?.status === "changes_requested";
              const executionBlocked = !prop || !isApproved;
              const pendingRequests = projectMaterialRequests.filter((r) => r.status === "pending").length;
              const blockedTasks = projectTasks.filter((t) => t.status === "blocked").length;

              const nextAction = !prop
                ? "Crie uma proposta na aba Proposta antes de enviar ao cliente."
                : isDraft
                ? "Revise e envie a proposta ao cliente para aprovação."
                : isSent
                ? "Aguardando aprovação do cliente. Sem execução até aprovação."
                : isChangesRequested
                ? "Cliente solicitou alterações — revise a proposta na aba Proposta."
                : isRejected
                ? "Proposta reprovada. Revise e reenvie pela aba Proposta."
                : isApproved
                ? blockedTasks > 0
                  ? `${blockedTasks} tarefa(s) bloqueada(s). Resolva os bloqueios antes de prosseguir.`
                  : pendingRequests > 0
                  ? `${pendingRequests} solicitação(ões) de material pendente(s) do cliente.`
                  : "Execução liberada. Agentes prontos para rodar."
                : "";

              return (
                <div className={`bg-white rounded-[10px] border shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4 ${
                  isApproved ? "border-[#BBF7D0]" : executionBlocked ? "border-[#FDE68A]" : "border-[#E5E5E2]"
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Gerente de Projeto</div>
                    <button
                      onClick={() => setTab("proposal")}
                      className="text-[12px] text-[#5B5BD6] hover:underline"
                    >
                      {prop ? "Ver Proposta" : "Criar Proposta"} →
                    </button>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2.5">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${isApproved ? "bg-[#16A34A]" : "bg-[#D97706]"}`} />
                      <span className="text-[13px] font-medium text-[#1A1A1A]">
                        {isApproved ? "Proposta aprovada — execução liberada" : executionBlocked ? "Execução bloqueada — proposta não aprovada" : ""}
                      </span>
                    </div>
                    {prop && (
                      <div className="flex items-center gap-2 flex-wrap pl-4">
                        {[
                          { label: "Proposta", value: prop.status === "draft" ? "Rascunho" : prop.status === "sent" ? "Enviada ao cliente" : prop.status === "approved" ? "Aprovada" : prop.status === "rejected" ? "Reprovada" : "Alterações solicitadas", color: isApproved ? "bg-[#DCFCE7] text-[#16A34A]" : isSent ? "bg-[#EEF0FF] text-[#5B5BD6]" : isRejected ? "bg-[#FEE2E2] text-[#DC2626]" : "bg-[#FEF3C7] text-[#D97706]" },
                          ...(pendingRequests > 0 ? [{ label: "Materiais do cliente", value: `${pendingRequests} pendente(s)`, color: "bg-[#FEF3C7] text-[#D97706]" }] : []),
                          ...(blockedTasks > 0 ? [{ label: "Tarefas bloqueadas", value: `${blockedTasks}`, color: "bg-[#FEE2E2] text-[#DC2626]" }] : []),
                        ].map((item) => (
                          <span key={item.label} className={`h-5 px-2 rounded-full text-[10px] font-semibold ${item.color}`}>
                            {item.label}: {item.value}
                          </span>
                        ))}
                      </div>
                    )}
                    {nextAction && (
                      <p className="text-[12px] text-[#6B6B65] pl-4 leading-relaxed">
                        <span className="font-medium text-[#1A1A1A]">Próximo: </span>{nextAction}
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Social Media Department status */}
            {(() => {
              const SOCIAL_TYPES = ["Content Strategy", "Content Calendar", "Posts", "Stories", "Design Requests"];
              const socialDeliverables = projectDeliverables.filter((d) => SOCIAL_TYPES.includes(d.type));
              if (socialDeliverables.length === 0) return null;

              const hasStrategy = socialDeliverables.some((d) => d.type === "Content Strategy");
              const hasCalendar = socialDeliverables.some((d) => d.type === "Content Calendar");
              const hasContent  = socialDeliverables.some((d) => d.type === "Posts" || d.type === "Stories");
              const hasDesign   = socialDeliverables.some((d) => d.type === "Design Requests");
              const pendingApproval = socialDeliverables.filter((d) => d.status === "in_review").length;
              const approvedCount   = socialDeliverables.filter((d) => d.status === "approved").length;

              const deptItems = [
                { label: "Estratégia Social",  done: hasStrategy },
                { label: "Calendário de Conteúdo", done: hasCalendar },
                { label: "Pacote de Conteúdo",  done: hasContent },
                { label: "Solicitações de Design",  done: hasDesign },
              ];

              return (
                <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Departamento de Redes Sociais</div>
                    <button onClick={() => setTab("deliverables")} className="text-[12px] text-[#5B5BD6] hover:underline">
                      Ver entregas →
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {deptItems.map(({ label, done }) => (
                      <div key={label} className="flex items-center gap-2">
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${done ? "bg-[#DCFCE7]" : "bg-[#F0F0ED]"}`}>
                          {done ? (
                            <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                              <path d="M1 3L3 5L7 1" stroke="#16A34A" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          ) : (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#C0C0BC]" />
                          )}
                        </span>
                        <span className={`text-[13px] ${done ? "text-[#1A1A1A]" : "text-[#9B9B95]"}`}>{label}</span>
                      </div>
                    ))}
                  </div>
                  {(pendingApproval > 0 || approvedCount > 0) && (
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#F0F0ED] flex-wrap">
                      {pendingApproval > 0 && (
                        <span className="flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-[#FEF3C7] text-[#D97706] text-[11px] font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#D97706]" />
                          {pendingApproval} aguardando aprovação
                        </span>
                      )}
                      {approvedCount > 0 && (
                        <span className="flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-[#DCFCE7] text-[#16A34A] text-[11px] font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
                          {approvedCount} aprovado(s)
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Design Department status */}
            {(() => {
              const designDeliverables  = projectDeliverables.filter((d) => d.type === "Design");
              const hasDesignRequests   = projectDeliverables.some((d) => d.type === "Design Requests");
              if (!hasDesignRequests && designDeliverables.length === 0) return null;

              const pendingApproval = designDeliverables.filter((d) => d.status === "in_review").length;
              const approvedCount   = designDeliverables.filter((d) => d.status === "approved").length;
              const totalDesigns    = designDeliverables.length;

              const deptItems = [
                { label: "Solicitações de Design",    done: hasDesignRequests },
                { label: "Briefs Gerados",   done: totalDesigns > 0 },
                { label: "Aguardando Aprovação",   done: pendingApproval > 0 || approvedCount > 0 },
              ];

              return (
                <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Departamento de Design</div>
                    <button onClick={() => setTab("deliverables")} className="text-[12px] text-[#5B5BD6] hover:underline">
                      Ver entregas →
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {deptItems.map(({ label, done }) => (
                      <div key={label} className="flex items-center gap-2">
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${done ? "bg-[#FFF4ED]" : "bg-[#F0F0ED]"}`}>
                          {done ? (
                            <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                              <path d="M1 3L3 5L7 1" stroke="#C2530A" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          ) : (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#C0C0BC]" />
                          )}
                        </span>
                        <span className={`text-[13px] ${done ? "text-[#1A1A1A]" : "text-[#9B9B95]"}`}>{label}</span>
                        {label === "Briefs Gerados" && totalDesigns > 0 && (
                          <span className="text-[11px] text-[#9B9B95]">({totalDesigns})</span>
                        )}
                      </div>
                    ))}
                  </div>
                  {(pendingApproval > 0 || approvedCount > 0) && (
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#F0F0ED] flex-wrap">
                      {pendingApproval > 0 && (
                        <span className="flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-[#FEF3C7] text-[#D97706] text-[11px] font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#D97706]" />
                          {pendingApproval} aguardando aprovação
                        </span>
                      )}
                      {approvedCount > 0 && (
                        <span className="flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-[#DCFCE7] text-[#16A34A] text-[11px] font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
                          {approvedCount} aprovado(s)
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Goal */}
            <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-2">Objetivo</div>
              <p className="text-[14px] text-[#1A1A1A] leading-relaxed">{project.goal}</p>
            </div>

            {/* Tasks snapshot */}
            <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#F0F0ED]">
                <div className="text-[13px] font-semibold text-[#1A1A1A]">Tarefas</div>
                <button onClick={() => setTab("tasks")} className="text-[12px] text-[#5B5BD6] hover:underline">Ver todas</button>
              </div>
              {projectTasks.slice(0, 4).map((task, i) => (
                <div key={task.id} className={`flex items-center gap-3 px-5 py-3 ${i > 0 ? "border-t border-[#F0F0ED]" : ""}`}>
                  <button
                    onClick={() => updateTaskStatus(task.id, TASK_CYCLE[task.status])}
                    className={`w-4 h-4 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors ${
                      task.status === "done"
                        ? "bg-[#5B5BD6] border-[#5B5BD6]"
                        : task.status === "blocked"
                        ? "bg-[#FEE2E2] border-[#DC2626]"
                        : "border-[#D0D0CC] hover:border-[#5B5BD6]"
                    }`}
                  >
                    {task.status === "done" && (
                      <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    )}
                  </button>
                  <span className={`text-[13px] flex-1 ${task.status === "done" ? "line-through text-[#9B9B95]" : "text-[#1A1A1A]"}`}>
                    {task.title}
                  </span>
                  <Badge variant={task.status} />
                </div>
              ))}
            </div>

            {/* Deliverables snapshot */}
            {projectDeliverables.length > 0 && (
              <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#F0F0ED]">
                  <div className="text-[13px] font-semibold text-[#1A1A1A]">Entregas</div>
                  <button onClick={() => setTab("deliverables")} className="text-[12px] text-[#5B5BD6] hover:underline">Ver todas</button>
                </div>
                {projectDeliverables.map((d, i) => (
                  <div key={d.id} className={`flex items-center justify-between px-5 py-3 ${i > 0 ? "border-t border-[#F0F0ED]" : ""}`}>
                    <div>
                      <div className="text-[13px] font-medium text-[#1A1A1A]">{d.name}</div>
                      <div className="text-[11px] text-[#9B9B95]">{d.type} · v{d.version}</div>
                    </div>
                    <button
                      onClick={() => updateDeliverableStatus(d.id, DELIVERABLE_CYCLE[d.status])}
                      className="cursor-pointer"
                    >
                      <Badge variant={d.status} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sidebar info */}
          <div className="space-y-4">
            <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-3">Detalhes</div>
              <div className="space-y-2.5">
                {[
                  { label: "Cliente", value: client?.name ?? "—" },
                  { label: "Tipo", value: project.type },
                  { label: "Prazo", value: project.deadline },
                  { label: "Criado em", value: project.createdAt },
                  { label: "Tarefas", value: `${doneTasks} / ${projectTasks.length} concluídas` },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-[12px] text-[#9B9B95]">{label}</span>
                    <span className="text-[12px] font-medium text-[#1A1A1A]">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Agents */}
            <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-3">Agentes Atribuídos</div>
              <div className="space-y-2">
                {project.agents.map((agentId) => {
                  const agent = getAgent(agentId);
                  if (!agent) return null;
                  return (
                    <div key={agentId} className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-[#EEF0FF] flex items-center justify-center text-[10px] font-bold text-[#5B5BD6]">
                        {agent.name.slice(0, 1)}
                      </div>
                      <span className="text-[12px] text-[#1A1A1A]">{agent.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Execution */}
      {tab === "execution" && (
        <div className="space-y-6">

          {/* Stage Control */}
          <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4">
            <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-3">Controle de Etapa</div>
            <div className="flex items-center gap-1 flex-wrap">
              {STAGES.map((stage, i) => {
                const isActive = project.stage === stage;
                const isDone = STAGES.indexOf(stage) < STAGES.indexOf(project.stage);
                return (
                  <div key={stage} className="flex items-center gap-1">
                    <button
                      onClick={() => moveProjectStage(id, stage)}
                      className={`h-7 px-3 rounded-full text-[12px] font-medium transition-all ${
                        isActive
                          ? "bg-[#5B5BD6] text-white"
                          : isDone
                          ? "bg-[#F0F0ED] text-[#6B6B65] hover:bg-[#E8E8E5]"
                          : "bg-[#F7F7F6] text-[#9B9B95] border border-[#E5E5E2] hover:border-[#5B5BD6] hover:text-[#5B5BD6]"
                      }`}
                    >
                      {isDone && <span className="mr-1 text-[#16A34A]">✓</span>}
                      {stage.charAt(0).toUpperCase() + stage.slice(1)}
                    </button>
                    {i < STAGES.length - 1 && <span className="text-[#D0D0CC] text-[11px]">›</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Agent Pipeline */}
          <div>
            <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-3">Pipeline de Agentes</div>
            {project.agents.length === 0 ? (
              <div className="bg-white rounded-[10px] border border-dashed border-[#E5E5E2] px-5 py-8 text-center">
                <p className="text-[13px] text-[#9B9B95]">Nenhum agente atribuído. Edite o projeto para atribuir agentes.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {project.agents.map((agentId, idx) => {
                  const agent = getAgent(agentId);
                  if (!agent) return null;
                  const status = getAgentStatus(agentId);
                  const runUrl = getAgentRunUrl(agent.name);
                  const agentTasks = projectTasks.filter((t) => t.agentId === agentId);
                  const doneTasks = agentTasks.filter((t) => t.status === "done").length;
                  return (
                    <div key={agentId} className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4 flex items-center gap-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0 ${
                        status === "done" ? "bg-[#DCFCE7] text-[#16A34A]" : status === "in_progress" ? "bg-[#FFF4ED] text-[#C2530A]" : "bg-[#EEF0FF] text-[#5B5BD6]"
                      }`}>
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-[13px] font-semibold text-[#1A1A1A]">{agent.name}</p>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLOR[status]}`}>
                            {STATUS_LABEL[status]}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#9B9B95] truncate">{agent.role}</p>
                        {agentTasks.length > 0 && (
                          <p className="text-[11px] text-[#6B6B65] mt-1">
                            {doneTasks}/{agentTasks.length} tarefas concluídas
                          </p>
                        )}
                      </div>
                      {runUrl ? (
                        <button
                          onClick={() => {
                            setPendingAgentInput({
                              projectId: id,
                              projectName: project.name,
                              clientName: client?.name ?? "",
                              goal: project.goal,
                              projectType: project.type,
                            });
                            router.push(runUrl);
                          }}
                          className="shrink-0 h-7 px-3 rounded-[6px] text-[12px] font-medium border border-[#E5E5E2] text-[#1A1A1A] hover:bg-[#F7F7F6] hover:border-[#5B5BD6] hover:text-[#5B5BD6] transition-colors flex items-center gap-1.5"
                        >
                          Executar
                          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                            <path d="M2 5.5h7M5.5 2l3.5 3.5L5.5 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      ) : (
                        <span className="shrink-0 h-7 px-3 rounded-[6px] text-[12px] font-medium border border-[#E5E5E2] text-[#C0C0BC] cursor-not-allowed flex items-center">
                          Sem página
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Deliverables by category */}
          <div>
            <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-3">Entregas</div>
            <div className="grid grid-cols-3 gap-4">
              {(["posts", "design", "campaigns"] as const).map((cat) => {
                const catLabels = { posts: "Posts & Copy", design: "Ativos de Design", campaigns: "Campanhas & Anúncios" };
                const catDeliverables = projectDeliverables.filter((d) => getDeliverableCategory(d.type) === cat);
                return (
                  <div key={cat} className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                    <div className="px-4 py-3 border-b border-[#F0F0ED] flex items-center justify-between">
                      <p className="text-[12px] font-semibold text-[#1A1A1A]">{catLabels[cat]}</p>
                      <span className="text-[11px] text-[#9B9B95]">{catDeliverables.length}</span>
                    </div>
                    {catDeliverables.length === 0 ? (
                      <div className="px-4 py-6 text-center">
                        <p className="text-[11px] text-[#C0C0BC]">Nenhuma entrega ainda</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-[#F0F0ED]">
                        {catDeliverables.map((d) => (
                          <div key={d.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-[12px] font-medium text-[#1A1A1A] truncate">{d.name}</p>
                              <p className="text-[10px] text-[#9B9B95]">v{d.version}</p>
                            </div>
                            <button onClick={() => updateDeliverableStatus(d.id, DELIVERABLE_CYCLE[d.status])}>
                              <Badge variant={d.status} size="sm" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}

      {/* Tab: Pipeline */}
      {tab === "pipeline" && (
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="divide-y divide-[#F0F0ED]">
            {STAGES.map((stage, i) => {
              const isActive = project.stage === stage;
              const isDone = STAGES.indexOf(stage) < STAGES.indexOf(project.stage);
              return (
                <div key={stage} className={`flex items-center gap-4 px-6 py-4 ${isActive ? "bg-[#FAFAFE]" : ""}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                    isActive ? "bg-[#5B5BD6] text-white" : isDone ? "bg-[#DCFCE7] text-[#16A34A]" : "bg-[#F0F0ED] text-[#9B9B95]"
                  }`}>
                    {isDone ? "✓" : i + 1}
                  </div>
                  <div className="flex-1">
                    <div className={`text-[13px] font-medium ${isActive ? "text-[#5B5BD6]" : isDone ? "text-[#6B6B65]" : "text-[#9B9B95]"}`}>
                      {stage.charAt(0).toUpperCase() + stage.slice(1)}
                    </div>
                    {isActive && (
                      <div className="text-[12px] text-[#9B9B95] mt-0.5">Etapa atual</div>
                    )}
                  </div>
                  {isActive && <Badge variant="in_progress" size="md">Atual</Badge>}
                  {isDone && <Badge variant="done" size="md">Concluído</Badge>}
                  {!isActive && (
                    <button
                      onClick={() => moveProjectStage(id, stage)}
                      className="h-6 px-2.5 rounded-[5px] text-[11px] font-medium border border-[#E5E5E2] text-[#6B6B65] hover:border-[#5B5BD6] hover:text-[#5B5BD6] transition-colors"
                    >
                      Mover aqui
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab: Tasks */}
      {tab === "tasks" && (
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          {projectTasks.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <p className="text-[14px] font-medium text-[#1A1A1A]">Nenhuma tarefa encontrada.</p>
              <p className="text-[13px] text-[#9B9B95] mt-1.5">Execute o Orchestrator para gerar um plano de tarefas para este projeto.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#F0F0ED]">
                  <th className="w-8 px-5 py-3"></th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Tarefa</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Agente</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Status</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Prazo</th>
                </tr>
              </thead>
              <tbody>
                {projectTasks.map((task, i) => {
                  const agent = getAgent(task.agentId);
                  return (
                    <tr key={task.id} className={`hover:bg-[#FAFAF9] transition-colors ${i > 0 ? "border-t border-[#F0F0ED]" : ""}`}>
                      <td className="px-5 py-3.5">
                        <button
                          onClick={() => updateTaskStatus(task.id, TASK_CYCLE[task.status])}
                          className={`w-4 h-4 rounded-[4px] border flex items-center justify-center transition-colors ${
                            task.status === "done"
                              ? "bg-[#5B5BD6] border-[#5B5BD6]"
                              : task.status === "blocked"
                              ? "bg-[#FEE2E2] border-[#DC2626]"
                              : "border-[#D0D0CC] hover:border-[#5B5BD6]"
                          }`}
                        >
                          {task.status === "done" && (
                            <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          )}
                        </button>
                      </td>
                      <td className="px-3 py-3.5">
                        <div className={`text-[13px] font-medium ${task.status === "done" ? "line-through text-[#9B9B95]" : "text-[#1A1A1A]"}`}>
                          {task.title}
                        </div>
                        <div className="text-[11px] text-[#9B9B95] mt-0.5 line-clamp-1">{task.description}</div>
                      </td>
                      <td className="px-5 py-3.5 text-[12px] text-[#6B6B65]">{agent?.name ?? "—"}</td>
                      <td className="px-5 py-3.5"><Badge variant={task.status} /></td>
                      <td className="px-5 py-3.5 text-[12px] text-[#9B9B95]">{task.dueDate.slice(5)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: Deliverables */}
      {tab === "deliverables" && (
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          {projectDeliverables.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <p className="text-[14px] font-medium text-[#1A1A1A]">Nenhuma entrega salva ainda.</p>
              <p className="text-[13px] text-[#9B9B95] mt-1.5">As entregas são criadas conforme os agentes concluem suas tarefas.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#F0F0ED]">
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Nome</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Tipo</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Versão</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Status</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Data</th>
                </tr>
              </thead>
              <tbody>
                {projectDeliverables.map((d, i) => (
                  <tr key={d.id} className={`hover:bg-[#FAFAF9] transition-colors ${i > 0 ? "border-t border-[#F0F0ED]" : ""}`}>
                    <td className="px-5 py-3.5 text-[13px] font-medium text-[#1A1A1A]">{d.name}</td>
                    <td className="px-5 py-3.5 text-[13px] text-[#6B6B65]">{d.type}</td>
                    <td className="px-5 py-3.5 text-[13px] text-[#9B9B95] mono-num">v{d.version}</td>
                    <td className="px-5 py-3.5">
                      <button onClick={() => updateDeliverableStatus(d.id, DELIVERABLE_CYCLE[d.status])}>
                        <Badge variant={d.status} />
                      </button>
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-[#9B9B95]">{d.createdAt.slice(5)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: Briefing */}
      {tab === "briefing" && (() => {
        const ob = project.orchestratorBriefing;
        const SERVICE_LABELS: Record<string, string> = {
          social_media: "Social Media", ads: "Ads", seo: "SEO", branding: "Branding", content: "Content",
        };
        const Row = ({ label, value }: { label: string; value: string }) => (
          <div className="flex items-start gap-4 py-4 border-b border-[#F7F7F6] last:border-0">
            <div className="w-[160px] shrink-0 pt-0.5">
              <span className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">{label}</span>
            </div>
            <p className={`flex-1 text-[13px] leading-relaxed ${value ? "text-[#1A1A1A]" : "text-[#C0C0BC] italic"}`}>
              {value || "Não especificado"}
            </p>
          </div>
        );

        if (!ob) {
          return (
            <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-8 py-12 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="w-10 h-10 rounded-full bg-[#F0F0ED] flex items-center justify-center mx-auto mb-4">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M3 5h12M3 9h8M3 13h5" stroke="#9B9B95" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
              </div>
              <p className="text-[14px] font-medium text-[#1A1A1A]">Sem dados de briefing</p>
              <p className="text-[13px] text-[#9B9B95] mt-1.5 max-w-xs mx-auto">
                Este projeto não foi criado via Orchestrator. Dados de briefing estão disponíveis para projetos gerados a partir de um brief analisado.
              </p>
            </div>
          );
        }

        return (
          <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-3.5 border-b border-[#F0F0ED] bg-[#FAFAF9]">
              <span className="text-[12px] font-semibold text-[#1A1A1A] uppercase tracking-[0.05em]">Briefing Original</span>
              <span className="text-[11px] text-[#9B9B95]">Capturado na criação do projeto · somente leitura</span>
            </div>
            <div className="px-6">
              {/* Services */}
              <div className="flex items-start gap-4 py-4 border-b border-[#F7F7F6]">
                <div className="w-[160px] shrink-0 pt-1">
                  <span className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Serviços</span>
                </div>
                <div className="flex flex-wrap gap-1.5 flex-1">
                  {ob.services.length > 0
                    ? ob.services.map((s) => (
                        <span key={s} className="h-6 px-2.5 rounded-full text-[11px] font-medium bg-[#EEF0FF] text-[#5B5BD6]">
                          {SERVICE_LABELS[s] ?? s}
                        </span>
                      ))
                    : <span className="text-[13px] text-[#C0C0BC] italic">Não especificado</span>
                  }
                </div>
              </div>
              <Row label="Objetivo"            value={ob.objective} />
              <Row label="Descrição do Negócio" value={ob.businessDescription} />
              <Row label="Público-alvo"      value={ob.targetAudience} />
              {/* Channels */}
              <div className="flex items-start gap-4 py-4 border-b border-[#F7F7F6]">
                <div className="w-[160px] shrink-0 pt-0.5">
                  <span className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Canais</span>
                </div>
                <p className={`flex-1 text-[13px] leading-relaxed ${ob.channels.length > 0 ? "text-[#1A1A1A]" : "text-[#C0C0BC] italic"}`}>
                  {ob.channels.length > 0 ? ob.channels.join(" · ") : "Não especificado"}
                </p>
              </div>
              <Row label="Prazo" value={ob.deadline} />
              <Row label="Observações"    value={ob.notes} />
            </div>
          </div>
        );
      })()}

      {/* Tab: Strategy */}
      {tab === "strategy" && (
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-6 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          {!briefing ? (
            <div className="py-10 text-center">
              <p className="text-[14px] font-medium text-[#1A1A1A]">Nenhum briefing encontrado</p>
              <p className="text-[13px] text-[#9B9B95] mt-1.5">Envie um briefing pela página de Briefings para popular esta aba.</p>
            </div>
          ) : (
            <div className="space-y-6 max-w-2xl">
              {[
                { label: "Objetivo do Negócio", value: briefing.goal },
                { label: "Público-alvo", value: briefing.audience },
                { label: "Mensagem-chave", value: briefing.keyMessage },
                { label: "Entregas Solicitadas", value: briefing.deliverables },
                { label: "Critérios de Sucesso", value: briefing.successCriteria },
                ...(briefing.notes ? [{ label: "Observações", value: briefing.notes }] : []),
              ].map(({ label, value }) => (
                <div key={label}>
                  <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-2">{label}</div>
                  <p className="text-[13px] text-[#1A1A1A] leading-relaxed">{value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Proposal */}
      {tab === "proposal" && (
        <div className="space-y-5">
          {/* Status banner */}
          {project.proposal && (() => {
            const p = project.proposal!;
            const banners: Record<string, { bg: string; border: string; text: string; label: string }> = {
              draft:             { bg: "bg-[#F7F7F6]",  border: "border-[#E5E5E2]",  text: "text-[#6B6B65]",  label: "Rascunho — ainda não enviado ao cliente" },
              sent:              { bg: "bg-[#EEF0FF]",  border: "border-[#C7C7F5]",  text: "text-[#5B5BD6]",  label: "Enviado — aguardando aprovação do cliente" },
              approved:          { bg: "bg-[#DCFCE7]",  border: "border-[#BBF7D0]",  text: "text-[#16A34A]",  label: "Aprovado — execução liberada" },
              rejected:          { bg: "bg-[#FEF2F2]",  border: "border-[#FECACA]",  text: "text-[#DC2626]",  label: "Reprovado — revise e reenvie" },
              changes_requested: { bg: "bg-[#FFFBEB]",  border: "border-[#FDE68A]",  text: "text-[#D97706]",  label: "Alterações solicitadas pelo cliente" },
            };
            const b = banners[p.status];
            return (
              <div className={`flex items-center justify-between px-4 py-2.5 rounded-[8px] border ${b.bg} ${b.border}`}>
                <span className={`text-[13px] font-medium ${b.text}`}>{b.label}</span>
                {p.status === "changes_requested" && p.requestedChanges && (
                  <span className="text-[12px] text-[#6B6B65] max-w-xs truncate">{p.requestedChanges}</span>
                )}
                {p.status === "rejected" && p.rejectionReason && (
                  <span className="text-[12px] text-[#6B6B65] max-w-xs truncate">{p.rejectionReason}</span>
                )}
              </div>
            );
          })()}

          {!project.proposal && (
            <div className="px-4 py-3 rounded-[8px] border border-[#FDE68A] bg-[#FFFBEB]">
              <p className="text-[13px] text-[#D97706]">Nenhuma proposta criada ainda. Use o formulário abaixo — ela não será visível para o cliente até você enviá-la.</p>
            </div>
          )}

          {/* Proposal editor */}
          <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#F0F0ED] flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[#1A1A1A]">Editor de Proposta</span>
              {proposalDirty && (
                <span className="text-[11px] text-[#D97706]">Alterações não salvas</span>
              )}
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.04em] mb-1.5">OBJETIVO</label>
                <input
                  value={proposalForm.objective ?? ""}
                  onChange={(e) => { setProposalForm((f) => ({ ...f, objective: e.target.value })); setProposalDirty(true); }}
                  placeholder="O que este projeto pretende alcançar?"
                  className="w-full h-9 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.04em] mb-1.5">ESCOPO</label>
                <textarea
                  value={proposalForm.scope ?? ""}
                  onChange={(e) => { setProposalForm((f) => ({ ...f, scope: e.target.value })); setProposalDirty(true); }}
                  placeholder="Descreva o escopo completo do trabalho…"
                  rows={4}
                  className="w-full px-3 py-2 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white resize-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.04em] mb-1.5">ENTREGAS <span className="font-normal text-[#9B9B95] normal-case">(uma por linha)</span></label>
                <textarea
                  value={deliverablesText}
                  onChange={(e) => { setDeliverablesText(e.target.value); setProposalDirty(true); }}
                  placeholder={"Gestão de Redes Sociais\nCalendário de Conteúdo\nRelatório Mensal"}
                  rows={4}
                  className="w-full px-3 py-2 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white resize-none font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.04em] mb-1.5">CRONOGRAMA</label>
                  <input
                    value={proposalForm.timeline ?? ""}
                    onChange={(e) => { setProposalForm((f) => ({ ...f, timeline: e.target.value })); setProposalDirty(true); }}
                    placeholder="ex.: entrega do projeto até 01/08/2026"
                    className="w-full h-9 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.04em] mb-1.5">INVESTIMENTO</label>
                  <input
                    value={proposalForm.pricing ?? ""}
                    onChange={(e) => { setProposalForm((f) => ({ ...f, pricing: e.target.value })); setProposalDirty(true); }}
                    placeholder="ex.: R$ 4.500 / mês"
                    className="w-full h-9 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleSaveProposal}
                  disabled={!proposalDirty && !!project.proposal}
                  className="h-8 px-4 rounded-[7px] border border-[#E5E5E2] text-[#1A1A1A] text-[12px] font-medium hover:border-[#5B5BD6] hover:text-[#5B5BD6] transition-colors disabled:opacity-40"
                >
                  Salvar Rascunho
                </button>
                {(!project.proposal || project.proposal.status === "draft" || project.proposal.status === "changes_requested" || project.proposal.status === "rejected") && (
                  <button
                    onClick={handleSendProposal}
                    className="h-8 px-4 rounded-[7px] bg-[#1A1A1A] hover:bg-[#111111] text-white text-[12px] font-medium transition-colors"
                  >
                    Enviar ao Cliente
                  </button>
                )}
                {project.proposal?.status === "sent" && (
                  <span className="text-[12px] text-[#5B5BD6] font-medium">Proposta aguardando aprovação — edições não atualizam a versão enviada até reenvio.</span>
                )}
                {project.proposal?.status === "approved" && (
                  <span className="text-[12px] text-[#16A34A] font-medium">Proposta aprovada. Edição bloqueada.</span>
                )}
              </div>
            </div>
          </div>

          {/* Client material requests */}
          {projectMaterialRequests.length > 0 && (
            <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#F0F0ED]">
                <span className="text-[13px] font-semibold text-[#1A1A1A]">Solicitado ao Cliente</span>
              </div>
              <div className="divide-y divide-[#F0F0ED]">
                {projectMaterialRequests.map((req) => (
                  <div key={req.id} className="flex items-start justify-between px-5 py-3.5 gap-4">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-[#1A1A1A]">{req.title}</div>
                      {req.description && <p className="text-[12px] text-[#6B6B65] mt-0.5 leading-relaxed">{req.description}</p>}
                    </div>
                    <span className={`h-5 px-2 rounded-full text-[10px] font-semibold shrink-0 whitespace-nowrap ${
                      req.status === "received" ? "bg-[#DCFCE7] text-[#16A34A]" : req.status === "cancelled" ? "bg-[#F0F0ED] text-[#9B9B95]" : "bg-[#FEF3C7] text-[#D97706]"
                    }`}>
                      {req.status === "received" ? "Recebido" : req.status === "cancelled" ? "Cancelado" : "Pendente"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Assets */}
      {tab === "assets" && (
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-6 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <p className="text-[13px] text-[#6B6B65]">
            Os ativos de marca de <strong>{client?.name}</strong> são gerenciados na seção{" "}
            <Link href="/agency/brand-assets" className="text-[#5B5BD6] hover:underline">Brand Assets</Link>.
          </p>
          {client && (
            <Link href={`/agency/clients/${client.id}`} className="inline-flex items-center gap-1.5 mt-4 text-[13px] font-medium text-[#5B5BD6] hover:underline">
              Ver ativos de {client.name} →
            </Link>
          )}
        </div>
      )}

      {/* Tab: History */}
      {tab === "history" && (
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-6 py-4 text-center text-[13px] text-[#9B9B95]">
            O histórico de atividades está disponível no Painel de Controle.
          </div>
        </div>
      )}

      {/* Edit Modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Editar Projeto">
        <div className="space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Nome do Projeto</label>
            <input
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Objetivo</label>
            <textarea
              value={editForm.goal}
              onChange={(e) => setEditForm({ ...editForm, goal: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Tipo</label>
              <input
                value={editForm.type}
                onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Prazo</label>
              <input
                type="date"
                value={editForm.deadline}
                onChange={(e) => setEditForm({ ...editForm, deadline: e.target.value })}
                className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Prioridade</label>
              <select
                value={editForm.priority}
                onChange={(e) => setEditForm({ ...editForm, priority: e.target.value as Priority })}
                className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white"
              >
                <option value="high">Alta</option>
                <option value="medium">Média</option>
                <option value="low">Baixa</option>
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Etapa</label>
              <select
                value={editForm.stage}
                onChange={(e) => setEditForm({ ...editForm, stage: e.target.value as ProjectStage })}
                className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white"
              >
                {STAGES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2.5 pt-1">
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleSaveEdit}>Salvar Alterações</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
