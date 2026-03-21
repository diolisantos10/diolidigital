"use client";

import { useAgencyStore } from "@/store/agency-store";
import Badge from "@/components/agency/ui/Badge";
import Link from "next/link";
import { ProjectStage } from "@/lib/agency/mock-data";

const STAGE_ORDER: ProjectStage[] = [
  "briefing", "diagnosis", "planning", "production", "review", "delivery", "ongoing", "completed",
];

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const EVENT_ICONS: Record<string, string> = {
  project_created: "🟢",
  project_stage_changed: "🔄",
  task_updated: "✓",
  deliverable_updated: "📦",
  client_created: "🏢",
  briefing_created: "📋",
  orchestrator_approved: "⚡",
};

export default function DashboardPage() {
  const { projects, tasks, activity, clients } = useAgencyStore();

  const activeProjects = projects.filter((p) => p.stage !== "completed");
  const atRisk = projects.filter((p) => {
    if (p.stage === "completed") return false;
    const deadline = new Date(p.deadline).getTime();
    const now = Date.now();
    return (deadline - now) / (1000 * 60 * 60 * 24) <= 7;
  });
  const todayTasks = tasks.filter((t) => t.status === "in_progress");
  const blockedTasks = tasks.filter((t) => t.status === "blocked");

  // Pipeline overview (count per stage, excluding completed)
  const stageCounts = STAGE_ORDER.slice(0, 7).map((stage) => ({
    stage,
    count: projects.filter((p) => p.stage === stage).length,
  }));

  // Upcoming deadlines (next 14 days, not completed)
  const upcoming = [...activeProjects]
    .filter((p) => {
      const days = (new Date(p.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      return days >= 0 && days <= 14;
    })
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
    .slice(0, 5);

  const getClient = (clientId: string) => clients.find((c) => c.id === clientId);

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <p className="text-[12px] font-medium text-[#9B9B95] uppercase tracking-[0.06em] mb-1">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-[#1A1A1A]">Command Dashboard</h1>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: "Active Projects", value: activeProjects.length, color: "#5B5BD6", sub: `${projects.filter(p => p.stage === "production").length} in production` },
          { label: "At Risk", value: atRisk.length, color: "#DC2626", sub: "deadline within 7 days" },
          { label: "In Progress Tasks", value: todayTasks.length, color: "#D97706", sub: `${blockedTasks.length} blocked` },
          { label: "Upcoming Deadlines", value: upcoming.length, color: "#16A34A", sub: "next 14 days" },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="bg-white rounded-[10px] border border-[#E5E5E2] px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
          >
            <div className="text-[28px] font-semibold mono-num tracking-[-0.02em]" style={{ color: kpi.color }}>
              {kpi.value}
            </div>
            <div className="text-[13px] font-medium text-[#1A1A1A] mt-0.5">{kpi.label}</div>
            <div className="text-[11px] text-[#9B9B95] mt-0.5">{kpi.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_340px] gap-6">
        {/* Left column */}
        <div className="space-y-6">
          {/* Active Projects */}
          <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F0ED]">
              <h2 className="text-[14px] font-semibold text-[#1A1A1A]">Active Projects</h2>
              <Link href="/agency/projects" className="text-[12px] text-[#5B5BD6] hover:underline font-medium">
                View all
              </Link>
            </div>
            <div>
              {activeProjects.slice(0, 6).map((project, i) => {
                const client = getClient(project.clientId);
                const projectTasks = tasks.filter((t) => t.projectId === project.id);
                const doneTasks = projectTasks.filter((t) => t.status === "done").length;
                const progress = projectTasks.length > 0 ? Math.round((doneTasks / projectTasks.length) * 100) : 0;
                const daysLeft = Math.ceil((new Date(project.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                const isAtRisk = daysLeft <= 7 && daysLeft >= 0;
                return (
                  <Link
                    key={project.id}
                    href={`/agency/projects/${project.id}`}
                    className={`flex items-center gap-4 px-5 py-3.5 hover:bg-[#FAFAF9] transition-colors ${i > 0 ? "border-t border-[#F0F0ED]" : ""}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[13px] font-medium text-[#1A1A1A] truncate">{project.name}</span>
                        {isAtRisk && <span className="text-[10px] font-semibold text-[#DC2626] bg-[#FEE2E2] px-1.5 py-0.5 rounded">AT RISK</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-[#9B9B95]">{client?.name}</span>
                        <span className="text-[#E5E5E2]">·</span>
                        <span className={`text-[11px] ${isAtRisk ? "text-[#DC2626]" : "text-[#9B9B95]"}`}>
                          {daysLeft <= 0 ? "Overdue" : `${daysLeft}d left`}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {/* Progress */}
                      <div className="text-right">
                        <div className="text-[11px] text-[#9B9B95] mono-num">{doneTasks}/{projectTasks.length}</div>
                        <div className="w-20 h-1 bg-[#F0F0ED] rounded-full mt-1 overflow-hidden">
                          <div className="h-full bg-[#5B5BD6] rounded-full transition-all" style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                      <Badge variant={project.stage} />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Pipeline Overview */}
          <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F0ED]">
              <h2 className="text-[14px] font-semibold text-[#1A1A1A]">Pipeline Overview</h2>
              <Link href="/agency/pipeline" className="text-[12px] text-[#5B5BD6] hover:underline font-medium">
                Open board
              </Link>
            </div>
            <div className="px-5 py-4">
              <div className="grid grid-cols-7 gap-2">
                {stageCounts.map(({ stage, count }) => (
                  <div key={stage} className="text-center">
                    <div className={`text-[20px] font-semibold mono-num ${count > 0 ? "text-[#1A1A1A]" : "text-[#D0D0CC]"}`}>
                      {count}
                    </div>
                    <div className="text-[10px] text-[#9B9B95] mt-0.5 capitalize leading-tight">{stage}</div>
                    <div className="w-full h-1 rounded-full mt-1.5 bg-[#F0F0ED] overflow-hidden">
                      {count > 0 && <div className="h-full bg-[#5B5BD6] rounded-full" />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Upcoming Deadlines */}
          <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#F0F0ED]">
              <h2 className="text-[14px] font-semibold text-[#1A1A1A]">Upcoming Deadlines</h2>
            </div>
            <div>
              {upcoming.length === 0 ? (
                <div className="px-5 py-6 text-center text-[13px] text-[#9B9B95]">No deadlines in the next 14 days</div>
              ) : (
                upcoming.map((project, i) => {
                  const client = getClient(project.clientId);
                  const daysLeft = Math.ceil((new Date(project.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  const isUrgent = daysLeft <= 3;
                  return (
                    <Link
                      key={project.id}
                      href={`/agency/projects/${project.id}`}
                      className={`flex items-center justify-between px-5 py-3 hover:bg-[#FAFAF9] transition-colors ${i > 0 ? "border-t border-[#F0F0ED]" : ""}`}
                    >
                      <div className="min-w-0 mr-3">
                        <div className="text-[12px] font-medium text-[#1A1A1A] truncate">{project.name}</div>
                        <div className="text-[11px] text-[#9B9B95]">{client?.name}</div>
                      </div>
                      <div className={`text-[11px] font-semibold shrink-0 ${isUrgent ? "text-[#DC2626]" : "text-[#D97706]"}`}>
                        {daysLeft}d
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>

          {/* Activity Feed */}
          <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#F0F0ED]">
              <h2 className="text-[14px] font-semibold text-[#1A1A1A]">Recent Activity</h2>
            </div>
            <div>
              {activity.slice(0, 8).map((event, i) => (
                <div
                  key={event.id}
                  className={`flex items-start gap-3 px-5 py-3 ${i > 0 ? "border-t border-[#F0F0ED]" : ""}`}
                >
                  <span className="text-[14px] shrink-0 mt-0.5">{EVENT_ICONS[event.type] ?? "•"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] text-[#1A1A1A] leading-snug">{event.message}</p>
                    <p className="text-[11px] text-[#9B9B95] mt-0.5">{timeAgo(event.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
