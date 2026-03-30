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
import { TaskStatus, DeliverableStatus, Priority, ProjectStage, MOCK_AGENTS } from "@/lib/agency/mock-data";

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
  const { projects, clients, tasks, deliverables, briefings, updateTaskStatus, updateDeliverableStatus, updateProject, moveProjectStage, setPendingAgentInput } = useAgencyStore();

  type TabId = "overview" | "execution" | "pipeline" | "tasks" | "deliverables" | "strategy" | "assets" | "history";
  const VALID_TABS: TabId[] = ["overview", "execution", "pipeline", "tasks", "deliverables", "strategy", "assets", "history"];
  const [tab, setTab] = useState<TabId>(() => {
    const t = searchParams.get("tab") as TabId | null;
    return t && VALID_TABS.includes(t) ? t : "overview";
  });
  const [editOpen, setEditOpen] = useState(false);

  const project = projects.find((p) => p.id === id);
  if (!project) return notFound();

  const client = clients.find((c) => c.id === project.clientId);
  const projectTasks = tasks.filter((t) => t.projectId === id);
  const projectDeliverables = deliverables.filter((d) => d.projectId === id);
  const briefing = briefings.find((b) => b.projectId === id);
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

  const getAgent = (agentId: string) => MOCK_AGENTS.find((a) => a.id === agentId);

  const TABS = VALID_TABS;

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
    not_started: "Not started",
    in_progress: "In progress",
    done: "Done",
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
          ← Projects
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
        actions={<Button variant="secondary" onClick={() => setEditOpen(true)}>Edit Project</Button>}
      />

      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[12px] text-[#9B9B95]">Task progress</span>
          <span className="text-[12px] text-[#6B6B65] font-medium mono-num">{doneTasks}/{projectTasks.length} tasks done</span>
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
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab: Overview */}
      {tab === "overview" && (
        <div className="grid grid-cols-[1fr_280px] gap-6">
          <div className="space-y-5">
            {/* Goal */}
            <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-2">Goal</div>
              <p className="text-[14px] text-[#1A1A1A] leading-relaxed">{project.goal}</p>
            </div>

            {/* Tasks snapshot */}
            <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#F0F0ED]">
                <div className="text-[13px] font-semibold text-[#1A1A1A]">Tasks</div>
                <button onClick={() => setTab("tasks")} className="text-[12px] text-[#5B5BD6] hover:underline">View all</button>
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
                  <div className="text-[13px] font-semibold text-[#1A1A1A]">Deliverables</div>
                  <button onClick={() => setTab("deliverables")} className="text-[12px] text-[#5B5BD6] hover:underline">View all</button>
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
              <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-3">Details</div>
              <div className="space-y-2.5">
                {[
                  { label: "Client", value: client?.name ?? "—" },
                  { label: "Type", value: project.type },
                  { label: "Deadline", value: project.deadline },
                  { label: "Created", value: project.createdAt },
                  { label: "Tasks", value: `${doneTasks} / ${projectTasks.length} done` },
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
              <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-3">Assigned Agents</div>
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
            <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-3">Stage Control</div>
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
            <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-3">Agent Pipeline</div>
            {project.agents.length === 0 ? (
              <div className="bg-white rounded-[10px] border border-dashed border-[#E5E5E2] px-5 py-8 text-center">
                <p className="text-[13px] text-[#9B9B95]">No agents assigned. Edit the project to assign agents.</p>
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
                            {doneTasks}/{agentTasks.length} tasks complete
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
                          Run
                          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                            <path d="M2 5.5h7M5.5 2l3.5 3.5L5.5 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      ) : (
                        <span className="shrink-0 h-7 px-3 rounded-[6px] text-[12px] font-medium border border-[#E5E5E2] text-[#C0C0BC] cursor-not-allowed flex items-center">
                          No page yet
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
            <div className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-3">Outputs</div>
            <div className="grid grid-cols-3 gap-4">
              {(["posts", "design", "campaigns"] as const).map((cat) => {
                const catLabels = { posts: "Posts & Copy", design: "Design Assets", campaigns: "Campaigns & Ads" };
                const catDeliverables = projectDeliverables.filter((d) => getDeliverableCategory(d.type) === cat);
                return (
                  <div key={cat} className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                    <div className="px-4 py-3 border-b border-[#F0F0ED] flex items-center justify-between">
                      <p className="text-[12px] font-semibold text-[#1A1A1A]">{catLabels[cat]}</p>
                      <span className="text-[11px] text-[#9B9B95]">{catDeliverables.length}</span>
                    </div>
                    {catDeliverables.length === 0 ? (
                      <div className="px-4 py-6 text-center">
                        <p className="text-[11px] text-[#C0C0BC]">No outputs yet</p>
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
                      <div className="text-[12px] text-[#9B9B95] mt-0.5">Current stage</div>
                    )}
                  </div>
                  {isActive && <Badge variant="in_progress" size="md">Current</Badge>}
                  {isDone && <Badge variant="done" size="md">Done</Badge>}
                  {!isActive && (
                    <button
                      onClick={() => moveProjectStage(id, stage)}
                      className="h-6 px-2.5 rounded-[5px] text-[11px] font-medium border border-[#E5E5E2] text-[#6B6B65] hover:border-[#5B5BD6] hover:text-[#5B5BD6] transition-colors"
                    >
                      Move here
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
              <p className="text-[14px] font-medium text-[#1A1A1A]">No tasks yet</p>
              <p className="text-[13px] text-[#9B9B95] mt-1.5">Run the Orchestrator to generate a task plan for this project.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#F0F0ED]">
                  <th className="w-8 px-5 py-3"></th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Task</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Agent</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Status</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Due</th>
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
              <p className="text-[14px] font-medium text-[#1A1A1A]">No deliverables yet</p>
              <p className="text-[13px] text-[#9B9B95] mt-1.5">Deliverables are created as agents complete their tasks.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#F0F0ED]">
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Name</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Type</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Version</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Status</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Date</th>
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

      {/* Tab: Strategy */}
      {tab === "strategy" && (
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-6 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          {!briefing ? (
            <div className="py-10 text-center">
              <p className="text-[14px] font-medium text-[#1A1A1A]">No briefing found</p>
              <p className="text-[13px] text-[#9B9B95] mt-1.5">Submit a briefing from the Briefings page to populate this tab.</p>
            </div>
          ) : (
            <div className="space-y-6 max-w-2xl">
              {[
                { label: "Business Goal", value: briefing.goal },
                { label: "Target Audience", value: briefing.audience },
                { label: "Key Message", value: briefing.keyMessage },
                { label: "Deliverables Requested", value: briefing.deliverables },
                { label: "Success Criteria", value: briefing.successCriteria },
                ...(briefing.notes ? [{ label: "Notes", value: briefing.notes }] : []),
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

      {/* Tab: Assets */}
      {tab === "assets" && (
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-6 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <p className="text-[13px] text-[#6B6B65]">
            Brand assets for <strong>{client?.name}</strong> are managed in the{" "}
            <Link href="/agency/brand-assets" className="text-[#5B5BD6] hover:underline">Brand Assets</Link> section.
          </p>
          {client && (
            <Link href={`/agency/clients/${client.id}`} className="inline-flex items-center gap-1.5 mt-4 text-[13px] font-medium text-[#5B5BD6] hover:underline">
              View {client.name} assets →
            </Link>
          )}
        </div>
      )}

      {/* Tab: History */}
      {tab === "history" && (
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-6 py-4 text-center text-[13px] text-[#9B9B95]">
            Activity history is available in the Command Dashboard.
          </div>
        </div>
      )}

      {/* Edit Modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Project">
        <div className="space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Project Name</label>
            <input
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Goal</label>
            <textarea
              value={editForm.goal}
              onChange={(e) => setEditForm({ ...editForm, goal: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Type</label>
              <input
                value={editForm.type}
                onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Deadline</label>
              <input
                type="date"
                value={editForm.deadline}
                onChange={(e) => setEditForm({ ...editForm, deadline: e.target.value })}
                className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Priority</label>
              <select
                value={editForm.priority}
                onChange={(e) => setEditForm({ ...editForm, priority: e.target.value as Priority })}
                className="w-full h-8 px-3 text-[13px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] focus:bg-white"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#6B6B65] mb-1.5">Stage</label>
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
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleSaveEdit}>Save Changes</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
