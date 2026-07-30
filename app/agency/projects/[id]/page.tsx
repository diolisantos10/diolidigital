"use client";

import { use, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAgencyStore } from "@/store/agency-store";
import { useDbStrategyRooms } from "@/lib/hooks/useDbStrategyRooms";
import { notFound } from "next/navigation";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import Badge from "@/components/agency/ui/Badge";
import Button from "@/components/agency/ui/Button";
import Modal from "@/components/agency/ui/Modal";
import DeliverableDetailModal from "@/components/agency/deliverables/DeliverableDetailModal";
import { SecurePortalLinkButton } from "@/components/agency/portal/SecurePortalLinkButton";
import MarketingIntelligence from "@/components/agency/MarketingIntelligence";
import Link from "next/link";
import { TaskStatus, DeliverableStatus, Priority, ProjectStage, MOCK_AGENTS, ProjectProposal, StrategyRoomSpecialist, DebateTurn } from "@/lib/agency/mock-data";
import { getOwner, getVersion, needsRevision, getFeedbackExcerpt } from "@/lib/agency/deliverables";
import { getProjectProgress, getProjectReportText, getProjectHealth, getPilotChecklist, getPilotAudit, getPilotTimeline, getOperatorPlaybook, isValidProposalPricing, INVALID_PRICING_MESSAGE, getPilotOperationsReport, getPilotFindings, getPilotFinalReport } from "@/lib/agency/reporting";
import { getClientAgentContext } from "@/lib/agency/workspace";
import PilotChecklist from "@/components/agency/PilotChecklist";
import PilotPlaybook from "@/components/agency/PilotPlaybook";
import PilotTimeline from "@/components/agency/PilotTimeline";
import { buildProjectTimeline, TIMELINE_DEPT_STYLE } from "@/lib/agency/orchestration/timeline";
import { computeRecommendedStage } from "@/lib/agency/orchestration/pipeline-advance";
import { generateAutoTasksForProject, AUTO_TASK_PRIORITY_STYLE, AUTO_TASK_OWNER_STYLE } from "@/lib/agency/orchestration/auto-tasks";
import EsteiraDoProjeto from "@/components/agency/EsteiraDoProjeto";

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
  const { projects, clients, tasks, deliverables, briefings, materialRequests, updateTaskStatus, updateDeliverableStatus, updateProject, updateProposal, sendProposal, markPartnerProject, moveProjectStage, setPendingAgentInput } = useAgencyStore();
  const { strategyRooms, generate: generateStrategyRoom, clear: clearStrategyRoom } = useDbStrategyRooms();

  type TabId = "overview" | "proposal" | "execution" | "pipeline" | "tasks" | "deliverables" | "briefing" | "strategy" | "intelligence" | "report" | "timeline";
  // Every tab remains reachable (deep-links + in-page buttons), but the tab BAR
  // shows only the five that matter day-to-day. Dead stubs (assets, history)
  // were removed entirely.
  const VALID_TABS: TabId[] = ["overview", "proposal", "execution", "pipeline", "tasks", "deliverables", "briefing", "strategy", "intelligence", "report", "timeline"];
  const BAR_TABS: TabId[] = ["overview", "proposal", "tasks", "deliverables", "strategy", "intelligence"];
  const [tab, setTab] = useState<TabId>(() => {
    const t = searchParams.get("tab") as TabId | null;
    return t && VALID_TABS.includes(t) ? t : "overview";
  });
  const [editOpen, setEditOpen] = useState(false);
  const [proposalDirty, setProposalDirty] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [reportCopied, setReportCopied] = useState(false);
  const [stratViewTab, setStratViewTab] = useState<"specialists" | "debate" | "consensus">("specialists");
  const [stratApplied, setStratApplied] = useState(false);

  const project = projects.find((p) => p.id === id);
  if (!project) return notFound();

  const portalClientId = project.clientId;

  const client = clients.find((c) => c.id === project.clientId);
  const projectTasks = tasks.filter((t) => t.projectId === id);
  const projectDeliverables = deliverables.filter((d) => d.projectId === id);
  const briefing = briefings.find((b) => b.projectId === id);
  const projectMaterialRequests = materialRequests.filter((r) => r.projectId === id);
  const doneTasks = projectTasks.filter((t) => t.status === "done").length;
  const progress = projectTasks.length > 0 ? Math.round((doneTasks / projectTasks.length) * 100) : 0;
  const strategyRoom = strategyRooms.find((r) => r.projectId === id) ?? null;

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

  // Live pricing validity, tracked against the editable form so the warning
  // and the disabled send button update as the operator types.
  const pricingValid = isValidProposalPricing(proposalForm.pricing);

  const handleSendProposal = () => {
    if (!pricingValid) return;
    const parsed = deliverablesText.split("\n").map((s) => s.trim()).filter(Boolean);
    updateProposal(id, { ...proposalForm, deliverables: parsed });
    sendProposal(id);
    setProposalDirty(false);
  };

  const getAgent = (agentId: string) => MOCK_AGENTS.find((a) => a.id === agentId);

  const TABS = BAR_TABS;
  const TAB_LABELS: Record<TabId, string> = {
    overview: "Visão Geral",
    proposal: "Proposta",
    execution: "Execução",
    pipeline: "Pipeline",
    tasks: "Tarefas",
    deliverables: "Entregas",
    briefing: "Briefing",
    strategy: "Estratégia",
    intelligence: "Inteligência",
    report: "Relatório",
    timeline: "Linha do Tempo",
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
    not_started: "bg-[var(--accent)] text-[var(--text-muted)]",
    in_progress: "bg-[#E6FBFA] text-[#0E7C75]",
    done: "bg-[var(--success-bg)] text-[var(--success)]",
  };

  return (
    <>
      <div className="mb-2">
        <Link href="/agency/projects" className="text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
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
            <span className="text-[12px] text-[var(--text-muted)]">Due {project.deadline.slice(5)}</span>
          </div>
        }
        actions={<Button variant="secondary" onClick={() => setEditOpen(true)}>Editar Projeto</Button>}
      />

      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[12px] text-[var(--text-muted)]">Progresso das tarefas</span>
          <span className="text-[12px] text-[var(--text-secondary)] font-medium mono-num">{doneTasks}/{projectTasks.length} tarefas concluídas</span>
        </div>
        <div className="h-1.5 bg-[var(--accent)] rounded-full overflow-hidden">
          <div className="h-full bg-[var(--navy)] rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-[var(--border)] mb-6 -mt-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`h-9 px-4 text-[13px] font-medium border-b-2 transition-colors ${
              tab === t
                ? "border-[var(--navy)] text-[var(--navy)]"
                : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Tab: Inteligência de Marketing */}
      {tab === "intelligence" && <MarketingIntelligence projectId={id} projectName={project.name} />}

      {/* Tab: Overview */}
      {tab === "overview" && (() => {
        const ovProgress = getProjectProgress(project, projectDeliverables, projectTasks, projectMaterialRequests, strategyRooms);
        const ovHealth = getProjectHealth(project, ovProgress);
        const ovAudit = getPilotAudit({ project, client, briefing, strategyRoom: strategyRoom ?? undefined, materialRequests: projectMaterialRequests });
        const pendingCount = ovProgress.draft + ovProgress.inReview;
        const PROPOSAL_TEXT: Record<string, string> = {
          draft: "Rascunho", sent: "Enviada", approved: "Aprovada", rejected: "Reprovada", changes_requested: "Alterações solicitadas",
        };
        const goToReport = () => setTab("report");
        return (
        <div className="space-y-6">
          {/* ── COMMAND CENTER — unified operational summary ── */}
          <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)]">
              <div className="flex items-center gap-2.5">
                <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">Centro de Comando</h2>
                <span className={`flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11px] font-semibold ${ovHealth.color}`}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ovHealth.dotColor }} />
                  {ovHealth.label}
                </span>
              </div>
              <span className="text-[11px] text-[var(--text-muted)]">Prontidão {ovProgress.readinessScore}%</span>
            </div>
            {/* Stat row */}
            <div className="grid grid-cols-5 divide-x divide-[var(--border)] border-b border-[var(--border)]">
              {[
                { label: "Proposta", value: PROPOSAL_TEXT[ovProgress.proposalStatus ?? "draft"] ?? "—", onClick: () => setTab("proposal"), warn: !ovProgress.proposalApproved },
                { label: "Aprovações pend.", value: String(ovProgress.inReview), onClick: () => setTab("deliverables"), warn: ovProgress.inReview > 0 },
                { label: "Revisões pend.", value: String(ovProgress.revisionNeeded), onClick: () => setTab("deliverables"), warn: ovProgress.revisionNeeded > 0 },
                { label: "Entregas pend.", value: String(pendingCount), onClick: () => setTab("deliverables"), warn: pendingCount > 0 },
                { label: "Materiais pend.", value: String(ovProgress.pendingMaterialRequests), onClick: () => setTab("briefing"), warn: ovProgress.pendingMaterialRequests > 0 },
              ].map((s) => (
                <button key={s.label} onClick={s.onClick} className="px-4 py-3 text-left hover:bg-[var(--bg-elevated)] transition-colors">
                  <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.04em] mb-1">{s.label}</div>
                  <div className={`text-[16px] font-bold mono-num leading-none ${s.warn ? "text-[var(--warning)]" : "text-[var(--text-primary)]"}`}>{s.value}</div>
                </button>
              ))}
            </div>
            {/* Next action + quick actions */}
            <div className="px-5 py-3.5 flex items-center justify-between gap-4 flex-wrap">
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)]">Próxima ação</span>
                <p className="text-[13px] font-medium text-[var(--text-primary)] leading-snug">{ovProgress.nextAction}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!strategyRoom && (
                  <button onClick={() => setTab("strategy")} className="h-7 px-3 rounded-[6px] text-[12px] font-medium border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--navy)] hover:text-[var(--navy)] transition-colors">Gerar Estratégia</button>
                )}
                <SecurePortalLinkButton
                  clientId={portalClientId}
                  label="Portal do cliente ↗"
                  className="h-7 px-3 rounded-[6px] text-[12px] font-medium border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--navy)] hover:text-[var(--navy)] transition-colors flex items-center disabled:opacity-60"
                />
                <button onClick={() => setTab("intelligence")} className="h-7 px-3 rounded-[6px] text-[12px] font-medium border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--navy)] hover:text-[var(--navy)] transition-colors">Inteligência de Marketing</button>
                <button onClick={goToReport} className="h-7 px-3 rounded-[6px] text-[12px] font-medium bg-[var(--navy)] text-white hover:opacity-90 transition-opacity">Ver Relatório</button>
              </div>
            </div>
            {/* Audit warnings */}
            {ovAudit.warnings.length > 0 && (
              <div className="border-t border-[var(--border)] px-5 py-3 bg-[#F0FBFE]">
                <div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)] mb-2">
                  Avisos de prontidão ({ovAudit.warnings.length})
                </div>
                <div className="space-y-1.5">
                  {ovAudit.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className={`mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-[3px] shrink-0 ${
                        w.severity === "high" ? "bg-[#FEE2E2] text-[var(--danger)]" : w.severity === "medium" ? "bg-[var(--warning-bg)] text-[var(--warning)]" : "bg-[var(--accent)] text-[var(--text-secondary)]"
                      }`}>{w.area}</span>
                      <span className="text-[12px] text-[var(--text-secondary)] leading-snug">{w.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        {/* A ESTEIRA — a primeira coisa que se lê ao abrir o projeto. Em que
            etapa está, quem tem a bola, o que trava e o que fazer agora. Antes
            desta faixa era preciso caçar a resposta em cinco painéis. */}
        <div className="mb-6">
          <EsteiraDoProjeto projectId={id} />
        </div>

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
                <div className="bg-white rounded-[12px] border border-[var(--border)] px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-3">Aprovação do Cliente</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {awaitingReview > 0 && (
                      <button
                        onClick={() => setTab("deliverables")}
                        className="flex items-center gap-1.5 h-7 px-3 rounded-full bg-[var(--warning-bg)] text-[var(--warning)] text-[12px] font-medium hover:opacity-80 transition-opacity"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning)]" />
                        {awaitingReview} aguardando revisão
                      </button>
                    )}
                    {revisionNeeded > 0 && (
                      <button
                        onClick={() => setTab("deliverables")}
                        className="flex items-center gap-1.5 h-7 px-3 rounded-full bg-[#FEE2E2] text-[var(--danger)] text-[12px] font-medium hover:opacity-80 transition-opacity"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--danger)]" />
                        {revisionNeeded} revisão necessária
                      </button>
                    )}
                    {approvedCount > 0 && (
                      <button
                        onClick={() => setTab("deliverables")}
                        className="flex items-center gap-1.5 h-7 px-3 rounded-full bg-[var(--success-bg)] text-[var(--success)] text-[12px] font-medium hover:opacity-80 transition-opacity"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
                        {approvedCount} aprovado(s)
                      </button>
                    )}
                  </div>
                  {revisionNeeded > 0 && reworkAgent && (
                    <p className="text-[12px] text-[var(--text-muted)] mt-2.5">
                      Próxima ação: <span className="text-[var(--text-primary)] font-medium">{reworkAgent.name}</span> deve revisar a entrega sinalizada.
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

              // ── Deliverable review visibility ──────────────────────────────
              const awaitingApproval = projectDeliverables.filter((d) => d.status === "in_review").length;
              const revisionDeliverables = projectDeliverables.filter((d) => needsRevision(d));
              const revisionNeeded = revisionDeliverables.length;
              const revisionAgents = [...new Set(revisionDeliverables.map((d) => getOwner(d).name))];

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
                  : revisionNeeded > 0
                  ? `${revisionNeeded} entrega(s) em revisão — ${revisionAgents.join(", ")} precisa(m) refazer.`
                  : awaitingApproval > 0
                  ? `${awaitingApproval} entrega(s) aguardando aprovação do cliente.`
                  : "Execução liberada. Agentes prontos para rodar."
                : "";

              return (
                <div className={`bg-white rounded-[10px] border shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4 ${
                  isApproved ? "border-[#BBF7D0]" : executionBlocked ? "border-[#FDE68A]" : "border-[var(--border)]"
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Gerente de Projeto</div>
                    <button
                      onClick={() => setTab("proposal")}
                      className="text-[12px] text-[var(--navy)] hover:underline"
                    >
                      {prop ? "Ver Proposta" : "Criar Proposta"} →
                    </button>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2.5">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${isApproved ? "bg-[var(--success)]" : "bg-[var(--warning)]"}`} />
                      <span className="text-[13px] font-medium text-[var(--text-primary)]">
                        {isApproved ? "Proposta aprovada — execução liberada" : executionBlocked ? "Execução bloqueada — proposta não aprovada" : ""}
                      </span>
                    </div>
                    {executionBlocked && (
                      <div className="pl-4 pt-1">
                        <button
                          onClick={() => { if (confirm("Liberar este projeto como MARCA PARCEIRA (sem cobrança)? A execução é liberada sem passar pela proposta paga.")) markPartnerProject(id); }}
                          className="h-8 px-3.5 rounded-[7px] bg-[#0E7C75] hover:bg-[#0B655F] text-white text-[12px] font-semibold transition-colors"
                        >
                          Marca parceira — liberar sem custo
                        </button>
                        <p className="text-[11px] text-[var(--text-muted)] mt-1 leading-snug">
                          Cliente que não paga (parceria): libera a execução direto, sem proposta.
                        </p>
                      </div>
                    )}
                    {prop && (
                      <div className="flex items-center gap-2 flex-wrap pl-4">
                        {[
                          { label: "Proposta", value: prop.status === "draft" ? "Rascunho" : prop.status === "sent" ? "Enviada ao cliente" : prop.status === "approved" ? "Aprovada" : prop.status === "rejected" ? "Reprovada" : "Alterações solicitadas", color: isApproved ? "bg-[var(--success-bg)] text-[var(--success)]" : isSent ? "bg-[var(--accent-light)] text-[var(--navy)]" : isRejected ? "bg-[#FEE2E2] text-[var(--danger)]" : "bg-[var(--warning-bg)] text-[var(--warning)]" },
                          ...(pendingRequests > 0 ? [{ label: "Materiais do cliente", value: `${pendingRequests} pendente(s)`, color: "bg-[var(--warning-bg)] text-[var(--warning)]" }] : []),
                          ...(blockedTasks > 0 ? [{ label: "Tarefas bloqueadas", value: `${blockedTasks}`, color: "bg-[#FEE2E2] text-[var(--danger)]" }] : []),
                        ].map((item) => (
                          <span key={item.label} className={`h-5 px-2 rounded-full text-[10px] font-semibold ${item.color}`}>
                            {item.label}: {item.value}
                          </span>
                        ))}
                        {strategyRoom && (
                          <button
                            onClick={() => setTab("strategy")}
                            className="h-5 px-2 rounded-full text-[10px] font-semibold bg-[var(--accent-light)] text-[var(--navy)] hover:opacity-80 transition-opacity"
                          >
                            Strategy Room completo
                          </button>
                        )}
                      </div>
                    )}
                    {nextAction && (
                      <p className="text-[12px] text-[var(--text-secondary)] pl-4 leading-relaxed">
                        <span className="font-medium text-[var(--text-primary)]">Próximo: </span>{nextAction}
                      </p>
                    )}
                    {/* Deliverable review summary */}
                    {(awaitingApproval > 0 || revisionNeeded > 0) && (
                      <div className="flex items-center gap-2 flex-wrap pl-4 pt-1">
                        {awaitingApproval > 0 && (
                          <button
                            onClick={() => setTab("deliverables")}
                            className="h-5 px-2 rounded-full text-[10px] font-semibold bg-[var(--warning-bg)] text-[var(--warning)] hover:opacity-80 transition-opacity"
                          >
                            {awaitingApproval} aguardando aprovação
                          </button>
                        )}
                        {revisionNeeded > 0 && (
                          <button
                            onClick={() => setTab("deliverables")}
                            className="h-5 px-2 rounded-full text-[10px] font-semibold bg-[#FEE2E2] text-[var(--danger)] hover:opacity-80 transition-opacity"
                          >
                            {revisionNeeded} em revisão{revisionAgents.length > 0 ? ` · ${revisionAgents.join(", ")}` : ""}
                          </button>
                        )}
                      </div>
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
                <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Departamento de Redes Sociais</div>
                    <button onClick={() => setTab("deliverables")} className="text-[12px] text-[var(--navy)] hover:underline">
                      Ver entregas →
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {deptItems.map(({ label, done }) => (
                      <div key={label} className="flex items-center gap-2">
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${done ? "bg-[var(--success-bg)]" : "bg-[var(--accent)]"}`}>
                          {done ? (
                            <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                              <path d="M1 3L3 5L7 1" stroke="#16A34A" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          ) : (
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-subtle)]" />
                          )}
                        </span>
                        <span className={`text-[13px] ${done ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>{label}</span>
                      </div>
                    ))}
                  </div>
                  {(pendingApproval > 0 || approvedCount > 0) && (
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--border)] flex-wrap">
                      {pendingApproval > 0 && (
                        <span className="flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-[var(--warning-bg)] text-[var(--warning)] text-[11px] font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning)]" />
                          {pendingApproval} aguardando aprovação
                        </span>
                      )}
                      {approvedCount > 0 && (
                        <span className="flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-[var(--success-bg)] text-[var(--success)] text-[11px] font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
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
                <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Departamento de Design</div>
                    <button onClick={() => setTab("deliverables")} className="text-[12px] text-[var(--navy)] hover:underline">
                      Ver entregas →
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {deptItems.map(({ label, done }) => (
                      <div key={label} className="flex items-center gap-2">
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${done ? "bg-[#E6FBFA]" : "bg-[var(--accent)]"}`}>
                          {done ? (
                            <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                              <path d="M1 3L3 5L7 1" stroke="#0E7C75" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          ) : (
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-subtle)]" />
                          )}
                        </span>
                        <span className={`text-[13px] ${done ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>{label}</span>
                        {label === "Briefs Gerados" && totalDesigns > 0 && (
                          <span className="text-[11px] text-[var(--text-muted)]">({totalDesigns})</span>
                        )}
                      </div>
                    ))}
                  </div>
                  {(pendingApproval > 0 || approvedCount > 0) && (
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--border)] flex-wrap">
                      {pendingApproval > 0 && (
                        <span className="flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-[var(--warning-bg)] text-[var(--warning)] text-[11px] font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning)]" />
                          {pendingApproval} aguardando aprovação
                        </span>
                      )}
                      {approvedCount > 0 && (
                        <span className="flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-[var(--success-bg)] text-[var(--success)] text-[11px] font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
                          {approvedCount} aprovado(s)
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Ads Department status */}
            {(() => {
              const ADS_TYPES = ["Ads Strategy", "Campaign Structure", "Audience Plan", "Ad Copy", "Creative Requirements", "Optimization Notes"];
              const adsDeliverables = projectDeliverables.filter((d) => ADS_TYPES.includes(d.type));
              if (adsDeliverables.length === 0) return null;

              const hasStrategy  = adsDeliverables.some((d) => d.type === "Ads Strategy");
              const hasStructure = adsDeliverables.some((d) => d.type === "Campaign Structure");
              const hasCreative  = adsDeliverables.some((d) => d.type === "Creative Requirements");
              const pendingApproval = adsDeliverables.filter((d) => d.status === "in_review").length;
              const approvedCount   = adsDeliverables.filter((d) => d.status === "approved").length;

              const deptItems = [
                { label: "Estratégia de Ads",      done: hasStrategy },
                { label: "Estrutura de Campanha",  done: hasStructure },
                { label: "Requisitos de Criativo", done: hasCreative },
              ];

              return (
                <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Departamento de Tráfego Pago</div>
                    <button onClick={() => setTab("deliverables")} className="text-[12px] text-[var(--navy)] hover:underline">
                      Ver entregas →
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {deptItems.map(({ label, done }) => (
                      <div key={label} className="flex items-center gap-2">
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${done ? "bg-[#E6FBFA]" : "bg-[var(--accent)]"}`}>
                          {done ? (
                            <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                              <path d="M1 3L3 5L7 1" stroke="#0E7490" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          ) : (
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-subtle)]" />
                          )}
                        </span>
                        <span className={`text-[13px] ${done ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>{label}</span>
                      </div>
                    ))}
                  </div>
                  {(pendingApproval > 0 || approvedCount > 0) && (
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--border)] flex-wrap">
                      {pendingApproval > 0 && (
                        <span className="flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-[var(--warning-bg)] text-[var(--warning)] text-[11px] font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning)]" />
                          {pendingApproval} aguardando aprovação do cliente
                        </span>
                      )}
                      {approvedCount > 0 && (
                        <span className="flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-[var(--success-bg)] text-[var(--success)] text-[11px] font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
                          {approvedCount} aprovado(s)
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Goal */}
            <div className="bg-white rounded-[12px] border border-[var(--border)] px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-2">Objetivo</div>
              <p className="text-[14px] text-[var(--text-primary)] leading-relaxed">{project.goal}</p>
            </div>

            {/* Tasks snapshot */}
            <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)]">
                <div className="text-[13px] font-semibold text-[var(--text-primary)]">Tarefas</div>
                <button onClick={() => setTab("tasks")} className="text-[12px] text-[var(--navy)] hover:underline">Ver todas</button>
              </div>
              {projectTasks.slice(0, 4).map((task, i) => (
                <div key={task.id} className={`flex items-center gap-3 px-5 py-3 ${i > 0 ? "border-t border-[var(--border)]" : ""}`}>
                  <button
                    onClick={() => updateTaskStatus(task.id, TASK_CYCLE[task.status])}
                    className={`w-4 h-4 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors ${
                      task.status === "done"
                        ? "bg-[var(--navy)] border-[var(--navy)]"
                        : task.status === "blocked"
                        ? "bg-[#FEE2E2] border-[var(--danger)]"
                        : "border-[var(--border-strong)] hover:border-[var(--navy)]"
                    }`}
                  >
                    {task.status === "done" && (
                      <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    )}
                  </button>
                  <span className={`text-[13px] flex-1 ${task.status === "done" ? "line-through text-[var(--text-muted)]" : "text-[var(--text-primary)]"}`}>
                    {task.title}
                  </span>
                  <Badge variant={task.status} />
                </div>
              ))}
            </div>

            {/* Deliverables snapshot */}
            {projectDeliverables.length > 0 && (
              <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)]">
                  <div className="text-[13px] font-semibold text-[var(--text-primary)]">Entregas</div>
                  <button onClick={() => setTab("deliverables")} className="text-[12px] text-[var(--navy)] hover:underline">Ver todas</button>
                </div>
                {projectDeliverables.map((d, i) => (
                  <div
                    key={d.id}
                    onClick={() => setDetailId(d.id)}
                    className={`group flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-[var(--bg-elevated)] transition-colors ${i > 0 ? "border-t border-[var(--border)]" : ""}`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-[var(--text-primary)] group-hover:text-[var(--navy)] transition-colors">{d.name}</span>
                        {needsRevision(d) && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--warning-bg)] text-[var(--warning)]">Revisão</span>
                        )}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">{d.type} · v{getVersion(d)} · {getOwner(d).name}</div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); updateDeliverableStatus(d.id, DELIVERABLE_CYCLE[d.status]); }}
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
            <div className="bg-white rounded-[12px] border border-[var(--border)] px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-3">Detalhes</div>
              <div className="space-y-2.5">
                {[
                  { label: "Cliente", value: client?.name ?? "—" },
                  { label: "Tipo", value: project.type },
                  { label: "Prazo", value: project.deadline },
                  { label: "Criado em", value: project.createdAt },
                  { label: "Tarefas", value: `${doneTasks} / ${projectTasks.length} concluídas` },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-[12px] text-[var(--text-muted)]">{label}</span>
                    <span className="text-[12px] font-medium text-[var(--text-primary)]">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Agents */}
            <div className="bg-white rounded-[12px] border border-[var(--border)] px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-3">Agentes Atribuídos</div>
              <div className="space-y-2">
                {project.agents.map((agentId) => {
                  const agent = getAgent(agentId);
                  if (!agent) return null;
                  return (
                    <div key={agentId} className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-[var(--accent-light)] flex items-center justify-center text-[10px] font-bold text-[var(--navy)]">
                        {agent.name.slice(0, 1)}
                      </div>
                      <span className="text-[12px] text-[var(--text-primary)]">{agent.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        </div>
        );
      })()}

      {/* Tab: Execution */}
      {tab === "execution" && (
        <div className="space-y-6">

          {/* Stage Control */}
          <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4">
            <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-3">Controle de Etapa</div>
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
                          ? "bg-[var(--navy)] text-white"
                          : isDone
                          ? "bg-[var(--accent)] text-[var(--text-secondary)] hover:bg-[var(--border)]"
                          : "bg-[var(--bg)] text-[var(--text-muted)] border border-[var(--border)] hover:border-[var(--navy)] hover:text-[var(--navy)]"
                      }`}
                    >
                      {isDone && <span className="mr-1 text-[var(--success)]">✓</span>}
                      {stage.charAt(0).toUpperCase() + stage.slice(1)}
                    </button>
                    {i < STAGES.length - 1 && <span className="text-[var(--border-strong)] text-[11px]">›</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Agent Pipeline */}
          <div>
            <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-3">Pipeline de Agentes</div>
            {project.agents.length === 0 ? (
              <div className="bg-white rounded-[10px] border border-dashed border-[var(--border)] px-5 py-8 text-center">
                <p className="text-[13px] text-[var(--text-muted)]">Nenhum agente atribuído. Edite o projeto para atribuir agentes.</p>
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
                    <div key={agentId} className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4 flex items-center gap-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0 ${
                        status === "done" ? "bg-[var(--success-bg)] text-[var(--success)]" : status === "in_progress" ? "bg-[#E6FBFA] text-[#0E7C75]" : "bg-[var(--accent-light)] text-[var(--navy)]"
                      }`}>
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-[13px] font-semibold text-[var(--text-primary)]">{agent.name}</p>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLOR[status]}`}>
                            {STATUS_LABEL[status]}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--text-muted)] truncate">{agent.role}</p>
                        {agentTasks.length > 0 && (
                          <p className="text-[11px] text-[var(--text-secondary)] mt-1">
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
                          className="shrink-0 h-7 px-3 rounded-[6px] text-[12px] font-medium border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--bg)] hover:border-[var(--navy)] hover:text-[var(--navy)] transition-colors flex items-center gap-1.5"
                        >
                          Executar
                          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                            <path d="M2 5.5h7M5.5 2l3.5 3.5L5.5 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      ) : (
                        <span className="shrink-0 h-7 px-3 rounded-[6px] text-[12px] font-medium border border-[var(--border)] text-[var(--text-subtle)] cursor-not-allowed flex items-center">
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
            <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-3">Entregas</div>
            <div className="grid grid-cols-3 gap-4">
              {(["posts", "design", "campaigns"] as const).map((cat) => {
                const catLabels = { posts: "Posts & Copy", design: "Ativos de Design", campaigns: "Campanhas & Anúncios" };
                const catDeliverables = projectDeliverables.filter((d) => getDeliverableCategory(d.type) === cat);
                return (
                  <div key={cat} className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                    <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
                      <p className="text-[12px] font-semibold text-[var(--text-primary)]">{catLabels[cat]}</p>
                      <span className="text-[11px] text-[var(--text-muted)]">{catDeliverables.length}</span>
                    </div>
                    {catDeliverables.length === 0 ? (
                      <div className="px-4 py-6 text-center">
                        <p className="text-[11px] text-[var(--text-subtle)]">Nenhuma entrega ainda</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-[var(--border)]">
                        {catDeliverables.map((d) => (
                          <div key={d.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-[12px] font-medium text-[var(--text-primary)] truncate">{d.name}</p>
                              <p className="text-[10px] text-[var(--text-muted)]">v{d.version}</p>
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
        <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="divide-y divide-[var(--border)]">
            {STAGES.map((stage, i) => {
              const isActive = project.stage === stage;
              const isDone = STAGES.indexOf(stage) < STAGES.indexOf(project.stage);
              return (
                <div key={stage} className={`flex items-center gap-4 px-6 py-4 ${isActive ? "bg-[#F5F8FF]" : ""}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                    isActive ? "bg-[var(--navy)] text-white" : isDone ? "bg-[var(--success-bg)] text-[var(--success)]" : "bg-[var(--accent)] text-[var(--text-muted)]"
                  }`}>
                    {isDone ? "✓" : i + 1}
                  </div>
                  <div className="flex-1">
                    <div className={`text-[13px] font-medium ${isActive ? "text-[var(--navy)]" : isDone ? "text-[var(--text-secondary)]" : "text-[var(--text-muted)]"}`}>
                      {stage.charAt(0).toUpperCase() + stage.slice(1)}
                    </div>
                    {isActive && (
                      <div className="text-[12px] text-[var(--text-muted)] mt-0.5">Etapa atual</div>
                    )}
                  </div>
                  {isActive && <Badge variant="in_progress" size="md">Atual</Badge>}
                  {isDone && <Badge variant="done" size="md">Concluído</Badge>}
                  {!isActive && (
                    <button
                      onClick={() => moveProjectStage(id, stage)}
                      className="h-6 px-2.5 rounded-[5px] text-[11px] font-medium border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--navy)] hover:text-[var(--navy)] transition-colors"
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
        <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          {projectTasks.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <p className="text-[14px] font-medium text-[var(--text-primary)]">Nenhuma tarefa encontrada.</p>
              <p className="text-[13px] text-[var(--text-muted)] mt-1.5">Execute o Orchestrator para gerar um plano de tarefas para este projeto.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="w-8 px-5 py-3"></th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Tarefa</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Agente</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Status</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Prazo</th>
                </tr>
              </thead>
              <tbody>
                {projectTasks.map((task, i) => {
                  const agent = getAgent(task.agentId);
                  return (
                    <tr key={task.id} className={`hover:bg-[var(--bg-elevated)] transition-colors ${i > 0 ? "border-t border-[var(--border)]" : ""}`}>
                      <td className="px-5 py-3.5">
                        <button
                          onClick={() => updateTaskStatus(task.id, TASK_CYCLE[task.status])}
                          className={`w-4 h-4 rounded-[4px] border flex items-center justify-center transition-colors ${
                            task.status === "done"
                              ? "bg-[var(--navy)] border-[var(--navy)]"
                              : task.status === "blocked"
                              ? "bg-[#FEE2E2] border-[var(--danger)]"
                              : "border-[var(--border-strong)] hover:border-[var(--navy)]"
                          }`}
                        >
                          {task.status === "done" && (
                            <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          )}
                        </button>
                      </td>
                      <td className="px-3 py-3.5">
                        <div className={`text-[13px] font-medium ${task.status === "done" ? "line-through text-[var(--text-muted)]" : "text-[var(--text-primary)]"}`}>
                          {task.title}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)] mt-0.5 line-clamp-1">{task.description}</div>
                      </td>
                      <td className="px-5 py-3.5 text-[12px] text-[var(--text-secondary)]">{agent?.name ?? "—"}</td>
                      <td className="px-5 py-3.5"><Badge variant={task.status} /></td>
                      <td className="px-5 py-3.5 text-[12px] text-[var(--text-muted)]">{task.dueDate.slice(5)}</td>
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
        <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          {projectDeliverables.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <p className="text-[14px] font-medium text-[var(--text-primary)]">Nenhuma entrega salva ainda.</p>
              <p className="text-[13px] text-[var(--text-muted)] mt-1.5">As entregas são criadas conforme os agentes concluem suas tarefas.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Nome</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Responsável</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Versão</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Status</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Data</th>
                </tr>
              </thead>
              <tbody>
                {projectDeliverables.map((d, i) => {
                  const owner = getOwner(d);
                  const revision = needsRevision(d);
                  const excerpt = getFeedbackExcerpt(d);
                  return (
                    <tr
                      key={d.id}
                      onClick={() => setDetailId(d.id)}
                      className={`group hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer ${i > 0 ? "border-t border-[var(--border)]" : ""}`}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-[var(--text-primary)] group-hover:text-[var(--navy)] transition-colors">{d.name}</span>
                          <span className="text-[11px] text-[var(--text-muted)] bg-[var(--accent)] px-1.5 py-0.5 rounded-[4px]">{d.type}</span>
                          {revision && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--warning-bg)] text-[var(--warning)]">Revisão necessária</span>
                          )}
                        </div>
                        {excerpt && (
                          <div className="text-[11px] text-[var(--text-muted)] mt-0.5 italic truncate max-w-[360px]">“{excerpt}”</div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-[13px] text-[var(--text-secondary)]">{owner.name}</td>
                      <td className="px-5 py-3.5 text-[13px] text-[var(--text-muted)] mono-num">v{getVersion(d)}</td>
                      <td className="px-5 py-3.5">
                        <button onClick={(e) => { e.stopPropagation(); updateDeliverableStatus(d.id, DELIVERABLE_CYCLE[d.status]); }}>
                          <Badge variant={d.status} />
                        </button>
                      </td>
                      <td className="px-5 py-3.5 text-[12px] text-[var(--text-muted)]">{d.createdAt.slice(5)}</td>
                    </tr>
                  );
                })}
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
          <div className="flex items-start gap-4 py-4 border-b border-[var(--border)] last:border-0">
            <div className="w-[160px] shrink-0 pt-0.5">
              <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">{label}</span>
            </div>
            <p className={`flex-1 text-[13px] leading-relaxed ${value ? "text-[var(--text-primary)]" : "text-[var(--text-subtle)] italic"}`}>
              {value || "Não especificado"}
            </p>
          </div>
        );

        if (!ob) {
          return (
            <div className="bg-white rounded-[12px] border border-[var(--border)] px-8 py-12 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="w-10 h-10 rounded-full bg-[var(--accent)] flex items-center justify-center mx-auto mb-4">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M3 5h12M3 9h8M3 13h5" stroke="#9B9B95" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
              </div>
              <p className="text-[14px] font-medium text-[var(--text-primary)]">Sem dados de briefing</p>
              <p className="text-[13px] text-[var(--text-muted)] mt-1.5 max-w-xs mx-auto">
                Este projeto não foi criado via Orchestrator. Dados de briefing estão disponíveis para projetos gerados a partir de um brief analisado.
              </p>
            </div>
          );
        }

        return (
          <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-3.5 border-b border-[var(--border)] bg-[var(--bg-elevated)]">
              <span className="text-[12px] font-semibold text-[var(--text-primary)] uppercase tracking-[0.05em]">Briefing Original</span>
              <span className="text-[11px] text-[var(--text-muted)]">Capturado na criação do projeto · somente leitura</span>
            </div>
            <div className="px-6">
              {/* Services */}
              <div className="flex items-start gap-4 py-4 border-b border-[var(--border)]">
                <div className="w-[160px] shrink-0 pt-1">
                  <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Serviços</span>
                </div>
                <div className="flex flex-wrap gap-1.5 flex-1">
                  {ob.services.length > 0
                    ? ob.services.map((s) => (
                        <span key={s} className="h-6 px-2.5 rounded-full text-[11px] font-medium bg-[var(--accent-light)] text-[var(--navy)]">
                          {SERVICE_LABELS[s] ?? s}
                        </span>
                      ))
                    : <span className="text-[13px] text-[var(--text-subtle)] italic">Não especificado</span>
                  }
                </div>
              </div>
              <Row label="Objetivo"            value={ob.objective} />
              <Row label="Descrição do Negócio" value={ob.businessDescription} />
              <Row label="Público-alvo"      value={ob.targetAudience} />
              {/* Channels */}
              <div className="flex items-start gap-4 py-4 border-b border-[var(--border)]">
                <div className="w-[160px] shrink-0 pt-0.5">
                  <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Canais</span>
                </div>
                <p className={`flex-1 text-[13px] leading-relaxed ${ob.channels.length > 0 ? "text-[var(--text-primary)]" : "text-[var(--text-subtle)] italic"}`}>
                  {ob.channels.length > 0 ? ob.channels.join(" · ") : "Não especificado"}
                </p>
              </div>
              <Row label="Prazo" value={ob.deadline} />
              <Row label="Observações"    value={ob.notes} />
            </div>
          </div>
        );
      })()}

      {/* Tab: Strategy Room V2 */}
      {tab === "strategy" && (() => {
        const PRIORITY_COLOR: Record<string, string> = {
          high: "bg-[#FEE2E2] text-[var(--danger)]",
          medium: "bg-[var(--warning-bg)] text-[var(--warning)]",
          low: "bg-[var(--success-bg)] text-[var(--success)]",
        };
        const PRIORITY_LABEL: Record<string, string> = {
          high: "Alta", medium: "Média", low: "Baixa",
        };
        const DEBATE_TYPE_LABEL: Record<string, string> = {
          opening: "Abertura", critique: "Crítica", addition: "Adição", risk: "Risco", consensus: "Consenso",
        };
        const DEBATE_TYPE_COLOR: Record<string, string> = {
          opening: "bg-[var(--accent-light)] text-[var(--navy)]",
          critique: "bg-[#FEE2E2] text-[var(--danger)]",
          addition: "bg-[var(--success-bg)] text-[var(--success)]",
          risk: "bg-[var(--warning-bg)] text-[var(--warning)]",
          consensus: "bg-[var(--navy)] text-white",
        };
        const SPECIALIST_AVATAR: Record<string, string> = {
          strat: "BS", social: "SM", creative: "CD", paid: "PM", growth: "GS", ceo: "CE",
        };
        const SPECIALIST_COLOR: Record<string, string> = {
          strat: "bg-[var(--navy)]", social: "bg-[#0E7490]", creative: "bg-[#0E7C75]",
          paid: "bg-[var(--success)]", growth: "bg-[var(--navy)]", ceo: "bg-[var(--text-primary)]",
        };

        const applyEntireStrategy = () => {
          if (!strategyRoom) return;
          const c = strategyRoom.consensus;
          const s = strategyRoom.finalSynthesis;
          updateProposal(id, {
            objective: c ? c.positioning.slice(0, 300) : s.recommendedStrategy.slice(0, 300),
            scope: c ? c.strategy : s.proposalImplications,
            deliverables: c ? c.recommendedDeliverables.slice(0, 8) : s.recommendedServices,
            timeline: "3 meses (faseado: fundação → ritmo → escala)",
            pricing: c ? `Pacote: ${c.recommendedPackage}` : "A definir conforme escopo aprovado",
          });
          setStratApplied(true);
          setTimeout(() => setStratApplied(false), 4000);
        };

        if (!strategyRoom) {
          return (
            <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-6 py-10 text-center">
              <div className="w-12 h-12 rounded-full bg-[var(--accent-light)] flex items-center justify-center mx-auto mb-4">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#070A1F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                </svg>
              </div>
              <p className="text-[15px] font-semibold text-[var(--text-primary)] mb-1">Strategy Room V2</p>
              <p className="text-[13px] text-[var(--text-muted)] max-w-sm mx-auto mb-5">
                Seis especialistas analisam o cliente e debatem entre si — Brand Strategist, Social Media Director, Creative Director, Paid Media Director, Growth Strategist e Agency CEO — para produzir uma estratégia consolidada com consenso e resumo executivo.
              </p>
              <button
                onClick={() => { generateStrategyRoom(id); setStratViewTab("specialists"); }}
                className="inline-flex items-center gap-2 h-9 px-5 rounded-[8px] bg-[var(--navy)] text-white text-[13px] font-medium hover:bg-[#1E40AF] transition-colors"
              >
                Gerar Strategy Room
              </button>
            </div>
          );
        }

        const exec = strategyRoom.executiveSummary;
        const consensus = strategyRoom.consensus;
        const debate = strategyRoom.debateTurns ?? [];

        return (
          <div className="space-y-4">
            {/* Header bar */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <span className="text-[13px] font-semibold text-[var(--text-primary)]">Strategy Room</span>
                <span className="h-5 px-2 rounded-full bg-[var(--success-bg)] text-[var(--success)] text-[10px] font-semibold">V2 · Pronto</span>
                <span className="text-[11px] text-[var(--text-muted)]">
                  {new Date(strategyRoom.generatedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {stratApplied ? (
                  <span className="h-8 px-4 rounded-[7px] bg-[var(--success-bg)] text-[var(--success)] text-[12px] font-semibold flex items-center">
                    ✓ Aplicado! Abra Proposta ou Agentes
                  </span>
                ) : (
                  <button
                    onClick={applyEntireStrategy}
                    className="h-8 px-4 rounded-[7px] bg-[var(--navy)] text-white text-[12px] font-medium hover:bg-[#1E40AF] transition-colors"
                  >
                    Aplicar Estratégia Completa
                  </button>
                )}
                <button
                  onClick={() => clearStrategyRoom(id)}
                  className="h-8 px-3 rounded-[7px] border border-[var(--border)] text-[var(--text-muted)] text-[12px] hover:text-[var(--danger)] transition-colors"
                >
                  Limpar
                </button>
              </div>
            </div>

            {/* Executive Summary (always visible) */}
            {exec && (
              <div className="bg-[var(--text-primary)] rounded-[10px] px-5 py-4 text-white">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-muted)]">Resumo Executivo · 30 segundos</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-[var(--text-muted)]">Confiança</span>
                    <span className={`h-6 w-6 rounded-full text-[11px] font-bold flex items-center justify-center ${exec.confidenceScore >= 8 ? "bg-[var(--success)]" : exec.confidenceScore >= 6 ? "bg-[var(--warning)]" : "bg-[var(--danger)]"}`}>
                      {exec.confidenceScore}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="bg-white/5 rounded-[8px] px-3 py-2.5">
                    <div className="text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--success)] mb-1">Maior Oportunidade</div>
                    <p className="text-[12px] text-[var(--border)] leading-snug">{exec.biggestOpportunity}</p>
                  </div>
                  <div className="bg-white/5 rounded-[8px] px-3 py-2.5">
                    <div className="text-[9px] font-semibold uppercase tracking-[0.06em] text-[#EF4444] mb-1">Maior Risco</div>
                    <p className="text-[12px] text-[var(--border)] leading-snug">{exec.biggestRisk}</p>
                  </div>
                  <div className="bg-[var(--navy)]/20 rounded-[8px] px-3 py-2.5 border border-[var(--navy)]/30">
                    <div className="text-[9px] font-semibold uppercase tracking-[0.06em] text-[#6D8BFF] mb-1">Ação Recomendada</div>
                    <p className="text-[12px] text-[var(--border)] leading-snug">{exec.recommendedAction}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Sub-navigation */}
            <div className="flex items-center gap-1 bg-[var(--bg)] rounded-[8px] p-1">
              {(["specialists", "debate", "consensus"] as const).map((v) => {
                const LABELS = { specialists: "Especialistas", debate: "Debate", consensus: "Consenso" };
                return (
                  <button
                    key={v}
                    onClick={() => setStratViewTab(v)}
                    className={`flex-1 h-7 rounded-[6px] text-[12px] font-medium transition-colors ${stratViewTab === v ? "bg-white text-[var(--text-primary)] shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
                  >
                    {LABELS[v]}
                  </button>
                );
              })}
            </div>

            {/* ── Specialists view ─── */}
            {stratViewTab === "specialists" && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {strategyRoom.specialists.map((sp: StrategyRoomSpecialist) => (
                  <div key={sp.specialistId} className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4">
                    {/* Specialist header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-full ${SPECIALIST_COLOR[sp.specialistId] ?? "bg-[var(--navy)]"} text-white text-[11px] font-bold flex items-center justify-center shrink-0`}>
                          {SPECIALIST_AVATAR[sp.specialistId] ?? sp.specialistName.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-[13px] font-semibold text-[var(--text-primary)] leading-tight">{sp.specialistName}</div>
                          <div className="text-[11px] text-[var(--text-muted)]">{sp.role}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`h-5 px-2 rounded-full text-[10px] font-semibold ${PRIORITY_COLOR[sp.priority]}`}>
                          {PRIORITY_LABEL[sp.priority]}
                        </span>
                        <span className="h-5 px-2 rounded-full bg-[var(--accent-light)] text-[var(--navy)] text-[10px] font-semibold">
                          {sp.confidence}/10
                        </span>
                      </div>
                    </div>
                    {/* Mission & perspective */}
                    {sp.mission && (
                      <div className="mb-2 bg-[var(--bg-elevated)] rounded-[7px] px-3 py-2 border border-[var(--border)]">
                        <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-0.5">Missão</div>
                        <p className="text-[11px] text-[var(--text-secondary)] leading-snug">{sp.mission}</p>
                      </div>
                    )}
                    {/* Priorities */}
                    {sp.priorities && sp.priorities.length > 0 && (
                      <div className="mb-2">
                        <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1">Prioridades</div>
                        <ol className="space-y-0.5">
                          {sp.priorities.map((p, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-[11px] text-[var(--text-secondary)]">
                              <span className="mt-[1px] w-4 h-4 rounded-full bg-[var(--accent-light)] text-[var(--navy)] text-[9px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                              {p}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                    {/* Main insight */}
                    <div className="mb-2">
                      <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-0.5">Insight principal</div>
                      <p className="text-[12px] text-[var(--text-primary)] leading-relaxed">{sp.mainInsight}</p>
                    </div>
                    {/* Recommended direction */}
                    <div className="mb-2">
                      <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-0.5">Direção recomendada</div>
                      <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">{sp.recommendedDirection}</p>
                    </div>
                    {/* Concerns */}
                    {sp.concerns && sp.concerns.length > 0 && (
                      <div className="mb-2">
                        <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1">Preocupações</div>
                        <ul className="space-y-0.5">
                          {sp.concerns.map((c, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-[11px] text-[var(--text-muted)]">
                              <span className="mt-[3px] w-1 h-1 rounded-full bg-[var(--danger)] shrink-0" />
                              {c}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {/* Suggested deliverables */}
                    {sp.suggestedDeliverables.length > 0 && (
                      <div>
                        <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1">Entregas sugeridas</div>
                        <div className="flex flex-wrap gap-1">
                          {sp.suggestedDeliverables.map((d: string) => (
                            <span key={d} className="h-5 px-2 rounded-full bg-[var(--accent)] text-[var(--text-secondary)] text-[10px] font-medium">{d}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── Debate view ─── */}
            {stratViewTab === "debate" && (
              <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                <div className="px-5 py-3.5 border-b border-[var(--border)]">
                  <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">Debate entre Especialistas</h3>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Discussão sequencial — cada especialista responde, critica e adiciona perspectiva</p>
                </div>
                <div className="divide-y divide-[var(--border)]">
                  {debate.length === 0 ? (
                    <p className="px-5 py-4 text-[12px] text-[var(--text-muted)] italic">Nenhum debate gerado. Regere o Strategy Room para ativar o modo debate.</p>
                  ) : (
                    debate.map((turn: DebateTurn, idx: number) => (
                      <div key={idx} className={`px-5 py-4 ${turn.type === "consensus" ? "bg-[#F5F8FF]" : ""}`}>
                        <div className="flex items-start gap-3">
                          <div className={`w-8 h-8 rounded-full ${SPECIALIST_COLOR[turn.specialistId] ?? "bg-[var(--navy)]"} text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5`}>
                            {SPECIALIST_AVATAR[turn.specialistId] ?? turn.specialistName.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1.5">
                              <span className="text-[12px] font-semibold text-[var(--text-primary)]">{turn.specialistName}</span>
                              <span className={`h-4 px-1.5 rounded-full text-[9px] font-semibold ${DEBATE_TYPE_COLOR[turn.type]}`}>
                                {DEBATE_TYPE_LABEL[turn.type]}
                              </span>
                              {turn.replyTo && (
                                <span className="text-[10px] text-[var(--text-muted)]">↳ respondendo {turn.replyTo}</span>
                              )}
                            </div>
                            <p className={`text-[12px] leading-relaxed ${turn.type === "consensus" ? "text-[var(--text-primary)] font-medium" : "text-[var(--text-secondary)]"}`}>
                              {turn.content}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* ── Consensus view ─── */}
            {stratViewTab === "consensus" && consensus && (
              <div className="space-y-4">
                {/* Consensus layer */}
                <div className="bg-white rounded-[10px] border border-[var(--navy)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-[13px] font-semibold text-[var(--text-primary)]">Consenso Estratégico</div>
                    <span className="h-5 px-2 rounded-full bg-[var(--accent-light)] text-[var(--navy)] text-[10px] font-semibold">
                      Score {strategyRoom.finalSynthesis.strategicScore}/10
                    </span>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1">Posicionamento consolidado</div>
                      <p className="text-[13px] text-[var(--text-primary)] leading-relaxed">{consensus.positioning}</p>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1">Estratégia de execução</div>
                      <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">{consensus.strategy}</p>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <div className="text-[10px] font-semibold text-[var(--success)] uppercase tracking-[0.05em] mb-1.5">Oportunidades</div>
                        <ul className="space-y-1">
                          {consensus.opportunities.map((o, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-[12px] text-[var(--text-secondary)]">
                              <span className="mt-[4px] w-1.5 h-1.5 rounded-full bg-[var(--success)] shrink-0" />
                              {o}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold text-[var(--warning)] uppercase tracking-[0.05em] mb-1.5">Riscos</div>
                        <ul className="space-y-1">
                          {consensus.risks.map((r, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-[12px] text-[var(--text-secondary)]">
                              <span className="mt-[4px] w-1.5 h-1.5 rounded-full bg-[var(--warning)] shrink-0" />
                              {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1">Pacote recomendado</div>
                      <span className="inline-flex h-6 px-3 rounded-full bg-[var(--navy)] text-white text-[11px] font-semibold items-center">
                        {consensus.recommendedPackage}
                      </span>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1.5">Canais recomendados</div>
                      <div className="flex flex-wrap gap-1.5">
                        {consensus.recommendedChannels.map((ch) => (
                          <span key={ch} className="h-5 px-2 rounded-full bg-[var(--accent-light)] text-[var(--navy)] text-[10px] font-semibold">{ch}</span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1.5">Entregas recomendadas</div>
                      <div className="flex flex-wrap gap-1">
                        {consensus.recommendedDeliverables.map((d) => (
                          <span key={d} className="h-5 px-2 rounded-full bg-[var(--accent)] text-[var(--text-secondary)] text-[10px] font-medium">{d}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Apply CTA */}
                {stratApplied ? (
                  <div className="rounded-[10px] border border-[var(--success-bg)] bg-[#F0FDF4] px-5 py-4">
                    <p className="text-[13px] font-semibold text-[var(--success)] mb-1">✓ Estratégia aplicada com sucesso!</p>
                    <p className="text-[12px] text-[var(--text-secondary)] mb-3">Proposta atualizada. Abra os agentes abaixo para continuar com a execução.</p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: "Abrir Proposta", action: () => setTab("proposal") },
                        { label: "Agente Social Media →", action: () => { setPendingAgentInput({ projectId: id, projectName: project.name, clientName: client?.name ?? "", goal: project.goal, projectType: project.type }); router.push("/agency/social-media-agent"); } },
                        { label: "Agente Design →", action: () => { setPendingAgentInput({ projectId: id, projectName: project.name, clientName: client?.name ?? "", goal: project.goal, projectType: project.type }); router.push("/agency/design-agent"); } },
                        { label: "Agente Tráfego Pago →", action: () => { setPendingAgentInput({ projectId: id, projectName: project.name, clientName: client?.name ?? "", goal: project.goal, projectType: project.type }); router.push("/agency/ads-agent"); } },
                      ].map(({ label, action }) => (
                        <button key={label} onClick={action} className="h-8 px-4 rounded-[7px] bg-white border border-[var(--border)] text-[var(--text-primary)] text-[12px] font-medium hover:border-[var(--navy)] hover:text-[var(--navy)] transition-colors">
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between bg-[var(--bg)] rounded-[12px] border border-[var(--border)] px-5 py-3.5">
                    <div>
                      <p className="text-[13px] font-medium text-[var(--text-primary)]">Pronto para executar a estratégia?</p>
                      <p className="text-[12px] text-[var(--text-muted)]">Popula a Proposta + prepara links para os 3 agentes em um clique.</p>
                    </div>
                    <button
                      onClick={applyEntireStrategy}
                      className="h-9 px-5 rounded-[8px] bg-[var(--navy)] text-white text-[13px] font-medium hover:bg-[#1E40AF] transition-colors shrink-0"
                    >
                      Aplicar Estratégia Completa →
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Consensus placeholder when not generated */}
            {stratViewTab === "consensus" && !consensus && (
              <div className="bg-white rounded-[12px] border border-[var(--border)] px-6 py-8 text-center">
                <p className="text-[13px] text-[var(--text-muted)]">Consenso não disponível. Regere o Strategy Room para ativar o V2.</p>
                <button onClick={() => { clearStrategyRoom(id); generateStrategyRoom(id); }} className="mt-3 h-8 px-4 rounded-[7px] bg-[var(--navy)] text-white text-[12px] font-medium hover:bg-[#1E40AF] transition-colors">
                  Regerar Strategy Room V2
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* Tab: Proposal */}
      {tab === "proposal" && (
        <div className="space-y-5">
          {/* Status banner */}
          {project.proposal && (() => {
            const p = project.proposal!;
            const banners: Record<string, { bg: string; border: string; text: string; label: string }> = {
              draft:             { bg: "bg-[var(--bg)]",  border: "border-[var(--border)]",  text: "text-[var(--text-secondary)]",  label: "Rascunho — ainda não enviado ao cliente" },
              sent:              { bg: "bg-[var(--accent-light)]",  border: "border-[#D6DEFF]",  text: "text-[var(--navy)]",  label: "Enviado — aguardando aprovação do cliente" },
              approved:          { bg: "bg-[var(--success-bg)]",  border: "border-[#BBF7D0]",  text: "text-[var(--success)]",  label: "Aprovado — execução liberada" },
              rejected:          { bg: "bg-[var(--danger-bg)]",  border: "border-[#FECACA]",  text: "text-[var(--danger)]",  label: "Reprovado — revise e reenvie" },
              changes_requested: { bg: "bg-[#FFFBEB]",  border: "border-[#FDE68A]",  text: "text-[var(--warning)]",  label: "Alterações solicitadas pelo cliente" },
            };
            const b = banners[p.status];
            return (
              <div className={`flex items-center justify-between px-4 py-2.5 rounded-[8px] border ${b.bg} ${b.border}`}>
                <span className={`text-[13px] font-medium ${b.text}`}>{b.label}</span>
                {p.status === "changes_requested" && p.requestedChanges && (
                  <span className="text-[12px] text-[var(--text-secondary)] max-w-xs truncate">{p.requestedChanges}</span>
                )}
                {p.status === "rejected" && p.rejectionReason && (
                  <span className="text-[12px] text-[var(--text-secondary)] max-w-xs truncate">{p.rejectionReason}</span>
                )}
              </div>
            );
          })()}

          {!project.proposal && (
            <div className="px-4 py-3 rounded-[8px] border border-[#FDE68A] bg-[#FFFBEB]">
              <p className="text-[13px] text-[var(--warning)]">Nenhuma proposta criada ainda. Use o formulário abaixo — ela não será visível para o cliente até você enviá-la.</p>
            </div>
          )}

          {/* Strategy Room summary banner */}
          {strategyRoom && (
            <div className="flex items-center justify-between px-4 py-3 rounded-[8px] border border-[#D6DEFF] bg-[var(--accent-light)]">
              <div>
                <p className="text-[13px] font-medium text-[var(--navy)]">Strategy Room completo · Score {strategyRoom.finalSynthesis.strategicScore}/10</p>
                <p className="text-[12px] text-[var(--text-secondary)] mt-0.5 truncate max-w-lg">{strategyRoom.finalSynthesis.recommendedStrategy.slice(0, 120)}…</p>
              </div>
              <button
                onClick={() => setTab("strategy")}
                className="text-[12px] text-[var(--navy)] hover:underline shrink-0 ml-4"
              >
                Ver estratégia →
              </button>
            </div>
          )}

          {/* Proposal editor */}
          <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[var(--border)] flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[var(--text-primary)]">Editor de Proposta</span>
              {proposalDirty && (
                <span className="text-[11px] text-[var(--warning)]">Alterações não salvas</span>
              )}
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.04em] mb-1.5">OBJETIVO</label>
                <input
                  value={proposalForm.objective ?? ""}
                  onChange={(e) => { setProposalForm((f) => ({ ...f, objective: e.target.value })); setProposalDirty(true); }}
                  placeholder="O que este projeto pretende alcançar?"
                  className="w-full h-9 px-3 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.04em] mb-1.5">ESCOPO</label>
                <textarea
                  value={proposalForm.scope ?? ""}
                  onChange={(e) => { setProposalForm((f) => ({ ...f, scope: e.target.value })); setProposalDirty(true); }}
                  placeholder="Descreva o escopo completo do trabalho…"
                  rows={4}
                  className="w-full px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white resize-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.04em] mb-1.5">ENTREGAS <span className="font-normal text-[var(--text-muted)] normal-case">(uma por linha)</span></label>
                <textarea
                  value={deliverablesText}
                  onChange={(e) => { setDeliverablesText(e.target.value); setProposalDirty(true); }}
                  placeholder={"Gestão de Redes Sociais\nCalendário de Conteúdo\nRelatório Mensal"}
                  rows={4}
                  className="w-full px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white resize-none font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.04em] mb-1.5">CRONOGRAMA</label>
                  <input
                    value={proposalForm.timeline ?? ""}
                    onChange={(e) => { setProposalForm((f) => ({ ...f, timeline: e.target.value })); setProposalDirty(true); }}
                    placeholder="ex.: entrega do projeto até 01/08/2026"
                    className="w-full h-9 px-3 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.04em] mb-1.5">INVESTIMENTO</label>
                  <input
                    value={proposalForm.pricing ?? ""}
                    onChange={(e) => { setProposalForm((f) => ({ ...f, pricing: e.target.value })); setProposalDirty(true); }}
                    placeholder="ex.: R$ 4.500 / mês"
                    className="w-full h-9 px-3 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
                  />
                </div>
              </div>
              {/* Pricing validation — block sending without a real price */}
              {!pricingValid && (
                <div className="flex items-start gap-2 rounded-[8px] border border-[#FECACA] bg-[var(--danger-bg)] px-4 py-3">
                  <span className="mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-[3px] bg-[#FEE2E2] text-[var(--danger)] shrink-0">INVESTIMENTO</span>
                  <span className="text-[12px] text-[var(--danger)] font-medium leading-snug">{INVALID_PRICING_MESSAGE}</span>
                </div>
              )}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleSaveProposal}
                  disabled={!proposalDirty && !!project.proposal}
                  className="h-8 px-4 rounded-[7px] border border-[var(--border)] text-[var(--text-primary)] text-[12px] font-medium hover:border-[var(--navy)] hover:text-[var(--navy)] transition-colors disabled:opacity-40"
                >
                  Salvar Rascunho
                </button>
                {(!project.proposal || project.proposal.status === "draft" || project.proposal.status === "changes_requested" || project.proposal.status === "rejected") && (
                  <button
                    onClick={handleSendProposal}
                    disabled={!pricingValid}
                    title={!pricingValid ? INVALID_PRICING_MESSAGE : undefined}
                    className="h-8 px-4 rounded-[7px] bg-[var(--text-primary)] hover:bg-[var(--text-primary)] text-white text-[12px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[var(--text-primary)]"
                  >
                    Enviar ao Cliente
                  </button>
                )}
                {project.proposal?.status === "sent" && (
                  <span className="text-[12px] text-[var(--navy)] font-medium">Proposta aguardando aprovação — edições não atualizam a versão enviada até reenvio.</span>
                )}
                {project.proposal?.status === "approved" && (
                  <span className="text-[12px] text-[var(--success)] font-medium">Proposta aprovada. Edição bloqueada.</span>
                )}
              </div>
            </div>
          </div>

          {/* Client material requests */}
          {projectMaterialRequests.length > 0 && (
            <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[var(--border)]">
                <span className="text-[13px] font-semibold text-[var(--text-primary)]">Solicitado ao Cliente</span>
              </div>
              <div className="divide-y divide-[var(--border)]">
                {projectMaterialRequests.map((req) => (
                  <div key={req.id} className="flex items-start justify-between px-5 py-3.5 gap-4">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-[var(--text-primary)]">{req.title}</div>
                      {req.description && <p className="text-[12px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">{req.description}</p>}
                    </div>
                    <span className={`h-5 px-2 rounded-full text-[10px] font-semibold shrink-0 whitespace-nowrap ${
                      req.status === "received" ? "bg-[var(--success-bg)] text-[var(--success)]" : req.status === "cancelled" ? "bg-[var(--accent)] text-[var(--text-muted)]" : "bg-[var(--warning-bg)] text-[var(--warning)]"
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
      {/* Tab: Report */}
      {tab === "report" && (() => {
        const progress = getProjectProgress(project, projectDeliverables, projectTasks, projectMaterialRequests, strategyRooms);
        const HEALTH_STYLE = {
          on_track:         { bg: "bg-[var(--success-bg)]", text: "text-[var(--success)]", label: "No Prazo" },
          needs_attention:  { bg: "bg-[var(--warning-bg)]", text: "text-[var(--warning)]", label: "Atenção Necessária" },
          at_risk:          { bg: "bg-[#FEE2E2]", text: "text-[var(--danger)]", label: "Em Risco" },
        };
        const PROPOSAL_LABEL: Record<string, string> = {
          draft: "Rascunho", sent: "Enviada", approved: "Aprovada",
          rejected: "Rejeitada", changes_requested: "Alterações Solicitadas",
        };
        const PROPOSAL_COLOR: Record<string, string> = {
          draft: "bg-[var(--accent)] text-[var(--text-secondary)]", sent: "bg-[var(--accent-light)] text-[var(--navy)]",
          approved: "bg-[var(--success-bg)] text-[var(--success)]", rejected: "bg-[#FEE2E2] text-[var(--danger)]",
          changes_requested: "bg-[var(--warning-bg)] text-[var(--warning)]",
        };
        const health = HEALTH_STYLE[progress.healthStatus];
        const projectHealth = getProjectHealth(project, progress);
        const brandBrainComplete = client ? getClientAgentContext(client).brandBrainReadiness >= 5 : false;
        const checklist = getPilotChecklist(progress, brandBrainComplete);
        const playbook = getOperatorPlaybook(progress, brandBrainComplete);
        const timeline = getPilotTimeline(project);
        const audit = getPilotAudit({ project, client, briefing, strategyRoom: strategyRoom ?? undefined, materialRequests: projectMaterialRequests });
        const opsReport = getPilotOperationsReport(project, client, projectDeliverables, projectMaterialRequests, strategyRoom ?? undefined);
        const findings = getPilotFindings(audit, opsReport, progress);
        const finalReport = getPilotFinalReport(audit, progress, findings, brandBrainComplete, project.agents);

        const handleCopyReport = () => {
          const text = getProjectReportText(project.name, client?.name ?? "—", progress);
          navigator.clipboard.writeText(text).then(() => {
            setReportCopied(true);
            setTimeout(() => setReportCopied(false), 2500);
          });
        };

        return (
          <div className="space-y-4">
            {/* Header row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-[var(--text-primary)]">Relatório de Progresso</span>
                <span className={`h-5 px-2 rounded-full text-[10px] font-semibold ${health.bg} ${health.text}`}>{health.label}</span>
              </div>
              <button
                onClick={handleCopyReport}
                className={`flex items-center gap-1.5 h-8 px-3 rounded-[7px] text-[12px] font-medium border transition-colors ${
                  reportCopied
                    ? "bg-[var(--success-bg)] border-[#BBF7D0] text-[var(--success)]"
                    : "bg-white border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg)]"
                }`}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <rect x="1" y="3" width="8" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M4 3V2a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                {reportCopied ? "Copiado!" : "Copiar Relatório"}
              </button>
            </div>

            {/* Score + meta */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Progresso Geral",     value: `${progress.readinessScore}%`,          sub: "Pontuação de prontidão" },
                { label: "Proposta",             value: PROPOSAL_LABEL[progress.proposalStatus ?? "draft"] ?? "—", sub: "Status da proposta", color: PROPOSAL_COLOR[progress.proposalStatus ?? "draft"] },
                { label: "Entregas Aprovadas",   value: `${progress.approved + progress.delivered}/${progress.totalDeliverables}`, sub: "Aprovadas + entregues" },
                { label: "Em Revisão do Cliente", value: String(progress.inReview),            sub: "Aguardando aprovação do cliente" },
              ].map(({ label, value, sub, color }) => (
                <div key={label} className="bg-white rounded-[12px] border border-[var(--border)] px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1">{label}</div>
                  {color ? (
                    <span className={`inline-flex h-5 px-2 rounded-full text-[10px] font-semibold items-center ${color}`}>{value}</span>
                  ) : (
                    <div className="text-[20px] font-bold text-[var(--text-primary)] mono-num leading-none">{value}</div>
                  )}
                  <div className="text-[10px] text-[var(--text-muted)] mt-1">{sub}</div>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            <div className="bg-white rounded-[12px] border border-[var(--border)] px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Prontidão do Projeto</span>
                <span className="text-[12px] font-semibold text-[var(--text-primary)]">{progress.readinessScore}%</span>
              </div>
              <div className="h-2 rounded-full bg-[var(--accent)] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${progress.readinessScore}%`, backgroundColor: progress.readinessScore >= 75 ? "#16A34A" : progress.readinessScore >= 40 ? "#D97706" : "#DC2626" }}
                />
              </div>
              <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
                {[
                  { label: "Proposta aprovada", done: progress.proposalApproved },
                  { label: "Strategy Room", done: progress.strategyRoomReady },
                  { label: "Entregas geradas", done: progress.totalDeliverables > 0 },
                  { label: "Itens aprovados", done: progress.approved + progress.delivered > 0 },
                  { label: "Materiais recebidos", done: progress.pendingMaterialRequests === 0 },
                ].map(({ label, done }) => (
                  <div key={label} className="flex items-center gap-1">
                    <span className={`w-3 h-3 rounded-full flex items-center justify-center ${done ? "bg-[var(--success-bg)]" : "bg-[var(--accent)]"}`}>
                      {done && <svg width="7" height="5" viewBox="0 0 7 5" fill="none"><path d="M1 2.5l1.5 1.5 3.5-3" stroke="#16A34A" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </span>
                    <span className={`text-[10px] ${done ? "text-[var(--success)]" : "text-[var(--text-muted)]"}`}>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Deliverable breakdown */}
            <div className="bg-white rounded-[12px] border border-[var(--border)] px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-3">Entregas por Status</div>
              <div className="grid grid-cols-5 gap-2">
                {[
                  { label: "Rascunho",        value: progress.draft,          color: "bg-[var(--accent)] text-[var(--text-secondary)]" },
                  { label: "Em Revisão",       value: progress.inReview,       color: "bg-[var(--warning-bg)] text-[var(--warning)]" },
                  { label: "Em Revisão Int.", value: progress.revisionNeeded,  color: "bg-[#FEE2E2] text-[var(--danger)]" },
                  { label: "Aprovadas",        value: progress.approved,       color: "bg-[var(--success-bg)] text-[var(--success)]" },
                  { label: "Entregues",        value: progress.delivered,      color: "bg-[var(--accent-light)] text-[var(--navy)]" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="text-center">
                    <div className={`rounded-[8px] px-2 py-2 mb-1 ${color}`}>
                      <span className="text-[18px] font-bold mono-num">{value}</span>
                    </div>
                    <span className="text-[10px] text-[var(--text-muted)]">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Department breakdown */}
            <div className="bg-white rounded-[12px] border border-[var(--border)] px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-3">Por Departamento</div>
              <div className="space-y-3">
                {progress.departments.map((dept) => (
                  <div key={dept.key} className={`rounded-[8px] border px-4 py-3 ${dept.active ? "border-[var(--border)] bg-[var(--bg-elevated)]" : "border-[var(--border)] bg-[var(--bg)] opacity-50"}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className={`h-5 px-2 rounded-full text-[10px] font-semibold ${dept.color}`}>{dept.name}</span>
                        {!dept.active && <span className="text-[10px] text-[var(--text-muted)]">sem entregas</span>}
                      </div>
                      {dept.active && <span className="text-[11px] text-[var(--text-muted)]">{dept.total} entrega(s)</span>}
                    </div>
                    {dept.active && (
                      <div className="flex items-center gap-3 flex-wrap">
                        {[
                          { label: "aprovadas", value: dept.approved, show: true, green: true },
                          { label: "entregues", value: dept.delivered, show: true, green: true },
                          { label: "em revisão cliente", value: dept.inReview, show: dept.inReview > 0, green: false },
                          { label: "revisão interna", value: dept.revisionNeeded, show: dept.revisionNeeded > 0, green: false },
                          { label: "rascunho", value: dept.draft, show: dept.draft > 0, green: false },
                        ].filter((x) => x.show).map((x) => (
                          <span key={x.label} className={`text-[11px] font-medium ${x.green ? "text-[var(--success)]" : "text-[var(--warning)]"}`}>
                            {x.value} {x.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Additional signals */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-[12px] border border-[var(--border)] px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-2">Tarefas</div>
                <div className="flex items-center gap-3">
                  <div className="text-center">
                    <div className="text-[18px] font-bold mono-num text-[var(--text-primary)]">{progress.doneTasks}</div>
                    <div className="text-[10px] text-[var(--text-muted)]">concluídas</div>
                  </div>
                  <span className="text-[var(--border)]">/</span>
                  <div className="text-center">
                    <div className="text-[18px] font-bold mono-num text-[var(--text-primary)]">{progress.totalTasks}</div>
                    <div className="text-[10px] text-[var(--text-muted)]">total</div>
                  </div>
                  {progress.blockedTasks > 0 && (
                    <span className="ml-auto h-5 px-2 rounded-full bg-[#FEE2E2] text-[var(--danger)] text-[10px] font-semibold">{progress.blockedTasks} bloqueada(s)</span>
                  )}
                </div>
              </div>
              <div className="bg-white rounded-[12px] border border-[var(--border)] px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-2">Materiais do Cliente</div>
                <div className="flex items-center gap-2">
                  <div className="text-[18px] font-bold mono-num text-[var(--text-primary)]">{progress.pendingMaterialRequests}</div>
                  <div className={`text-[11px] ${progress.pendingMaterialRequests > 0 ? "text-[var(--warning)]" : "text-[var(--text-muted)]"}`}>
                    {progress.pendingMaterialRequests > 0 ? "pendente(s) — aguardar" : "tudo recebido"}
                  </div>
                </div>
              </div>
            </div>

            {/* Next action */}
            <div className={`rounded-[10px] border px-5 py-4 ${
              progress.healthStatus === "at_risk" ? "bg-[var(--danger-bg)] border-[#FECACA]"
              : progress.healthStatus === "needs_attention" ? "bg-[#FFFBEB] border-[#FDE68A]"
              : "bg-[#F0FDF4] border-[#BBF7D0]"
            }`}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.05em] mb-0.5 text-[var(--text-muted)]">Próxima Ação Recomendada</div>
              <p className={`text-[13px] font-medium ${
                progress.healthStatus === "at_risk" ? "text-[var(--danger)]"
                : progress.healthStatus === "needs_attention" ? "text-[var(--warning)]"
                : "text-[var(--success)]"
              }`}>{progress.nextAction}</p>
            </div>

            {/* Project Health Score */}
            <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)]">
                <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">Saúde do Projeto</h3>
                <span className={`flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11px] font-semibold ${projectHealth.color}`}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: projectHealth.dotColor }} />
                  {projectHealth.label}
                </span>
              </div>
              <div className="px-5 py-3 divide-y divide-[var(--border)]">
                {projectHealth.signals.map((sig) => (
                  <div key={sig.label} className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2.5">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        sig.status === "ok" ? "bg-[var(--success)]" : sig.status === "warn" ? "bg-[var(--warning)]" : "bg-[var(--danger)]"
                      }`} />
                      <span className="text-[12px] font-medium text-[var(--text-primary)]">{sig.label}</span>
                    </div>
                    <span className={`text-[11px] ${
                      sig.status === "ok" ? "text-[var(--text-muted)]" : sig.status === "warn" ? "text-[var(--warning)]" : "text-[var(--danger)]"
                    }`}>{sig.detail}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Pilot Execution Timeline */}
            <PilotTimeline weeks={timeline} />

            {/* First Client Playbook (4-phase) */}
            <PilotPlaybook playbook={playbook} />

            {/* First Client Checklist (readiness snapshot) */}
            <PilotChecklist checklist={checklist} />

            {/* ── PART 4 — Pilot Operations Report ── */}
            <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[var(--border)]">
                <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">Relatório de Operações do Piloto</h3>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Análise de execução baseada nos dados reais do piloto</p>
              </div>
              {(
                [
                  { title: "O que funcionou", icon: "✓", items: opsReport.whatWorked, accent: "#16A34A", bg: "bg-[#F0FDF4]", border: "border-[#BBF7D0]" },
                  { title: "Fricção de UX", icon: "⚠", items: opsReport.uxFriction, accent: "#D97706", bg: "bg-[#FFFBEB]", border: "border-[#FDE68A]" },
                  { title: "Informações faltando", icon: "?", items: opsReport.missingInfo, accent: "#DC2626", bg: "bg-[var(--danger-bg)]", border: "border-[#FECACA]" },
                  { title: "Automações ausentes", icon: "⚡", items: opsReport.missingAutomation, accent: "#070A1F", bg: "bg-[var(--accent-light)]", border: "border-[#C7D8FE]" },
                  { title: "Pain points do operador", icon: "!", items: opsReport.operatorPainPoints, accent: "#0E7C75", bg: "bg-[#E6FBFA]", border: "border-[#FED7AA]" },
                ] as const
              ).map((section) => (
                <div key={section.title} className={`mx-5 my-3 rounded-[8px] border ${section.border} ${section.bg} overflow-hidden`}>
                  <div className="px-4 py-2 border-b border-current border-opacity-20">
                    <span className="text-[11px] font-bold uppercase tracking-[0.05em]" style={{ color: section.accent }}>
                      {section.icon} {section.title} ({section.items.length})
                    </span>
                  </div>
                  <div className="divide-y divide-current divide-opacity-10">
                    {section.items.map((obs, i) => (
                      <div key={i} className="px-4 py-2.5 flex items-start gap-3">
                        <span className="shrink-0 mt-0.5 h-4 px-1.5 rounded-[3px] text-[9px] font-bold" style={{ backgroundColor: `${section.accent}20`, color: section.accent }}>
                          {obs.area}
                        </span>
                        <span className="text-[12px] text-[var(--text-primary)] leading-snug">{obs.finding}</span>
                        <span className={`ml-auto shrink-0 h-4 px-1.5 rounded-full text-[9px] font-semibold ${
                          obs.impact === "high" ? "bg-[#FEE2E2] text-[var(--danger)]" : obs.impact === "medium" ? "bg-[var(--warning-bg)] text-[var(--warning)]" : "bg-[var(--accent)] text-[var(--text-muted)]"
                        }`}>{obs.impact}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div className="h-3" />
            </div>

            {/* ── PART 5 — P0/P1/P2 Findings ── */}
            <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[var(--border)] flex items-center justify-between">
                <div>
                  <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">Priorização do Piloto</h3>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Findings classificados por prioridade operacional</p>
                </div>
                <div className="flex items-center gap-2">
                  {finalReport.p0Count > 0 && <span className="h-5 px-2 rounded-full bg-[#FEE2E2] text-[var(--danger)] text-[10px] font-bold">{finalReport.p0Count} P0</span>}
                  {finalReport.p1Count > 0 && <span className="h-5 px-2 rounded-full bg-[var(--warning-bg)] text-[var(--warning)] text-[10px] font-bold">{finalReport.p1Count} P1</span>}
                  {finalReport.p2Count > 0 && <span className="h-5 px-2 rounded-full bg-[var(--accent-light)] text-[var(--navy)] text-[10px] font-bold">{finalReport.p2Count} P2</span>}
                </div>
              </div>
              {(["P0", "P1", "P2"] as const).map((priority) => {
                const pFindings = findings.filter((f) => f.priority === priority);
                if (pFindings.length === 0) return null;
                const pStyle = {
                  P0: { bg: "bg-[var(--danger-bg)]", border: "border-[#FECACA]", label: "bg-[#FEE2E2] text-[var(--danger)]", desc: "Bloqueador — corrigir antes do primeiro cliente externo" },
                  P1: { bg: "bg-[#FFFBEB]", border: "border-[#FDE68A]", label: "bg-[var(--warning-bg)] text-[var(--warning)]", desc: "Importante — pode embarcar cliente, mas corrigir em seguida" },
                  P2: { bg: "bg-[var(--accent-light)]", border: "border-[#C7D8FE]", label: "bg-[var(--accent-light)] text-[var(--navy)]", desc: "Melhoria — backlog de otimização pós-piloto" },
                }[priority];
                return (
                  <div key={priority} className={`mx-5 my-3 rounded-[8px] border ${pStyle.border} ${pStyle.bg} overflow-hidden`}>
                    <div className="px-4 py-2 flex items-center gap-2 border-b border-current border-opacity-10">
                      <span className={`h-5 px-2 rounded-full text-[10px] font-bold ${pStyle.label}`}>{priority}</span>
                      <span className="text-[11px] text-[var(--text-secondary)]">{pStyle.desc}</span>
                    </div>
                    <div className="divide-y divide-current divide-opacity-10">
                      {pFindings.map((f) => (
                        <div key={f.id} className="px-4 py-3">
                          <div className="flex items-start gap-2 mb-1">
                            <span className="shrink-0 mt-0.5 h-4 px-1.5 rounded-[3px] bg-black/5 text-[9px] font-bold text-[var(--text-secondary)]">{f.area}</span>
                            <span className="text-[12px] font-semibold text-[var(--text-primary)] leading-snug">{f.title}</span>
                          </div>
                          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed ml-0 mb-1.5">{f.description}</p>
                          <div className="flex items-start gap-1.5">
                            <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase mt-0.5 shrink-0">Ação:</span>
                            <span className="text-[11px] text-[var(--navy)] leading-snug">{f.recommendation}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              <div className="h-3" />
            </div>

            {/* ── PART 6 — Pilot Final Report ── */}
            <div className="bg-[var(--text-primary)] rounded-[10px] border border-[var(--text-primary)] shadow-[0_1px_3px_rgba(0,0,0,0.12)] overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--text-primary)] flex items-center justify-between">
                <div>
                  <h3 className="text-[13px] font-semibold text-white">Avaliação Final do Piloto</h3>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Score consolidado e recomendação de próximos passos</p>
                </div>
                <div className="text-right">
                  <div className="text-[32px] font-bold text-white mono-num leading-none">{finalReport.pilotScore}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">/100</div>
                </div>
              </div>

              {/* Score bar */}
              <div className="px-5 py-3 border-b border-[var(--text-primary)]">
                <div className="h-2 rounded-full bg-[var(--text-primary)] overflow-hidden mb-2">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${finalReport.pilotScore}%`,
                      backgroundColor: finalReport.pilotScore >= 75 ? "#16A34A" : finalReport.pilotScore >= 50 ? "#D97706" : "#DC2626",
                    }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {finalReport.scoreSignals.map((sig) => (
                    <div key={sig.label} className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${sig.met ? "bg-[var(--success)]" : "bg-[var(--text-secondary)]"}`} />
                        <span className={sig.met ? "text-[var(--text-muted)]" : "text-[var(--text-secondary)]"}>{sig.label}</span>
                      </div>
                      <span className={`font-semibold mono-num ${sig.met ? "text-white" : "text-[var(--text-secondary)]"}`}>{sig.score}/{sig.max}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recommendation */}
              <div className="px-5 py-4 border-b border-[var(--text-primary)]">
                <div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--text-secondary)] mb-1">Recomendação</div>
                <div className={`inline-flex h-6 px-3 rounded-full text-[11px] font-bold items-center mb-2 ${
                  finalReport.recommendation === "ready_for_external_client" ? "bg-[var(--success)] text-white"
                  : finalReport.recommendation === "continue" ? "bg-[var(--warning)] text-white"
                  : "bg-[var(--danger)] text-white"
                }`}>{finalReport.recommendationLabel}</div>
                <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">{finalReport.recommendationReason}</p>
              </div>

              {/* Top 10 Findings */}
              <div className="px-5 py-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--text-secondary)] mb-3">Top 10 Findings</div>
                <div className="space-y-2">
                  {finalReport.topFindings.map((finding, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <span className="w-4 h-4 rounded-full bg-[var(--text-primary)] text-[9px] font-bold text-[var(--text-secondary)] flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                      <span className="text-[12px] text-[var(--text-muted)] leading-snug">{finding}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Tab: Linha do Tempo */}
      {tab === "timeline" && (() => {
        const timelineEvents = buildProjectTimeline({
          project,
          client,
          deliverables: projectDeliverables,
          activity: [],
          materialRequests: projectMaterialRequests,
          strategyRooms,
        });
        const advice = computeRecommendedStage({
          project,
          client,
          deliverables: projectDeliverables,
          materialRequests: projectMaterialRequests,
          strategyRooms,
        });
        const projectAutoTasks = generateAutoTasksForProject({
          project,
          client,
          deliverables: projectDeliverables,
          tasks: projectTasks,
          materialRequests: projectMaterialRequests,
          strategyRooms,
        });

        return (
          <div className="space-y-4">
            {/* Pipeline recommendation banner */}
            {!advice.isAligned && advice.recommendedStage && (
              <div className={`rounded-[10px] border px-5 py-4 flex items-start gap-3 ${
                advice.confidence === "high"
                  ? "bg-[var(--accent-light)] border-[#C7D8FE]"
                  : "bg-[#FFFBEB] border-[#FDE68A]"
              }`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                  advice.confidence === "high" ? "bg-[var(--navy)]" : "bg-[var(--warning)]"
                }`}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M5 1v4M5 7.5v1" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-[12px] font-semibold mb-0.5 ${
                    advice.confidence === "high" ? "text-[var(--navy)]" : "text-[var(--warning)]"
                  }`}>
                    Estágio recomendado: <span className="uppercase">{advice.recommendedStage}</span>
                    <span className="ml-2 text-[10px] font-normal opacity-70">(atual: {advice.currentStage})</span>
                  </div>
                  <p className="text-[12px] text-[var(--text-secondary)]">{advice.reason}</p>
                </div>
                <button
                  onClick={() => moveProjectStage(id, advice.recommendedStage as Parameters<typeof moveProjectStage>[1])}
                  className={`shrink-0 h-7 px-3 rounded-[6px] text-[11px] font-medium border transition-colors ${
                    advice.confidence === "high"
                      ? "border-[var(--navy)] text-[var(--navy)] hover:bg-[var(--navy)] hover:text-white"
                      : "border-[var(--warning)] text-[var(--warning)] hover:bg-[var(--warning)] hover:text-white"
                  }`}
                >
                  Aplicar
                </button>
              </div>
            )}
            {advice.isAligned && (
              <div className="rounded-[10px] border border-[#BBF7D0] bg-[#F0FDF4] px-5 py-3 flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-[var(--success)] flex items-center justify-center shrink-0">
                  <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3l2 2 4-4" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </span>
                <span className="text-[12px] text-[var(--success)] font-medium">Pipeline alinhado — fase atual correta para o estado do projeto.</span>
              </div>
            )}

            {/* PM auto-tasks */}
            {projectAutoTasks.length > 0 && (
              <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                <div className="px-5 py-3.5 border-b border-[var(--border)] flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-[var(--text-primary)]">Ações Recomendadas pelo PM</span>
                  <span className="text-[11px] text-[var(--text-muted)]">{projectAutoTasks.length} item(ns)</span>
                </div>
                <div className="divide-y divide-[var(--border)]">
                  {projectAutoTasks.map((at) => {
                    const pStyle = AUTO_TASK_PRIORITY_STYLE[at.priority];
                    const oColor = (AUTO_TASK_OWNER_STYLE as Record<string, { color: string }>)[at.owner]?.color ?? "#6B6B65";
                    return (
                      <div key={at.id} className="flex items-start gap-3 px-5 py-3 hover:bg-[var(--bg-elevated)]">
                        <span className={`shrink-0 mt-0.5 h-5 px-2 rounded-full text-[10px] font-semibold flex items-center ${pStyle.bg} ${pStyle.text}`}>
                          {pStyle.label}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-[var(--text-primary)]">{at.title}</p>
                          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{at.description}</p>
                        </div>
                        <span className="shrink-0 text-[11px] font-medium" style={{ color: oColor }}>{at.owner}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Timeline events */}
            <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[var(--border)] flex items-center justify-between">
                <span className="text-[13px] font-semibold text-[var(--text-primary)]">Histórico do Projeto</span>
                <span className="text-[11px] text-[var(--text-muted)]">{timelineEvents.length} evento(s)</span>
              </div>
              {timelineEvents.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <p className="text-[13px] text-[var(--text-muted)]">Nenhum evento registrado ainda.</p>
                </div>
              ) : (
                <div className="px-5 py-4">
                  <div className="relative">
                    {/* Vertical line */}
                    <div className="absolute left-[7px] top-2 bottom-2 w-px bg-[var(--border)]" />
                    <div className="space-y-4">
                      {timelineEvents.map((ev) => {
                        const dStyle = TIMELINE_DEPT_STYLE[ev.dept];
                        const dateStr = new Date(ev.timestamp).toLocaleDateString("pt-BR", {
                          day: "2-digit", month: "short", year: "numeric",
                        });
                        return (
                          <div key={ev.id} className="flex items-start gap-3 pl-0">
                            {/* Dot */}
                            <div className="relative z-10 w-[15px] h-[15px] rounded-full border-2 border-white shrink-0 mt-0.5"
                              style={{ backgroundColor: dStyle.dot }} />
                            {/* Content */}
                            <div className="flex-1 min-w-0 pb-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[13px] font-medium text-[var(--text-primary)]">{ev.label}</span>
                                <span className="h-4 px-1.5 rounded-full text-[9px] font-semibold"
                                  style={{ backgroundColor: `${dStyle.dot}20`, color: dStyle.dot }}>
                                  {dStyle.label}
                                </span>
                              </div>
                              {ev.detail && (
                                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{ev.detail}</p>
                              )}
                              <p className="text-[10px] text-[var(--text-subtle)] mt-0.5">{dateStr}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Edit Modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Editar Projeto">
        <div className="space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">Nome do Projeto</label>
            <input
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              className="w-full h-8 px-3 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">Objetivo</label>
            <textarea
              value={editForm.goal}
              onChange={(e) => setEditForm({ ...editForm, goal: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">Tipo</label>
              <input
                value={editForm.type}
                onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                className="w-full h-8 px-3 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">Prazo</label>
              <input
                type="date"
                value={editForm.deadline}
                onChange={(e) => setEditForm({ ...editForm, deadline: e.target.value })}
                className="w-full h-8 px-3 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">Prioridade</label>
              <select
                value={editForm.priority}
                onChange={(e) => setEditForm({ ...editForm, priority: e.target.value as Priority })}
                className="w-full h-8 px-3 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
              >
                <option value="high">Alta</option>
                <option value="medium">Média</option>
                <option value="low">Baixa</option>
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">Etapa</label>
              <select
                value={editForm.stage}
                onChange={(e) => setEditForm({ ...editForm, stage: e.target.value as ProjectStage })}
                className="w-full h-8 px-3 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
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

      <DeliverableDetailModal deliverableId={detailId} onClose={() => setDetailId(null)} />
    </>
  );
}
