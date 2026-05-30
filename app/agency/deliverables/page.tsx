"use client";

import { useState, useMemo } from "react";
import { useAgencyStore } from "@/store/agency-store";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import Badge from "@/components/agency/ui/Badge";
import EmptyState from "@/components/agency/ui/EmptyState";
import { DeliverableStatus } from "@/lib/agency/mock-data";

const DELIVERABLE_CYCLE: Record<DeliverableStatus, DeliverableStatus> = {
  draft: "in_review", in_review: "approved", approved: "delivered", delivered: "draft",
};

export default function DeliverablesPage() {
  const { deliverables, projects, updateDeliverableStatus } = useAgencyStore();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<DeliverableStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");

  const types = [...new Set(deliverables.map((d) => d.type))];

  const filtered = useMemo(() => {
    return deliverables
      .filter((d) => statusFilter === "all" || d.status === statusFilter)
      .filter((d) => typeFilter === "all" || d.type === typeFilter)
      .filter((d) => projectFilter === "all" || d.projectId === projectFilter)
      .filter((d) =>
        !search ||
        d.name.toLowerCase().includes(search.toLowerCase()) ||
        d.type.toLowerCase().includes(search.toLowerCase())
      );
  }, [deliverables, statusFilter, typeFilter, projectFilter, search]);

  const getProject = (id: string) => projects.find((p) => p.id === id);

  return (
    <>
      <AgencyHeader
        title="Entregas"
        subtitle={`${deliverables.length} entrega${deliverables.length !== 1 ? "s" : ""} em todos os projetos`}
        meta={<p className="text-[12px] text-[#9B9B95]">Clique no badge de status para avançar no fluxo</p>}
      />

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar entregas..."
          className="h-8 px-3 text-[13px] bg-white border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] placeholder:text-[#9B9B95] w-56"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as DeliverableStatus | "all")}
          className="h-8 px-3 text-[12px] bg-white border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] text-[#6B6B65]"
        >
          <option value="all">Todos os status</option>
          <option value="draft">Rascunho</option>
          <option value="in_review">Em Revisão</option>
          <option value="approved">Aprovado</option>
          <option value="delivered">Entregue</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-8 px-3 text-[12px] bg-white border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] text-[#6B6B65]"
        >
          <option value="all">Todos os tipos</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="h-8 px-3 text-[12px] bg-white border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] text-[#6B6B65]"
        >
          <option value="all">Todos os projetos</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {(statusFilter !== "all" || typeFilter !== "all" || projectFilter !== "all" || search) && (
          <button
            onClick={() => { setStatusFilter("all"); setTypeFilter("all"); setProjectFilter("all"); setSearch(""); }}
            className="h-8 px-3 text-[12px] text-[#6B6B65] hover:text-[#1A1A1A]"
          >Limpar</button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="Nenhuma entrega encontrada" description="As entregas aparecem aqui conforme os agentes concluem suas tarefas." />
      ) : (
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#F0F0ED]">
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Entrega</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Projeto</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Tipo</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Versão</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Status</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Data</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d, i) => {
                const project = getProject(d.projectId);
                return (
                  <tr key={d.id} className={`hover:bg-[#FAFAF9] transition-colors ${i > 0 ? "border-t border-[#F0F0ED]" : ""}`}>
                    <td className="px-5 py-3.5 text-[13px] font-medium text-[#1A1A1A]">{d.name}</td>
                    <td className="px-5 py-3.5 text-[13px] text-[#6B6B65]">{project?.name ?? "—"}</td>
                    <td className="px-5 py-3.5">
                      <span className="text-[12px] text-[#6B6B65] bg-[#F0F0ED] px-2 py-0.5 rounded-[5px]">{d.type}</span>
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-[#9B9B95] mono-num">v{d.version}</td>
                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => updateDeliverableStatus(d.id, DELIVERABLE_CYCLE[d.status])}
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                        title="Clique para avançar o status"
                      >
                        <Badge variant={d.status} />
                      </button>
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-[#9B9B95]">{d.createdAt.slice(5)}</td>
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
