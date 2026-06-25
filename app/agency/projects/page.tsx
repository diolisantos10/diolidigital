"use client";

import { useState, useMemo, useCallback } from "react";
import { useAgencyStore } from "@/store/agency-store";
import { useDbProjects } from "@/lib/hooks/useDbProjects";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import Badge from "@/components/agency/ui/Badge";
import Button from "@/components/agency/ui/Button";
import EmptyState from "@/components/agency/ui/EmptyState";
import Link from "next/link";
import { Priority, ProjectStage } from "@/lib/agency/mock-data";

type SortKey = "deadline" | "priority" | "name";

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

const STAGE_LABELS: Record<ProjectStage, string> = {
  briefing: "Briefing", proposal_sent: "Proposta Enviada", approved: "Aprovado",
  diagnosis: "Diagnóstico", planning: "Planejamento", production: "Produção",
  review: "Revisão", delivery: "Entrega", ongoing: "Em Andamento", completed: "Concluído",
};

function SourceBadge({ source }: { source: "db" | "local" | "mixed" }) {
  const config = {
    db:    { bg: "bg-[#DCFCE7] text-[#16A34A]", dot: "bg-[#16A34A]", label: "DB" },
    local: { bg: "bg-[#F0F0ED] text-[#9B9B95]", dot: "bg-[#9B9B95]", label: "Local" },
    mixed: { bg: "bg-[#FEF3C7] text-[#D97706]", dot: "bg-[#D97706]", label: "DB + Local" },
  }[source];
  return (
    <span className={`inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10px] font-semibold ${config.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

export default function ProjectsPage() {
  const { clients, tasks, currentRole, deleteProject } = useAgencyStore();
  const { projects, source, loading } = useDbProjects();

  const isMaster = currentRole === "master";
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const handleDelete = useCallback((id: string) => {
    setDeleteTarget(null);
    deleteProject(id);
  }, [deleteProject]);

  const [search, setSearch]             = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [stageFilter, setStageFilter]   = useState<ProjectStage | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");
  const [sortBy, setSortBy]             = useState<SortKey>("deadline");

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
    const pt = tasks.filter((t) => t.projectId === projectId);
    if (pt.length === 0) return { done: 0, total: 0, pct: 0 };
    const done = pt.filter((t) => t.status === "done").length;
    return { done, total: pt.length, pct: Math.round((done / pt.length) * 100) };
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
        meta={
          <div className="flex items-center gap-2">
            {loading ? (
              <span className="text-[11px] text-[#9B9B95]">Carregando…</span>
            ) : (
              <SourceBadge source={source} />
            )}
          </div>
        }
        actions={
          <>
            {isMaster && source !== "db" && projects.length > 0 && (
              <button
                onClick={() => {
                  if (!confirm(`Apagar todos os ${projects.length} projetos locais? Esta ação não pode ser desfeita.`)) return;
                  projects.forEach((p) => deleteProject(p.id));
                }}
                className="h-8 px-3 rounded-[7px] border border-[#FCA5A5] bg-[#FEF2F2] text-[#DC2626] hover:border-[#F87171] text-[11px] font-semibold transition-colors inline-flex items-center gap-1.5"
                title="Apaga todos os projetos do localStorage"
              >
                <span className="text-[10px]">⟲</span>
                Limpar projetos locais ({projects.length})
                <span className="h-3.5 px-1 rounded-[3px] bg-[#DC2626] text-white text-[8px] font-bold leading-[14px]">ADMIN</span>
              </button>
            )}
            <Link href="/agency/orchestrator">
              <Button variant="primary">+ Novo Projeto</Button>
            </Link>
          </>
        }
      />

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar projetos..."
          className="h-8 px-3 text-[13px] bg-white border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#070A1F] placeholder:text-[#9B9B95] w-56"
        />
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="h-8 px-3 text-[12px] bg-white border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#070A1F] text-[#6B6B65]"
        >
          <option value="all">Todos os clientes</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value as ProjectStage | "all")}
          className="h-8 px-3 text-[12px] bg-white border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#070A1F] text-[#6B6B65]"
        >
          <option value="all">Todas as etapas</option>
          {(["briefing","diagnosis","planning","production","review","delivery","ongoing","completed"] as const).map((s) => (
            <option key={s} value={s}>{STAGE_LABELS[s]}</option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as Priority | "all")}
          className="h-8 px-3 text-[12px] bg-white border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#070A1F] text-[#6B6B65]"
        >
          <option value="all">Todas as prioridades</option>
          <option value="high">Alta</option>
          <option value="medium">Média</option>
          <option value="low">Baixa</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          className="h-8 px-3 text-[12px] bg-white border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#070A1F] text-[#6B6B65]"
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
        <div className="bg-white rounded-[12px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#F0F0ED]">
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Projeto</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Cliente</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Etapa</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Prioridade</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Progresso</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Prazo</th>
                {isMaster && source !== "db" && <th className="px-5 py-3" />}
              </tr>
            </thead>
            <tbody>
              {filtered.map((project, i) => {
                const client = getClient(project.clientId);
                const { done, total, pct } = getProgress(project.id);
                const daysLeft = project.deadline
                  ? Math.ceil((new Date(project.deadline).getTime() - Date.now()) / 86400000)
                  : null;
                const overdue = daysLeft !== null && daysLeft < 0;
                return (
                  <tr key={project.id} className={`group hover:bg-[#FAFAF9] transition-colors ${i > 0 ? "border-t border-[#F0F0ED]" : ""}`}>
                    <td className="px-5 py-3.5">
                      <Link href={`/agency/projects/${project.id}`}>
                        <div className="text-[13px] font-medium text-[#1A1A1A] group-hover:text-[#070A1F] transition-colors">
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
                          <div className="h-full bg-[#070A1F] rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[11px] text-[#9B9B95] mono-num">{done}/{total}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      {daysLeft === null ? (
                        <span className="text-[12px] text-[#9B9B95]">—</span>
                      ) : (
                        <span className={`text-[12px] mono-num font-medium ${overdue ? "text-[#DC2626]" : daysLeft <= 7 ? "text-[#D97706]" : "text-[#6B6B65]"}`}>
                          {overdue ? "Atrasado" : `${daysLeft}d`}
                        </span>
                      )}
                    </td>
                    {isMaster && source !== "db" && (
                      <td className="px-5 py-3.5">
                        {deleteTarget === project.id ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleDelete(project.id)}
                              className="h-6 px-2 rounded-[5px] bg-[#DC2626] text-white text-[10px] font-semibold hover:bg-[#B91C1C] transition-colors"
                            >
                              Confirmar
                            </button>
                            <button
                              onClick={() => setDeleteTarget(null)}
                              className="h-6 px-2 rounded-[5px] border border-[#E5E5E2] text-[#6B6B65] text-[10px] hover:bg-[#F0F0ED] transition-colors"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteTarget(project.id)}
                            title="Apagar projeto local"
                            className="opacity-0 group-hover:opacity-100 h-6 w-6 rounded-[5px] border border-[#FCA5A5] text-[#DC2626] hover:bg-[#FEF2F2] flex items-center justify-center transition-all"
                          >
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                              <path d="M3 4.5h10M6.5 4.5V3.5a1 1 0 011-1h1a1 1 0 011 1v1M5 4.5l.5 8a1 1 0 001 1h3a1 1 0 001-1l.5-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                        )}
                      </td>
                    )}
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
