"use client";

import { useState } from "react";
import Link from "next/link";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import { useAgencyStore } from "@/store/agency-store";
import { DEPARTMENT_DEFS } from "@/lib/agency/departments";

// ─── Maestro — CEO / COO Operations Panel ────────────────────────────────────
//
// Central command panel. All 7 AI departments at a glance: status, active work,
// quick-launch to each agent, and the canvas chain that links them.
// ─────────────────────────────────────────────────────────────────────────────

interface AgentMeta {
  deptId: string;
  label: string;
  role: string;
  color: string;
  accentBg: string;
  agentRoute: string | null;
  brainRoute: string | null;
  deliverableTypes: string[];
}

const AGENT_REGISTRY: AgentMeta[] = [
  {
    deptId: "project-management",
    label: "Gestão de Projetos",
    role: "PM Agent",
    color: "#1A1A1A",
    accentBg: "#F0F0ED",
    agentRoute: "/agency/pm-agent",
    brainRoute: null,
    deliverableTypes: ["planning", "document"],
  },
  {
    deptId: "strategy",
    label: "Estratégia",
    role: "Strategy Agent",
    color: "#7C3AED",
    accentBg: "#F5F3FF",
    agentRoute: "/agency/strategy-agent",
    brainRoute: "/agency/strategy",
    deliverableTypes: ["strategy_document", "planning"],
  },
  {
    deptId: "brand-hub",
    label: "Brand Hub",
    role: "Brand Guardian",
    color: "#C2530A",
    accentBg: "#FFF7ED",
    agentRoute: "/agency/brand-hub-agent",
    brainRoute: null,
    deliverableTypes: ["document", "design"],
  },
  {
    deptId: "social-media",
    label: "Social Media",
    role: "Social Agent",
    color: "#E53E3E",
    accentBg: "#FFF5F5",
    agentRoute: "/agency/social-media-agent",
    brainRoute: "/agency/social",
    deliverableTypes: ["social_media"],
  },
  {
    deptId: "design",
    label: "Design",
    role: "Design Agent",
    color: "#2563EB",
    accentBg: "#EFF6FF",
    agentRoute: "/agency/design-agent",
    brainRoute: "/agency/design",
    deliverableTypes: ["design"],
  },
  {
    deptId: "paid-traffic",
    label: "Tráfego Pago",
    role: "Ads Agent",
    color: "#0E7490",
    accentBg: "#ECFEFF",
    agentRoute: "/agency/ads-agent",
    brainRoute: "/agency/traffic",
    deliverableTypes: ["paid_traffic"],
  },
  {
    deptId: "operations",
    label: "Operações",
    role: "System Doctor",
    color: "#059669",
    accentBg: "#ECFDF5",
    agentRoute: "/agency/operations-agent",
    brainRoute: null,
    deliverableTypes: [],
  },
];

const CANVAS_CHAIN = [
  { label: "Strategy Canvas", dept: "strategy", color: "#7C3AED" },
  { label: "Social Canvas",   dept: "social-media", color: "#E53E3E" },
  { label: "Design Canvas",   dept: "design", color: "#2563EB" },
  { label: "Traffic Canvas",  dept: "paid-traffic", color: "#0E7490" },
  { label: "Analytics",       dept: null, color: "#6B6B65" },
  { label: "Quality Gate",    dept: null, color: "#6B6B65" },
];

