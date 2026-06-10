"use client";

import { useState } from "react";
import { BRAIN_IDENTITY, BRAIN_VERSION, BRAIN_RULES } from "@/lib/dioli-brain/brain-config";
import { DIOLI_COGNITIVE_FLOW } from "@/lib/dioli-brain/cognitive-flow";
import { BRAIN_DEPARTMENTS, getBrainDepartmentsByStatus } from "@/lib/dioli-brain/departments";
import { KNOWLEDGE_SOURCES } from "@/lib/dioli-brain/knowledge-map";
import { CURRENT_SYSTEM_MAP, getMappedModules, getModulesNeedingRefactor } from "@/lib/dioli-brain/current-system-map";
import { ENGINE_ROUTES } from "@/lib/dioli-brain/router";
import { BRAIN_STATUS_LABELS, BRAIN_STATUS_COLORS } from "@/lib/dioli-brain/department-adapter";

const TAB_IDS = ["overview", "flow", "departments", "knowledge", "engine", "system-map"] as const;
type TabId = (typeof TAB_IDS)[number];

const TAB_LABELS: Record<TabId, string> = {
  overview:     "Visão Geral",
  flow:         "Fluxo Cognitivo",
  departments:  "Departamentos",
  knowledge:    "Base de Conhecimento",
  engine:       "Engine Router",
  "system-map": "Mapa do Sistema",
};

