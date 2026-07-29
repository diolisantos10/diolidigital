"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAgencyStore } from "@/store/agency-store";
import { useTranslation } from "@/lib/i18n";
import Link from "next/link";
import { MOCK_AGENTS, ProjectStage } from "@/lib/agency/mock-data";
import { getProjectProgress, getProjectHealth } from "@/lib/agency/reporting";
import { runSystemDoctor } from "@/lib/agency/system-doctor";
import { computeAllDirectives, computeOrchestrationSummary, PMUrgency } from "@/lib/agency/pm-agent";
import { generateAllAutoTasks, AUTO_TASK_PRIORITY_STYLE } from "@/lib/agency/orchestration/auto-tasks";
import { computeWorkspaceHealth, DEPT_HEALTH_STYLE } from "@/lib/agency/orchestration/department-health";
import { evaluateProjectPipeline, STAGE_STATUS_STYLE } from "@/lib/agency/orchestration/pipeline";
import FilaDeAvisos from "@/components/agency/FilaDeAvisos";

// ─── Helpers ─────────────────────────────────────────────────────────────────

type OpsStrings = {
  justNow: string;
  minsAgo: (n: number) => string;
  hrsAgo: (n: number) => string;
  daysAgo: (n: number) => string;
};

function timeAgo(iso: string, ops: OpsStrings) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return ops.justNow;
  if (mins < 60) return ops.minsAgo(mins);
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return ops.hrsAgo(hrs);
  return ops.daysAgo(Math.floor(hrs / 24));
}

function daysLeft(deadline: string) {
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
}

// Deterministic, timezone-independent short date (DD/MM) parsed directly from the
// ISO string. Used as the SSR-stable fallback for relative timestamps until the
// client has mounted — server and client render identical text, so no mismatch.
function isoShortDate(iso: string) {
  const parts = iso.slice(0, 10).split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : iso;
}

const AGENT_SHORT: Record<string, string> = {
  a1: "Copy", a2: "Design", a3: "Social", a4: "Ads",
  a5: "Strategy", a6: "Research", a7: "QA", a8: "SEO", a9: "Email", a10: "PM",
};

// ─── Action scoring engine ────────────────────────────────────────────────────

type ActionType = "execution" | "review" | "unblock" | "planning";

interface ActionItem {
  id: string;
  type: ActionType;
  score: number;       // numeric priority — higher = more urgent
  label: string;
  reason: string;      // short explanation shown below the label
  projectId: string;
  projectName: string;
  clientId: string;
  agentId: string;     // empty string when not agent-specific
  agentName: string;
  cta: string;
  href: string;        // fallback href (used only for <Link> in planning type)
}

const TYPE_STYLES: Record<ActionType, { bg: string; text: string }> = {
  unblock:   { bg: "bg-[#FEE2E2]", text: "text-[#DC2626]" },
  review:    { bg: "bg-[#FEF3C7]", text: "text-[#D97706]" },
  execution: { bg: "bg-[#E6FBFA]", text: "text-[#070A1F]" },
  planning:  { bg: "bg-[#F0F0ED]", text: "text-[#6B6B65]" },
};

// Maps agent IDs to dedicated agent pages (only agents with a page get direct execution)
function getAgentRunUrl(agentId: string): string | null {
  if (agentId === "a2") return "/agency/design-agent";
  if (agentId === "a3") return "/agency/social-media-agent";
  if (agentId === "a4") return "/agency/ads-agent";
  if (agentId === "a5") return "/agency/strategy-agent";
  if (agentId === "a10") return "/agency/pm-agent";
  return null;
}

