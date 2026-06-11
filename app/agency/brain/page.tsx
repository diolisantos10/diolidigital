"use client";

import { useEffect, useState, useCallback } from "react";
import { BRAIN_IDENTITY, BRAIN_VERSION, BRAIN_RULES } from "@/lib/dioli-brain/brain-config";
import { DIOLI_COGNITIVE_FLOW } from "@/lib/dioli-brain/cognitive-flow";
import { BRAIN_DEPARTMENTS, getBrainDepartmentsByStatus } from "@/lib/dioli-brain/departments";
import { KNOWLEDGE_SOURCES } from "@/lib/dioli-brain/knowledge-map";
import { CURRENT_SYSTEM_MAP, getMappedModules, getModulesNeedingRefactor } from "@/lib/dioli-brain/current-system-map";
import { ENGINE_ROUTES } from "@/lib/dioli-brain/router";
import { BRAIN_STATUS_LABELS, BRAIN_STATUS_COLORS } from "@/lib/dioli-brain/department-adapter";
import { GLOBAL_QUALITY_GATE, ALL_QUALITY_GATES } from "@/lib/dioli-brain/quality-gates";
import { TRAINING_RULES, BRAIN_CHANGE_SOURCE_LABELS, BRAIN_CHANGE_STATUS_LABELS } from "@/lib/dioli-brain/training-policy";
import { computeSDRScorecard } from "@/lib/dioli-brain/sdr-scorecard";
import { computeSDRMaturity, computeStrategyMaturity, computeSocialMaturity, computeDesignMaturity, MATURITY_LABELS } from "@/lib/dioli-brain/department-maturity";
import { computeStrategyScorecard } from "@/lib/dioli-brain/strategy-scorecard";
import { computeSocialScorecard } from "@/lib/dioli-brain/social-scorecard";
import { computeDesignScorecard } from "@/lib/dioli-brain/design-scorecard";
import { useAgencyStore } from "@/store/agency-store";
import { useTrainingStore } from "@/store/training-store";
import { useStrategyStore } from "@/store/strategy-store";
import { useSocialStore } from "@/store/social-store";
import { useDesignStore } from "@/store/design-store";

const TAB_IDS = ["overview", "flow", "departments", "knowledge", "training", "quality", "director"] as const;
type TabId = (typeof TAB_IDS)[number];

const TAB_LABELS: Record<TabId, string> = {
  overview:    "Visão Geral",
  flow:        "Fluxo Cognitivo",
  departments: "Departamentos",
  knowledge:   "Base de Conhecimento",
  training:    "Treinamento",
  quality:     "Qualidade",
  director:    "Brain Director",
};

