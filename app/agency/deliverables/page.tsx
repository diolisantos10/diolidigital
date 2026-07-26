"use client";

import { useState, useMemo } from "react";
import { useAgencyStore } from "@/store/agency-store";
import { useDbDeliverables } from "@/lib/hooks/useDbDeliverables";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import Badge from "@/components/agency/ui/Badge";
import EmptyState from "@/components/agency/ui/EmptyState";
import DeliverableDetailModal from "@/components/agency/deliverables/DeliverableDetailModal";
import { DeliverableStatus } from "@/lib/agency/mock-data";
import { getOwner, getVersion, needsRevision, getFeedbackExcerpt } from "@/lib/agency/deliverables";

function SourceBadge({ source }: { source: "db" | "local" }) {
  return (
    <span className={`inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10px] font-semibold ${
      source === "db" ? "bg-[var(--success-bg)] text-[var(--success)]" : "bg-[var(--accent)] text-[var(--text-muted)]"
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${source === "db" ? "bg-[var(--success)]" : "bg-[var(--text-muted)]"}`} />
      {source === "db" ? "DB" : "Local"}
    </span>
  );
}

const DELIVERABLE_CYCLE: Record<DeliverableStatus, DeliverableStatus> = {
  draft: "in_review", in_review: "approved", approved: "delivered", delivered: "draft",
};

export default function DeliverablesPage() {
  const { projects } = useAgencyStore();
  const { deliverables, source, loading, updateStatus: updateDeliverableStatus } = useDbDeliverables();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<DeliverableStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [detailId, setDetailId] = useState<string | null>(null);

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

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar entregas..."
          className="h-8 px-3 text-[13px] bg-white border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] placeholder:text-[var(--text-muted)] w-56"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as DeliverableStatus | "all")}
          className="h-8 px-3 text-[12px] bg-white border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] text-[var(--text-secondary)]"
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
          className="h-8 px-3 text-[12px] bg-white border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] text-[var(--text-secondary)]"
        >
          <option value="all">Todos os tipos</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="h-8 px-3 text-[12px] bg-white border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] text-[var(--text-secondary)]"
        >
          <option value="all">Todos os projetos</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {(statusFilter !== "all" || typeFilter !== "all" || projectFilter !== "all" || search) && (
          <button
            onClick={() => { setStatusFilter("all"); setTypeFilter("all"); setProjectFilter("all"); setSearch(""); }}
            className="h-8 px-3 text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >Limpar</button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="Nenhuma entrega encontrada" description="As entregas aparecem aqui conforme os agentes concluem suas tarefas." />
      ) : (
        <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Entrega</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Projeto</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Responsável</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Versão</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Status</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Data</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d, i) => {
                const project = getProject(d.projectId);
                const owner = getOwner(d);
                const revision = needsRevision(d);
                const excerpt = getFeedbackExcerpt(d);
                return (
                  <tr
                    key={d.id}
                    onClick={() => setDetailId(d.id)}
                    className={`group hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer ${i > 0 ? "border-t border-[var(--border)]" : ""}`}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-[var(--text-primary)] group-hover:text-[var(--navy)] transition-colors">{d.name}</span>
                        <span className="text-[11px] text-[var(--text-muted)] bg-[var(--accent)] px-1.5 py-0.5 rounded-[4px]">{d.type}</span>
                        {revision && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--warning-bg)] text-[var(--warning)]">Revisão necessária</span>
                        )}
                      </div>
                      {excerpt && (
                        <div className="text-[11px] text-[var(--text-muted)] mt-0.5 italic truncate max-w-[420px]">“{excerpt}”</div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-[13px] text-[var(--text-secondary)]">{project?.name ?? "—"}</td>
                    <td className="px-5 py-3.5 text-[13px] text-[var(--text-secondary)]">{owner.name}</td>
                    <td className="px-5 py-3.5 text-[12px] text-[var(--text-muted)] mono-num">v{getVersion(d)}</td>
                    <td className="px-5 py-3.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); updateDeliverableStatus(d.id, DELIVERABLE_CYCLE[d.status]); }}
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                        title="Clique para avançar o status"
                      >
                        <Badge variant={d.status} />
                      </button>
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-[var(--text-muted)]">{d.createdAt.slice(5)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <DeliverableDetailModal deliverableId={detailId} onClose={() => setDetailId(null)} />
    </>
  );
}
