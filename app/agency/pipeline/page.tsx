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

      {/* A sangria tem que casar com o padding do shell: `px-4` no celular,
          `md:px-8` daí pra cima. `-mx-8` fixo vazava 16px e cortava a primeira
          coluna a 375px. */}
      <div className="overflow-x-auto -mx-4 px-4 md:-mx-8 md:px-8">
        <div className="flex gap-3 min-w-max pb-4">
          {STAGES.map(({ key, label }) => {
            const stageProjects = projects.filter((p) => p.stage === key);
            return (
              <div key={key} className="w-[240px] shrink-0">
                {/* Column header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={key} />
                    <span className="text-[12px] text-[var(--text-muted)] mono-num">{stageProjects.length}</span>
                  </div>
                </div>

                {/* Cards */}
                <div className="space-y-2">
                  {stageProjects.map((project) => {
                    const client = getClient(project.clientId);
                    const isHighlighted = highlighted === project.id;
                    // Projeto sem prazo existe (briefing recem-chegado). Sem esta
                    // guarda o cartao mostrava literalmente "NaNd" ao usuario.
                    const prazo = project.deadline ? new Date(project.deadline).getTime() : NaN;
                    const daysLeft = Number.isNaN(prazo)
                      ? null
                      : Math.ceil((prazo - Date.now()) / (1000 * 60 * 60 * 24));
                    const overdue = daysLeft !== null && daysLeft < 0;
                    const atRisk = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7;
                    const currentIdx = STAGE_ORDER.indexOf(project.stage);

                    return (
                      <div
                        key={project.id}
                        className={`group bg-white rounded-[10px] border p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all duration-200 ${
                          isHighlighted
                            ? "border-[var(--navy)] shadow-[0_0_0_2px_rgba(91,91,214,0.15)]"
                            : "border-[var(--border)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
                        }`}
                      >
                        <Link href={`/agency/projects/${project.id}`}>
                          <div className="text-[13px] font-medium text-[var(--text-primary)] hover:text-[var(--navy)] transition-colors leading-snug mb-1">
                            {project.name}
                          </div>
                        </Link>
                        <div className="text-[11px] text-[var(--text-muted)] mb-3">{client?.name}</div>

                        <div className="flex items-center justify-between">
                          <Badge variant={project.priority} />
                          <span className={`text-[11px] font-medium mono-num ${
                            overdue ? "text-[var(--danger)]" : atRisk ? "text-[var(--warning)]" : "text-[var(--text-muted)]"
                          }`}>
                            {daysLeft === null ? "Sem prazo" : overdue ? "Atrasado" : `${daysLeft}d`}
                          </span>
                        </div>

                        {/* Move buttons */}
                        <div className="acao-revelada flex gap-1.5 mt-3">
                          <button
                            onClick={() => handleMove(project.id, "prev")}
                            disabled={currentIdx === 0}
                            className="flex-1 h-8 md:h-6 text-[12px] md:text-[11px] text-[var(--text-secondary)] bg-[var(--accent)] rounded-[5px] hover:bg-[var(--border)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            ← Ant.
                          </button>
                          <button
                            onClick={() => handleMove(project.id, "next")}
                            disabled={currentIdx === STAGE_ORDER.length - 1}
                            className="flex-1 h-8 md:h-6 text-[12px] md:text-[11px] text-[var(--text-secondary)] bg-[var(--accent)] rounded-[5px] hover:bg-[var(--border)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            Próx. →
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {stageProjects.length === 0 && (
                    <div className="h-16 rounded-[10px] border border-dashed border-[var(--border)] flex items-center justify-center">
                      <span className="text-[12px] text-[var(--text-subtle)]">Vazio</span>
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
