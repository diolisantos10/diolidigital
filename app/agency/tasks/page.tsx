"use client";

import { useState, useMemo, useCallback } from "react";
import { useAgencyStore } from "@/store/agency-store";
import { useDbTasks } from "@/lib/hooks/useDbTasks";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import EmptyState from "@/components/agency/ui/EmptyState";
import Link from "next/link";
import { MOCK_AGENTS, type TaskStatus } from "@/lib/agency/mock-data";
import {
  generateAllAutoTasks,
  AUTO_TASK_PRIORITY_STYLE,
  AUTO_TASK_OWNER_STYLE,
  type AutoTaskPriority,
  type AutoTask,
} from "@/lib/agency/orchestration/auto-tasks";

function SourceBadge({ source }: { source: "db" | "local" }) {
  return (
    <span className={`inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10px] font-semibold ${
      source === "db"
        ? "bg-[var(--success-bg)] text-[var(--success)]"
        : "bg-[var(--accent)] text-[var(--text-muted)]"
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${source === "db" ? "bg-[var(--success)]" : "bg-[var(--text-muted)]"}`} />
      {source === "db" ? "DB" : "Local"}
    </span>
  );
}

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
    projects, clients, deliverables,
    materialRequests, strategyRooms,
  } = useAgencyStore();

  const {
    tasks, source, loading,
    updateStatus: updateTaskStatus,
    createDbTask,
  } = useDbTasks();

  const [savingAutoId, setSavingAutoId] = useState<string | null>(null);

  const handleSaveAutoTask = useCallback(async (autoTask: AutoTask) => {
    setSavingAutoId(autoTask.id);
    await createDbTask({
      projectId:   autoTask.projectId,
      title:       autoTask.title,
      description: autoTask.description,
    });
    setSavingAutoId(null);
  }, [createDbTask]);

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

  const autoTaskById = useMemo(
    () => Object.fromEntries(autoTasks.map((t) => [t.id, t])),
    [autoTasks]
  );

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
        meta={
          <div className="flex items-center gap-2">
            {loading ? (
              <span className="text-[11px] text-[var(--text-muted)]">Carregando…</span>
            ) : (
              <SourceBadge source={source} />
            )}
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-[var(--border)] mb-6 -mt-2 overflow-x-auto scrollbar-none -mx-4 px-4 md:mx-0 md:px-0">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 h-9 px-4 text-[13px] font-medium border-b-2 whitespace-nowrap shrink-0 transition-colors ${
              tab === t
                ? "border-[var(--navy)] text-[var(--navy)]"
                : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {TAB_LABELS[t]}
            {counts[t] > 0 && (
              <span className={`inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full text-[10px] font-bold leading-none ${
                tab === t ? "bg-[var(--navy)] text-white" : "bg-[var(--accent)] text-[var(--text-muted)]"
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
          className="h-8 px-3 text-[13px] bg-white border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] placeholder:text-[var(--text-muted)] w-52"
        />
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="h-8 px-3 text-[12px] bg-white border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] text-[var(--text-secondary)]"
        >
          <option value="all">Todos os projetos</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as AutoTaskPriority | "all")}
          className="h-8 px-3 text-[12px] bg-white border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] text-[var(--text-secondary)]"
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
          className="h-8 px-3 text-[12px] bg-white border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] text-[var(--text-secondary)]"
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
            className="h-8 px-3 text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Limpar
          </button>
        )}
      </div>

      {/* Task Table */}
      {filtered.length === 0 ? (
        <EmptyState title="Nenhuma tarefa encontrada" description="Ajuste os filtros ou crie novas tarefas." />
      ) : (
        <>
        {/* Celular: 9 colunas não cabem em 375px nem rolando — vira cartão.
            Ver DESIGN.md §6.3. */}
        <ul className="md:hidden space-y-2 list-none p-0 m-0">
          {filtered.map((task) => {
            const pStyle     = AUTO_TASK_PRIORITY_STYLE[task.priority];
            const ownerColor = (AUTO_TASK_OWNER_STYLE as Record<string, { color: string }>)[task.owner]?.color ?? "var(--text-secondary)";
            const isOverdue  = task.kind === "store" && task.dueDate && task.dueDate < today && task.storeStatus !== "done";
            const statusLabel = task.kind === "store" && task.storeStatus
              ? (task.storeStatus === "done" ? "Concluída"
                : task.storeStatus === "blocked" ? "Bloqueada"
                : task.storeStatus === "in_progress" ? "Em andamento" : "Pendente")
              : "Sugerida";
            const statusClass = task.kind === "store" && task.storeStatus
              ? (task.storeStatus === "done" ? "bg-[var(--success-bg)] text-[var(--success)]"
                : task.storeStatus === "blocked" ? "bg-[#FEE2E2] text-[var(--danger)]"
                : task.storeStatus === "in_progress" ? "bg-[var(--warning-bg)] text-[var(--warning)]"
                : "bg-[var(--accent)] text-[var(--text-secondary)]")
              : "bg-[var(--accent-light)] text-[var(--navy)]";
            return (
              <li
                key={task.id}
                className={`bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 ${task.storeStatus === "done" ? "opacity-60" : ""}`}
              >
                <div className="flex items-start gap-3">
                  {task.kind === "store" ? (
                    <button
                      onClick={() => task.storeStatus && updateTaskStatus(task.id, TASK_CYCLE[task.storeStatus])}
                      aria-label={task.storeStatus === "done" ? "Reabrir tarefa" : "Avançar status da tarefa"}
                      className={`mt-0.5 w-5 h-5 shrink-0 rounded-[5px] border flex items-center justify-center transition-colors ${
                        task.storeStatus === "done"
                          ? "bg-[var(--navy)] border-[var(--navy)]"
                          : task.storeStatus === "blocked"
                          ? "bg-[#FEE2E2] border-[var(--danger)]"
                          : task.storeStatus === "in_progress"
                          ? "border-[var(--navy)] bg-[var(--accent-light)]"
                          : "border-[var(--border-strong)]"
                      }`}
                    >
                      {task.storeStatus === "done" && (
                        <svg width="9" height="7" viewBox="0 0 9 7" fill="none" aria-hidden="true">
                          <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </button>
                  ) : (
                    <span className="mt-0.5 w-5 h-5 shrink-0 rounded-[5px] bg-[var(--accent-light)] border border-[var(--navy)]/30 flex items-center justify-center text-[8px] text-[var(--navy)] font-bold leading-none">
                      PM
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className={`text-[14px] font-medium leading-snug ${task.storeStatus === "done" ? "line-through text-[var(--text-muted)]" : "text-[var(--text-primary)]"}`}>
                      {task.title}
                    </div>
                    <Link
                      href={`/agency/projects/${task.projectId}`}
                      className="text-[12px] text-[var(--text-secondary)] hover:text-[var(--navy)] transition-colors block mt-1 line-clamp-2"
                    >
                      {task.projectName} · {task.clientName}
                    </Link>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 mt-3">
                  <span className={`inline-flex h-5 px-2 rounded-full text-[11px] font-semibold items-center ${pStyle.bg} ${pStyle.text}`}>
                    {pStyle.label}
                  </span>
                  <span className={`inline-flex h-5 px-2 rounded-full text-[11px] font-semibold items-center ${statusClass}`}>
                    {statusLabel}
                  </span>
                </div>
                <p className="text-[12px] text-[var(--text-muted)] mt-1.5">
                  <span className="font-medium" style={{ color: ownerColor }}>{task.owner}</span>
                  {task.dueDate && (
                    <span className={isOverdue ? "text-[var(--danger)] font-semibold" : undefined}>
                      {" · "}{isOverdue && "⚑ "}{task.dueDate.slice(5)}
                    </span>
                  )}
                  {" · "}{SOURCE_LABELS[task.source] ?? task.source}
                </p>

                {(task.kind === "store" && task.storeStatus && task.storeStatus !== "done") ||
                 (task.kind === "auto" && source === "db") || task.route ? (
                  <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-[var(--border)]">
                    {task.kind === "store" && task.storeStatus && task.storeStatus !== "done" && (
                      <>
                        <button
                          onClick={() => updateTaskStatus(task.id, "done")}
                          className="h-8 px-3 rounded-[6px] text-[12px] font-medium border border-[var(--border)] text-[var(--success)]"
                        >
                          Concluir
                        </button>
                        {task.storeStatus !== "blocked" ? (
                          <button
                            onClick={() => updateTaskStatus(task.id, "blocked")}
                            className="h-8 px-3 rounded-[6px] text-[12px] font-medium border border-[var(--border)] text-[var(--danger)]"
                          >
                            Bloquear
                          </button>
                        ) : (
                          <button
                            onClick={() => updateTaskStatus(task.id, "pending")}
                            className="h-8 px-3 rounded-[6px] text-[12px] font-medium border border-[var(--border)] text-[var(--warning)]"
                          >
                            Reabrir
                          </button>
                        )}
                      </>
                    )}
                    {task.kind === "auto" && source === "db" && (
                      <button
                        onClick={() => { const at = autoTaskById[task.id]; if (at) handleSaveAutoTask(at); }}
                        disabled={savingAutoId === task.id}
                        className="h-8 px-3 rounded-[6px] text-[12px] font-medium border border-[var(--border)] text-[var(--navy)] disabled:opacity-50"
                      >
                        {savingAutoId === task.id ? "…" : "Salvar no DB"}
                      </button>
                    )}
                    {task.route && (
                      <Link
                        href={task.route}
                        className="h-8 px-3 inline-flex items-center rounded-[6px] border border-[var(--border)] text-[12px] text-[var(--text-secondary)]"
                      >
                        Abrir →
                      </Link>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>

        <div className="hidden md:block bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-x-auto">
          <table className="w-full min-w-[880px]">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="w-8 px-4 py-3" />
                <th className="text-left px-3 py-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Tarefa</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Projeto · Cliente</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Resp.</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Prioridade</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Status</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Prazo</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Origem</th>
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
                    className={`transition-colors ${i > 0 ? "border-t border-[var(--border)]" : ""} ${
                      task.storeStatus === "done" ? "opacity-50" : "hover:bg-[var(--bg-elevated)]"
                    }`}
                  >
                    {/* Indicator */}
                    <td className="px-4 py-3.5">
                      {task.kind === "store" ? (
                        <button
                          onClick={() => task.storeStatus && updateTaskStatus(task.id, TASK_CYCLE[task.storeStatus])}
                          className={`w-4 h-4 rounded-[4px] border flex items-center justify-center transition-colors ${
                            task.storeStatus === "done"
                              ? "bg-[var(--navy)] border-[var(--navy)]"
                              : task.storeStatus === "blocked"
                              ? "bg-[#FEE2E2] border-[var(--danger)]"
                              : task.storeStatus === "in_progress"
                              ? "border-[var(--navy)] bg-[var(--accent-light)]"
                              : "border-[var(--border-strong)] hover:border-[var(--navy)]"
                          }`}
                        >
                          {task.storeStatus === "done" && (
                            <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                              <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </button>
                      ) : (
                        <span className="w-4 h-4 rounded-[4px] bg-[var(--accent-light)] border border-[var(--navy)]/30 flex items-center justify-center text-[7px] text-[var(--navy)] font-bold leading-none">
                          PM
                        </span>
                      )}
                    </td>

                    {/* Title */}
                    <td className="px-3 py-3.5 min-w-[200px] max-w-[280px]">
                      <div className={`text-[13px] font-medium ${task.storeStatus === "done" ? "line-through text-[var(--text-muted)]" : "text-[var(--text-primary)]"}`}>
                        {task.title}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] mt-0.5 line-clamp-1">{task.description}</div>
                    </td>

                    {/* Project · Client */}
                    <td className="px-4 py-3.5 min-w-[140px]">
                      <Link
                        href={`/agency/projects/${task.projectId}`}
                        className="text-[12px] font-medium text-[var(--text-primary)] hover:text-[var(--navy)] transition-colors block truncate max-w-[160px]"
                      >
                        {task.projectName}
                      </Link>
                      <div className="text-[11px] text-[var(--text-muted)] truncate max-w-[160px]">{task.clientName}</div>
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
                          task.storeStatus === "done"        ? "bg-[var(--success-bg)] text-[var(--success)]"
                          : task.storeStatus === "blocked"   ? "bg-[#FEE2E2] text-[var(--danger)]"
                          : task.storeStatus === "in_progress" ? "bg-[var(--warning-bg)] text-[var(--warning)]"
                          : "bg-[var(--accent)] text-[var(--text-muted)]"
                        }`}>
                          {task.storeStatus === "done"        ? "Concluída"
                            : task.storeStatus === "blocked"  ? "Bloqueada"
                            : task.storeStatus === "in_progress" ? "Em andamento"
                            : "Pendente"}
                        </span>
                      ) : (
                        <span className="inline-flex h-5 px-2 rounded-full text-[10px] font-semibold items-center bg-[var(--accent-light)] text-[var(--navy)]">
                          Sugerida
                        </span>
                      )}
                    </td>

                    {/* Due date */}
                    <td className="px-4 py-3.5">
                      {task.dueDate ? (
                        <span className={`text-[12px] ${isOverdue ? "text-[var(--danger)] font-semibold" : "text-[var(--text-muted)]"}`}>
                          {isOverdue && "⚑ "}{task.dueDate.slice(5)}
                        </span>
                      ) : (
                        <span className="text-[12px] text-[var(--text-subtle)]">—</span>
                      )}
                    </td>

                    {/* Source */}
                    <td className="px-4 py-3.5">
                      <span className="text-[11px] text-[var(--text-muted)]">
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
                              className="h-6 px-2 rounded-[5px] text-[10px] font-medium border border-[var(--border)] text-[var(--success)] hover:bg-[#F0FDF4] transition-colors"
                            >
                              Concluir
                            </button>
                            {task.storeStatus !== "blocked" ? (
                              <button
                                onClick={() => updateTaskStatus(task.id, "blocked")}
                                className="h-6 px-2 rounded-[5px] text-[10px] font-medium border border-[var(--border)] text-[var(--danger)] hover:bg-[var(--danger-bg)] transition-colors"
                              >
                                Bloquear
                              </button>
                            ) : (
                              <button
                                onClick={() => updateTaskStatus(task.id, "pending")}
                                className="h-6 px-2 rounded-[5px] text-[10px] font-medium border border-[var(--border)] text-[var(--warning)] hover:bg-[#FFFBEB] transition-colors"
                              >
                                Reabrir
                              </button>
                            )}
                          </>
                        )}
                        {task.kind === "auto" && source === "db" && (
                          <button
                            onClick={() => { const at = autoTaskById[task.id]; if (at) handleSaveAutoTask(at); }}
                            disabled={savingAutoId === task.id}
                            className="h-6 px-2 rounded-[5px] text-[10px] font-medium border border-[var(--border)] text-[var(--navy)] hover:bg-[var(--accent-light)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {savingAutoId === task.id ? "…" : "Salvar no DB"}
                          </button>
                        )}
                        {task.route && (
                          <Link
                            href={task.route}
                            className="h-6 w-6 flex items-center justify-center rounded-[5px] border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--navy)] hover:text-[var(--navy)] transition-colors text-[12px]"
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
        </>
      )}
    </>
  );
}
