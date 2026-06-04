"use client";

import { useState, useMemo } from "react";
import { useAgencyStore } from "@/store/agency-store";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import EmptyState from "@/components/agency/ui/EmptyState";
import Link from "next/link";
import { MOCK_AGENTS, type TaskStatus } from "@/lib/agency/mock-data";
import {
  generateAllAutoTasks,
  AUTO_TASK_PRIORITY_STYLE,
  AUTO_TASK_OWNER_STYLE,
  type AutoTaskPriority,
} from "@/lib/agency/orchestration/auto-tasks";

type TabId = "all" | "suggested" | "overdue" | "blocked" | "high" | "completed";

interface NTask {
  id: string;
  kind: "store" | "auto";
  title: string;
  description: string;
  projectId: string;
  projectName: string;
  clientName: string;
  owner: string;
  priority: AutoTaskPriority;
  storeStatus?: TaskStatus;
  dueDate: string | null;
  source: string;
  route: string | null;
}

const SOURCE_LABELS: Record<string, string> = {
  proposal_gate:        "Proposta",
  strategy_gate:        "Estratégia",
  material_follow_up:   "Materiais",
  revision_queue:       "Revisão",
  execution_gap:        "Execução",
  deadline_risk:        "Prazo",
  review_pending:       "Aprovação",
  dependency_violation: "Bloqueio",
  manual:               "Manual",
};

const TASK_CYCLE: Record<TaskStatus, TaskStatus> = {
  pending: "in_progress",
  in_progress: "done",
  done: "pending",
  blocked: "pending",
};

const TAB_LABELS: Record<TabId, string> = {
  all:       "Todas",
  suggested: "Sugeridas PM",
  overdue:   "Atrasadas",
  blocked:   "Bloqueadas",
  high:      "Alta Prioridade",
  completed: "Concluídas",
};

const TABS: TabId[] = ["all", "suggested", "overdue", "blocked", "high", "completed"];