export default function BrainPage() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/brain/changes")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.counts) setPendingCount(d.counts.pending_review + d.counts.draft); })
      .catch(() => {});
  }, []);

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
        <div className="flex gap-1 mt-5 flex-wrap">
          {TAB_IDS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-[6px] text-[12px] font-medium transition-all flex items-center gap-1.5 ${
                activeTab === tab
                  ? "bg-white/[0.08] text-white"
                  : "text-[#6B6B65] hover:text-[#C0C0BA]"
              }`}
            >
              {TAB_LABELS[tab]}
              {tab === "director" && pendingCount != null && pendingCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-[#D97706] text-white text-[9px] font-bold leading-none">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="px-8 py-6">
        {activeTab === "overview" && <OverviewTab />}
        {activeTab === "flow" && <FlowTab />}
        {activeTab === "departments" && <DepartmentsTab />}
        {activeTab === "knowledge" && <KnowledgeTab />}
        {activeTab === "training" && <TrainingTab />}
        {activeTab === "quality" && <QualityTab />}
        {activeTab === "director" && <DirectorTab onCountsChange={setPendingCount} />}
      </div>
    </div>
  );
}

// ─── SDR Pilot Panel ──────────────────────────────────────────────────────────

function SDRPilotPanel() {
  const { clientRequests } = useAgencyStore();
  const { runs, suggestions } = useTrainingStore();

  const scorecard = computeSDRScorecard(clientRequests, runs, suggestions, 0);
  const maturity  = computeSDRMaturity({
    hasSimulator:               true,
    hasTrainingCenter:          true,
    hasQualityGate:             true,
    hasGovernanceIntegration:   true,
    hasEvidenceLayer:           true,
    hasBrainReasoningOutput:    true,
    brainChangeRequestsGenerated: 0,
    trainingSuggestionsGenerated: scorecard.trainingSuggestionsGenerated,
    qualityGatePassRate:          scorecard.qualityGatePassRate,
  });

  const statuses = [
    { label: "Simulador",    active: true },
    { label: "Treinamento",  active: true },
    { label: "Quality Gate", active: true },
    { label: "Governança",   active: true },
    { label: "Evidência",    active: true },
  ];

  const scorecardMetrics = [
    { label: "Briefings",        value: `${scorecard.briefingsCompleted}/${scorecard.briefingsStarted}` },
    { label: "Qualificação",     value: `${scorecard.qualifiedRate}%` },
    { label: "QG Pass",          value: scorecard.briefingsStarted > 0 ? `${scorecard.qualityGatePassRate}%` : "—" },
    { label: "Objeções resolvidas", value: `${scorecard.objectionResolutionRate}%` },
    { label: "Confiança média",  value: `${scorecard.averageConfidence}%` },
    { label: "Treinamentos",     value: runs.length.toString() },
    { label: "Sugestões",        value: scorecard.trainingSuggestionsGenerated.toString() },
    { label: "Brain Changes",    value: scorecard.brainChangeRequestsGenerated.toString() },
    { label: "Score médio",      value: runs.length > 0 ? `${Math.round(runs.reduce((a, r) => a + r.score, 0) / runs.length)}/100` : "—" },
  ];

  return (
    <div className="rounded-[10px] border border-[#16A34A]/30 bg-[#16A34A]/[0.04] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold text-[#16A34A] uppercase tracking-[0.08em]">
          Primeiro Piloto — Atendimento / SDR
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border"
            style={{ color: maturity.color, borderColor: `${maturity.color}40`, background: `${maturity.color}15` }}
          >
            {MATURITY_LABELS[maturity.current]}
          </span>
          <span className="text-[10px] text-[#4A4A44]">{maturity.completionPct}% maturidade</span>
        </div>
      </div>

      {/* Active capability statuses */}
      <div className="flex gap-2 flex-wrap">
        {statuses.map((s) => (
          <span
            key={s.label}
            className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
              s.active
                ? "text-[#16A34A] bg-[#16A34A]/10 border-[#16A34A]/20"
                : "text-[#4A4A44] bg-white/[0.03] border-white/[0.06]"
            }`}
          >
            {s.active ? "✓ " : "○ "}{s.label}
          </span>
        ))}
      </div>

      {/* Maturity criteria */}
      <div className="grid grid-cols-2 gap-1.5">
        {maturity.criteria.map((c) => (
          <div key={c.id} className="flex items-center gap-1.5 text-[10px]">
            <span className={c.met ? "text-[#16A34A]" : "text-[#4A4A44]"}>
              {c.met ? "✓" : "○"}
            </span>
            <span className={c.met ? "text-[#8A8A84]" : "text-[#4A4A44]"}>{c.label}</span>
          </div>
        ))}
      </div>

      {/* SDR Scorecard */}
      <div className="border-t border-[#16A34A]/20 pt-3">
        <div className="text-[10px] font-semibold text-[#4A4A44] uppercase tracking-[0.06em] mb-2">
          Scorecard SDR
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {scorecardMetrics.map((m) => (
            <div key={m.label} className="text-center">
              <div className="text-[15px] font-bold text-white">{m.value}</div>
              <div className="text-[9px] text-[#4A4A44] mt-0.5">{m.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Strategy Department Panel ────────────────────────────────────────────────

function StrategyDepartmentPanel() {
  const { canvases, changeRequestCanvasIds } = useStrategyStore();

  const scorecard = computeStrategyScorecard(canvases, changeRequestCanvasIds.length);
  const maturity  = computeStrategyMaturity({
    hasStrategyEngine:        true,
    hasWorkspace:             true,
    hasQualityGate:           true,
    hasSimulator:             true,
    hasTrainingStructure:     true,
    hasGovernanceIntegration: true,
    hasEvidenceTypes:         true,
    strategiesCreated:            scorecard.strategiesCreated,
    strategiesApproved:           scorecard.strategiesApproved,
    brainChangeRequestsGenerated: scorecard.brainChangeRequestsGenerated,
    qualityGatePassRate:          scorecard.qualityGatePassRate,
  });

  const statuses = [
    { label: "Engine",        active: true },
    { label: "Workspace",     active: true },
    { label: "Quality Gate",  active: true },
    { label: "Simulador",     active: true },
    { label: "Treinamento",   active: true },
    { label: "Governança",    active: true },
    { label: "Evidência",     active: true },
  ];

  const scorecardMetrics = [
    { label: "Criadas",          value: scorecard.strategiesCreated.toString() },
    { label: "Aprovadas",        value: scorecard.strategiesApproved.toString() },
    { label: "Aprovação",        value: `${scorecard.approvalRate}%` },
    { label: "QG Pass",          value: scorecard.strategiesCreated > 0 ? `${scorecard.qualityGatePassRate}%` : "—" },
    { label: "Roadmaps",         value: scorecard.roadmapsGenerated.toString() },
    { label: "Territórios",      value: scorecard.territoriesDefined.toString() },
    { label: "Evidências",       value: scorecard.evidenceGenerated.toString() },
    { label: "Brain Changes",    value: scorecard.brainChangeRequestsGenerated.toString() },
  ];

  return (
    <div className="rounded-[10px] border border-[#7C3AED]/30 bg-[#7C3AED]/[0.04] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold text-[#7C3AED] uppercase tracking-[0.08em]">
          Segundo Departamento — Estratégia
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border"
            style={{ color: maturity.color, borderColor: `${maturity.color}40`, background: `${maturity.color}15` }}
          >
            {MATURITY_LABELS[maturity.current]}
          </span>
          <span className="text-[10px] text-[#4A4A44]">{maturity.completionPct}% maturidade</span>
        </div>
      </div>

      <p className="text-[12px] text-[#8A8A84] leading-relaxed">
        Transforma clientes qualificados pelo SDR em direção estratégica: posicionamento, territórios de
        conteúdo, direção de comunicação e roadmap. Não cria criativos finais nem lança campanhas.
      </p>

      {/* Active capability statuses */}
      <div className="flex gap-2 flex-wrap">
        {statuses.map((s) => (
          <span
            key={s.label}
            className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
              s.active
                ? "text-[#7C3AED] bg-[#7C3AED]/10 border-[#7C3AED]/20"
                : "text-[#4A4A44] bg-white/[0.03] border-white/[0.06]"
            }`}
          >
            {s.active ? "✓ " : "○ "}{s.label}
          </span>
        ))}
      </div>

      {/* Maturity criteria */}
      <div className="grid grid-cols-2 gap-1.5">
        {maturity.criteria.map((c) => (
          <div key={c.id} className="flex items-center gap-1.5 text-[10px]">
            <span className={c.met ? "text-[#7C3AED]" : "text-[#4A4A44]"}>
              {c.met ? "✓" : "○"}
            </span>
            <span className={c.met ? "text-[#8A8A84]" : "text-[#4A4A44]"}>{c.label}</span>
          </div>
        ))}
      </div>

      {/* Strategy Scorecard */}
      <div className="border-t border-[#7C3AED]/20 pt-3">
        <div className="text-[10px] font-semibold text-[#4A4A44] uppercase tracking-[0.06em] mb-2">
          Scorecard Estratégia
        </div>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {scorecardMetrics.map((m) => (
            <div key={m.label} className="text-center">
              <div className="text-[15px] font-bold text-white">{m.value}</div>
              <div className="text-[9px] text-[#4A4A44] mt-0.5">{m.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Social Media Department Panel ────────────────────────────────────────────

function SocialDepartmentPanel() {
  const { canvases, changeRequestCanvasIds } = useSocialStore();

  const scorecard = computeSocialScorecard(canvases, changeRequestCanvasIds.length);
  const maturity  = computeSocialMaturity({
    hasSocialEngine:          true,
    hasWorkspace:             true,
    hasQualityGate:           true,
    hasCalendar:              true,
    hasSimulator:             true,
    hasTrainingStructure:     true,
    hasGovernanceIntegration: true,
    hasEvidenceTypes:         true,
    plansCreated:                 scorecard.plansCreated,
    plansApproved:                scorecard.plansApproved,
    brainChangeRequestsGenerated: scorecard.brainChangeRequestsGenerated,
    qualityGatePassRate:          scorecard.qualityGatePassRate,
  });

  const statuses = [
    { label: "Engine",        active: true },
    { label: "Workspace",     active: true },
    { label: "Quality Gate",  active: true },
    { label: "Calendário",    active: true },
    { label: "Simulador",     active: true },
    { label: "Treinamento",   active: true },
    { label: "Governança",    active: true },
    { label: "Evidência",     active: true },
  ];

  const scorecardMetrics = [
    { label: "Criados",          value: scorecard.plansCreated.toString() },
    { label: "Aprovados",        value: scorecard.plansApproved.toString() },
    { label: "Aprovação",        value: `${scorecard.approvalRate}%` },
    { label: "Calendários",      value: scorecard.calendarsGenerated.toString() },
    { label: "QG Pass",          value: scorecard.plansCreated > 0 ? `${scorecard.qualityGatePassRate}%` : "—" },
    { label: "Evidências",       value: scorecard.evidenceGenerated.toString() },
    { label: "Publicados",       value: scorecard.publishedContent.toString() },
    { label: "Brain Changes",    value: scorecard.brainChangeRequestsGenerated.toString() },
  ];

  return (
    <div className="rounded-[10px] border border-[#DB2777]/30 bg-[#DB2777]/[0.04] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold text-[#DB2777] uppercase tracking-[0.08em]">
          Terceiro Departamento — Social Media (primeiro de execução)
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border"
            style={{ color: maturity.color, borderColor: `${maturity.color}40`, background: `${maturity.color}15` }}
          >
            {MATURITY_LABELS[maturity.current]}
          </span>
          <span className="text-[10px] text-[#4A4A44]">{maturity.completionPct}% maturidade</span>
        </div>
      </div>

      <p className="text-[12px] text-[#8A8A84] leading-relaxed">
        Transforma estratégia aprovada em operação de conteúdo: pilares editoriais, plano mensal e calendário.
        Nunca produz sem estratégia, não altera posicionamento, marca ou o Brain.
      </p>

      {/* Active capability statuses */}
      <div className="flex gap-2 flex-wrap">
        {statuses.map((s) => (
          <span
            key={s.label}
            className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
              s.active
                ? "text-[#DB2777] bg-[#DB2777]/10 border-[#DB2777]/20"
                : "text-[#4A4A44] bg-white/[0.03] border-white/[0.06]"
            }`}
          >
            {s.active ? "✓ " : "○ "}{s.label}
          </span>
        ))}
      </div>

      {/* Maturity criteria */}
      <div className="grid grid-cols-2 gap-1.5">
        {maturity.criteria.map((c) => (
          <div key={c.id} className="flex items-center gap-1.5 text-[10px]">
            <span className={c.met ? "text-[#DB2777]" : "text-[#4A4A44]"}>
              {c.met ? "✓" : "○"}
            </span>
            <span className={c.met ? "text-[#8A8A84]" : "text-[#4A4A44]"}>{c.label}</span>
          </div>
        ))}
      </div>

      {/* Social Scorecard */}
      <div className="border-t border-[#DB2777]/20 pt-3">
        <div className="text-[10px] font-semibold text-[#4A4A44] uppercase tracking-[0.06em] mb-2">
          Scorecard Social
        </div>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {scorecardMetrics.map((m) => (
            <div key={m.label} className="text-center">
              <div className="text-[15px] font-bold text-white">{m.value}</div>
              <div className="text-[9px] text-[#4A4A44] mt-0.5">{m.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Design Department Panel ─────────────────────────────────────────────────

function DesignDepartmentPanel() {
  const { canvases, changeRequestCanvasIds } = useDesignStore();

  const scorecard = computeDesignScorecard(canvases, changeRequestCanvasIds.length);
  const maturity  = computeDesignMaturity({
    hasDesignEngine:          true,
    hasWorkspace:             true,
    hasQualityGate:           true,
    hasBriefGenerator:        true,
    hasPromptSpecs:           true,
    hasSimulator:             true,
    hasTrainingStructure:     true,
    hasGovernanceIntegration: true,
    hasEvidenceTypes:         true,
    canvasesCreated:              scorecard.canvasesCreated,
    canvasesApproved:             scorecard.canvasesApproved,
    brainChangeRequestsGenerated: scorecard.brainChangeRequestsGenerated,
    qualityGatePassRate:          scorecard.qualityGatePassRate,
  });

  const statuses = [
    { label: "Engine",        active: true },
    { label: "Workspace",     active: true },
    { label: "Quality Gate",  active: true },
    { label: "Briefs",        active: true },
    { label: "Prompts",       active: true },
    { label: "Simulador",     active: true },
    { label: "Treinamento",   active: true },
    { label: "Governança",    active: true },
    { label: "Evidência",     active: true },
  ];

  const scorecardMetrics = [
    { label: "Canvases",         value: scorecard.canvasesCreated.toString() },
    { label: "Aprovados",        value: scorecard.canvasesApproved.toString() },
    { label: "Aprovação",        value: `${scorecard.approvalRate}%` },
    { label: "Briefs",           value: scorecard.briefsGenerated.toString() },
    { label: "Prompts",          value: scorecard.promptsGenerated.toString() },
    { label: "Assets",           value: scorecard.assetsRequired.toString() },
    { label: "QG Pass",          value: scorecard.canvasesCreated > 0 ? `${scorecard.qualityGatePassRate}%` : "—" },
    { label: "Brain Changes",    value: scorecard.brainChangeRequestsGenerated.toString() },
  ];

  return (
    <div className="rounded-[10px] border border-[#EA580C]/30 bg-[#EA580C]/[0.04] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold text-[#EA580C] uppercase tracking-[0.08em]">
          Quarto Departamento — Design (segundo de execução)
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border"
            style={{ color: maturity.color, borderColor: `${maturity.color}40`, background: `${maturity.color}15` }}
          >
            {MATURITY_LABELS[maturity.current]}
          </span>
          <span className="text-[10px] text-[#4A4A44]">{maturity.completionPct}% maturidade</span>
        </div>
      </div>

      <p className="text-[12px] text-[#8A8A84] leading-relaxed">
        Transforma planos de conteúdo em direção visual: conceito, briefs criativos, prompts de imagem e
        requisitos de assets. Nunca produz sem Social Canvas aprovado. Não altera posicionamento nem estratégia.
      </p>

      {/* Active capability statuses */}
      <div className="flex gap-2 flex-wrap">
        {statuses.map((s) => (
          <span
            key={s.label}
            className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
              s.active
                ? "text-[#EA580C] bg-[#EA580C]/10 border-[#EA580C]/20"
                : "text-[#4A4A44] bg-white/[0.03] border-white/[0.06]"
            }`}
          >
            {s.active ? "✓ " : "○ "}{s.label}
          </span>
        ))}
      </div>

      {/* Maturity criteria */}
      <div className="grid grid-cols-2 gap-1.5">
        {maturity.criteria.map((c) => (
          <div key={c.id} className="flex items-center gap-1.5 text-[10px]">
            <span className={c.met ? "text-[#EA580C]" : "text-[#4A4A44]"}>
              {c.met ? "✓" : "○"}
            </span>
            <span className={c.met ? "text-[#8A8A84]" : "text-[#4A4A44]"}>{c.label}</span>
          </div>
        ))}
      </div>

      {/* Design Scorecard */}
      <div className="border-t border-[#EA580C]/20 pt-3">
        <div className="text-[10px] font-semibold text-[#4A4A44] uppercase tracking-[0.06em] mb-2">
          Scorecard Design
        </div>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {scorecardMetrics.map((m) => (
            <div key={m.label} className="text-center">
              <div className="text-[15px] font-bold text-white">{m.value}</div>
              <div className="text-[9px] text-[#4A4A44] mt-0.5">{m.label}</div>
            </div>
          ))}
        </div>
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

      {/* Pilot — live metrics */}
      <SDRPilotPanel />

      {/* Strategy Department — live metrics */}
      <StrategyDepartmentPanel />

      {/* Social Media Department — live metrics */}
      <SocialDepartmentPanel />

      {/* Design Department — live metrics */}
      <DesignDepartmentPanel />

      {/* System map */}
      <SystemMapSection />
    </div>
  );
}

function SystemMapSection() {
  const statusColors: Record<string, string> = {
    mapped: "#16A34A", partial: "#D97706", unmapped: "#6B6B65", needs_refactor: "#7C3AED",
  };
  const statusLabels: Record<string, string> = {
    mapped: "Mapeado", partial: "Parcial", unmapped: "Não mapeado", needs_refactor: "Refatorar",
  };
  return (
    <div>
      <SectionTitle>Mapa do Sistema Atual → Brain</SectionTitle>
      <div className="space-y-2">
        {CURRENT_SYSTEM_MAP.map((m) => {
          const color = statusColors[m.status];
          return (
            <div key={m.moduleId} className="rounded-[8px] border border-white/[0.06] bg-[#111111] p-3.5">
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
                  <div className="text-[10px] font-mono text-[#4A4A44] mb-1">{m.currentPath}</div>
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
          <div key={step.id} className="rounded-[8px] border border-white/[0.06] bg-[#111111] p-4">
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
            <div key={dept.id} className="rounded-[8px] border border-white/[0.06] bg-[#111111] p-4">
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
                  <div className="text-[10px] text-[#4A4A44]">+{dept.qualityGate.length - 3} mais</div>
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

      {/* Engine Router */}
      <div className="mt-8">
        <SectionTitle>AI Engine Router</SectionTitle>
        <p className="text-[13px] text-[#6B6B65] mb-4">
          O modelo pode mudar. O Brain não pode. Configuração de roteamento por departamento.
        </p>
        <div className="space-y-2">
          {ENGINE_ROUTES.map((route) => (
            <div key={route.departmentId} className="rounded-[8px] border border-white/[0.06] bg-[#111111] p-3.5">
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
            </div>
          ))}
        </div>
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
          <div key={src.sourceId} className="rounded-[8px] border border-white/[0.06] bg-[#111111] p-3.5">
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

// ─── Training Tab ─────────────────────────────────────────────────────────────

interface WorkerStatusLite {
  workerActive: boolean;
  cronConfigured: boolean;
  enabled: boolean;
  runsToday: number;
  dailyCap: number;
  pendingSuggestions: number;
  lastBatchAt: string | null;
}

function TrainingTab() {
  const [status, setStatus] = useState<WorkerStatusLite | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    fetch("/api/admin/training/sdr/run")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setStatus)
      .catch(() => setLoadFailed(true));
  }, []);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <SectionTitle>Training Center</SectionTitle>
        <p className="text-[13px] text-[#6B6B65] mb-4">
          Loop de aprendizado do Brain. Simulações → Sugestões → BrainChangeRequest → revisão do Brain Director.
        </p>
      </div>

      {/* Worker status */}
      <div className="rounded-[10px] border border-white/[0.06] bg-[#111111] p-5">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[12px] font-semibold text-white">Worker 24h — SDR (piloto)</span>
          {status ? (
            status.workerActive ? (
              <span className="text-[10px] font-semibold text-[#16A34A] bg-[#16A34A]/10 px-2 py-0.5 rounded-full border border-[#16A34A]/20">ATIVO</span>
            ) : (
              <span className="text-[10px] font-semibold text-[#D97706] bg-[#D97706]/10 px-2 py-0.5 rounded-full border border-[#D97706]/20">CONFIGURAR</span>
            )
          ) : (
            <span className="text-[10px] text-[#4A4A44]">{loadFailed ? "indisponível" : "carregando…"}</span>
          )}
        </div>
        {status && (
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-[18px] font-bold text-white">{status.runsToday}<span className="text-[12px] text-[#4A4A44] font-normal"> / {status.dailyCap}</span></div>
              <div className="text-[11px] text-[#6B6B65]">runs hoje / cap diário</div>
            </div>
            <div>
              <div className="text-[18px] font-bold text-[#D97706]">{status.pendingSuggestions}</div>
              <div className="text-[11px] text-[#6B6B65]">sugestões pendentes</div>
            </div>
            <div>
              <div className="text-[13px] font-medium text-white mt-1">
                {status.lastBatchAt ? new Date(status.lastBatchAt).toLocaleString("pt-BR") : "—"}
              </div>
              <div className="text-[11px] text-[#6B6B65]">último batch</div>
            </div>
          </div>
        )}
        <a
          href="/agency/simulations/training"
          className="inline-block mt-4 text-[12px] text-[#5B5BD6] hover:text-[#7C7CE8] transition-colors"
        >
          Abrir Training Center completo →
        </a>
      </div>

      {/* Pipeline explanation */}
      <div className="rounded-[10px] border border-[#5B5BD6]/20 bg-[#5B5BD6]/[0.03] p-5">
        <div className="text-[11px] font-semibold text-[#5B5BD6] uppercase tracking-[0.08em] mb-3">
          Pipeline de Governança
        </div>
        <div className="flex items-center gap-2 text-[12px] text-[#8A8A84] flex-wrap">
          <span className="text-white font-medium">Simulação</span>
          <span className="text-[#4A4A44]">→</span>
          <span className="text-white font-medium">Sugestão (pending)</span>
          <span className="text-[#4A4A44]">→</span>
          <span className="text-white font-medium">Aprovação manual</span>
          <span className="text-[#4A4A44]">→</span>
          <span className="text-[#5B5BD6] font-medium">BrainChangeRequest</span>
          <span className="text-[#4A4A44]">→</span>
          <span className="text-white font-medium">Brain Director</span>
          <span className="text-[#4A4A44]">→</span>
          <span className="text-[#16A34A] font-medium">Aplicado + versão</span>
        </div>
        <p className="text-[11px] text-[#6B6B65] mt-3">
          Sugestões aprovadas criam automaticamente um BrainChangeRequest em status pending_review.
          Nada é aplicado automaticamente — a aplicação é uma transição explícita e separada, feita pelo Brain Director.
        </p>
      </div>

      {/* Policy rules */}
      <div>
        <SectionTitle>Política de Treinamento</SectionTitle>
        <div className="space-y-2">
          {TRAINING_RULES.map((rule, i) => (
            <div key={i} className="flex items-start gap-2.5 text-[12px] text-[#8A8A84]">
              <span className="text-[#5B5BD6] mt-0.5 shrink-0">—</span>
              <span>{rule}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Quality Tab ──────────────────────────────────────────────────────────────

function QualityTab() {
  const deptGateEntries = Object.entries(ALL_QUALITY_GATES).filter(([k]) => k !== "global");
  const deptNames: Record<string, string> = Object.fromEntries(
    BRAIN_DEPARTMENTS.map((d) => [d.id, d.name])
  );

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <SectionTitle>Quality Gates</SectionTitle>
        <p className="text-[13px] text-[#6B6B65] mb-4">
          O gate global se aplica a toda saída de departamento. Gates por departamento adicionam checks de escopo.
          Enforcement em runtime virá em fase futura — esta é a definição de governança.
        </p>
      </div>

      {/* Global gate */}
      <div className="rounded-[10px] border border-[#5B5BD6]/20 bg-[#5B5BD6]/[0.03] p-5">
        <div className="text-[11px] font-semibold text-[#5B5BD6] uppercase tracking-[0.08em] mb-3">
          Gate Global — todos os departamentos
        </div>
        <div className="space-y-2">
          {GLOBAL_QUALITY_GATE.map((check) => (
            <div key={check.id} className="flex items-start gap-2.5">
              <span className={`text-[10px] mt-0.5 px-1.5 py-0.5 rounded border shrink-0 ${
                check.blocking
                  ? "text-[#DC2626] bg-[#DC2626]/10 border-[#DC2626]/20"
                  : "text-[#6B6B65] bg-white/[0.04] border-white/[0.08]"
              }`}>
                {check.blocking ? "bloqueante" : "advisory"}
              </span>
              <div>
                <span className="text-[12px] font-medium text-white">{check.label}</span>
                <p className="text-[11px] text-[#6B6B65]">{check.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Department gates */}
      <div className="grid grid-cols-2 gap-4">
        {deptGateEntries.map(([deptId, checks]) => (
          <div key={deptId} className="rounded-[8px] border border-white/[0.06] bg-[#111111] p-4">
            <div className="text-[12px] font-semibold text-white mb-2">
              {deptNames[deptId] ?? deptId}
            </div>
            <div className="space-y-1.5">
              {checks.map((check) => (
                <div key={check.id} className="flex items-start gap-1.5 text-[11px] text-[#8A8A84]">
                  <span className={check.blocking ? "text-[#DC2626] shrink-0" : "text-[#4A4A44] shrink-0"}>
                    {check.blocking ? "●" : "○"}
                  </span>
                  {check.label}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Brain Director Tab ───────────────────────────────────────────────────────

interface ChangeRequestItem {
  id: string;
  title: string;
  description: string;
  rationale: string;
  expectedImpact: string;
  proposedChange: string;
  source: string;
  department: string;
  category: string;
  riskLevel: string;
  requestedBy: string;
  approvalRequiredBy: string[];
  status: string;
  sourceSuggestionIds: string[];
  createdAt: string;
  reviewedAt: string | null;
  appliedAt: string | null;
  reviewNote: string | null;
  requiresCeoApproval: boolean;
}

interface VersionItem {
  id: string;
  version: string;
  summary: string;
  createdAt: string;
}

interface GovernanceData {
  counts: Record<string, number>;
  currentVersion: string;
  requests: ChangeRequestItem[];
  versions: VersionItem[];
}

const RISK_COLORS: Record<string, string> = {
  low: "#16A34A", medium: "#D97706", high: "#DC2626", critical: "#DC2626",
};

const STATUS_FILTERS = [
  { id: "pending_review", label: "Pendentes" },
  { id: "approved",       label: "Aprovados" },
  { id: "rejected",       label: "Rejeitados" },
  { id: "applied",        label: "Aplicados" },
] as const;

function DirectorTab({ onCountsChange }: { onCountsChange: (n: number) => void }) {
  const [data, setData] = useState<GovernanceData | null>(null);
  const [filter, setFilter] = useState<string>("pending_review");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/brain/changes")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: GovernanceData) => {
        setData(d);
        onCountsChange(d.counts.pending_review + d.counts.draft);
        setError(null);
      })
      .catch((e) => setError(String(e)));
  }, [onCountsChange]);

  useEffect(() => { load(); }, [load]);

  async function runAction(id: string, action: string) {
    setActionBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/brain/changes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? body.error ?? `HTTP ${res.status}`);
      }
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setActionBusy(null);
    }
  }

  // Include legacy "draft" entries with pending filter
  const filtered = data?.requests.filter((r) =>
    filter === "pending_review" ? (r.status === "pending_review" || r.status === "draft") : r.status === filter
  ) ?? [];

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <SectionTitle>Brain Director — Fila de Governança</SectionTitle>
          <p className="text-[13px] text-[#6B6B65]">
            Nada modifica o Brain diretamente. Toda mudança passa por esta fila:
            pending_review → aprovado → aplicado (versiona o Brain).
          </p>
        </div>
        {data && (
          <div className="text-right shrink-0">
            <div className="text-[11px] text-[#4A4A44] mb-1">Versão atual do Brain</div>
            <div className="text-[16px] font-mono font-bold text-[#5B5BD6]">v{data.currentVersion}</div>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-[8px] border border-[#DC2626]/30 bg-[#DC2626]/[0.06] px-4 py-3 text-[12px] text-[#FCA5A5]">
          {error}
        </div>
      )}

      {/* Status filter chips */}
      <div className="flex gap-2">
        {STATUS_FILTERS.map((f) => {
          const count = data
            ? f.id === "pending_review"
              ? data.counts.pending_review + data.counts.draft
              : data.counts[f.id] ?? 0
            : 0;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-[6px] text-[12px] font-medium transition-all flex items-center gap-1.5 ${
                filter === f.id
                  ? "bg-white/[0.08] text-white border border-white/[0.12]"
                  : "text-[#6B6B65] hover:text-[#C0C0BA] border border-transparent"
              }`}
            >
              {f.label}
              <span className="text-[10px] text-[#4A4A44]">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Request list */}
      {!data ? (
        <div className="text-[12px] text-[#4A4A44] py-8 text-center">Carregando fila de governança…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[8px] border border-white/[0.06] bg-[#111111] py-10 text-center">
          <div className="text-[13px] text-[#6B6B65]">Nenhum BrainChangeRequest neste status.</div>
          {filter === "pending_review" && (
            <div className="text-[11px] text-[#4A4A44] mt-1">
              Sugestões aprovadas no Training Center aparecem aqui automaticamente.
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((req) => {
            const riskColor = RISK_COLORS[req.riskLevel] ?? "#6B6B65";
            const expanded = expandedId === req.id;
            const sourceLabel = (BRAIN_CHANGE_SOURCE_LABELS as Record<string, string>)[req.source] ?? req.source;
            const statusLabel = (BRAIN_CHANGE_STATUS_LABELS as Record<string, string>)[req.status] ?? req.status;
            return (
              <div key={req.id} className="rounded-[8px] border border-white/[0.06] bg-[#111111]">
                {/* Header row */}
                <button
                  onClick={() => setExpandedId(expanded ? null : req.id)}
                  className="w-full text-left p-4 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-[13px] font-semibold text-white">{req.title}</span>
                        {req.requiresCeoApproval && (
                          <span className="text-[10px] font-semibold text-[#F59E0B] bg-[#F59E0B]/10 px-1.5 py-0.5 rounded border border-[#F59E0B]/20">
                            ◆ CEO
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Chip label={sourceLabel} color="#5B5BD6" />
                        <Chip label={req.department} color="#8A8A84" />
                        <Chip label={`risco: ${req.riskLevel}`} color={riskColor} />
                        <Chip label={statusLabel} color="#6B6B65" />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] text-[#4A4A44]">
                        {new Date(req.createdAt).toLocaleDateString("pt-BR")}
                      </div>
                      <div className="text-[10px] text-[#4A4A44] mt-0.5">{req.requestedBy}</div>
                    </div>
                  </div>
                </button>

                {/* Expanded review panel — Quality Gate before approval */}
                {expanded && (
                  <div className="px-4 pb-4 border-t border-white/[0.04] pt-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <ReviewField label="Benefícios Esperados" value={req.expectedImpact || "—"} />
                      <ReviewField
                        label="Riscos"
                        value={`Nível: ${req.riskLevel}${req.requiresCeoApproval ? " · Categoria estrutural — requer aprovação do CEO" : ""}`}
                        color={riskColor}
                      />
                      <ReviewField label="Departamentos Afetados" value={req.department} />
                      <ReviewField
                        label="Evidência"
                        value={req.rationale || (req.sourceSuggestionIds.length > 0
                          ? `${req.sourceSuggestionIds.length} sugestão(ões) de treinamento`
                          : "—")}
                      />
                    </div>

                    <div>
                      <div className="text-[10px] font-semibold text-[#4A4A44] uppercase tracking-[0.06em] mb-1">
                        Mudança Proposta
                      </div>
                      <div className="text-[12px] text-[#C0C0BA] bg-[#0A0A0A] rounded-[6px] px-3 py-2.5 leading-relaxed">
                        {req.proposedChange}
                      </div>
                    </div>

                    {req.description && (
                      <ReviewField label="Descrição / Problema" value={req.description} />
                    )}

                    <div>
                      <div className="text-[10px] font-semibold text-[#4A4A44] uppercase tracking-[0.06em] mb-1">
                        Aprovação requerida de
                      </div>
                      <div className="flex gap-1.5">
                        {req.approvalRequiredBy.map((r) => (
                          <Chip key={r} label={r} color={r === "ceo" ? "#F59E0B" : "#5B5BD6"} />
                        ))}
                      </div>
                    </div>

                    {req.reviewNote && (
                      <ReviewField label="Nota de Revisão" value={req.reviewNote} />
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                      {req.status === "draft" && (
                        <ActionButton
                          label="Submeter para Revisão"
                          color="#5B5BD6"
                          busy={actionBusy === req.id}
                          onClick={() => runAction(req.id, "submit")}
                        />
                      )}
                      {req.status === "pending_review" && (
                        <>
                          <ActionButton
                            label="Aprovar"
                            color="#16A34A"
                            busy={actionBusy === req.id}
                            onClick={() => runAction(req.id, "approve")}
                          />
                          <ActionButton
                            label="Rejeitar"
                            color="#DC2626"
                            busy={actionBusy === req.id}
                            onClick={() => runAction(req.id, "reject")}
                          />
                        </>
                      )}
                      {req.status === "approved" && (
                        <ActionButton
                          label="Aplicar (versiona o Brain)"
                          color="#5B5BD6"
                          busy={actionBusy === req.id}
                          onClick={() => runAction(req.id, "apply")}
                        />
                      )}
                      {(req.status === "rejected" || req.status === "applied" || req.status === "approved") && (
                        <ActionButton
                          label="Arquivar"
                          color="#6B6B65"
                          busy={actionBusy === req.id}
                          onClick={() => runAction(req.id, "archive")}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Version history */}
      {data && (
        <div>
          <SectionTitle>Histórico de Versões do Brain</SectionTitle>
          {data.versions.length === 0 ? (
            <div className="text-[12px] text-[#4A4A44]">
              Nenhuma mudança aplicada ainda. O Brain está em v{BRAIN_VERSION} (base).
            </div>
          ) : (
            <div className="space-y-2">
              {data.versions.map((v) => (
                <div key={v.id} className="flex items-center gap-3 rounded-[8px] border border-white/[0.06] bg-[#111111] px-4 py-2.5">
                  <span className="text-[12px] font-mono font-bold text-[#5B5BD6] shrink-0">v{v.version}</span>
                  <span className="text-[12px] text-[#C0C0BA] flex-1 truncate">{v.summary}</span>
                  <span className="text-[10px] text-[#4A4A44] shrink-0">
                    {new Date(v.createdAt).toLocaleString("pt-BR")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReviewField({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-[#4A4A44] uppercase tracking-[0.06em] mb-1">{label}</div>
      <div className="text-[12px] leading-relaxed" style={{ color: color ?? "#C0C0BA" }}>{value}</div>
    </div>
  );
}

function ActionButton({ label, color, busy, onClick }: { label: string; color: string; busy: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="text-[12px] font-medium px-3 py-1.5 rounded-[6px] border transition-all disabled:opacity-50"
      style={{ color, borderColor: `${color}40`, background: `${color}10` }}
    >
      {busy ? "…" : label}
    </button>
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