export default function BrainPage() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      {/* Header */}
      <div className="border-b border-white/[0.06] px-8 py-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-8 h-8 rounded-[7px] bg-[#5B5BD6] flex items-center justify-center shrink-0">
                <BrainIcon size={16} className="text-white" />
              </div>
              <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-white">
                Dioli Brain
              </h1>
              <span className="text-[11px] font-mono text-[#5B5BD6] bg-[#5B5BD6]/10 px-2 py-0.5 rounded-full border border-[#5B5BD6]/20">
                v{BRAIN_VERSION}
              </span>
            </div>
            <p className="text-[13px] text-[#6B6B65] max-w-xl">
              {BRAIN_IDENTITY.tagline}
            </p>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-[#4A4A44] mb-1">Piloto ativo</div>
            <div className="text-[13px] font-medium text-[#5B5BD6]">Atendimento / SDR</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-5">
          {TAB_IDS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-[6px] text-[12px] font-medium transition-all ${
                activeTab === tab
                  ? "bg-white/[0.08] text-white"
                  : "text-[#6B6B65] hover:text-[#C0C0BA]"
              }`}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>
      </div>

      <div className="px-8 py-6">
        {activeTab === "overview" && <OverviewTab />}
        {activeTab === "flow" && <FlowTab />}
        {activeTab === "departments" && <DepartmentsTab />}
        {activeTab === "knowledge" && <KnowledgeTab />}
        {activeTab === "engine" && <EngineTab />}
        {activeTab === "system-map" && <SystemMapTab />}
      </div>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab() {
  const existing       = getBrainDepartmentsByStatus("existing").length;
  const partial        = getBrainDepartmentsByStatus("partial").length;
  const mapped         = getMappedModules().length;
  const needsRefactor  = getModulesNeedingRefactor().length;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Thesis */}
      <div className="rounded-[10px] border border-[#5B5BD6]/30 bg-[#5B5BD6]/[0.04] p-5">
        <div className="text-[11px] font-semibold text-[#5B5BD6] uppercase tracking-[0.08em] mb-3">Tese Central</div>
        <p className="text-[15px] font-medium text-white leading-relaxed">
          A IA não é o produto. O Brain é o produto.
        </p>
        <p className="text-[13px] text-[#8A8A84] mt-2 leading-relaxed">
          Modelos de IA são motores — intercambiáveis, melhoráveis, substituíveis.
          O Dioli Brain é a inteligência operacional que permanece constante independente de qual motor é usado.
          Departamentos são escopos profissionais. Agentes não são brains independentes.
          Todo agente raciocina através da mesma lógica do Brain, restrito ao seu escopo de departamento.
        </p>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Módulos mapeados" value={mapped} total={CURRENT_SYSTEM_MAP.length} color="#16A34A" />
        <StatCard label="Depts existentes" value={existing} total={BRAIN_DEPARTMENTS.length} color="#5B5BD6" />
        <StatCard label="Depts parciais" value={partial} total={BRAIN_DEPARTMENTS.length} color="#D97706" />
        <StatCard label="Precisam refatorar" value={needsRefactor} total={CURRENT_SYSTEM_MAP.length} color="#7C3AED" />
      </div>

      {/* Architecture layers */}
      <div>
        <SectionTitle>Camadas de Arquitetura</SectionTitle>
        <div className="grid grid-cols-3 gap-3">
          {ARCHITECTURE_LAYERS.map((layer) => (
            <div key={layer.id} className="rounded-[8px] border border-white/[0.06] bg-[#111111] p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-[5px] flex items-center justify-center text-[14px]"
                  style={{ background: `${layer.color}15` }}>
                  <span style={{ color: layer.color }}>{layer.icon}</span>
                </div>
                <span className="text-[12px] font-semibold text-white">{layer.name}</span>
              </div>
              <p className="text-[11px] text-[#6B6B65] leading-relaxed">{layer.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Brain rules */}
      <div>
        <SectionTitle>Regras Fundamentais</SectionTitle>
        <div className="space-y-2">
          {BRAIN_RULES.map((rule, i) => (
            <div key={i} className="flex items-start gap-2.5 text-[12px] text-[#8A8A84]">
              <span className="text-[#5B5BD6] mt-0.5 shrink-0">—</span>
              <span>{rule}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Pilot */}
      <div className="rounded-[10px] border border-[#16A34A]/30 bg-[#16A34A]/[0.04] p-5">
        <div className="text-[11px] font-semibold text-[#16A34A] uppercase tracking-[0.08em] mb-3">
          Primeiro Piloto — Atendimento / SDR
        </div>
        <p className="text-[13px] text-[#8A8A84] leading-relaxed">
          O departamento de Atendimento controla a entrada de toda demanda de cliente.
          Antes de qualquer departamento agir, o Brain deve capturar a intenção corretamente.
          O SDR já tem simulador, evaluador, loop de treinamento e modelo de handoff —
          tornando-o o candidato natural para o primeiro piloto completo.
        </p>
        <div className="flex gap-2 mt-3">
          {["Briefing Room", "SDR Agent", "Training Center", "Lab", "Treinamento Contínuo"].map((m) => (
            <span key={m} className="text-[10px] font-medium text-[#16A34A] bg-[#16A34A]/10 px-2 py-0.5 rounded-full border border-[#16A34A]/20">
              {m}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Flow Tab ─────────────────────────────────────────────────────────────────

function FlowTab() {
  return (
    <div className="max-w-3xl">
      <SectionTitle>Fluxo Cognitivo Obrigatório</SectionTitle>
      <p className="text-[13px] text-[#6B6B65] mb-5">
        Todo departamento usa o mesmo fluxo de raciocínio. O escopo e as ferramentas diferem; a lógica não.
      </p>
      <div className="space-y-3">
        {DIOLI_COGNITIVE_FLOW.map((step) => (
          <div
            key={step.id}
            className="rounded-[8px] border border-white/[0.06] bg-[#111111] p-4"
          >
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-[#5B5BD6]/10 border border-[#5B5BD6]/20 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[10px] font-bold text-[#5B5BD6]">{step.order}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-white mb-0.5">{step.label}</div>
                <div className="text-[12px] text-[#6B6B65] italic mb-2">{step.guidingQuestion}</div>
                <div className="text-[11px] text-[#5B5BD6]">
                  Output: <span className="font-mono">{step.output}</span>
                </div>
                {step.riskFlags.length > 0 && (
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {step.riskFlags.map((f) => (
                      <span key={f} className="text-[10px] text-[#D97706] bg-[#D97706]/10 px-1.5 py-0.5 rounded border border-[#D97706]/20">
                        {f}
                      </span>
                    ))}
                  </div>
                )}
                {step.humanApprovalTriggers.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {step.humanApprovalTriggers.map((t) => (
                      <span key={t} className="text-[10px] text-[#DC2626] bg-[#DC2626]/10 px-1.5 py-0.5 rounded border border-[#DC2626]/20">
                        ✋ {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Departments Tab ──────────────────────────────────────────────────────────

function DepartmentsTab() {
  return (
    <div className="max-w-5xl">
      <SectionTitle>Departamentos como Escopos Profissionais</SectionTitle>
      <p className="text-[13px] text-[#6B6B65] mb-5">
        A lógica do Brain é compartilhada. Departamentos definem escopo, permissões, ferramentas e tipos de entregável.
      </p>
      <div className="grid grid-cols-2 gap-4">
        {BRAIN_DEPARTMENTS.map((dept) => {
          const statusColor = BRAIN_STATUS_COLORS[dept.firstVersionStatus];
          const statusLabel = BRAIN_STATUS_LABELS[dept.firstVersionStatus];
          return (
            <div
              key={dept.id}
              className="rounded-[8px] border border-white/[0.06] bg-[#111111] p-4"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="text-[13px] font-semibold text-white">{dept.name}</div>
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full border"
                  style={{ color: statusColor, borderColor: `${statusColor}30`, background: `${statusColor}10` }}
                >
                  {statusLabel}
                </span>
              </div>
              <p className="text-[11px] text-[#6B6B65] mb-3 leading-relaxed">{dept.mission}</p>
              <div className="text-[10px] font-semibold text-[#4A4A44] uppercase tracking-[0.06em] mb-1.5">
                Quality Gate ({dept.qualityGate.length} checks)
              </div>
              <div className="space-y-0.5">
                {dept.qualityGate.slice(0, 3).map((check) => (
                  <div key={check} className="flex items-center gap-1.5 text-[11px] text-[#8A8A84]">
                    <span className="text-[#5B5BD6]">·</span>
                    {check}
                  </div>
                ))}
                {dept.qualityGate.length > 3 && (
                  <div className="text-[10px] text-[#4A4A44]">
                    +{dept.qualityGate.length - 3} mais
                  </div>
                )}
              </div>
              {dept.simulator && (
                <div className="mt-2 pt-2 border-t border-white/[0.04]">
                  <span className="text-[10px] text-[#16A34A] bg-[#16A34A]/10 px-1.5 py-0.5 rounded border border-[#16A34A]/20">
                    Simulador ativo
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Knowledge Tab ────────────────────────────────────────────────────────────

function KnowledgeTab() {
  return (
    <div className="max-w-4xl">
      <SectionTitle>Base de Conhecimento</SectionTitle>
      <p className="text-[13px] text-[#6B6B65] mb-5">
        Memória institucional da agência. Estruturada, controlada por acesso e atualizável.
      </p>
      <div className="space-y-2">
        {KNOWLEDGE_SOURCES.map((src) => (
          <div
            key={src.sourceId}
            className="rounded-[8px] border border-white/[0.06] bg-[#111111] p-3.5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[12px] font-semibold text-white">{src.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                    src.sensitivity === "confidential"
                      ? "text-[#DC2626] bg-[#DC2626]/10 border-[#DC2626]/20"
                      : src.sensitivity === "internal"
                      ? "text-[#D97706] bg-[#D97706]/10 border-[#D97706]/20"
                      : "text-[#6B6B65] bg-white/[0.04] border-white/[0.08]"
                  }`}>
                    {src.sensitivity}
                  </span>
                </div>
                <p className="text-[11px] text-[#6B6B65]">{src.description}</p>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[10px] text-[#4A4A44]">{src.owner}</div>
                <div className="text-[10px] text-[#4A4A44] mt-0.5">
                  {src.currentSystemMapping
                    ? <span className="text-[#16A34A]">mapeado</span>
                    : <span className="text-[#D97706]">pendente</span>}
                </div>
              </div>
            </div>
            {src.currentSystemMapping && (
              <div className="mt-2 text-[10px] font-mono text-[#4A4A44] bg-[#0A0A0A] px-2 py-1 rounded">
                {src.currentSystemMapping}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Engine Tab ───────────────────────────────────────────────────────────────

function EngineTab() {
  return (
    <div className="max-w-4xl">
      <SectionTitle>AI Engine Router</SectionTitle>
      <p className="text-[13px] text-[#6B6B65] mb-5">
        O modelo pode mudar. O Brain não pode. Configuração de roteamento por departamento.
      </p>
      <div className="space-y-2">
        {ENGINE_ROUTES.map((route) => (
          <div
            key={route.departmentId}
            className="rounded-[8px] border border-white/[0.06] bg-[#111111] p-3.5"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-[12px] font-semibold text-white">{route.departmentId}</div>
              <div className="flex gap-1.5">
                <Chip label={route.costTier} color={route.costTier === "low" ? "#16A34A" : route.costTier === "medium" ? "#D97706" : "#DC2626"} />
                <Chip label={route.latencyTier} color="#5B5BD6" />
                <Chip label={route.qualityTier} color="#7C3AED" />
              </div>
            </div>
            <div className="flex gap-4 text-[11px] text-[#6B6B65]">
              <span>Preferido: <span className="text-white font-mono">{route.preferredProvider}</span></span>
              <span>Fallback: <span className="text-white font-mono">{route.fallbackProvider}</span></span>
              <span>Capacidade: <span className="text-[#5B5BD6]">{route.capabilityRequired}</span></span>
            </div>
            {route.notes && (
              <p className="text-[11px] text-[#4A4A44] mt-1.5 italic">{route.notes}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── System Map Tab ───────────────────────────────────────────────────────────

function SystemMapTab() {
  const statusColors: Record<string, string> = {
    mapped:         "#16A34A",
    partial:        "#D97706",
    unmapped:       "#6B6B65",
    needs_refactor: "#7C3AED",
  };
  const statusLabels: Record<string, string> = {
    mapped:         "Mapeado",
    partial:        "Parcial",
    unmapped:       "Não mapeado",
    needs_refactor: "Refatorar",
  };

  const layerGroups = CURRENT_SYSTEM_MAP.reduce<Record<string, typeof CURRENT_SYSTEM_MAP>>((acc, m) => {
    (acc[m.brainLayer] = acc[m.brainLayer] || []).push(m);
    return acc;
  }, {});

  return (
    <div className="max-w-5xl">
      <SectionTitle>Mapa do Sistema Atual → Brain</SectionTitle>
      <p className="text-[13px] text-[#6B6B65] mb-5">
        Como cada módulo existente se encaixa na arquitetura do Dioli Brain.
      </p>
      <div className="space-y-6">
        {Object.entries(layerGroups).map(([layer, modules]) => (
          <div key={layer}>
            <div className="text-[10px] font-semibold text-[#4A4A44] uppercase tracking-[0.08em] mb-2">
              {LAYER_LABELS[layer] ?? layer}
            </div>
            <div className="space-y-2">
              {modules.map((m) => {
                const color = statusColors[m.status];
                return (
                  <div
                    key={m.moduleId}
                    className="rounded-[8px] border border-white/[0.06] bg-[#111111] p-3.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[12px] font-semibold text-white">{m.label}</span>
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded border"
                            style={{ color, borderColor: `${color}30`, background: `${color}10` }}
                          >
                            {statusLabels[m.status]}
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-[#4A4A44] mb-1">
                          {m.currentPath}
                        </div>
                        <p className="text-[11px] text-[#6B6B65]">{m.notes}</p>
                      </div>
                      {m.brainDepartmentId && (
                        <span className="text-[10px] text-[#5B5BD6] bg-[#5B5BD6]/10 px-1.5 py-0.5 rounded border border-[#5B5BD6]/20 shrink-0">
                          {m.brainDepartmentId}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[15px] font-semibold text-white mb-4">{children}</h2>
  );
}

function StatCard({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  return (
    <div className="rounded-[8px] border border-white/[0.06] bg-[#111111] p-4">
      <div className="text-[24px] font-bold tracking-[-0.02em]" style={{ color }}>
        {value}
        <span className="text-[14px] text-[#4A4A44] font-normal ml-1">/ {total}</span>
      </div>
      <div className="text-[11px] text-[#6B6B65] mt-1">{label}</div>
    </div>
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded border"
      style={{ color, borderColor: `${color}30`, background: `${color}10` }}
    >
      {label}
    </span>
  );
}

// ─── Static data ──────────────────────────────────────────────────────────────

const ARCHITECTURE_LAYERS = [
  {
    id: "ceo",
    icon: "◆",
    color: "#F59E0B",
    name: "CEO / Dono do Negócio",
    description: "Visão estratégica. Define qualidade, approva mudanças estruturais.",
  },
  {
    id: "brain_director",
    icon: "⬡",
    color: "#5B5BD6",
    name: "Brain Director",
    description: "Audita raciocínio, approva/rejeita BrainChangeRequests, versiona o Brain.",
  },
  {
    id: "brain",
    icon: "●",
    color: "#5B5BD6",
    name: "Dioli Brain",
    description: "Fluxo cognitivo compartilhado, Knowledge Base, Quality Gate, Evidence.",
  },
  {
    id: "departments",
    icon: "□",
    color: "#8A8A84",
    name: "Departamentos",
    description: "Escopos profissionais. Mesma lógica, ferramentas e permissões diferentes.",
  },
  {
    id: "training",
    icon: "▲",
    color: "#16A34A",
    name: "Training Center",
    description: "Loop de aprendizado. Simulações → Sugestões → BrainChangeRequest → revisão.",
  },
  {
    id: "evidence",
    icon: "★",
    color: "#D97706",
    name: "Evidence Layer",
    description: "Prova de valor. Métricas, elogios, antes/depois. Aprovação humana obrigatória.",
  },
];

const LAYER_LABELS: Record<string, string> = {
  intake:           "Intake / Captação",
  knowledge_base:   "Base de Conhecimento",
  cognitive_flow:   "Fluxo Cognitivo",
  department_scope: "Escopo de Departamento",
  training:         "Training Center",
  quality:          "Qualidade",
  evidence:         "Evidence Layer",
  governance:       "Governança",
};

// ─── Brain icon ───────────────────────────────────────────────────────────────

function BrainIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <path
        d="M8 2C5.24 2 3 4.24 3 7c0 1.1.36 2.12.96 2.94C3.36 10.32 3 11.12 3 12c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2 0-.88-.36-1.68-.96-2.06C12.64 9.12 13 8.1 13 7c0-2.76-2.24-5-5-5z"
        stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"
      />
      <path d="M6 7h4M7 9.5h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}
