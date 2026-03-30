"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAgencyStore } from "@/store/agency-store";
import { useTranslation } from "@/lib/i18n";
import Link from "next/link";
import { MOCK_AGENTS, ProjectStage } from "@/lib/agency/mock-data";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function daysLeft(deadline: string) {
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
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

const TYPE_STYLES: Record<ActionType, { bg: string; text: string; label: string }> = {
  unblock:   { bg: "bg-[#FEE2E2]", text: "text-[#DC2626]", label: "Unblock"  },
  review:    { bg: "bg-[#FEF3C7]", text: "text-[#D97706]", label: "Review"   },
  execution: { bg: "bg-[#EEF0FF]", text: "text-[#5B5BD6]", label: "Execute"  },
  planning:  { bg: "bg-[#F0F0ED]", text: "text-[#6B6B65]", label: "Plan"     },
};

// Maps agent IDs to dedicated agent pages (only agents with a page get direct execution)
function getAgentRunUrl(agentId: string): string | null {
  if (agentId === "a2") return "/agency/design-agent";
  if (agentId === "a3") return "/agency/social-media-agent";
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

const EVENT_LABELS: Record<string, string> = {
  project_created: "Project created",
  project_stage_changed: "Stage moved",
  task_updated: "Task updated",
  deliverable_updated: "Deliverable saved",
  client_created: "Client added",
  briefing_created: "Briefing submitted",
  orchestrator_approved: "Orchestrator approved",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const { projects, tasks, deliverables, activity, clients, setPendingAgentInput } = useAgencyStore();
  const { t } = useTranslation();
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);

  const activeProjects = projects.filter((p) => p.stage !== "completed");
  const getClient = (cid: string) => clients.find((c) => c.id === cid);
  const agentMap = Object.fromEntries(MOCK_AGENTS.map((a) => [a.id, a]));

  // ── Action execution ──────────────────────────────────────────────────────
  function handleAction(item: ActionItem) {
    // Show inline feedback
    const agent = agentMap[item.agentId];
    let msg = `Opening ${item.projectName}…`;
    if (item.type === "execution" && agent) {
      const url = getAgentRunUrl(item.agentId);
      msg = url ? `Opening ${agent.name} for ${item.projectName}…` : `Opening execution tab for ${item.projectName}…`;
    } else if (item.type === "review") {
      msg = `Opening deliverables for ${item.projectName}…`;
    } else if (item.type === "unblock") {
      msg = `Opening blocked tasks for ${item.projectName}…`;
    } else if (item.type === "planning") {
      msg = "Opening Orchestrator…";
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
        label: `${blocked.length} task${blocked.length !== 1 ? "s" : ""} blocked — ${p.name}`,
        reason: "Requires manual resolution",
        projectId: p.id, projectName: p.name, clientId: p.clientId,
        agentId: firstAgent?.id ?? "", agentName: firstAgent?.name ?? "",
        cta: "Resolve", href: `/agency/projects/${p.id}`,
      });
    }

    // Overdue — base 85 (deadline modifier adds another +40 on top)
    if (dl < 0) {
      actionItems.push({
        id: `overdue-${p.id}`, type: "execution",
        score: scoreAction(85, dl, p.stage, pendingCnt),
        label: `${p.name} is overdue`,
        reason: `${Math.abs(dl)} day${Math.abs(dl) !== 1 ? "s" : ""} past deadline`,
        projectId: p.id, projectName: p.name, clientId: p.clientId,
        agentId: "", agentName: "",
        cta: "Open Project", href: `/agency/projects/${p.id}`,
      });
    }

    // Production + no deliverables saved — base 60
    if (p.stage === "production" && pDelivs.length === 0) {
      const targetId    = p.agents.find((a) => ["a2", "a3", "a1"].includes(a)) ?? p.agents[0];
      const targetAgent = agentMap[targetId];
      actionItems.push({
        id: `no-output-${p.id}`, type: "execution",
        score: scoreAction(60, dl, p.stage, pendingCnt),
        label: `No outputs saved — ${p.name}`,
        reason: `${targetAgent?.name ?? "Agent"} execution not started`,
        projectId: p.id, projectName: p.name, clientId: p.clientId,
        agentId: targetId ?? "", agentName: targetAgent?.name ?? "",
        cta: "Run Agent", href: `/agency/projects/${p.id}`,
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
          label: `${agent?.name ?? agentId} not started — ${p.name}`,
          reason: "All assigned tasks still pending",
          projectId: p.id, projectName: p.name, clientId: p.clientId,
          agentId, agentName: agent?.name ?? "",
          cta: "Run Agent", href: `/agency/projects/${p.id}`,
        });
      });
    }

    // Briefing + no tasks — base 40
    if (p.stage === "briefing" && pTasks.length === 0) {
      actionItems.push({
        id: `plan-${p.id}`, type: "planning",
        score: scoreAction(40, dl, p.stage, 0),
        label: `${p.name} has no execution plan`,
        reason: "Run Orchestrator to generate tasks",
        projectId: p.id, projectName: p.name, clientId: p.clientId,
        agentId: "", agentName: "",
        cta: "Plan Project", href: `/agency/orchestrator`,
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
        label: `"${d.name}" needs review`,
        reason: "Awaiting client approval",
        projectId: p.id, projectName: p.name, clientId: p.clientId,
        agentId: "", agentName: "",
        cta: "Review", href: `/agency/projects/${d.projectId}`,
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
        label: `"${d.name}" revision needed — ${p.name}`,
        reason: "Client requested changes",
        projectId: p.id, projectName: p.name, clientId: p.clientId,
        agentId: reworkId ?? "", agentName: reworkAgent?.name ?? "",
        cta: "Revise", href: `/agency/projects/${p.id}`,
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

  return (
    <div>
      {/* Header */}
      <div className="mb-7">
        <p className="text-[12px] font-medium text-[#9B9B95] uppercase tracking-[0.06em] mb-1">
          {new Date().toLocaleDateString("pt-BR", { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-[#1A1A1A]">{t.dashboard.title}</h1>
      </div>

      {/* TODAY PANEL */}
      <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden mb-6">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#F0F0ED]">
          <div className="flex items-center gap-2">
            <h2 className="text-[13px] font-semibold text-[#1A1A1A]">{t.dashboard.today}</h2>
            {sortedActions.length > 0 && (
              <span className="w-5 h-5 rounded-full bg-[#5B5BD6] text-white text-[10px] font-bold flex items-center justify-center">
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
                    {ts.label}
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
                    className="shrink-0 h-6 px-2.5 rounded-[5px] text-[11px] font-medium border border-[#E5E5E2] text-[#6B6B65] hover:border-[#5B5BD6] hover:text-[#5B5BD6] transition-colors whitespace-nowrap"
                  >
                    {item.cta} →
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-[1fr_340px] gap-6">
        {/* LEFT — Active Projects with pipeline */}
        <div className="space-y-6">
          <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#F0F0ED]">
              <h2 className="text-[13px] font-semibold text-[#1A1A1A]">{t.dashboard.activeProjects}</h2>
              <Link href="/agency/projects" className="text-[12px] text-[#5B5BD6] hover:underline font-medium">{t.common.viewAll}</Link>
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
                          <span className={dl < 0 ? "text-[#DC2626]" : dl <= 3 ? "text-[#D97706]" : ""}>
                            {dl < 0 ? t.project.labels.daysOverdue(dl) : t.project.labels.daysLeft(dl)}
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
        </div>

        {/* RIGHT column */}
        <div className="space-y-5">

          {/* Outputs Ready */}
          <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#F0F0ED]">
              <h2 className="text-[13px] font-semibold text-[#1A1A1A]">{t.dashboard.outputs}</h2>
              <Link href="/agency/deliverables" className="text-[12px] text-[#5B5BD6] hover:underline">{t.dashboard.allDeliverables}</Link>
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
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-[3px] shrink-0 capitalize ${statusColor}`}>
                        {d.status.replace("_", " ")}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Blocks & Alerts */}
          {blocks.length > 0 && (
            <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#F0F0ED] flex items-center gap-2">
                <h2 className="text-[13px] font-semibold text-[#1A1A1A]">{t.dashboard.alerts}</h2>
                <span className="w-4 h-4 rounded-full bg-[#FEE2E2] text-[#DC2626] text-[9px] font-bold flex items-center justify-center">
                  {blocks.length}
                </span>
              </div>
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
            </div>
          )}

          {/* Recent Activity */}
          <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
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
                  <span className="text-[10px] text-[#C0C0BC] shrink-0">{timeAgo(event.timestamp)}</span>
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
