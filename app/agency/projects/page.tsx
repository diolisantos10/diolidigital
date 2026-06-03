"use client";

import { useState, useMemo } from "react";
import { useAgencyStore } from "@/store/agency-store";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import Badge from "@/components/agency/ui/Badge";
import Button from "@/components/agency/ui/Button";
import EmptyState from "@/components/agency/ui/EmptyState";
import Link from "next/link";
import { Priority, ProjectStage } from "@/lib/agency/mock-data";

type SortKey = "deadline" | "priority" | "name";

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

// pt-BR stage labels — kept in sync with Badge labels for terminology consistency.
const STAGE_LABELS: Record<ProjectStage, string> = {
  briefing: "Briefing", proposal_sent: "Proposta Enviada", approved: "Aprovado",
  diagnosis: "Diagnóstico", planning: "Planejamento", production: "Produção",
  review: "Revisão", delivery: "Entrega", ongoing: "Em Andamento", completed: "Concluído",
};

export default function ProjectsPage() {
  const { projects, clients, tasks } = useAgencyStore();
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState<ProjectStage | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");
  const [sortBy, setSortBy] = useState<SortKey>("deadline");

  const filtered = useMemo(() => {
    return projects
      .filter((p) => clientFilter === "all" || p.clientId === clientFilter)
      .filter((p) => stageFilter === "all" || p.stage === stageFilter)
      .filter((p) => priorityFilter === "all" || p.priority === priorityFilter)
      .filter((p) =>
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.goal.toLowerCase().includes(search.toLowerCase()) ||
        clients.find((c) => c.id === p.clientId)?.name.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => {
        if (sortBy === "deadline") return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
        if (sortBy === "priority") return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        return a.name.localeCompare(b.name);
      });
  }, [projects, clients, search, clientFilter, stageFilter, priorityFilter, sortBy]);

  const getClient = (id: string) => clients.find((c) => c.id === id);

  const getProgress = (projectId: string) => {
    const projectTasks = tasks.filter((t) => t.projectId === projectId);
    if (projectTasks.length === 0) return { done: 0, total: 0, pct: 0 };
    const done = projectTasks.filter((t) => t.status === "done").length;
    return { done, total: projectTasks.length, pct: Math.round((done / projectTasks.length) * 100) };
  };

  const clearFilters = () => {
    setSearch(""); setClientFilter("all"); setStageFilter("all"); setPriorityFilter("all");
  };
  const hasFilters = search || clientFilter !== "all" || stageFilter !== "all" || priorityFilter !== "all";

  return (
    <>
      <AgencyHeader
        title="Projetos"
        subtitle={`${projects.length} projeto${projects.length !== 1 ? "s" : ""} no total`}
        actions={
          <Link href="/agency/orchestrator">
            <Button variant="primary">+ Novo Projeto</Button>
          </Link>
        }
      />

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar projetos..."
          className="h-8 px-3 text-[13px] bg-white border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] placeholder:text-[#9B9B95] w-56"
        />
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="h-8 px-3 text-[12px] bg-white border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] text-[#6B6B65]"
        >
          <option value="all">Todos os clientes</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value as ProjectStage | "all")}
          className="h-8 px-3 text-[12px] bg-white border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] text-[#6B6B65]"
        >
          <option value="all">Todas as etapas</option>
          {(["briefing","diagnosis","planning","production","review","delivery","ongoing","completed"] as const).map((s) => (
            <option key={s} value={s}>{STAGE_LABELS[s]}</option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as Priority | "all")}
          className="h-8 px-3 text-[12px] bg-white border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] text-[#6B6B65]"
        >
          <option value="all">Todas as prioridades</option>
          <option value="high">Alta</option>
          <option value="medium">Média</option>
          <option value="low">Baixa</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          className="h-8 px-3 text-[12px] bg-white border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] text-[#6B6B65]"
        >
          <option value="deadline">Ordenar: Prazo</option>
          <option value="priority">Ordenar: Prioridade</option>
          <option value="name">Ordenar: Nome</option>
        </select>
        {hasFilters && (
          <button onClick={clearFilters} className="h-8 px-3 text-[12px] text-[#6B6B65] hover:text-[#1A1A1A] transition-colors">
            Limpar filtros
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Nenhum projeto encontrado"
          description={hasFilters ? "Tente ajustar os filtros." : "Use o Orquestrador para criar seu primeiro projeto."}
          action={<Link href="/agency/orchestrator"><Button variant="primary">Abrir Orquestrador</Button></Link>}
        />
      ) : (
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#F0F0ED]">
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Projeto</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Cliente</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Etapa</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Prioridade</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Progresso</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Prazo</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((project, i) => {
                const client = getClient(project.clientId);
                const { done, total, pct } = getProgress(project.id);
                const daysLeft = Math.ceil((new Date(project.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                const overdue = daysLeft < 0;
                return (
                  <tr key={project.id} className={`group hover:bg-[#FAFAF9] transition-colors ${i > 0 ? "border-t border-[#F0F0ED]" : ""}`}>
                    <td className="px-5 py-3.5">
                      <Link href={`/agency/projects/${project.id}`}>
                        <div className="text-[13px] font-medium text-[#1A1A1A] group-hover:text-[#5B5BD6] transition-colors">
                          {project.name}
                        </div>
                        <div className="text-[11px] text-[#9B9B95]">{project.type}</div>
                      </Link>
                    </td>
                    <td className="px-5 py-3.5">
                      {client && (
                        <Link href={`/agency/clients/${client.id}`} className="text-[13px] text-[#6B6B65] hover:text-[#1A1A1A] transition-colors">
                          {client.name}
                        </Link>
                      )}
                    </td>
                    <td className="px-5 py-3.5"><Badge variant={project.stage} /></td>
                    <td className="px-5 py-3.5"><Badge variant={project.priority} /></td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-[#F0F0ED] rounded-full overflow-hidden">
                          <div className="h-full bg-[#5B5BD6] rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[11px] text-[#9B9B95] mono-num">{done}/{total}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-[12px] mono-num font-medium ${overdue ? "text-[#DC2626]" : daysLeft <= 7 ? "text-[#D97706]" : "text-[#6B6B65]"}`}>
                        {overdue ? "Atrasado" : `${daysLeft}d`}
                      </span>
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
