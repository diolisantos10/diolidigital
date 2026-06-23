"use client";

import { useState } from "react";
import { useAgencyStore } from "@/store/agency-store";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import Badge from "@/components/agency/ui/Badge";
import Link from "next/link";
import { ProjectStage } from "@/lib/agency/mock-data";

const STAGES: { key: ProjectStage; label: string }[] = [
  { key: "briefing", label: "Briefing" },
  { key: "diagnosis", label: "Diagnóstico" },
  { key: "planning", label: "Planejamento" },
  { key: "production", label: "Produção" },
  { key: "review", label: "Revisão" },
  { key: "delivery", label: "Entrega" },
  { key: "ongoing", label: "Em Andamento" },
  { key: "completed", label: "Concluído" },
];

const STAGE_ORDER = STAGES.map((s) => s.key);

export default function PipelinePage() {
  const { projects, clients, moveProjectStage } = useAgencyStore();
  const [highlighted, setHighlighted] = useState<string | null>(null);

  const getClient = (clientId: string) => clients.find((c) => c.id === clientId);

  const handleMove = (projectId: string, direction: "prev" | "next") => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    const currentIdx = STAGE_ORDER.indexOf(project.stage);
    const newIdx = direction === "next" ? currentIdx + 1 : currentIdx - 1;
    if (newIdx < 0 || newIdx >= STAGE_ORDER.length) return;
    moveProjectStage(projectId, STAGE_ORDER[newIdx]);
    setHighlighted(projectId);
    setTimeout(() => setHighlighted(null), 1500);
  };

  return (
    <>
      <AgencyHeader
        title="Quadro de Pipeline"
        subtitle={`${projects.filter((p) => p.stage !== "completed").length} projeto${projects.filter((p) => p.stage !== "completed").length !== 1 ? "s" : ""} ativo${projects.filter((p) => p.stage !== "completed").length !== 1 ? "s" : ""} em andamento`}
      />

      <div className="overflow-x-auto -mx-8 px-8">
        <div className="flex gap-3 min-w-max pb-4">
          {STAGES.map(({ key, label }) => {
            const stageProjects = projects.filter((p) => p.stage === key);
            return (
              <div key={key} className="w-[240px] shrink-0">
                {/* Column header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={key} />
                    <span className="text-[12px] text-[#9B9B95] mono-num">{stageProjects.length}</span>
                  </div>
                </div>

                {/* Cards */}
                <div className="space-y-2">
                  {stageProjects.map((project) => {
                    const client = getClient(project.clientId);
                    const isHighlighted = highlighted === project.id;
                    const daysLeft = Math.ceil(
                      (new Date(project.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                    );
                    const overdue = daysLeft < 0;
                    const atRisk = daysLeft >= 0 && daysLeft <= 7;
                    const currentIdx = STAGE_ORDER.indexOf(project.stage);

                    return (
                      <div
                        key={project.id}
                        className={`group bg-white rounded-[10px] border p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all duration-200 ${
                          isHighlighted
                            ? "border-[#070A1F] shadow-[0_0_0_2px_rgba(91,91,214,0.15)]"
                            : "border-[#E5E5E2] hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
                        }`}
                      >
                        <Link href={`/agency/projects/${project.id}`}>
                          <div className="text-[13px] font-medium text-[#1A1A1A] hover:text-[#070A1F] transition-colors leading-snug mb-1">
                            {project.name}
                          </div>
                        </Link>
                        <div className="text-[11px] text-[#9B9B95] mb-3">{client?.name}</div>

                        <div className="flex items-center justify-between">
                          <Badge variant={project.priority} />
                          <span className={`text-[11px] font-medium mono-num ${
                            overdue ? "text-[#DC2626]" : atRisk ? "text-[#D97706]" : "text-[#9B9B95]"
                          }`}>
                            {overdue ? "Atrasado" : `${daysLeft}d`}
                          </span>
                        </div>

                        {/* Move buttons */}
                        <div className="flex gap-1.5 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleMove(project.id, "prev")}
                            disabled={currentIdx === 0}
                            className="flex-1 h-6 text-[11px] text-[#6B6B65] bg-[#F0F0ED] rounded-[5px] hover:bg-[#E8E8E5] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            ← Ant.
                          </button>
                          <button
                            onClick={() => handleMove(project.id, "next")}
                            disabled={currentIdx === STAGE_ORDER.length - 1}
                            className="flex-1 h-6 text-[11px] text-[#6B6B65] bg-[#F0F0ED] rounded-[5px] hover:bg-[#E8E8E5] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            Próx. →
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {stageProjects.length === 0 && (
                    <div className="h-16 rounded-[10px] border border-dashed border-[#E5E5E2] flex items-center justify-center">
                      <span className="text-[12px] text-[#C0C0BC]">Vazio</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