export default function MaestroPage() {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const { projects, clients, deliverables } = useAgencyStore();

  const linkedProject = selectedProjectId ? projects.find((p) => p.id === selectedProjectId) : null;
  const linkedClient  = linkedProject ? clients.find((c) => c.id === linkedProject.clientId) : null;

  const getDelivCount = (types: string[]) =>
    deliverables.filter((d) =>
      (selectedProjectId ? d.projectId === selectedProjectId : true) &&
      types.some((t) => d.type === t)
    ).length;

  return (
    <div className="flex flex-col min-h-screen bg-[#F7F7F6]">
      <AgencyHeader
        title="Painel Maestro"
        subtitle="Visão unificada dos 7 agentes de IA — comando central da agência."
      />

      <div className="flex-1 p-6 max-w-[1200px] mx-auto w-full space-y-6">
        {/* ── Top bar ── */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#EEF0FF] text-[#5B5BD6]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#5B5BD6]" />
              7 Departamentos · ✦ Dioli Brain
            </span>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[12px] text-[#9B9B95]">Contexto:</span>
            <select
              value={selectedProjectId ?? ""}
              onChange={(e) => setSelectedProjectId(e.target.value || null)}
              className="h-8 px-3 text-[12px] bg-white border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#5B5BD6] transition-colors"
            >
              <option value="">— todos os projetos —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {linkedProject && (
              <Link href={`/agency/projects/${linkedProject.id}`} className="text-[12px] text-[#5B5BD6] hover:underline">
                Ver projeto →
              </Link>
            )}
          </div>
        </div>

        {/* ── Canvas Chain ── */}
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4">
          <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-3">Cadeia de Canvas — fluxo de raciocínio</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {CANVAS_CHAIN.map((c, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span
                  className="px-2.5 py-1 rounded-full text-[11px] font-semibold text-white"
                  style={{ backgroundColor: c.color, opacity: c.dept ? 1 : 0.4 }}
                >
                  {c.label}
                </span>
                {i < CANVAS_CHAIN.length - 1 && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6h8M7 3l3 3-3 3" stroke="#C0C0BC" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[#9B9B95] mt-2.5 leading-relaxed">
            Cada departamento alimenta o próximo. Strategy Canvas → Social Canvas → Design Canvas → Traffic Canvas → Quality Gate.
          </p>
        </div>

        {/* ── 7 Agents Grid ── */}
        <div>
          <p className="text-[13px] font-semibold text-[#1A1A1A] mb-3">Agentes de IA — Status</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {AGENT_REGISTRY.map((agent) => {
              const delivCount = getDelivCount(agent.deliverableTypes);
              const deptDef = DEPARTMENT_DEFS.find((d) => d.id === agent.deptId);
              const hasPage = !!agent.agentRoute;

              return (
                <div
                  key={agent.deptId}
                  className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden"
                >
                  {/* Header */}
                  <div className="px-4 pt-4 pb-3 border-b border-[#F0F0ED]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-[7px] flex items-center justify-center text-[13px] font-bold text-white shrink-0"
                          style={{ backgroundColor: agent.color }}>
                          {agent.label[0]}
                        </div>
                        <div>
                          <p className="text-[13px] font-semibold text-[#1A1A1A] leading-tight">{agent.label}</p>
                          <p className="text-[11px] text-[#9B9B95]">{agent.role}</p>
                        </div>
                      </div>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${hasPage ? "text-white" : "bg-[#F0F0ED] text-[#9B9B95]"}`}
                        style={hasPage ? { backgroundColor: agent.color } : {}}>
                        {hasPage ? "✦ IA" : "em breve"}
                      </span>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="px-4 py-3">
                    <div className="flex items-center gap-4 mb-3">
                      <div className="text-center">
                        <p className="text-[16px] font-bold text-[#1A1A1A]">{delivCount}</p>
                        <p className="text-[9px] text-[#9B9B95]">entregas</p>
                      </div>
                      <div className="flex-1 text-[11px] text-[#6B6B65] leading-snug">
                        {deptDef?.mission.slice(0, 80) ?? ""}…
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {agent.agentRoute ? (
                        <Link
                          href={selectedProjectId
                            ? `${agent.agentRoute}?projectId=${selectedProjectId}`
                            : agent.agentRoute}
                          className="flex-1 h-7 rounded-[6px] text-[11px] font-semibold text-center inline-flex items-center justify-center text-white transition-colors hover:opacity-90"
                          style={{ backgroundColor: agent.color }}
                        >
                          Abrir Agente →
                        </Link>
                      ) : (
                        <span className="flex-1 h-7 rounded-[6px] text-[11px] font-medium text-center inline-flex items-center justify-center bg-[#F0F0ED] text-[#9B9B95] cursor-not-allowed">
                          Em construção
                        </span>
                      )}
                      {agent.brainRoute && (
                        <Link
                          href={agent.brainRoute}
                          className="h-7 px-2.5 rounded-[6px] text-[11px] font-medium border border-[#E5E5E2] text-[#6B6B65] hover:border-current transition-colors whitespace-nowrap"
                          style={{ "--hover-color": agent.color } as React.CSSProperties}
                        >
                          Brain →
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Pilot CTA ── */}
        <div className="bg-[#F5F3FF] border border-[#DDD6FE] rounded-[10px] px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-[13px] font-semibold text-[#7C3AED]">Piloto Sushi Cazza</p>
            <p className="text-[12px] text-[#6B6B65] mt-0.5">Guia passo a passo para rodar o pipeline completo com o primeiro cliente real.</p>
          </div>
          <Link href="/agency/pilot"
            className="h-9 px-5 rounded-[8px] text-[13px] font-semibold text-white bg-[#7C3AED] hover:bg-[#6D28D9] transition-colors shrink-0">
            Iniciar Piloto →
          </Link>
        </div>

        {/* ── Quick links ── */}
        <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4">
          <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-3">Atalhos de Gestão</p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Dashboard", href: "/agency/dashboard" },
              { label: "Aprovações", href: "/agency/approvals" },
              { label: "Pipeline", href: "/agency/pipeline" },
              { label: "Projetos", href: "/agency/projects" },
              { label: "Clientes", href: "/agency/clients" },
              { label: "Entregas", href: "/agency/deliverables" },
              { label: "Tarefas", href: "/agency/tasks" },
              { label: "Integrações", href: "/agency/integrations" },
              { label: "Dioli Brain", href: "/agency/brain" },
            ].map((l) => (
              <Link key={l.href} href={l.href}
                className="h-7 px-3 rounded-[6px] text-[12px] font-medium border border-[#E5E5E2] text-[#6B6B65] hover:bg-[#F7F7F6] transition-colors">
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
