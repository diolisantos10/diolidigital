"use client";

import { useAgencyStore } from "@/store/agency-store";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import Link from "next/link";

const DEPTS = [
  { id: "strategy",           label: "Estratégia",    icon: "⚡" },
  { id: "social-media",       label: "Social",        icon: "📱" },
  { id: "design",             label: "Design",        icon: "🎨" },
  { id: "paid-traffic",       label: "Tráfego",       icon: "📊" },
  { id: "project-management", label: "PM",            icon: "🗂" },
];

export default function ControlRoomPage() {
  const {
    projects, clients, deliverables, clientPortalItems,
    runDepartmentIntelligence, getDepartmentMode,
  } = useAgencyStore();

  const active = projects.filter((p) => p.stage !== "completed");

  function runAll(projectId: string) {
    for (const dept of DEPTS) {
      const mode = getDepartmentMode(dept.id);
      if (mode !== "full_human") {
        runDepartmentIntelligence(dept.id, projectId);
      }
    }
  }

  return (
    <div className="space-y-6">
      <AgencyHeader
        title="Sala de Controle"
        subtitle={`${active.length} projeto${active.length !== 1 ? "s" : ""} em andamento`}
      />

      {active.length === 0 ? (
        <div className="bg-white rounded-[12px] border border-[#E5E5E2] px-8 py-16 text-center">
          <p className="text-[14px] font-medium text-[#1A1A1A]">Nenhum projeto ativo</p>
          <p className="text-[13px] text-[#9B9B95] mt-1">Crie um projeto a partir de uma solicitação para ver os agentes trabalhando aqui.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {active.map((project) => {
            const client = clients.find((c) => c.id === project.clientId);
            const pendingPortal = clientPortalItems.filter(
              (i) => i.projectId === project.id && i.status === "pending"
            );

            return (
              <div key={project.id} className="bg-white rounded-[12px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                {/* Project header */}
                <div className="flex items-center gap-4 px-5 py-4 bg-[#070A1F]">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/agency/projects/${project.id}`} className="text-[14px] font-semibold text-white hover:text-[#9AF5F0] transition-colors">
                        {project.name}
                      </Link>
                      <span className="text-white/40">·</span>
                      <span className="text-[12px] text-white/60">{client?.name ?? project.clientId}</span>
                      <span className="h-5 px-2 rounded-full bg-white/10 text-white/80 text-[9px] font-semibold uppercase tracking-wider">
                        {project.stage}
                      </span>
                    </div>
                    {project.goal && (
                      <p className="text-[11px] text-white/40 mt-0.5 truncate">{project.goal}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {pendingPortal.length > 0 && (
                      <Link href={`/portal/${project.clientId}`}>
                        <span className="h-6 px-2.5 rounded-full bg-[#FEF3C7] text-[#D97706] text-[10px] font-semibold inline-flex items-center gap-1">
                          ⚠ {pendingPortal.length} pendente{pendingPortal.length !== 1 ? "s" : ""} no portal
                        </span>
                      </Link>
                    )}
                    <button
                      onClick={() => runAll(project.id)}
                      className="h-7 px-3 rounded-[6px] bg-[#9AF5F0] text-[#070A1F] text-[11px] font-semibold hover:bg-[#7DEDE7] transition-colors"
                    >
                      ✦ Rodar todos os agentes
                    </button>
                  </div>
                </div>

                {/* Department grid */}
                <div className="grid grid-cols-5 divide-x divide-[#F0F0ED]">
                  {DEPTS.map((dept) => {
                    const deptDeliverables = deliverables.filter(
                      (d) => d.projectId === project.id && d.ownerAgentId
                    );
                    const count = deptDeliverables.length;
                    const mode = getDepartmentMode(dept.id);
                    const hasContent = count > 0;

                    return (
                      <div key={dept.id} className="px-4 py-4">
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className="text-[12px]">{dept.icon}</span>
                          <span className="text-[11px] font-semibold text-[#1A1A1A]">{dept.label}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mb-3">
                          <span className={`h-4 px-1.5 rounded-[3px] text-[9px] font-semibold ${
                            mode === "full_ai" ? "bg-[#070A1F] text-white"
                            : mode === "hybrid" ? "bg-[#DCFCE7] text-[#16A34A]"
                            : "bg-[#F0F0ED] text-[#9B9B95]"
                          }`}>
                            {mode === "full_ai" ? "100% IA" : mode === "hybrid" ? "Híbrido" : "Humano"}
                          </span>
                        </div>
                        {hasContent ? (
                          <div>
                            <p className="text-[11px] text-[#16A34A] font-medium">✓ {count} entrega{count !== 1 ? "s" : ""}</p>
                          </div>
                        ) : (
                          <p className="text-[11px] text-[#C0C0BC]">Aguardando…</p>
                        )}
                        {mode !== "full_human" && (
                          <button
                            onClick={() => runDepartmentIntelligence(dept.id, project.id)}
                            className="mt-2 h-6 px-2 rounded-[5px] border border-[#E5E5E2] text-[10px] text-[#6B6B65] hover:border-[#070A1F] hover:text-[#070A1F] transition-colors w-full"
                          >
                            Rodar
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
