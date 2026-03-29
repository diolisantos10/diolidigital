"use client";

import { useAgencyStore } from "@/store/agency-store";
import { useTranslation } from "@/lib/i18n";
import Link from "next/link";
import { MOCK_AGENTS } from "@/lib/agency/mock-data";

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
  const { projects, tasks, deliverables, activity, clients } = useAgencyStore();
  const { t } = useTranslation();

  const activeProjects = projects.filter((p) => p.stage !== "completed");
  const getClient = (cid: string) => clients.find((c) => c.id === cid);

  // ── Today actions ────────────────────────────────────────────────────────
  type ActionItem = { id: string; label: string; href: string; cta: string; priority: "high" | "normal" };
  const actionItems: ActionItem[] = [];

  activeProjects.forEach((p) => {
    const pTasks = tasks.filter((t) => t.projectId === p.id);
    const pDeliverables = deliverables.filter((d) => d.projectId === p.id);
    const dl = daysLeft(p.deadline);
    void pTasks;

    // Overdue — top priority
    if (dl < 0) {
      actionItems.push({ id: `overdue-${p.id}`, label: t.dashboard.isOverdue(p.name), cta: t.dashboard.openProject, href: `/agency/projects/${p.id}`, priority: "high" });
    }

    // Production stage with no deliverables saved
    if (p.stage === "production" && pDeliverables.length === 0) {
      const hasSocial = p.agents.includes("a3");
      const hasDesign = p.agents.includes("a2");
      if (hasSocial) {
        actionItems.push({ id: `run-social-${p.id}`, label: t.dashboard.runSocialAgent(p.name), cta: t.dashboard.runAgent, href: `/agency/projects/${p.id}`, priority: "high" });
      } else if (hasDesign) {
        actionItems.push({ id: `run-design-${p.id}`, label: t.dashboard.runDesignAgent(p.name), cta: t.dashboard.runAgent, href: `/agency/projects/${p.id}`, priority: "high" });
      } else {
        actionItems.push({ id: `no-output-${p.id}`, label: t.dashboard.noOutputsSaved(p.name), cta: t.dashboard.viewProject, href: `/agency/projects/${p.id}`, priority: "normal" });
      }
    }

    // Blocked tasks
    const blocked = tasks.filter((tk) => tk.projectId === p.id && tk.status === "blocked");
    if (blocked.length > 0) {
      actionItems.push({ id: `blocked-${p.id}`, label: t.dashboard.blockedTasks(blocked.length, p.name), cta: t.dashboard.resolve, href: `/agency/projects/${p.id}?tab=tasks`, priority: "high" });
    }
  });

  // Deliverables in_review needing approval
  deliverables.filter((d) => d.status === "in_review").slice(0, 3).forEach((d) => {
    const p = projects.find((pr) => pr.id === d.projectId);
    actionItems.push({ id: `review-${d.id}`, label: t.dashboard.reviewDeliverable(d.name, p?.name ?? "—"), cta: t.dashboard.review, href: `/agency/projects/${d.projectId}`, priority: "normal" });
  });

  // Projects in briefing with no tasks yet
  activeProjects.filter((p) => p.stage === "briefing" && tasks.filter((tk) => tk.projectId === p.id).length === 0).forEach((p) => {
    actionItems.push({ id: `plan-${p.id}`, label: t.dashboard.noTasksOrchestrator(p.name), cta: t.dashboard.planProject, href: `/agency/orchestrator`, priority: "normal" });
  });

  const sortedActions = [...actionItems.filter(a => a.priority === "high"), ...actionItems.filter(a => a.priority === "normal")].slice(0, 7);

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
          <span className="text-[11px] text-[#9B9B95]">{t.dashboard.derivedFrom}</span>
        </div>
        {sortedActions.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-[13px] font-medium text-[#1A1A1A]">{t.dashboard.allClear}</p>
            <p className="text-[12px] text-[#9B9B95] mt-1">{t.dashboard.allClearSub}</p>
          </div>
        ) : (
          <div className="divide-y divide-[#F7F7F6]">
            {sortedActions.map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-5 py-3">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.priority === "high" ? "bg-[#DC2626]" : "bg-[#D97706]"}`} />
                <p className="text-[13px] text-[#1A1A1A] flex-1">{item.label}</p>
                <Link
                  href={item.href}
                  className="shrink-0 h-6 px-2.5 rounded-[5px] text-[11px] font-medium border border-[#E5E5E2] text-[#6B6B65] hover:border-[#5B5BD6] hover:text-[#5B5BD6] transition-colors"
                >
                  {item.cta} →
                </Link>
              </div>
            ))}
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