export default function TasksPage() {
  const {
    tasks, projects, clients, deliverables,
    materialRequests, strategyRooms, updateTaskStatus,
  } = useAgencyStore();

  const [tab, setTab]                   = useState<TabId>("all");
  const [search, setSearch]             = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState<AutoTaskPriority | "all">("all");
  const [ownerFilter, setOwnerFilter]   = useState("all");

  const autoTasks = useMemo(() => generateAllAutoTasks({
    projects, clients, deliverables, tasks, materialRequests, strategyRooms,
  }), [projects, clients, deliverables, tasks, materialRequests, strategyRooms]);

  const clientMap  = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c.name])), [clients]);
  const projectMap = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects]);

  const today = new Date().toISOString().slice(0, 10);

  const normalizedStore: NTask[] = useMemo(() => tasks.map((t) => {
    const project = projectMap[t.projectId];
    const agent   = MOCK_AGENTS.find((a) => a.id === t.agentId);
    return {
      id: t.id, kind: "store",
      title: t.title, description: t.description,
      projectId: t.projectId,
      projectName: project?.name ?? "—",
      clientName:  project ? (clientMap[project.clientId] ?? "—") : "—",
      owner:    agent?.name ?? "PM",
      priority: t.status === "blocked" ? "high" : "medium",
      storeStatus: t.status,
      dueDate: t.dueDate,
      source: "manual",
      route: `/agency/projects/${t.projectId}?tab=tasks`,
    } satisfies NTask;
  }), [tasks, projectMap, clientMap]);

  const normalizedAuto: NTask[] = useMemo(() => autoTasks.map((t) => ({
    id: t.id, kind: "auto",
    title: t.title, description: t.description,
    projectId: t.projectId, projectName: t.projectName,
    clientName: clientMap[t.clientId] ?? "—",
    owner: t.owner, priority: t.priority,
    storeStatus: undefined, dueDate: null,
    source: t.source, route: t.route,
  } satisfies NTask)), [autoTasks, clientMap]);

  const tabFiltered = useMemo((): NTask[] => {
    switch (tab) {
      case "all":
        return [...normalizedStore.filter((t) => t.storeStatus !== "done"), ...normalizedAuto];
      case "suggested":
        return normalizedAuto;
      case "overdue":
        return normalizedStore.filter((t) => t.dueDate && t.dueDate < today && t.storeStatus !== "done");
      case "blocked":
        return normalizedStore.filter((t) => t.storeStatus === "blocked");
      case "high":
        return [
          ...normalizedStore.filter((t) => t.storeStatus === "blocked"),
          ...normalizedAuto.filter((t) => t.priority === "critical" || t.priority === "high"),
        ];
      case "completed":
        return normalizedStore.filter((t) => t.storeStatus === "done");
    }
  }, [tab, normalizedStore, normalizedAuto, today]);

  const filtered = useMemo(() => tabFiltered
    .filter((t) => projectFilter === "all" || t.projectId === projectFilter)
    .filter((t) => priorityFilter === "all" || t.priority === priorityFilter)
    .filter((t) => ownerFilter === "all" || t.owner === ownerFilter || t.owner.startsWith(ownerFilter))
    .filter((t) => !search || t.title.toLowerCase().includes(search.toLowerCase()) || t.description.toLowerCase().includes(search.toLowerCase())),
  [tabFiltered, projectFilter, priorityFilter, ownerFilter, search]);

  const counts = useMemo(() => {
    const active   = normalizedStore.filter((t) => t.storeStatus !== "done");
    const overdueN = normalizedStore.filter((t) => t.dueDate && t.dueDate < today && t.storeStatus !== "done");
    const blockedN = normalizedStore.filter((t) => t.storeStatus === "blocked");
    const highAuto = normalizedAuto.filter((t) => t.priority === "critical" || t.priority === "high");
    return {
      all:       active.length + normalizedAuto.length,
      suggested: normalizedAuto.length,
      overdue:   overdueN.length,
      blocked:   blockedN.length,
      high:      blockedN.length + highAuto.length,
      completed: normalizedStore.filter((t) => t.storeStatus === "done").length,
    };
  }, [normalizedStore, normalizedAuto, today]);

  const hasActiveFilters = projectFilter !== "all" || priorityFilter !== "all" || ownerFilter !== "all" || search !== "";

  return (
    <>
      <AgencyHeader
        title="Central de Tarefas"
        subtitle={`${normalizedStore.length} tarefa${normalizedStore.length !== 1 ? "s" : ""} · ${normalizedAuto.length} sugerida${normalizedAuto.length !== 1 ? "s" : ""} pelo PM`}
      />

      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-[#E5E5E2] mb-6 -mt-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 h-9 px-4 text-[13px] font-medium border-b-2 transition-colors ${
              tab === t
                ? "border-[#5B5BD6] text-[#5B5BD6]"
                : "border-transparent text-[#6B6B65] hover:text-[#1A1A1A]"
            }`}
          >
            {TAB_LABELS[t]}
            {counts[t] > 0 && (
              <span className={`inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full text-[10px] font-bold leading-none ${
                tab === t ? "bg-[#5B5BD6] text-white" : "bg-[#F0F0ED] text-[#9B9B95]"
              }`}>
                {counts[t]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar tarefas…"
          className="h-8 px-3 text-[13px] bg-white border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] placeholder:text-[#9B9B95] w-52"
        />
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="h-8 px-3 text-[12px] bg-white border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] text-[#6B6B65]"
        >
          <option value="all">Todos os projetos</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as AutoTaskPriority | "all")}
          className="h-8 px-3 text-[12px] bg-white border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] text-[#6B6B65]"
        >
          <option value="all">Toda prioridade</option>
          <option value="critical">Crítico</option>
          <option value="high">Alto</option>
          <option value="medium">Médio</option>
          <option value="low">Baixo</option>
        </select>
        <select
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value)}
          className="h-8 px-3 text-[12px] bg-white border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] text-[#6B6B65]"
        >
          <option value="all">Todo responsável</option>
          <option value="PM">PM</option>
          <option value="Social">Social</option>
          <option value="Design">Design</option>
          <option value="Ads">Ads</option>
        </select>
        {hasActiveFilters && (
          <button
            onClick={() => { setProjectFilter("all"); setPriorityFilter("all"); setOwnerFilter("all"); setSearch(""); }}
            className="h-8 px-3 text-[12px] text-[#6B6B65] hover:text-[#1A1A1A] transition-colors"
          >
            Limpar
          </button>
        )}
      </div>

      {/* Task Table */}
      {filtered.length === 0 ? (
        <EmptyState title="Nenhuma tarefa encontrada" description="Ajuste os filtros ou crie novas tarefas." />
      ) : (
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#F0F0ED]">
                <th className="w-8 px-4 py-3" />
                <th className="text-left px-3 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Tarefa</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Projeto · Cliente</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Resp.</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Prioridade</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Status</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Prazo</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Origem</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((task, i) => {
                const pStyle     = AUTO_TASK_PRIORITY_STYLE[task.priority];
                const ownerColor = (AUTO_TASK_OWNER_STYLE as Record<string, { color: string }>)[task.owner]?.color ?? "#6B6B65";
                const isOverdue  = task.kind === "store" && task.dueDate && task.dueDate < today && task.storeStatus !== "done";

                return (
                  <tr
                    key={task.id}
                    className={`transition-colors ${i > 0 ? "border-t border-[#F0F0ED]" : ""} ${
                      task.storeStatus === "done" ? "opacity-50" : "hover:bg-[#FAFAF9]"
                    }`}
                  >
                    {/* Indicator */}
                    <td className="px-4 py-3.5">
                      {task.kind === "store" ? (
                        <button
                          onClick={() => task.storeStatus && updateTaskStatus(task.id, TASK_CYCLE[task.storeStatus])}
                          className={`w-4 h-4 rounded-[4px] border flex items-center justify-center transition-colors ${
                            task.storeStatus === "done"
                              ? "bg-[#5B5BD6] border-[#5B5BD6]"
                              : task.storeStatus === "blocked"
                              ? "bg-[#FEE2E2] border-[#DC2626]"
                              : task.storeStatus === "in_progress"
                              ? "border-[#5B5BD6] bg-[#EEF0FF]"
                              : "border-[#D0D0CC] hover:border-[#5B5BD6]"
                          }`}
                        >
                          {task.storeStatus === "done" && (
                            <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                              <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </button>
                      ) : (
                        <span className="w-4 h-4 rounded-[4px] bg-[#EEF0FF] border border-[#5B5BD6]/30 flex items-center justify-center text-[7px] text-[#5B5BD6] font-bold leading-none">
                          PM
                        </span>
                      )}
                    </td>

                    {/* Title */}
                    <td className="px-3 py-3.5 min-w-[200px] max-w-[280px]">
                      <div className={`text-[13px] font-medium ${task.storeStatus === "done" ? "line-through text-[#9B9B95]" : "text-[#1A1A1A]"}`}>
                        {task.title}
                      </div>
                      <div className="text-[11px] text-[#9B9B95] mt-0.5 line-clamp-1">{task.description}</div>
                    </td>

                    {/* Project · Client */}
                    <td className="px-4 py-3.5 min-w-[140px]">
                      <Link
                        href={`/agency/projects/${task.projectId}`}
                        className="text-[12px] font-medium text-[#1A1A1A] hover:text-[#5B5BD6] transition-colors block truncate max-w-[160px]"
                      >
                        {task.projectName}
                      </Link>
                      <div className="text-[11px] text-[#9B9B95] truncate max-w-[160px]">{task.clientName}</div>
                    </td>

                    {/* Owner */}
                    <td className="px-4 py-3.5">
                      <span className="text-[12px] font-medium" style={{ color: ownerColor }}>
                        {task.owner}
                      </span>
                    </td>

                    {/* Priority */}
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex h-5 px-2 rounded-full text-[10px] font-semibold items-center ${pStyle.bg} ${pStyle.text}`}>
                        {pStyle.label}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3.5">
                      {task.kind === "store" && task.storeStatus ? (
                        <span className={`inline-flex h-5 px-2 rounded-full text-[10px] font-semibold items-center ${
                          task.storeStatus === "done"        ? "bg-[#DCFCE7] text-[#16A34A]"
                          : task.storeStatus === "blocked"   ? "bg-[#FEE2E2] text-[#DC2626]"
                          : task.storeStatus === "in_progress" ? "bg-[#FEF3C7] text-[#D97706]"
                          : "bg-[#F0F0ED] text-[#9B9B95]"
                        }`}>
                          {task.storeStatus === "done"        ? "Concluída"
                            : task.storeStatus === "blocked"  ? "Bloqueada"
                            : task.storeStatus === "in_progress" ? "Em andamento"
                            : "Pendente"}
                        </span>
                      ) : (
                        <span className="inline-flex h-5 px-2 rounded-full text-[10px] font-semibold items-center bg-[#EEF0FF] text-[#5B5BD6]">
                          Sugerida
                        </span>
                      )}
                    </td>

                    {/* Due date */}
                    <td className="px-4 py-3.5">
                      {task.dueDate ? (
                        <span className={`text-[12px] ${isOverdue ? "text-[#DC2626] font-semibold" : "text-[#9B9B95]"}`}>
                          {isOverdue && "⚑ "}{task.dueDate.slice(5)}
                        </span>
                      ) : (
                        <span className="text-[12px] text-[#C0C0BC]">—</span>
                      )}
                    </td>

                    {/* Source */}
                    <td className="px-4 py-3.5">
                      <span className="text-[11px] text-[#9B9B95]">
                        {SOURCE_LABELS[task.source] ?? task.source}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5 justify-end">
                        {task.kind === "store" && task.storeStatus && task.storeStatus !== "done" && (
                          <>
                            <button
                              onClick={() => updateTaskStatus(task.id, "done")}
                              className="h-6 px-2 rounded-[5px] text-[10px] font-medium border border-[#E5E5E2] text-[#16A34A] hover:bg-[#F0FDF4] transition-colors"
                            >
                              Concluir
                            </button>
                            {task.storeStatus !== "blocked" ? (
                              <button
                                onClick={() => updateTaskStatus(task.id, "blocked")}
                                className="h-6 px-2 rounded-[5px] text-[10px] font-medium border border-[#E5E5E2] text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
                              >
                                Bloquear
                              </button>
                            ) : (
                              <button
                                onClick={() => updateTaskStatus(task.id, "pending")}
                                className="h-6 px-2 rounded-[5px] text-[10px] font-medium border border-[#E5E5E2] text-[#D97706] hover:bg-[#FFFBEB] transition-colors"
                              >
                                Reabrir
                              </button>
                            )}
                          </>
                        )}
                        {task.route && (
                          <Link
                            href={task.route}
                            className="h-6 w-6 flex items-center justify-center rounded-[5px] border border-[#E5E5E2] text-[#6B6B65] hover:border-[#5B5BD6] hover:text-[#5B5BD6] transition-colors text-[12px]"
                          >
                            →
                          </Link>
                        )}
                      </div>
                    </td>
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