// Priority score = base + deadline proximity + stage weight + pending task load
function scoreAction(
  base: number,
  dl: number,            // days left (negative = already overdue)
  stage: ProjectStage,
  pendingCount: number,
): number {
  let s = base;
  // Deadline proximity
  if (dl < 0)        s += 40;
  else if (dl <= 3)  s += 30;
  else if (dl <= 7)  s += 15;
  else if (dl <= 14) s += 5;
  // Stage weight — active execution stages rank higher
  if      (stage === "production") s += 15;
  else if (stage === "review")     s += 12;
  else if (stage === "delivery")   s += 10;
  else if (stage === "planning")   s += 5;
  // Pending task load adds urgency
  s += Math.min(pendingCount * 2, 10);
  return s;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const DOCTOR_STATUS_COLOR = {
  healthy:  { bg: "bg-[#DCFCE7]", text: "text-[#16A34A]", dot: "bg-[#16A34A]", label: "Sistema saudável" },
  degraded: { bg: "bg-[#FEF3C7]", text: "text-[#D97706]", dot: "bg-[#D97706]", label: "Atenção necessária" },
  critical: { bg: "bg-[#FEE2E2]", text: "text-[#DC2626]", dot: "bg-[#DC2626]", label: "Falha crítica" },
};

const URGENCY_STYLE: Record<PMUrgency, { bg: string; text: string; label: string }> = {
  critical: { bg: "bg-[#FEE2E2]", text: "text-[#DC2626]", label: "Crítico" },
  high:     { bg: "bg-[#FEF3C7]", text: "text-[#D97706]", label: "Alto" },
  normal:   { bg: "bg-[#E6FBFA]", text: "text-[#070A1F]", label: "Normal" },
  low:      { bg: "bg-[#F0F0ED]", text: "text-[#9B9B95]", label: "Baixo" },
};

export default function DashboardPage() {
  const router = useRouter();
  const { projects, tasks, deliverables, activity, clients, materialRequests, strategyRooms, brandUpdates, aiRunLogs, clientRequests, setPendingAgentInput } = useAgencyStore();
  const { t } = useTranslation();
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);
  const [persisted, setPersisted] = useState(false);
  // Relative/current-time labels depend on the wall clock, which differs slightly
  // between SSR and client hydration. Gate them so the first client render matches
  // the server, then swap to live values after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    try { setPersisted(!!window.localStorage.getItem("agency-os-v1")); } catch { /* */ }
  }, []);

  const ops = t.dashboard.ops;
  const TYPE_LABELS: Record<ActionType, string> = {
    unblock: ops.badgeUnblock, review: ops.badgeReview, execution: ops.badgeExecute, planning: ops.badgePlan,
  };
  const EVENT_LABELS: Record<string, string> = {
    project_created: ops.evProjectCreated,
    project_stage_changed: ops.evStageChanged,
    task_updated: ops.evTaskUpdated,
    deliverable_updated: ops.evDeliverableSaved,
    client_created: ops.evClientCreated,
    briefing_created: ops.evBriefingCreated,
    orchestrator_approved: ops.evOrchestratorApproved,
    proposal_sent: "Proposta enviada",
    proposal_approved: "Proposta aprovada",
    proposal_rejected: "Proposta rejeitada",
    deliverable_approved: "Entrega aprovada",
    change_requested: "Alteração solicitada",
    revision_resolved: "Revisão concluída",
    brand_update_applied: "Marca atualizada",
    brand_update_submitted: "Sugestão de marca",
    material_request_created: "Material solicitado",
    strategy_room_generated: "Strategy Room gerado",
  };
  const STATUS_LABELS: Record<string, string> = {
    draft: ops.statusDraft, in_review: ops.statusInReview, approved: ops.statusApproved, delivered: ops.statusDelivered,
  };

  const activeProjects = projects.filter((p) => p.stage !== "completed");
  const getClient = (cid: string) => clients.find((c) => c.id === cid);
  const agentMap = Object.fromEntries(MOCK_AGENTS.map((a) => [a.id, a]));

  // ── PM Agent directives ──────────────────────────────────────────────────
  const pmDirectives = computeAllDirectives({ projects, deliverables, tasks, materialRequests, strategyRooms, brandUpdates });

  // ── Orchestration engine ─────────────────────────────────────────────────
  const orchSummary = computeOrchestrationSummary({ projects, clients, deliverables, tasks, materialRequests, strategyRooms });
  const autoTasks = generateAllAutoTasks({ projects, clients, deliverables, tasks, materialRequests, strategyRooms });
  const workspaceHealth = computeWorkspaceHealth({ projects, deliverables, tasks });

  // ── Attention counts (for Centro de Comando) ─────────────────────────────
  const attentionCounts = {
    sentProposals: projects.filter((p) => p.proposal?.status === "sent").length,
    inReviewDelivs: deliverables.filter((d) => d.status === "in_review").length,
    pendingBrand: brandUpdates.filter((u) => u.status === "pending").length,
    pendingMaterials: materialRequests.filter((r) => r.status === "pending").length,
    revisionNeeded: deliverables.filter((d) => d.clientFeedback && (d.status === "draft" || d.revisionStatus === "revision_requested")).length,
  };
  const totalAttention = Object.values(attentionCounts).reduce((a, b) => a + b, 0);

  // ── System Doctor (automatic diagnostics, computed from store) ────────────
  const doctorReport = runSystemDoctor({ clients, projects, deliverables, materialRequests, strategyRooms, persisted, aiRunLogs, clientRequests });
  const docMeta = DOCTOR_STATUS_COLOR[doctorReport.overallStatus];

  // ── Action execution ──────────────────────────────────────────────────────
  function handleAction(item: ActionItem) {
    // Show inline feedback
    const agent = agentMap[item.agentId];
    let msg = ops.openingProject(item.projectName);
    if (item.type === "execution" && agent) {
      const url = getAgentRunUrl(item.agentId);
      msg = url ? ops.openingAgent(agent.name, item.projectName) : ops.openingExecution(item.projectName);
    } else if (item.type === "review") {
      msg = ops.openingDeliverables(item.projectName);
    } else if (item.type === "unblock") {
      msg = ops.openingBlocked(item.projectName);
    } else if (item.type === "planning") {
      msg = ops.openingOrchestrator;
    }
    setConfirmMsg(msg);
    setTimeout(() => setConfirmMsg(null), 2500);

    // Route with context
    if (item.type === "execution" && item.agentId) {
      const agentUrl = getAgentRunUrl(item.agentId);
      if (agentUrl) {
        const project = projects.find((p) => p.id === item.projectId);
        const client  = clients.find((c) => c.id === item.clientId);
        setPendingAgentInput({
          projectId:   item.projectId,
          projectName: item.projectName,
          clientName:  client?.name ?? "",
          goal:        project?.goal ?? "",
          projectType: project?.type ?? "",
        });
        router.push(agentUrl);
        return;
      }
      // No dedicated page — open project execution tab directly
      router.push(`/agency/projects/${item.projectId}?tab=execution`);
      return;
    }
    if (item.type === "review") {
      router.push(`/agency/projects/${item.projectId}?tab=deliverables`);
      return;
    }
    if (item.type === "unblock") {
      router.push(`/agency/projects/${item.projectId}?tab=tasks`);
      return;
    }
    // planning + open project: use the pre-computed href
    router.push(item.href);
  }

  // ── Action generation ─────────────────────────────────────────────────────
  const actionItems: ActionItem[] = [];

  activeProjects.forEach((p) => {
    const pTasks     = tasks.filter((t) => t.projectId === p.id);
    const pDelivs    = deliverables.filter((d) => d.projectId === p.id);
    const dl         = daysLeft(p.deadline);
    const pendingCnt = pTasks.filter((t) => t.status === "pending").length;
    const blocked    = pTasks.filter((t) => t.status === "blocked");

    // Unblock — base 100, +2 per additional blocked task
    if (blocked.length > 0) {
      const firstAgent = agentMap[blocked[0].agentId];
      actionItems.push({
        id: `unblock-${p.id}`, type: "unblock",
        score: scoreAction(100 + blocked.length * 2, dl, p.stage, pendingCnt),
        label: ops.labelTasksBlocked(blocked.length, p.name),
        reason: ops.reasonManual,
        projectId: p.id, projectName: p.name, clientId: p.clientId,
        agentId: firstAgent?.id ?? "", agentName: firstAgent?.name ?? "",
        cta: ops.ctaResolve, href: `/agency/projects/${p.id}`,
      });
    }

    // Overdue — base 85 (deadline modifier adds another +40 on top)
    if (dl < 0) {
      actionItems.push({
        id: `overdue-${p.id}`, type: "execution",
        score: scoreAction(85, dl, p.stage, pendingCnt),
        label: ops.labelOverdue(p.name),
        reason: ops.reasonPastDeadline(Math.abs(dl)),
        projectId: p.id, projectName: p.name, clientId: p.clientId,
        agentId: "", agentName: "",
        cta: ops.ctaOpenProject, href: `/agency/projects/${p.id}`,
      });
    }

    // Production + no deliverables saved — base 60
    if (p.stage === "production" && pDelivs.length === 0) {
      const targetId    = p.agents.find((a) => ["a2", "a3", "a1"].includes(a)) ?? p.agents[0];
      const targetAgent = agentMap[targetId];
      actionItems.push({
        id: `no-output-${p.id}`, type: "execution",
        score: scoreAction(60, dl, p.stage, pendingCnt),
        label: ops.labelNoOutputs(p.name),
        reason: ops.reasonExecNotStarted(targetAgent?.name ?? "Agente"),
        projectId: p.id, projectName: p.name, clientId: p.clientId,
        agentId: targetId ?? "", agentName: targetAgent?.name ?? "",
        cta: ops.ctaRunAgent, href: `/agency/projects/${p.id}`,
      });
    }

    // Production + agent with all-pending tasks (stalled) — base 55
    if (p.stage === "production" && pDelivs.length > 0) {
      const stalled = p.agents.filter((agentId) => {
        const agentTasks = pTasks.filter((t) => t.agentId === agentId);
        return agentTasks.length > 0 && agentTasks.every((t) => t.status === "pending");
      });
      stalled.slice(0, 1).forEach((agentId) => {
        const agent = agentMap[agentId];
        actionItems.push({
          id: `stalled-${p.id}-${agentId}`, type: "execution",
          score: scoreAction(55, dl, p.stage, pendingCnt),
          label: ops.labelNotStarted(agent?.name ?? agentId, p.name),
          reason: ops.reasonAllPending,
          projectId: p.id, projectName: p.name, clientId: p.clientId,
          agentId, agentName: agent?.name ?? "",
          cta: ops.ctaRunAgent, href: `/agency/projects/${p.id}`,
        });
      });
    }

    // Briefing + no tasks — base 40
    if (p.stage === "briefing" && pTasks.length === 0) {
      actionItems.push({
        id: `plan-${p.id}`, type: "planning",
        score: scoreAction(40, dl, p.stage, 0),
        label: ops.labelNoPlan(p.name),
        reason: ops.reasonRunOrchestrator,
        projectId: p.id, projectName: p.name, clientId: p.clientId,
        agentId: "", agentName: "",
        cta: ops.ctaPlanProject, href: `/agency/orchestrator`,
      });
    }
  });

  // Deliverables in_review — base 70
  deliverables
    .filter((d) => d.status === "in_review")
    .slice(0, 4)
    .forEach((d) => {
      const p = projects.find((pr) => pr.id === d.projectId);
      if (!p) return;
      const dl         = daysLeft(p.deadline);
      const pendingCnt = tasks.filter((t) => t.projectId === p.id && t.status === "pending").length;
      actionItems.push({
        id: `review-${d.id}`, type: "review",
        score: scoreAction(70, dl, p.stage, pendingCnt),
        label: ops.labelNeedsReview(d.name),
        reason: ops.reasonAwaitingClient,
        projectId: p.id, projectName: p.name, clientId: p.clientId,
        agentId: "", agentName: "",
        cta: ops.ctaReview, href: `/agency/projects/${d.projectId}`,
      });
    });

  // Revision needed (client requested changes) — base 80
  deliverables
    .filter((d) => d.status === "draft" && d.clientFeedback)
    .slice(0, 4)
    .forEach((d) => {
      const p = projects.find((pr) => pr.id === d.projectId);
      if (!p) return;
      const dl         = daysLeft(p.deadline);
      const pendingCnt = tasks.filter((t) => t.projectId === p.id && t.status === "pending").length;
      const reworkId   = p.agents.find((a) => ["a2", "a1", "a3"].includes(a)) ?? p.agents[0];
      const reworkAgent = agentMap[reworkId ?? ""];
      actionItems.push({
        id: `revision-${d.id}`, type: "execution",
        score: scoreAction(80, dl, p.stage, pendingCnt),
        label: ops.labelRevisionNeeded(d.name, p.name),
        reason: ops.reasonClientChanges,
        projectId: p.id, projectName: p.name, clientId: p.clientId,
        agentId: reworkId ?? "", agentName: reworkAgent?.name ?? "",
        cta: ops.ctaRevise, href: `/agency/projects/${p.id}`,
      });
    });

  // Sort by score descending, cap at 7
  const sortedActions = actionItems.sort((a, b) => b.score - a.score).slice(0, 7);

  // ── Outputs ready ────────────────────────────────────────────────────────
  const readyOutputs = deliverables
    .filter((d) => d.status === "draft" || d.status === "in_review" || d.status === "approved")
    .slice(0, 6);

  // ── Blocks / alerts ───────────────────────────────────────────────────────
  type Block = { id: string; level: "high" | "medium"; message: string; href: string };
  const blocks: Block[] = [];

  activeProjects.forEach((p) => {
    const dl = daysLeft(p.deadline);
    if (dl < 0) blocks.push({ id: `od-${p.id}`, level: "high", message: `${p.name} — ${t.dashboard.overdueBy(Math.abs(dl))}`, href: `/agency/projects/${p.id}` });
    else if (dl <= 3) blocks.push({ id: `urgent-${p.id}`, level: "high", message: `${p.name} — ${t.dashboard.dUntilDeadline(dl)}`, href: `/agency/projects/${p.id}` });
  });

  activeProjects.filter((p) => p.stage === "production" && deliverables.filter((d) => d.projectId === p.id).length === 0).forEach((p) => {
    blocks.push({ id: `noout-${p.id}`, level: "medium", message: `${p.name} — ${t.dashboard.noOutputsAttached}`, href: `/agency/projects/${p.id}` });
  });

  activeProjects.filter((p) => p.agents.length === 0).forEach((p) => {
    blocks.push({ id: `noagent-${p.id}`, level: "medium", message: `${p.name} — ${t.dashboard.noAgentsAssigned}`, href: `/agency/projects/${p.id}` });
  });

  const uniqueBlockedProjectIds = [...new Set(tasks.filter((tk) => tk.status === "blocked").map((tk) => tk.projectId))];
  uniqueBlockedProjectIds.forEach((pid) => {
    const p = projects.find((pr) => pr.id === pid);
    if (p && !blocks.find((b) => b.id === `od-${pid}`)) {
      blocks.push({ id: `blk-${pid}`, level: "medium", message: `${p.name} — ${t.dashboard.hasBlockedTasks}`, href: `/agency/projects/${pid}` });
    }
  });

  // ── Project Health (operational status of each active project) ──────────────
  const HEALTH_ORDER: Record<string, number> = { blocked: 0, attention: 1, good: 2, excellent: 3 };
  const projectHealth = activeProjects
    .map((p) => {
      const prog = getProjectProgress(
        p,
        deliverables.filter((d) => d.projectId === p.id),
        tasks.filter((tk) => tk.projectId === p.id),
        materialRequests.filter((r) => r.projectId === p.id),
        strategyRooms,
      );
      return { project: p, health: getProjectHealth(p, prog), client: getClient(p.clientId) };
    })
    .sort((a, b) => HEALTH_ORDER[a.health.level] - HEALTH_ORDER[b.health.level]);

  return (
    <div>
      {/* A FILA DE AVISOS — o que o cliente ainda não sabe. Vem antes de tudo
          porque é o único item do painel que representa um projeto PARADO
          esperando alguém que nem sabe que precisa agir. Some sozinha quando
          está vazia: caixa vazia treina o time a ignorar a tela. */}
      <div className="mb-6">
        <FilaDeAvisos />
      </div>

      {/* ── Hero header ─────────────────────────────────────────────────────── */}
      <div className="mb-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#9B9B95] mb-1.5">
          {mounted ? new Date().toLocaleDateString("pt-BR", { weekday: "long", month: "long", day: "numeric" }) : "\u00a0"}
        </p>
        <div className="flex items-end justify-between gap-4 mb-5">
          <h1 className="text-[26px] font-semibold tracking-[-0.03em] text-[#1A1A1A] leading-tight">
            {t.dashboard.title}
          </h1>
          <Link
            href="/agency/projects"
            className="h-8 px-4 rounded-[8px] text-[12px] font-semibold flex items-center gap-1.5 shrink-0 transition-colors hover:opacity-90"
            style={{ background: "#070A1F", color: "#9AF5F0" }}
          >
            Ver projetos →
          </Link>
        </div>
        {/* KPI strip */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Projetos ativos",     value: activeProjects.length, sub: `${projects.filter((p) => p.stage === "completed").length} concluídos`, color: "#070A1F" },
            { label: "Tarefas abertas",     value: tasks.filter((tk) => tk.status === "pending" || tk.status === "in_progress").length, sub: `${tasks.filter((tk) => tk.status === "blocked").length} bloqueadas`, color: "#D97706" },
            { label: "Entregas pendentes",  value: deliverables.filter((d) => d.status === "draft" || d.status === "in_review").length, sub: `${deliverables.filter((d) => d.status === "approved").length} aprovadas`, color: "#16A34A" },
            { label: "Atenção necessária",  value: totalAttention, sub: totalAttention === 0 ? "tudo em dia" : "itens pendentes", color: totalAttention > 0 ? "#DC2626" : "#16A34A" },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white rounded-[12px] border border-[#E5E5E2] px-4 py-3.5" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
              <div className="text-[11px] font-medium text-[#9B9B95] mb-1 truncate">{kpi.label}</div>
              <div className="flex items-baseline gap-2">
                <span className="text-[24px] font-bold leading-none mono-num" style={{ color: kpi.color }}>{kpi.value}</span>
                <span className="text-[11px] text-[#C0C0BC] truncate">{kpi.sub}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Centro de Comando ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-[12px] border border-[#E5E5E2] overflow-hidden mb-4">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#F0F0ED]">
          <div className="flex items-center gap-2">
            <h2 className="text-[13px] font-semibold text-[#1A1A1A]">Centro de Comando</h2>
            <span className="text-[11px] text-[#9B9B95]">O que precisa da sua atenção agora?</span>
          </div>
          <Link href="/agency/approvals" className="text-[11px] text-[#070A1F] font-medium hover:underline">
            Ver aprovações {totalAttention > 0 && <span className="ml-1 bg-[#D97706] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{totalAttention}</span>}
          </Link>
        </div>

        {/* Attention chips row */}
        {totalAttention > 0 ? (
          <div className="flex items-center gap-2 px-5 py-3 flex-wrap border-b border-[#F0F0ED]">
            {attentionCounts.sentProposals > 0 && (
              <Link href="/agency/approvals" className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#E6FBFA] hover:bg-[#E5E7FF] transition-colors">
                <span className="w-1.5 h-1.5 rounded-full bg-[#070A1F]" />
                <span className="text-[11px] font-semibold text-[#070A1F]">{attentionCounts.sentProposals} proposta{attentionCounts.sentProposals !== 1 ? "s" : ""} aguardando</span>
              </Link>
            )}
            {attentionCounts.inReviewDelivs > 0 && (
              <Link href="/agency/approvals" className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FEF3C7] hover:bg-[#FDE68A] transition-colors">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D97706]" />
                <span className="text-[11px] font-semibold text-[#D97706]">{attentionCounts.inReviewDelivs} entrega{attentionCounts.inReviewDelivs !== 1 ? "s" : ""} em revisão</span>
              </Link>
            )}
            {attentionCounts.revisionNeeded > 0 && (
              <Link href="/agency/approvals" className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FEE2E2] hover:bg-[#FECACA] transition-colors">
                <span className="w-1.5 h-1.5 rounded-full bg-[#DC2626]" />
                <span className="text-[11px] font-semibold text-[#DC2626]">{attentionCounts.revisionNeeded} revis{attentionCounts.revisionNeeded !== 1 ? "ões" : "ão"} solicitada{attentionCounts.revisionNeeded !== 1 ? "s" : ""}</span>
              </Link>
            )}
            {attentionCounts.pendingBrand > 0 && (
              <Link href="/agency/approvals" className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#EDE9FE] hover:bg-[#9AF5F0] transition-colors">
                <span className="w-1.5 h-1.5 rounded-full bg-[#070A1F]" />
                <span className="text-[11px] font-semibold text-[#070A1F]">{attentionCounts.pendingBrand} sugestão{attentionCounts.pendingBrand !== 1 ? "" : ""} de marca</span>
              </Link>
            )}
            {attentionCounts.pendingMaterials > 0 && (
              <Link href="/agency/approvals" className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#E0F2FE] hover:bg-[#BAE6FD] transition-colors">
                <span className="w-1.5 h-1.5 rounded-full bg-[#0891B2]" />
                <span className="text-[11px] font-semibold text-[#0891B2]">{attentionCounts.pendingMaterials} material(is) pendente{attentionCounts.pendingMaterials !== 1 ? "s" : ""}</span>
              </Link>
            )}
          </div>
        ) : (
          <div className="px-5 py-3 border-b border-[#F0F0ED]">
            <span className="text-[12px] text-[#16A34A] font-medium">✓ Nenhuma aprovação pendente</span>
          </div>
        )}

        {/* PM Agent directives per project */}
        {pmDirectives.length > 0 ? (
          <div className="divide-y divide-[#F7F7F6]">
            {pmDirectives.slice(0, 4).map((d) => {
              const style = URGENCY_STYLE[d.urgency];
              return (
                <div key={d.projectId} className="flex items-start gap-3 px-5 py-3">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] shrink-0 mt-0.5 ${style.bg} ${style.text}`}>
                    {style.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-[#1A1A1A] leading-snug">
                      <span className="text-[#9B9B95] font-normal">{d.projectName} · </span>
                      {d.nextAction}
                    </p>
                    <p className="text-[11px] text-[#9B9B95] mt-0.5">{d.reason}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {d.blocker && (
                      <span className="text-[10px] font-semibold text-[#DC2626] bg-[#FEE2E2] px-1.5 py-0.5 rounded">Bloqueio</span>
                    )}
                    <Link
                      href={d.route}
                      className="h-6 px-2.5 rounded-[5px] text-[11px] font-medium border border-[#E5E5E2] text-[#6B6B65] hover:border-[#070A1F] hover:text-[#070A1F] transition-colors whitespace-nowrap inline-flex items-center"
                    >
                      {d.role} →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-5 py-4 text-center text-[13px] text-[#9B9B95]">
            Nenhum projeto ativo encontrado.
          </div>
        )}
      </div>

      {/* System Doctor compact card */}
      <div className="bg-white rounded-[12px] border border-[#E5E5E2] overflow-hidden mb-4">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#F0F0ED]">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full shrink-0 ${docMeta.dot}`} />
            <span className="text-[12px] font-semibold text-[#1A1A1A]">System Doctor</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-[#9B9B95]">
              {doctorReport.pass} ok · {doctorReport.warning} atenção · {doctorReport.fail} falha
            </span>
            <Link href="/agency/settings" className="text-[11px] text-[#070A1F] hover:underline font-medium">
              Ver diagnóstico →
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-4 px-5 py-3">
          {/* Score pill */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-[7px] ${docMeta.bg}`}>
            <span className={`text-[18px] font-bold mono-num ${docMeta.text}`}>{doctorReport.score}</span>
            <span className={`text-[11px] font-semibold ${docMeta.text}`}>/100</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className={`text-[12px] font-semibold mb-0.5 ${docMeta.text}`}>{docMeta.label}</div>
            {(doctorReport.fail > 0 || doctorReport.warning > 0) && (
              <p className="text-[11px] text-[#6B6B65] truncate leading-snug">{doctorReport.topAction}</p>
            )}
          </div>
        </div>
      </div>

      {/* TODAY PANEL */}
      <div className="bg-white rounded-[12px] border border-[#E5E5E2] overflow-hidden mb-6">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#F0F0ED]">
          <div className="flex items-center gap-2">
            <h2 className="text-[13px] font-semibold text-[#1A1A1A]">{t.dashboard.today}</h2>
            {sortedActions.length > 0 && (
              <span className="w-5 h-5 rounded-full bg-[#070A1F] text-white text-[10px] font-bold flex items-center justify-center">
                {sortedActions.length}
              </span>
            )}
          </div>
          {confirmMsg
            ? <span className="text-[11px] font-medium text-[#16A34A] transition-opacity">{confirmMsg}</span>
            : <span className="text-[11px] text-[#9B9B95]">{t.dashboard.derivedFrom}</span>
          }
        </div>
        {sortedActions.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-[13px] font-medium text-[#1A1A1A]">{t.dashboard.allClear}</p>
            <p className="text-[12px] text-[#9B9B95] mt-1">{t.dashboard.allClearSub}</p>
          </div>
        ) : (
          <div className="divide-y divide-[#F7F7F6]">
            {sortedActions.map((item) => {
              const ts = TYPE_STYLES[item.type];
              return (
                <div key={item.id} className="flex items-start gap-3 px-5 py-3.5">
                  {/* Type badge */}
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] shrink-0 mt-0.5 ${ts.bg} ${ts.text}`}>
                    {TYPE_LABELS[item.type]}
                  </span>
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[#1A1A1A] leading-snug">{item.label}</p>
                    <p className="text-[11px] text-[#9B9B95] mt-0.5">
                      {item.reason}
                      {item.agentName && (
                        <> · <span className="text-[#6B6B65]">{item.agentName}</span></>
                      )}
                    </p>
                  </div>
                  {/* CTA */}
                  <button
                    onClick={() => handleAction(item)}
                    className="shrink-0 h-6 px-2.5 rounded-[5px] text-[11px] font-medium border border-[#E5E5E2] text-[#6B6B65] hover:border-[#070A1F] hover:text-[#070A1F] transition-colors whitespace-nowrap"
                  >
                    {item.cta} →
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Orchestration Summary ─────────────────────────────────────────── */}
      {(orchSummary.criticalBlockerCount > 0 || orchSummary.stalledApprovals.length > 0 || orchSummary.departments.some((d) => d.isIdle || d.isOverloaded)) && (
        <div className="bg-white rounded-[12px] border border-[#E5E5E2] overflow-hidden mb-4">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#F0F0ED]">
            <div className="flex items-center gap-2">
              <h2 className="text-[13px] font-semibold text-[#1A1A1A]">Orquestração</h2>
              <span className="text-[11px] text-[#9B9B95]">{orchSummary.topQuestion}</span>
            </div>
            {orchSummary.criticalBlockerCount > 0 && (
              <span className="text-[10px] font-bold bg-[#FEE2E2] text-[#DC2626] px-2 py-0.5 rounded-full">
                {orchSummary.criticalBlockerCount} bloqueio{orchSummary.criticalBlockerCount !== 1 ? "s" : ""} crítico{orchSummary.criticalBlockerCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="divide-y divide-[#F7F7F6]">
            {orchSummary.blockers.slice(0, 4).map((b, i) => (
              <Link key={i} href={b.route} className="flex items-center gap-3 px-5 py-2.5 hover:bg-[#FAFAF9] transition-colors">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${b.severity === "critical" ? "bg-[#DC2626]" : b.severity === "high" ? "bg-[#D97706]" : "bg-[#9B9B95]"}`} />
                <span className="text-[11px] text-[#9B9B95] font-medium shrink-0 w-[110px] truncate">{b.projectName}</span>
                <span className="text-[12px] text-[#1A1A1A] flex-1">{b.message}</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${b.severity === "critical" ? "bg-[#FEE2E2] text-[#DC2626]" : b.severity === "high" ? "bg-[#FEF3C7] text-[#D97706]" : "bg-[#F0F0ED] text-[#9B9B95]"}`}>
                  {b.severity === "critical" ? "Crítico" : b.severity === "high" ? "Alto" : "Médio"}
                </span>
              </Link>
            ))}
            {orchSummary.stalledApprovals.slice(0, 2).map((s, i) => (
              <Link key={`stall-${i}`} href="/agency/approvals" className="flex items-center gap-3 px-5 py-2.5 hover:bg-[#FAFAF9] transition-colors">
                <span className="w-1.5 h-1.5 rounded-full bg-[#070A1F] shrink-0" />
                <span className="text-[11px] text-[#9B9B95] font-medium shrink-0 w-[110px] truncate">{s.projectName}</span>
                <span className="text-[12px] text-[#1A1A1A] flex-1">"{s.deliverableName}" parada há {s.daysSent} dias</span>
                <span className="text-[9px] font-bold bg-[#EDE9FE] text-[#070A1F] px-1.5 py-0.5 rounded shrink-0">Parada</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Auto Tasks (PM-generated) ─────────────────────────────────────── */}
      {autoTasks.length > 0 && (
        <div className="bg-white rounded-[12px] border border-[#E5E5E2] overflow-hidden mb-4">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#F0F0ED]">
            <div className="flex items-center gap-2">
              <h2 className="text-[13px] font-semibold text-[#1A1A1A]">Tarefas Automáticas</h2>
              <span className="w-5 h-5 rounded-full bg-[#070A1F] text-white text-[10px] font-bold flex items-center justify-center">{Math.min(autoTasks.length, 6)}</span>
              <span className="text-[11px] text-[#9B9B95]">geradas pelo PM Engine</span>
            </div>
            <Link href="/agency/tasks" className="text-[11px] text-[#070A1F] font-medium hover:underline">
              Ver todas →
            </Link>
          </div>
          <div className="divide-y divide-[#F7F7F6]">
            {autoTasks.slice(0, 6).map((task) => {
              const ps = AUTO_TASK_PRIORITY_STYLE[task.priority];
              return (
                <Link key={task.id} href={task.route} className="flex items-start gap-3 px-5 py-3 hover:bg-[#FAFAF9] transition-colors">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-[4px] shrink-0 mt-0.5 ${ps.bg} ${ps.text}`}>
                    {ps.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-[#1A1A1A] leading-snug">
                      <span className="text-[#9B9B95] font-normal">{task.projectName} · </span>
                      {task.title}
                    </p>
                    <p className="text-[11px] text-[#9B9B95] truncate mt-0.5">{task.description}</p>
                  </div>
                  <span className="text-[10px] font-medium text-[#9B9B95] shrink-0 mt-0.5">{task.owner} →</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Department Health ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-[12px] border border-[#E5E5E2] overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-[#F0F0ED] flex items-center gap-2">
          <h2 className="text-[13px] font-semibold text-[#1A1A1A]">Saúde dos Departamentos</h2>
          {workspaceHealth.mostOverloaded && (
            <span className="text-[10px] font-semibold text-[#DC2626] bg-[#FEE2E2] px-2 py-0.5 rounded-full">
              {workspaceHealth.mostOverloaded.label} sobrecarregado
            </span>
          )}
          {workspaceHealth.mostIdle && !workspaceHealth.mostOverloaded && (
            <span className="text-[10px] font-semibold text-[#9B9B95] bg-[#F0F0ED] px-2 py-0.5 rounded-full">
              {workspaceHealth.mostIdle.label} ocioso
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 divide-x divide-[#F0F0ED]">
          {workspaceHealth.departments.map((dept) => {
            const style = DEPT_HEALTH_STYLE[dept.level];
            return (
              <div key={dept.dept} className="px-5 py-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-semibold text-[#1A1A1A]" style={{ color: dept.accentHex }}>{dept.label}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-[4px] ${style.bg} ${style.text}`}>{style.label}</span>
                </div>
                <p className="text-[11px] text-[#6B6B65] leading-snug mb-3">{dept.statusText}</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center">
                    <p className="text-[16px] font-bold text-[#1A1A1A] mono-num">{dept.metrics.generated}</p>
                    <p className="text-[9px] text-[#9B9B95]">geradas</p>
                  </div>
                  <div className="text-center">
                    <p className={`text-[16px] font-bold mono-num ${dept.metrics.revisionsOpen > 0 ? "text-[#DC2626]" : "text-[#1A1A1A]"}`}>{dept.metrics.revisionsOpen}</p>
                    <p className="text-[9px] text-[#9B9B95]">revisões</p>
                  </div>
                  <div className="text-center">
                    <p className={`text-[16px] font-bold mono-num ${dept.metrics.approved > 0 ? "text-[#16A34A]" : "text-[#9B9B95]"}`}>{dept.metrics.approved}</p>
                    <p className="text-[9px] text-[#9B9B95]">aprovadas</p>
                  </div>
                </div>
                {dept.recommendation && (
                  <p className="text-[10px] text-[#D97706] mt-2 leading-snug">{dept.recommendation}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Execution Pipeline (per project) ─────────────────────────────── */}
      {activeProjects.length > 0 && (
        <div className="bg-white rounded-[12px] border border-[#E5E5E2] overflow-hidden mb-6">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#F0F0ED]">
            <h2 className="text-[13px] font-semibold text-[#1A1A1A]">Pipeline de Execução</h2>
            <Link href="/agency/pipeline" className="text-[11px] text-[#070A1F] font-medium hover:underline">Ver quadro →</Link>
          </div>
          <div className="divide-y divide-[#F0F0ED]">
            {activeProjects.slice(0, 5).map((project) => {
              const client = getClient(project.clientId);
              const pipeline = evaluateProjectPipeline({
                project,
                client,
                deliverables,
                materialRequests,
                strategyRooms,
              });
              const relevant = pipeline.filter((s) => s.status !== "not_applicable").slice(0, 7);
              return (
                <Link key={project.id} href={`/agency/projects/${project.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-[#FAFAF9] transition-colors">
                  <div className="w-[160px] shrink-0">
                    <p className="text-[12px] font-medium text-[#1A1A1A] truncate">{project.name}</p>
                    <p className="text-[10px] text-[#9B9B95]">{client?.name ?? "—"}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-1 min-w-0 flex-wrap">
                    {relevant.map((stage) => {
                      const ss = STAGE_STATUS_STYLE[stage.status];
                      return (
                        <span
                          key={stage.def.id}
                          title={stage.blockedBy ?? stage.detail ?? stage.def.description}
                          className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-[3px] whitespace-nowrap ${ss.bg} ${ss.text}`}
                        >
                          {stage.status === "complete" ? "✓ " : stage.status === "blocked" ? "✗ " : ""}{stage.def.name}
                        </span>
                      );
                    })}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-[1fr_340px] gap-6">
        {/* LEFT — Active Projects with pipeline */}
        <div className="space-y-6">
          <div className="bg-white rounded-[12px] border border-[#E5E5E2] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#F0F0ED]">
              <h2 className="text-[13px] font-semibold text-[#1A1A1A]">{t.dashboard.activeProjects}</h2>
              <Link href="/agency/projects" className="text-[12px] text-[#070A1F] hover:underline font-medium">{t.common.viewAll}</Link>
            </div>
            {activeProjects.length === 0 ? (
              <div className="px-5 py-8 text-center text-[13px] text-[#9B9B95]">{t.dashboard.noActiveProjects}</div>
            ) : (
              <div className="divide-y divide-[#F0F0ED]">
                {activeProjects.slice(0, 7).map((project) => {
                  const client = getClient(project.clientId);
                  const dl = daysLeft(project.deadline);
                  const pTasks = tasks.filter((tk) => tk.projectId === project.id);

                  return (
                    <Link
                      key={project.id}
                      href={`/agency/projects/${project.id}`}
                      className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#FAFAF9] transition-colors group"
                    >
                      {/* Name + client */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[13px] font-medium text-[#1A1A1A] truncate">{project.name}</span>
                          {dl < 0 && <span className="text-[10px] font-bold text-[#DC2626] bg-[#FEE2E2] px-1.5 py-0.5 rounded shrink-0">{t.project.status.overdue}</span>}
                          {dl >= 0 && dl <= 3 && <span className="text-[10px] font-bold text-[#D97706] bg-[#FEF3C7] px-1.5 py-0.5 rounded shrink-0">{t.project.status.urgent}</span>}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-[#9B9B95]">
                          <span>{client?.name ?? "—"}</span>
                          <span>·</span>
                          <span className={mounted && dl < 0 ? "text-[#DC2626]" : mounted && dl <= 3 ? "text-[#D97706]" : ""}>
                            {mounted ? (dl < 0 ? t.project.labels.daysOverdue(dl) : t.project.labels.daysLeft(dl)) : "—"}
                          </span>
                        </div>
                      </div>

                      {/* Agent pipeline */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {project.agents.slice(0, 4).map((agentId) => {
                          const agentTasks = pTasks.filter((tk) => tk.agentId === agentId);
                          const isDone = agentTasks.length > 0 && agentTasks.every((tk) => tk.status === "done");
                          const isActive = agentTasks.some((tk) => tk.status === "in_progress");
                          return (
                            <span
                              key={agentId}
                              title={MOCK_AGENTS.find(a => a.id === agentId)?.name}
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-[3px] ${
                                isDone
                                  ? "bg-[#DCFCE7] text-[#16A34A]"
                                  : isActive
                                  ? "bg-[#FFF4ED] text-[#C2530A]"
                                  : "bg-[#F0F0ED] text-[#9B9B95]"
                              }`}
                            >
                              {AGENT_SHORT[agentId] ?? agentId}
                            </span>
                          );
                        })}
                      </div>

                      {/* Stage */}
                      <span className="shrink-0 text-[11px] font-medium text-[#6B6B65] bg-[#F7F7F6] border border-[#E5E5E2] px-2 py-0.5 rounded-full capitalize">
                        {t.project.stages[project.stage as keyof typeof t.project.stages] ?? project.stage}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Project Health — operational status */}
          <div className="bg-white rounded-[12px] border border-[#E5E5E2] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#F0F0ED]">
              <div>
                <h2 className="text-[13px] font-semibold text-[#1A1A1A]">{ops.healthTitle}</h2>
                <p className="text-[11px] text-[#9B9B95] mt-0.5">{ops.healthSub}</p>
              </div>
            </div>
            {projectHealth.length === 0 ? (
              <div className="px-5 py-8 text-center text-[13px] text-[#9B9B95]">{ops.noProjects}</div>
            ) : (
              <div className="divide-y divide-[#F0F0ED]">
                {projectHealth.map(({ project, health, client }) => (
                  <Link
                    key={project.id}
                    href={`/agency/projects/${project.id}?tab=report`}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-[#FAFAF9] transition-colors"
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: health.dotColor }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-[#1A1A1A] truncate">{project.name}</p>
                      <p className="text-[11px] text-[#9B9B95] truncate">{client?.name ?? "—"}</p>
                    </div>
                    <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${health.color}`}>
                      {health.label}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT column */}
        <div className="space-y-5">

          {/* Outputs Ready */}
          <div className="bg-white rounded-[12px] border border-[#E5E5E2] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#F0F0ED]">
              <h2 className="text-[13px] font-semibold text-[#1A1A1A]">{t.dashboard.outputs}</h2>
              <Link href="/agency/deliverables" className="text-[12px] text-[#070A1F] hover:underline">{t.dashboard.allDeliverables}</Link>
            </div>
            {readyOutputs.length === 0 ? (
              <div className="px-5 py-6 text-center text-[12px] text-[#9B9B95]">{t.dashboard.noOutputs}</div>
            ) : (
              <div className="divide-y divide-[#F0F0ED]">
                {readyOutputs.map((d) => {
                  const p = projects.find((pr) => pr.id === d.projectId);
                  const statusColor =
                    d.status === "approved" ? "text-[#16A34A] bg-[#DCFCE7]"
                    : d.status === "in_review" ? "text-[#D97706] bg-[#FEF3C7]"
                    : "text-[#9B9B95] bg-[#F0F0ED]";
                  return (
                    <Link
                      key={d.id}
                      href={`/agency/projects/${d.projectId}`}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#FAFAF9] transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-[#1A1A1A] truncate">{d.name}</p>
                        <p className="text-[10px] text-[#9B9B95]">{p?.name ?? "—"} · {d.type}</p>
                      </div>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-[3px] shrink-0 ${statusColor}`}>
                        {STATUS_LABELS[d.status] ?? d.status}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Blocks & Alerts */}
          <div className="bg-white rounded-[12px] border border-[#E5E5E2] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#F0F0ED] flex items-center gap-2">
              <h2 className="text-[13px] font-semibold text-[#1A1A1A]">{t.dashboard.alerts}</h2>
              {blocks.length > 0 && (
                <span className="w-4 h-4 rounded-full bg-[#FEE2E2] text-[#DC2626] text-[9px] font-bold flex items-center justify-center">
                  {blocks.length}
                </span>
              )}
            </div>
            {blocks.length === 0 ? (
              <div className="px-5 py-6 text-center text-[12px] text-[#9B9B95]">{t.dashboard.allClearAlerts}</div>
            ) : (
              <div className="divide-y divide-[#F0F0ED]">
                {blocks.slice(0, 5).map((b) => (
                  <Link
                    key={b.id}
                    href={b.href}
                    className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-[#FAFAF9] transition-colors"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${b.level === "high" ? "bg-[#DC2626]" : "bg-[#D97706]"}`} />
                    <p className="text-[12px] text-[#1A1A1A] leading-snug flex-1">{b.message}</p>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-[12px] border border-[#E5E5E2] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#F0F0ED]">
              <h2 className="text-[13px] font-semibold text-[#1A1A1A]">{t.dashboard.recentActivity}</h2>
            </div>
            <div className="divide-y divide-[#F0F0ED]">
              {activity.slice(0, 8).map((event) => (
                <div key={event.id} className="flex items-start gap-3 px-4 py-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#D0D0CC] shrink-0 mt-1.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-[#6B6B65] font-medium">{EVENT_LABELS[event.type] ?? event.type}</p>
                    <p className="text-[11px] text-[#9B9B95] truncate">{event.message}</p>
                  </div>
                  <span className="text-[10px] text-[#C0C0BC] shrink-0">{mounted ? timeAgo(event.timestamp, ops) : isoShortDate(event.timestamp)}</span>
                </div>
              ))}
              {activity.length === 0 && (
                <div className="px-5 py-6 text-center text-[12px] text-[#9B9B95]">{t.dashboard.noActivity}</div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
