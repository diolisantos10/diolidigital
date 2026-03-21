"use client";

import { useState, useMemo } from "react";
import { useAgencyStore } from "@/store/agency-store";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import Badge from "@/components/agency/ui/Badge";
import EmptyState from "@/components/agency/ui/EmptyState";
import { TaskStatus, MOCK_AGENTS } from "@/lib/agency/mock-data";

const TASK_CYCLE: Record<TaskStatus, TaskStatus> = {
  pending: "in_progress", in_progress: "done", done: "pending", blocked: "pending",
};

export default function TasksPage() {
  const { tasks, projects, updateTaskStatus } = useAgencyStore();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");

  const filtered = useMemo(() => {
    return tasks
      .filter((t) => statusFilter === "all" || t.status === statusFilter)
      .filter((t) => projectFilter === "all" || t.projectId === projectFilter)
      .filter((t) => agentFilter === "all" || t.agentId === agentFilter)
      .filter((t) =>
        !search ||
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        t.description.toLowerCase().includes(search.toLowerCase())
      );
  }, [tasks, statusFilter, projectFilter, agentFilter, search]);

  const getProject = (id: string) => projects.find((p) => p.id === id);
  const getAgent = (id: string) => MOCK_AGENTS.find((a) => a.id === id);

  const counts = {
    pending: tasks.filter((t) => t.status === "pending").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    done: tasks.filter((t) => t.status === "done").length,
    blocked: tasks.filter((t) => t.status === "blocked").length,
  };

  return (
    <>
      <AgencyHeader
        title="Tasks"
        subtitle={`${tasks.length} tasks across all projects`}
      />

      {/* Status summary strip */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {(["pending", "in_progress", "done", "blocked"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
            className={`text-left px-4 py-3 rounded-[8px] border transition-all ${
              statusFilter === s ? "bg-[#1A1A1A] border-[#1A1A1A] text-white" : "bg-white border-[#E5E5E2] hover:bg-[#FAFAF9]"
            }`}
          >
            <div className={`text-[20px] font-semibold mono-num ${statusFilter === s ? "text-white" : "text-[#1A1A1A]"}`}>
              {counts[s]}
            </div>
            <div className={`text-[11px] mt-0.5 ${statusFilter === s ? "text-white/70" : "text-[#9B9B95]"}`}>
              {s === "in_progress" ? "In Progress" : s.charAt(0).toUpperCase() + s.slice(1)}
            </div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tasks..."
          className="h-8 px-3 text-[13px] bg-white border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] placeholder:text-[#9B9B95] w-56"
        />
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="h-8 px-3 text-[12px] bg-white border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] text-[#6B6B65]"
        >
          <option value="all">All Projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          className="h-8 px-3 text-[12px] bg-white border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] text-[#6B6B65]"
        >
          <option value="all">All Agents</option>
          {MOCK_AGENTS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        {(statusFilter !== "all" || projectFilter !== "all" || agentFilter !== "all" || search) && (
          <button
            onClick={() => { setStatusFilter("all"); setProjectFilter("all"); setAgentFilter("all"); setSearch(""); }}
            className="h-8 px-3 text-[12px] text-[#6B6B65] hover:text-[#1A1A1A] transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Task table */}
      {filtered.length === 0 ? (
        <EmptyState title="No tasks found" description="Try adjusting your filters." />
      ) : (
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#F0F0ED]">
                <th className="w-10 px-5 py-3"></th>
                <th className="text-left px-3 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Task</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Project</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Agent</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Status</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Due</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((task, i) => {
                const project = getProject(task.projectId);
                const agent = getAgent(task.agentId);
                return (
                  <tr
                    key={task.id}
                    className={`hover:bg-[#FAFAF9] transition-colors ${i > 0 ? "border-t border-[#F0F0ED]" : ""} ${
                      task.status === "done" ? "opacity-60" : ""
                    }`}
                  >
                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => updateTaskStatus(task.id, TASK_CYCLE[task.status])}
                        className={`w-4 h-4 rounded-[4px] border flex items-center justify-center transition-colors ${
                          task.status === "done"
                            ? "bg-[#5B5BD6] border-[#5B5BD6]"
                            : task.status === "in_progress"
                            ? "border-[#5B5BD6] bg-[#EEF0FF]"
                            : task.status === "blocked"
                            ? "bg-[#FEE2E2] border-[#DC2626]"
                            : "border-[#D0D0CC] hover:border-[#5B5BD6]"
                        }`}
                      >
                        {task.status === "done" && (
                          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                            <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </button>
                    </td>
                    <td className="px-3 py-3.5">
                      <div className={`text-[13px] font-medium ${task.status === "done" ? "line-through text-[#9B9B95]" : "text-[#1A1A1A]"}`}>
                        {task.title}
                      </div>
                      <div className="text-[11px] text-[#9B9B95] mt-0.5 line-clamp-1">{task.description}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      {project && (
                        <span className="text-[12px] text-[#6B6B65]">{project.name}</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-[#6B6B65]">{agent?.name ?? "—"}</td>
                    <td className="px-5 py-3.5">
                      <button onClick={() => updateTaskStatus(task.id, TASK_CYCLE[task.status])}>
                        <Badge variant={task.status} />
                      </button>
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-[#9B9B95]">{task.dueDate.slice(5)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
