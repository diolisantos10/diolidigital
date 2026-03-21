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
        title="Deliverables"
        subtitle={`${deliverables.length} deliverables across all projects`}
        meta={<p className="text-[12px] text-[#9B9B95]">Click a status badge to advance it through the workflow</p>}
      />

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search deliverables..."
          className="h-8 px-3 text-[13px] bg-white border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] placeholder:text-[#9B9B95] w-56"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as DeliverableStatus | "all")}
          className="h-8 px-3 text-[12px] bg-white border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] text-[#6B6B65]"
        >
          <option value="all">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="in_review">In Review</option>
          <option value="approved">Approved</option>
          <option value="delivered">Delivered</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-8 px-3 text-[12px] bg-white border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] text-[#6B6B65]"
        >
          <option value="all">All Types</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="h-8 px-3 text-[12px] bg-white border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] text-[#6B6B65]"
        >
          <option value="all">All Projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {(statusFilter !== "all" || typeFilter !== "all" || projectFilter !== "all" || search) && (
          <button
            onClick={() => { setStatusFilter("all"); setTypeFilter("all"); setProjectFilter("all"); setSearch(""); }}
            className="h-8 px-3 text-[12px] text-[#6B6B65] hover:text-[#1A1A1A]"
          >Clear</button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No deliverables found" description="Deliverables appear here as agents complete their tasks." />
      ) : (
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#F0F0ED]">
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Deliverable</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Project</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Type</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Version</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Status</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Date</th>
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
                        title="Click to advance status"
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
