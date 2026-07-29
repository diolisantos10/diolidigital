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
import { computeSDRMaturity, computeStrategyMaturity, computeSocialMaturity, computeDesignMaturity, computeTrafficMaturity, computeAnalyticsMaturity, computeQualityMaturity, MATURITY_LABELS } from "@/lib/dioli-brain/department-maturity";
import { computeStrategyScorecard } from "@/lib/dioli-brain/strategy-scorecard";
import { computeSocialScorecard } from "@/lib/dioli-brain/social-scorecard";
import { computeDesignScorecard } from "@/lib/dioli-brain/design-scorecard";
import { computeTrafficScorecard } from "@/lib/dioli-brain/traffic-scorecard";
import { computeAnalyticsScorecard } from "@/lib/dioli-brain/analytics-scorecard";
import { computeQualityScorecard } from "@/lib/dioli-brain/quality-scorecard";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import { useAgencyStore } from "@/store/agency-store";
import { useTrainingStore } from "@/store/training-store";
import { useStrategyStore } from "@/store/strategy-store";
import { useSocialStore } from "@/store/social-store";
import { useDesignStore } from "@/store/design-store";
import { useTrafficStore } from "@/store/traffic-store";
import { useAnalyticsStore } from "@/store/analytics-store";
import { useQualityStore } from "@/store/quality-store";

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
    <div className="min-h-screen bg-[var(--navy)] text-white">
      {/* Header */}
      <div className="border-b border-white/[0.06] px-8 py-6">
        <AgencyHeader
          tone="dark"
          title="Dioli Brain"
          subtitle={BRAIN_IDENTITY.tagline}
          meta={
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-[7px] bg-[var(--cyan)]/15 flex items-center justify-center shrink-0">
                <BrainIcon size={16} className="text-[var(--cyan)]" />
              </div>
              <span className="text-[11px] font-mono text-[var(--cyan)] bg-[var(--cyan)]/10 px-2 py-0.5 rounded-full border border-[var(--cyan)]/20">
                v{BRAIN_VERSION}
              </span>
            </div>
          }
          actions={
            <div className="text-right">
              <div className="text-[11px] text-[var(--text-secondary)] mb-1">Piloto ativo</div>
              <div className="text-[13px] font-medium text-[var(--cyan)]">Atendimento / SDR</div>
            </div>
          }
        />

        {/* Tabs */}
        <div className="flex gap-1 mt-5 flex-wrap">
          {TAB_IDS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-[6px] text-[12px] font-medium transition-all flex items-center gap-1.5 ${
                activeTab === tab
                  ? "bg-white/[0.08] text-white"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-subtle)]"
              }`}
            >
              {TAB_LABELS[tab]}
              {tab === "director" && pendingCount != null && pendingCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-[var(--warning)] text-white text-[9px] font-bold leading-none">
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
    <div className="rounded-[10px] border border-[var(--success)]/30 bg-[var(--success)]/[0.04] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold text-[var(--success)] uppercase tracking-[0.08em]">
          Primeiro Piloto — Atendimento / SDR
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border"
            style={{ color: maturity.color, borderColor: `${maturity.color}40`, background: `${maturity.color}15` }}
          >
            {MATURITY_LABELS[maturity.current]}
          </span>
          <span className="text-[10px] text-[var(--text-secondary)]">{maturity.completionPct}% maturidade</span>
        </div>
      </div>

      {/* Active capability statuses */}
      <div className="flex gap-2 flex-wrap">
        {statuses.map((s) => (
          <span
            key={s.label}
            className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
              s.active
                ? "text-[var(--success)] bg-[var(--success)]/10 border-[var(--success)]/20"
                : "text-[var(--text-secondary)] bg-white/[0.03] border-white/[0.06]"
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
            <span className={c.met ? "text-[var(--success)]" : "text-[var(--text-secondary)]"}>
              {c.met ? "✓" : "○"}
            </span>
            <span className={c.met ? "text-[var(--text-muted)]" : "text-[var(--text-secondary)]"}>{c.label}</span>
          </div>
        ))}
      </div>

      {/* SDR Scorecard */}
      <div className="border-t border-[var(--success)]/20 pt-3">
        <div className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.06em] mb-2">
          Scorecard SDR
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {scorecardMetrics.map((m) => (
            <div key={m.label} className="text-center">
              <div className="text-[15px] font-bold text-white">{m.value}</div>
              <div className="text-[9px] text-[var(--text-secondary)] mt-0.5">{m.label}</div>
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
    <div className="rounded-[10px] border border-[var(--cyan)]/30 bg-white/[0.04] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold text-[var(--cyan)] uppercase tracking-[0.08em]">
          Segundo Departamento — Estratégia
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border"
            style={{ color: maturity.color, borderColor: `${maturity.color}40`, background: `${maturity.color}15` }}
          >
            {MATURITY_LABELS[maturity.current]}
          </span>
          <span className="text-[10px] text-[var(--text-secondary)]">{maturity.completionPct}% maturidade</span>
        </div>
      </div>

      <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">
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
                ? "text-[var(--cyan)] bg-[var(--cyan)]/10 border-[var(--cyan)]/25"
                : "text-[var(--text-secondary)] bg-white/[0.03] border-white/[0.06]"
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
            <span className={c.met ? "text-[var(--cyan)]" : "text-[var(--text-secondary)]"}>
              {c.met ? "✓" : "○"}
            </span>
            <span className={c.met ? "text-[var(--text-muted)]" : "text-[var(--text-secondary)]"}>{c.label}</span>
          </div>
        ))}
      </div>

      {/* Strategy Scorecard */}
      <div className="border-t border-[var(--cyan)]/25 pt-3">
        <div className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.06em] mb-2">
          Scorecard Estratégia
        </div>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {scorecardMetrics.map((m) => (
            <div key={m.label} className="text-center">
              <div className="text-[15px] font-bold text-white">{m.value}</div>
              <div className="text-[9px] text-[var(--text-secondary)] mt-0.5">{m.label}</div>
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
    <div className="rounded-[10px] border border-[#0057FF]/30 bg-[#0057FF]/[0.04] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold text-[#0057FF] uppercase tracking-[0.08em]">
          Terceiro Departamento — Social Media (primeiro de execução)
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border"
            style={{ color: maturity.color, borderColor: `${maturity.color}40`, background: `${maturity.color}15` }}
          >
            {MATURITY_LABELS[maturity.current]}
          </span>
          <span className="text-[10px] text-[var(--text-secondary)]">{maturity.completionPct}% maturidade</span>
        </div>
      </div>

      <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">
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
                ? "text-[#0057FF] bg-[#0057FF]/10 border-[#0057FF]/20"
                : "text-[var(--text-secondary)] bg-white/[0.03] border-white/[0.06]"
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
            <span className={c.met ? "text-[#0057FF]" : "text-[var(--text-secondary)]"}>
              {c.met ? "✓" : "○"}
            </span>
            <span className={c.met ? "text-[var(--text-muted)]" : "text-[var(--text-secondary)]"}>{c.label}</span>
          </div>
        ))}
      </div>

      {/* Social Scorecard */}
      <div className="border-t border-[#0057FF]/20 pt-3">
        <div className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.06em] mb-2">
          Scorecard Social
        </div>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {scorecardMetrics.map((m) => (
            <div key={m.label} className="text-center">
              <div className="text-[15px] font-bold text-white">{m.value}</div>
              <div className="text-[9px] text-[var(--text-secondary)] mt-0.5">{m.label}</div>
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
    <div className="rounded-[10px] border border-[#0891B2]/30 bg-[#0891B2]/[0.04] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold text-[#0891B2] uppercase tracking-[0.08em]">
          Quarto Departamento — Design (segundo de execução)
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border"
            style={{ color: maturity.color, borderColor: `${maturity.color}40`, background: `${maturity.color}15` }}
          >
            {MATURITY_LABELS[maturity.current]}
          </span>
          <span className="text-[10px] text-[var(--text-secondary)]">{maturity.completionPct}% maturidade</span>
        </div>
      </div>

      <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">
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
                ? "text-[#0891B2] bg-[#0891B2]/10 border-[#0891B2]/20"
                : "text-[var(--text-secondary)] bg-white/[0.03] border-white/[0.06]"
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
            <span className={c.met ? "text-[#0891B2]" : "text-[var(--text-secondary)]"}>
              {c.met ? "✓" : "○"}
            </span>
            <span className={c.met ? "text-[var(--text-muted)]" : "text-[var(--text-secondary)]"}>{c.label}</span>
          </div>
        ))}
      </div>

      {/* Design Scorecard */}
      <div className="border-t border-[#0891B2]/20 pt-3">
        <div className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.06em] mb-2">
          Scorecard Design
        </div>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {scorecardMetrics.map((m) => (
            <div key={m.label} className="text-center">
              <div className="text-[15px] font-bold text-white">{m.value}</div>
              <div className="text-[9px] text-[var(--text-secondary)] mt-0.5">{m.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Traffic Department Panel ─────────────────────────────────────────────────

function TrafficDepartmentPanel() {
  const { canvases, changeRequestCanvasIds } = useTrafficStore();

  const scorecard = computeTrafficScorecard(canvases, changeRequestCanvasIds.length);
  const maturity  = computeTrafficMaturity({
    hasTrafficEngine:         true,
    hasWorkspace:             true,
    hasQualityGate:           true,
    hasBudgetModel:           true,
    hasAudienceModel:         true,
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
    { label: "Budget Model",  active: true },
    { label: "Audience",      active: true },
    { label: "Simulador",     active: true },
    { label: "Treinamento",   active: true },
    { label: "Governança",    active: true },
    { label: "Evidência",     active: true },
  ];

  const scorecardMetrics = [
    { label: "Canvases",        value: scorecard.canvasesCreated.toString() },
    { label: "Aprovados",       value: scorecard.canvasesApproved.toString() },
    { label: "Aprovação",       value: `${scorecard.approvalRate}%` },
    { label: "Campanhas",       value: scorecard.campaignsPlanned.toString() },
    { label: "Budget total",    value: `R$ ${scorecard.totalBudgetAllocated.toLocaleString("pt-BR")}` },
    { label: "QG Pass",         value: scorecard.canvasesCreated > 0 ? `${scorecard.qualityGatePassRate}%` : "—" },
    { label: "Evidências",      value: scorecard.evidenceGenerated.toString() },
    { label: "Brain Changes",   value: scorecard.brainChangeRequestsGenerated.toString() },
  ];

  return (
    <div className="rounded-[10px] border border-[#0891B2]/30 bg-[#0891B2]/[0.04] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold text-[#0891B2] uppercase tracking-[0.08em]">
          Quinto Departamento — Tráfego Pago (terceiro de execução)
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border"
            style={{ color: maturity.color, borderColor: `${maturity.color}40`, background: `${maturity.color}15` }}
          >
            {MATURITY_LABELS[maturity.current]}
          </span>
          <span className="text-[10px] text-[var(--text-secondary)]">{maturity.completionPct}% maturidade</span>
        </div>
      </div>

      <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">
        Transforma estratégia em planos de campanhas pagas: estrutura de campanha, audiências, budget (fee separado),
        mapeamento de ofertas e projeções de CAC/ROAS. Nunca lança campanha sem Traffic Canvas aprovado.
      </p>

      {/* Active capability statuses */}
      <div className="flex gap-2 flex-wrap">
        {statuses.map((s) => (
          <span
            key={s.label}
            className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
              s.active
                ? "text-[#0891B2] bg-[#0891B2]/10 border-[#0891B2]/20"
                : "text-[var(--text-secondary)] bg-white/[0.03] border-white/[0.06]"
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
            <span className={c.met ? "text-[#0891B2]" : "text-[var(--text-secondary)]"}>
              {c.met ? "✓" : "○"}
            </span>
            <span className={c.met ? "text-[var(--text-muted)]" : "text-[var(--text-secondary)]"}>{c.label}</span>
          </div>
        ))}
      </div>

      {/* Traffic Scorecard */}
      <div className="border-t border-[#0891B2]/20 pt-3">
        <div className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.06em] mb-2">
          Scorecard Tráfego Pago
        </div>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {scorecardMetrics.map((m) => (
            <div key={m.label} className="text-center">
              <div className="text-[15px] font-bold text-white">{m.value}</div>
              <div className="text-[9px] text-[var(--text-secondary)] mt-0.5">{m.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Analytics Department Panel ──────────────────────────────────────────────

function AnalyticsDepartmentPanel() {
  const { canvases, changeRequestCanvasIds } = useAnalyticsStore();

  const scorecard = computeAnalyticsScorecard(canvases, changeRequestCanvasIds.length);
  const maturity  = computeAnalyticsMaturity({
    hasAnalyticsEngine:       true,
    hasWorkspace:             true,
    hasQualityGate:           true,
    hasKPIFramework:          true,
    hasAttributionModel:      true,
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
    { label: "Engine",           active: true },
    { label: "Workspace",        active: true },
    { label: "Quality Gate",     active: true },
    { label: "KPI Framework",    active: true },
    { label: "Attribution",      active: true },
    { label: "Simulador",        active: true },
    { label: "Treinamento",      active: true },
    { label: "Governança",       active: true },
    { label: "Evidência",        active: true },
  ];

  const scorecardMetrics = [
    { label: "Canvases",         value: scorecard.canvasesCreated.toString() },
    { label: "Aprovados",        value: scorecard.canvasesApproved.toString() },
    { label: "Aprovação",        value: `${scorecard.approvalRate}%` },
    { label: "KPIs mapeados",    value: scorecard.kpisFramed.toString() },
    { label: "Recomendações",    value: scorecard.recommendationsGenerated.toString() },
    { label: "QG Pass",          value: scorecard.canvasesCreated > 0 ? `${scorecard.qualityGatePassRate}%` : "—" },
    { label: "Evidências",       value: scorecard.evidenceGenerated.toString() },
    { label: "Brain Changes",    value: scorecard.brainChangeRequestsGenerated.toString() },
  ];

  return (
    <div className="rounded-[10px] border border-[var(--success)]/30 bg-[var(--success)]/[0.04] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold text-[var(--success)] uppercase tracking-[0.08em]">
          Sexto Departamento — Analytics (mensuração e inteligência)
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border"
            style={{ color: maturity.color, borderColor: `${maturity.color}40`, background: `${maturity.color}15` }}
          >
            {MATURITY_LABELS[maturity.current]}
          </span>
          <span className="text-[10px] text-[var(--text-secondary)]">{maturity.completionPct}% maturidade</span>
        </div>
      </div>

      <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">
        Transforma dados de performance em inteligência mensurável: framework de KPIs, modelo de atribuição por canal,
        gaps de performance, recomendações cross-departamento e thresholds de alerta. Consome Strategy, Social, Design e Traffic.
      </p>

      <div className="flex gap-2 flex-wrap">
        {statuses.map((s) => (
          <span
            key={s.label}
            className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
              s.active
                ? "text-[var(--success)] bg-[var(--success)]/10 border-[var(--success)]/20"
                : "text-[var(--text-secondary)] bg-white/[0.03] border-white/[0.06]"
            }`}
          >
            {s.active ? "✓ " : "○ "}{s.label}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {maturity.criteria.map((c) => (
          <div key={c.id} className="flex items-center gap-1.5 text-[10px]">
            <span className={c.met ? "text-[var(--success)]" : "text-[var(--text-secondary)]"}>
              {c.met ? "✓" : "○"}
            </span>
            <span className={c.met ? "text-[var(--text-muted)]" : "text-[var(--text-secondary)]"}>{c.label}</span>
          </div>
        ))}
      </div>

      <div className="border-t border-[var(--success)]/20 pt-3">
        <div className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.06em] mb-2">
          Scorecard Analytics
        </div>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {scorecardMetrics.map((m) => (
            <div key={m.label} className="text-center">
              <div className="text-[15px] font-bold text-white">{m.value}</div>
              <div className="text-[9px] text-[var(--text-secondary)] mt-0.5">{m.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function QualityDepartmentPanel() {
  const { canvases, changeRequestCanvasIds } = useQualityStore();

  const scorecard = computeQualityScorecard(canvases, changeRequestCanvasIds.length);
  const maturity  = computeQualityMaturity({
    hasQualityEngine:         true,
    hasWorkspace:             true,
    hasGlobalGate:            true,
    hasDeptGates:             true,
    hasPatternDetection:      true,
    hasSimulator:             true,
    hasTrainingStructure:     true,
    hasGovernanceIntegration: true,
    hasEvidenceTypes:         true,
    auditsRun:                    scorecard.auditsRun,
    auditsApproved:               scorecard.auditsApproved,
    brainChangeRequestsGenerated: scorecard.brainChangeRequestsGenerated,
    qualityGatePassRate:          scorecard.qualityGatePassRate,
  });

  const statuses = [
    { label: "Engine",           active: true },
    { label: "Workspace",        active: true },
    { label: "Global Gate",      active: true },
    { label: "Dept Gates",       active: true },
    { label: "Padrões",          active: true },
    { label: "Simulador",        active: true },
    { label: "Treinamento",      active: true },
    { label: "Governança",       active: true },
    { label: "Evidência",        active: true },
  ];

  const scorecardMetrics = [
    { label: "Auditorias",        value: scorecard.auditsRun.toString() },
    { label: "Aprovadas",         value: scorecard.auditsApproved.toString() },
    { label: "Aprovação",         value: `${scorecard.approvalRate}%` },
    { label: "Padrões",           value: scorecard.patternsIdentified.toString() },
    { label: "Recomendações",     value: scorecard.recommendationsGenerated.toString() },
    { label: "Sinais",            value: scorecard.trainingSignalsExtracted.toString() },
    { label: "Evidências",        value: scorecard.evidenceCandidatesFound.toString() },
    { label: "Brain Changes",     value: scorecard.brainChangeRequestsGenerated.toString() },
  ];

  return (
    <div className="rounded-[10px] border border-[var(--cyan)]/30 bg-white/[0.04] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold text-[var(--cyan)] uppercase tracking-[0.08em]">
          Sétimo Departamento — Quality (auditoria e padrões)
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border"
            style={{ color: maturity.color, borderColor: `${maturity.color}40`, background: `${maturity.color}15` }}
          >
            {MATURITY_LABELS[maturity.current]}
          </span>
          <span className="text-[10px] text-[var(--text-secondary)]">{maturity.completionPct}% maturidade</span>
        </div>
      </div>

      <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">
        Executa auditorias cross-departamento completas: Quality Gate global + departamental, detecção de padrões de
        força e risco, candidatos a evidência e sinais de treinamento. Consome todos os canvases upstream.
      </p>

      <div className="flex gap-2 flex-wrap">
        {statuses.map((s) => (
          <span
            key={s.label}
            className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
              s.active
                ? "text-[var(--cyan)] bg-[var(--cyan)]/10 border-[var(--cyan)]/25"
                : "text-[var(--text-secondary)] bg-white/[0.03] border-white/[0.06]"
            }`}
          >
            {s.active ? "✓ " : "○ "}{s.label}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {maturity.criteria.map((c) => (
          <div key={c.id} className="flex items-center gap-1.5 text-[10px]">
            <span className={c.met ? "text-[var(--cyan)]" : "text-[var(--text-secondary)]"}>
              {c.met ? "✓" : "○"}
            </span>
            <span className={c.met ? "text-[var(--text-muted)]" : "text-[var(--text-secondary)]"}>{c.label}</span>
          </div>
        ))}
      </div>

      <div className="border-t border-[var(--cyan)]/25 pt-3">
        <div className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.06em] mb-2">
          Scorecard Quality
        </div>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {scorecardMetrics.map((m) => (
            <div key={m.label} className="text-center">
              <div className="text-[15px] font-bold text-white">{m.value}</div>
              <div className="text-[9px] text-[var(--text-secondary)] mt-0.5">{m.label}</div>
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
      <div className="rounded-[10px] border border-[var(--cyan)]/30 bg-white/[0.04] p-5">
        <div className="text-[11px] font-semibold text-[var(--cyan)] uppercase tracking-[0.08em] mb-3">Tese Central</div>
        <p className="text-[15px] font-medium text-white leading-relaxed">
          A IA não é o produto. O Brain é o produto.
        </p>
        <p className="text-[13px] text-[var(--text-muted)] mt-2 leading-relaxed">
          Modelos de IA são motores — intercambiáveis, melhoráveis, substituíveis.
          O Dioli Brain é a inteligência operacional que permanece constante independente de qual motor é usado.
          Departamentos são escopos profissionais. Agentes não são brains independentes.
          Todo agente raciocina através da mesma lógica do Brain, restrito ao seu escopo de departamento.
        </p>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Módulos mapeados" value={mapped} total={CURRENT_SYSTEM_MAP.length} color="#16A34A" />
        <StatCard label="Depts existentes" value={existing} total={BRAIN_DEPARTMENTS.length} color="#9B9EB5" />
        <StatCard label="Depts parciais" value={partial} total={BRAIN_DEPARTMENTS.length} color="#D97706" />
        <StatCard label="Precisam refatorar" value={needsRefactor} total={CURRENT_SYSTEM_MAP.length} color="#9B9EB5" />
      </div>

      {/* Architecture layers */}
      <div>
        <SectionTitle>Camadas de Arquitetura</SectionTitle>
        <div className="grid grid-cols-3 gap-3">
          {ARCHITECTURE_LAYERS.map((layer) => (
            <div key={layer.id} className="rounded-[8px] border border-white/[0.06] bg-[var(--navy)] p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-[5px] flex items-center justify-center text-[14px]"
                  style={{ background: `${layer.color}15` }}>
                  <span style={{ color: layer.color }}>{layer.icon}</span>
                </div>
                <span className="text-[12px] font-semibold text-white">{layer.name}</span>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{layer.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Brain rules */}
      <div>
        <SectionTitle>Regras Fundamentais</SectionTitle>
        <div className="space-y-2">
          {BRAIN_RULES.map((rule, i) => (
            <div key={i} className="flex items-start gap-2.5 text-[12px] text-[var(--text-muted)]">
              <span className="text-[var(--cyan)] mt-0.5 shrink-0">—</span>
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

      {/* Traffic Department — live metrics */}
      <TrafficDepartmentPanel />

      {/* Analytics Department — live metrics */}
      <AnalyticsDepartmentPanel />

      {/* Quality Department — live metrics */}
      <QualityDepartmentPanel />

      {/* Department Pipeline */}
      <DepartmentPipelineSection />

      {/* System map */}
      <SystemMapSection />

      {/* Pilot readiness */}
      <PilotReadinessChecklist />
    </div>
  );
}

function DepartmentPipelineSection() {
  const PIPELINE_STEPS = [
    { step: 1, dept: "SDR",       status: "waiting_strategy", label: "Atendimento / SDR",  color: "#9B9EB5", href: "/agency/requests" },
    { step: 2, dept: "Strategy",  status: "waiting_social",   label: "Estratégia",         color: "#9B9EB5", href: "/agency/strategy" },
    { step: 3, dept: "Social",    status: "waiting_design",   label: "Social Media",       color: "#0057FF", href: "/agency/social" },
    { step: 4, dept: "Design",    status: "waiting_traffic",  label: "Design",             color: "#0891B2", href: "/agency/design" },
    { step: 5, dept: "Traffic",   status: "waiting_analytics",label: "Tráfego Pago",       color: "#0891B2", href: "/agency/traffic" },
    { step: 6, dept: "Analytics", status: "waiting_quality",  label: "Analytics",          color: "#16A34A", href: "/agency/analytics" },
    { step: 7, dept: "Quality",   status: "in_progress",      label: "Quality",            color: "#9B9EB5", href: "/agency/quality" },
  ];

  return (
    <div className="rounded-[10px] border border-white/[0.06] bg-[var(--navy)] p-5">
      <div className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.08em] mb-4">
        Pipeline de Departamentos — Fase 1 Completa
      </div>
      <div className="flex items-start gap-0 overflow-x-auto pb-1">
        {PIPELINE_STEPS.map((s, i) => (
          <div key={s.dept} className="flex items-center shrink-0">
            <div className="flex flex-col items-center gap-1.5 w-[88px]">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                style={{ background: s.color }}
              >
                {s.step}
              </div>
              <div className="text-[10px] font-semibold text-white text-center leading-tight">{s.label}</div>
              <div className="text-[9px] text-[var(--text-secondary)] text-center leading-tight font-mono">{s.status}</div>
            </div>
            {i < PIPELINE_STEPS.length - 1 && (
              <div className="w-6 h-px bg-[var(--navy)] shrink-0 mb-5" />
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-white/[0.04] text-[11px] text-[var(--text-secondary)]">
        Cada departamento gera um Canvas aprovado antes de avançar para o próximo. Quality encerra o loop Brain.
      </div>
    </div>
  );
}

function SystemMapSection() {
  const statusColors: Record<string, string> = {
    mapped: "#16A34A", partial: "#D97706", unmapped: "#9B9EB5", needs_refactor: "#9B9EB5",
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
            <div key={m.moduleId} className="rounded-[8px] border border-white/[0.06] bg-[var(--navy)] p-3.5">
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
                  <div className="text-[10px] font-mono text-[var(--text-secondary)] mb-1">{m.currentPath}</div>
                  <p className="text-[11px] text-[var(--text-secondary)]">{m.notes}</p>
                </div>
                {m.brainDepartmentId && (
                  <span className="text-[10px] text-[var(--cyan)] bg-[var(--cyan)]/10 px-1.5 py-0.5 rounded border border-[var(--cyan)]/25 shrink-0">
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

// ─── Pilot Readiness Checklist ────────────────────────────────────────────────

type CheckStatus = "done" | "partial" | "blocked";

interface CheckItem {
  label: string;
  status: CheckStatus;
  note?: string;
}

const PILOT_CHECKS: CheckItem[] = [
  { status: "done",    label: "Modelos DB persistidos (ClientRequestDb, BrainArtifact, ApprovalRequest, EvidenceItem, PortalAccess)" },
  { status: "done",    label: "Briefing público grava em DB (dual-write: Zustand + API)" },
  { status: "done",    label: "FAIL bloqueia aprovação em todos os departamentos (incluindo Estratégia)" },
  { status: "done",    label: "Aprovações de departamento persistem BrainArtifact no DB" },
  { status: "done",    label: "APIs brain/client-requests, brain/artifacts, brain/approvals, brain/evidence criadas" },
  { status: "done",    label: "Portal cliente: seção Brain Pipeline lê do DB em tempo real" },
  { status: "done",    label: "Rota /portal/access/[token] valida PortalAccess e renderiza pipeline" },
  { status: "done",    label: "Override manual de status requer motivo e registra atividade" },
  { status: "partial", label: "Portal cliente: deliverables e propostas ainda lêem do Zustand (localStorage)", note: "Migração incremental pendente" },
  { status: "partial", label: "Aprovação formal do cliente via ApprovalRequest (API existe, UI pendente)", note: "Fluxo backend pronto, tela cliente não criada" },
  { status: "partial", label: "Evidências persistidas no DB via API (saveEvidenceToDb pendente nas UIs de depto)", note: "API pronta, chamadas de UI pendentes" },
  { status: "blocked", label: "SQLite ephemeral no Railway: dados apagados a cada deploy (db:provision --accept-data-loss)", note: "Necessário migrar para Postgres ou proteger seed antes do piloto real" },
];

function PilotReadinessChecklist() {
  const done    = PILOT_CHECKS.filter((c) => c.status === "done").length;
  const partial = PILOT_CHECKS.filter((c) => c.status === "partial").length;
  const blocked = PILOT_CHECKS.filter((c) => c.status === "blocked").length;

  const statusStyle: Record<CheckStatus, { icon: string; color: string; bg: string }> = {
    done:    { icon: "✓", color: "#16A34A", bg: "#DCFCE7" },
    partial: { icon: "~", color: "#D97706", bg: "#FEF3C7" },
    blocked: { icon: "✗", color: "#DC2626", bg: "#FEE2E2" },
  };

  return (
    <div>
      <SectionTitle>Prontidão para Piloto</SectionTitle>
      <div className="rounded-[10px] border border-white/[0.06] bg-[var(--navy)] p-4 mb-3">
        <div className="flex items-center gap-4 mb-3">
          <span className="text-[11px] text-[var(--text-secondary)]">
            <span className="text-[var(--success)] font-bold">{done}</span> concluídos ·{" "}
            <span className="text-[var(--warning)] font-bold">{partial}</span> parciais ·{" "}
            <span className="text-[var(--danger)] font-bold">{blocked}</span> bloqueados
          </span>
          <span className={`ml-auto h-6 px-3 rounded-full text-[10px] font-semibold flex items-center ${
            blocked > 0 ? "bg-[#FEE2E2] text-[var(--danger)]" : partial > 0 ? "bg-[var(--warning-bg)] text-[var(--warning)]" : "bg-[var(--success-bg)] text-[var(--success)]"
          }`}>
            {blocked > 0 ? "NÃO PRONTO" : partial > 0 ? "QUASE PRONTO" : "PRONTO"}
          </span>
        </div>
        <div className="space-y-2">
          {PILOT_CHECKS.map((item, i) => {
            const s = statusStyle[item.status];
            return (
              <div key={i} className="flex items-start gap-2.5">
                <div
                  className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5"
                  style={{ background: s.bg, color: s.color }}
                >
                  {s.icon}
                </div>
                <div>
                  <p className="text-[11px] text-[var(--text-subtle)] leading-tight">{item.label}</p>
                  {item.note && (
                    <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 italic">{item.note}</p>
                  )}
                </div>
              </div>
            );
          })}
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
      <p className="text-[13px] text-[var(--text-secondary)] mb-5">
        Todo departamento usa o mesmo fluxo de raciocínio. O escopo e as ferramentas diferem; a lógica não.
      </p>
      <div className="space-y-3">
        {DIOLI_COGNITIVE_FLOW.map((step) => (
          <div key={step.id} className="rounded-[8px] border border-white/[0.06] bg-[var(--navy)] p-4">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-[var(--cyan)]/10 border border-[var(--cyan)]/25 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[10px] font-bold text-[var(--cyan)]">{step.order}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-white mb-0.5">{step.label}</div>
                <div className="text-[12px] text-[var(--text-secondary)] italic mb-2">{step.guidingQuestion}</div>
                <div className="text-[11px] text-[var(--cyan)]">
                  Output: <span className="font-mono">{step.output}</span>
                </div>
                {step.riskFlags.length > 0 && (
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {step.riskFlags.map((f) => (
                      <span key={f} className="text-[10px] text-[var(--warning)] bg-[var(--warning)]/10 px-1.5 py-0.5 rounded border border-[var(--warning)]/20">
                        {f}
                      </span>
                    ))}
                  </div>
                )}
                {step.humanApprovalTriggers.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {step.humanApprovalTriggers.map((t) => (
                      <span key={t} className="text-[10px] text-[var(--danger)] bg-[var(--danger)]/10 px-1.5 py-0.5 rounded border border-[var(--danger)]/20">
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
      <p className="text-[13px] text-[var(--text-secondary)] mb-5">
        A lógica do Brain é compartilhada. Departamentos definem escopo, permissões, ferramentas e tipos de entregável.
      </p>
      <div className="grid grid-cols-2 gap-4">
        {BRAIN_DEPARTMENTS.map((dept) => {
          const statusColor = BRAIN_STATUS_COLORS[dept.firstVersionStatus];
          const statusLabel = BRAIN_STATUS_LABELS[dept.firstVersionStatus];
          return (
            <div key={dept.id} className="rounded-[8px] border border-white/[0.06] bg-[var(--navy)] p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="text-[13px] font-semibold text-white">{dept.name}</div>
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full border"
                  style={{ color: statusColor, borderColor: `${statusColor}30`, background: `${statusColor}10` }}
                >
                  {statusLabel}
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] mb-3 leading-relaxed">{dept.mission}</p>
              <div className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.06em] mb-1.5">
                Quality Gate ({dept.qualityGate.length} checks)
              </div>
              <div className="space-y-0.5">
                {dept.qualityGate.slice(0, 3).map((check) => (
                  <div key={check} className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                    <span className="text-[var(--cyan)]">·</span>
                    {check}
                  </div>
                ))}
                {dept.qualityGate.length > 3 && (
                  <div className="text-[10px] text-[var(--text-secondary)]">+{dept.qualityGate.length - 3} mais</div>
                )}
              </div>
              {dept.simulator && (
                <div className="mt-2 pt-2 border-t border-white/[0.04]">
                  <span className="text-[10px] text-[var(--success)] bg-[var(--success)]/10 px-1.5 py-0.5 rounded border border-[var(--success)]/20">
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
        <p className="text-[13px] text-[var(--text-secondary)] mb-4">
          O modelo pode mudar. O Brain não pode. Configuração de roteamento por departamento.
        </p>
        <div className="space-y-2">
          {ENGINE_ROUTES.map((route) => (
            <div key={route.departmentId} className="rounded-[8px] border border-white/[0.06] bg-[var(--navy)] p-3.5">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[12px] font-semibold text-white">{route.departmentId}</div>
                <div className="flex gap-1.5">
                  <Chip label={route.costTier} color={route.costTier === "low" ? "#16A34A" : route.costTier === "medium" ? "#D97706" : "#DC2626"} />
                  <Chip label={route.latencyTier} color="#9B9EB5" />
                  <Chip label={route.qualityTier} color="#9B9EB5" />
                </div>
              </div>
              <div className="flex gap-4 text-[11px] text-[var(--text-secondary)]">
                <span>Preferido: <span className="text-white font-mono">{route.preferredProvider}</span></span>
                <span>Fallback: <span className="text-white font-mono">{route.fallbackProvider}</span></span>
                <span>Capacidade: <span className="text-[var(--cyan)]">{route.capabilityRequired}</span></span>
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
      <p className="text-[13px] text-[var(--text-secondary)] mb-5">
        Memória institucional da agência. Estruturada, controlada por acesso e atualizável.
      </p>
      <div className="space-y-2">
        {KNOWLEDGE_SOURCES.map((src) => (
          <div key={src.sourceId} className="rounded-[8px] border border-white/[0.06] bg-[var(--navy)] p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[12px] font-semibold text-white">{src.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                    src.sensitivity === "confidential"
                      ? "text-[var(--danger)] bg-[var(--danger)]/10 border-[var(--danger)]/20"
                      : src.sensitivity === "internal"
                      ? "text-[var(--warning)] bg-[var(--warning)]/10 border-[var(--warning)]/20"
                      : "text-[var(--text-secondary)] bg-white/[0.04] border-white/[0.08]"
                  }`}>
                    {src.sensitivity}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)]">{src.description}</p>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[10px] text-[var(--text-secondary)]">{src.owner}</div>
                <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                  {src.currentSystemMapping
                    ? <span className="text-[var(--success)]">mapeado</span>
                    : <span className="text-[var(--warning)]">pendente</span>}
                </div>
              </div>
            </div>
            {src.currentSystemMapping && (
              <div className="mt-2 text-[10px] font-mono text-[var(--text-secondary)] bg-[var(--navy)] px-2 py-1 rounded">
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
        <p className="text-[13px] text-[var(--text-secondary)] mb-4">
          Loop de aprendizado do Brain. Simulações → Sugestões → BrainChangeRequest → revisão do Brain Director.
        </p>
      </div>

      {/* Worker status */}
      <div className="rounded-[10px] border border-white/[0.06] bg-[var(--navy)] p-5">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[12px] font-semibold text-white">Worker 24h — SDR (piloto)</span>
          {status ? (
            status.workerActive ? (
              <span className="text-[10px] font-semibold text-[var(--success)] bg-[var(--success)]/10 px-2 py-0.5 rounded-full border border-[var(--success)]/20">ATIVO</span>
            ) : (
              <span className="text-[10px] font-semibold text-[var(--warning)] bg-[var(--warning)]/10 px-2 py-0.5 rounded-full border border-[var(--warning)]/20">CONFIGURAR</span>
            )
          ) : (
            <span className="text-[10px] text-[var(--text-secondary)]">{loadFailed ? "indisponível" : "carregando…"}</span>
          )}
        </div>
        {status && (
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-[18px] font-bold text-white">{status.runsToday}<span className="text-[12px] text-[var(--text-secondary)] font-normal"> / {status.dailyCap}</span></div>
              <div className="text-[11px] text-[var(--text-secondary)]">runs hoje / cap diário</div>
            </div>
            <div>
              <div className="text-[18px] font-bold text-[var(--warning)]">{status.pendingSuggestions}</div>
              <div className="text-[11px] text-[var(--text-secondary)]">sugestões pendentes</div>
            </div>
            <div>
              <div className="text-[13px] font-medium text-white mt-1">
                {status.lastBatchAt ? new Date(status.lastBatchAt).toLocaleString("pt-BR") : "—"}
              </div>
              <div className="text-[11px] text-[var(--text-secondary)]">último batch</div>
            </div>
          </div>
        )}
        <a
          href="/agency/simulations/training"
          className="inline-block mt-4 text-[12px] text-[var(--cyan)] hover:text-[#6D8BFF] transition-colors"
        >
          Abrir Training Center completo →
        </a>
      </div>

      {/* Pipeline explanation */}
      <div className="rounded-[10px] border border-[var(--cyan)]/25 bg-white/[0.03] p-5">
        <div className="text-[11px] font-semibold text-[var(--cyan)] uppercase tracking-[0.08em] mb-3">
          Pipeline de Governança
        </div>
        <div className="flex items-center gap-2 text-[12px] text-[var(--text-muted)] flex-wrap">
          <span className="text-white font-medium">Simulação</span>
          <span className="text-[var(--text-secondary)]">→</span>
          <span className="text-white font-medium">Sugestão (pending)</span>
          <span className="text-[var(--text-secondary)]">→</span>
          <span className="text-white font-medium">Aprovação manual</span>
          <span className="text-[var(--text-secondary)]">→</span>
          <span className="text-[var(--cyan)] font-medium">BrainChangeRequest</span>
          <span className="text-[var(--text-secondary)]">→</span>
          <span className="text-white font-medium">Brain Director</span>
          <span className="text-[var(--text-secondary)]">→</span>
          <span className="text-[var(--success)] font-medium">Aplicado + versão</span>
        </div>
        <p className="text-[11px] text-[var(--text-secondary)] mt-3">
          Sugestões aprovadas criam automaticamente um BrainChangeRequest em status pending_review.
          Nada é aplicado automaticamente — a aplicação é uma transição explícita e separada, feita pelo Brain Director.
        </p>
      </div>

      {/* Policy rules */}
      <div>
        <SectionTitle>Política de Treinamento</SectionTitle>
        <div className="space-y-2">
          {TRAINING_RULES.map((rule, i) => (
            <div key={i} className="flex items-start gap-2.5 text-[12px] text-[var(--text-muted)]">
              <span className="text-[var(--cyan)] mt-0.5 shrink-0">—</span>
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
        <p className="text-[13px] text-[var(--text-secondary)] mb-4">
          O gate global se aplica a toda saída de departamento. Gates por departamento adicionam checks de escopo.
          Enforcement em runtime virá em fase futura — esta é a definição de governança.
        </p>
      </div>

      {/* Global gate */}
      <div className="rounded-[10px] border border-[var(--cyan)]/25 bg-white/[0.03] p-5">
        <div className="text-[11px] font-semibold text-[var(--cyan)] uppercase tracking-[0.08em] mb-3">
          Gate Global — todos os departamentos
        </div>
        <div className="space-y-2">
          {GLOBAL_QUALITY_GATE.map((check) => (
            <div key={check.id} className="flex items-start gap-2.5">
              <span className={`text-[10px] mt-0.5 px-1.5 py-0.5 rounded border shrink-0 ${
                check.blocking
                  ? "text-[var(--danger)] bg-[var(--danger)]/10 border-[var(--danger)]/20"
                  : "text-[var(--text-secondary)] bg-white/[0.04] border-white/[0.08]"
              }`}>
                {check.blocking ? "bloqueante" : "advisory"}
              </span>
              <div>
                <span className="text-[12px] font-medium text-white">{check.label}</span>
                <p className="text-[11px] text-[var(--text-secondary)]">{check.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Department gates */}
      <div className="grid grid-cols-2 gap-4">
        {deptGateEntries.map(([deptId, checks]) => (
          <div key={deptId} className="rounded-[8px] border border-white/[0.06] bg-[var(--navy)] p-4">
            <div className="text-[12px] font-semibold text-white mb-2">
              {deptNames[deptId] ?? deptId}
            </div>
            <div className="space-y-1.5">
              {checks.map((check) => (
                <div key={check.id} className="flex items-start gap-1.5 text-[11px] text-[var(--text-muted)]">
                  <span className={check.blocking ? "text-[var(--danger)] shrink-0" : "text-[var(--text-secondary)] shrink-0"}>
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
          <p className="text-[13px] text-[var(--text-secondary)]">
            Nada modifica o Brain diretamente. Toda mudança passa por esta fila:
            pending_review → aprovado → aplicado (versiona o Brain).
          </p>
        </div>
        {data && (
          <div className="text-right shrink-0">
            <div className="text-[11px] text-[var(--text-secondary)] mb-1">Versão atual do Brain</div>
            <div className="text-[16px] font-mono font-bold text-[var(--cyan)]">v{data.currentVersion}</div>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-[8px] border border-[var(--danger)]/30 bg-[var(--danger)]/[0.06] px-4 py-3 text-[12px] text-[#FCA5A5]">
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
                  : "text-[var(--text-secondary)] hover:text-[var(--text-subtle)] border border-transparent"
              }`}
            >
              {f.label}
              <span className="text-[10px] text-[var(--text-secondary)]">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Request list */}
      {!data ? (
        <div className="text-[12px] text-[var(--text-secondary)] py-8 text-center">Carregando fila de governança…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[8px] border border-white/[0.06] bg-[var(--navy)] py-10 text-center">
          <div className="text-[13px] text-[var(--text-secondary)]">Nenhum BrainChangeRequest neste status.</div>
          {filter === "pending_review" && (
            <div className="text-[11px] text-[var(--text-secondary)] mt-1">
              Sugestões aprovadas no Training Center aparecem aqui automaticamente.
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((req) => {
            const riskColor = RISK_COLORS[req.riskLevel] ?? "#9B9EB5";
            const expanded = expandedId === req.id;
            const sourceLabel = (BRAIN_CHANGE_SOURCE_LABELS as Record<string, string>)[req.source] ?? req.source;
            const statusLabel = (BRAIN_CHANGE_STATUS_LABELS as Record<string, string>)[req.status] ?? req.status;
            return (
              <div key={req.id} className="rounded-[8px] border border-white/[0.06] bg-[var(--navy)]">
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
                        <Chip label={sourceLabel} color="#9B9EB5" />
                        <Chip label={req.department} color="#8A8A84" />
                        <Chip label={`risco: ${req.riskLevel}`} color={riskColor} />
                        <Chip label={statusLabel} color="#9B9EB5" />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] text-[var(--text-secondary)]">
                        {new Date(req.createdAt).toLocaleDateString("pt-BR")}
                      </div>
                      <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">{req.requestedBy}</div>
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
                      <div className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.06em] mb-1">
                        Mudança Proposta
                      </div>
                      <div className="text-[12px] text-[var(--text-subtle)] bg-[var(--navy)] rounded-[6px] px-3 py-2.5 leading-relaxed">
                        {req.proposedChange}
                      </div>
                    </div>

                    {req.description && (
                      <ReviewField label="Descrição / Problema" value={req.description} />
                    )}

                    <div>
                      <div className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.06em] mb-1">
                        Aprovação requerida de
                      </div>
                      <div className="flex gap-1.5">
                        {req.approvalRequiredBy.map((r) => (
                          <Chip key={r} label={r} color={r === "ceo" ? "#F59E0B" : "#9B9EB5"} />
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
                          color="#9B9EB5"
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
                          color="#9B9EB5"
                          busy={actionBusy === req.id}
                          onClick={() => runAction(req.id, "apply")}
                        />
                      )}
                      {(req.status === "rejected" || req.status === "applied" || req.status === "approved") && (
                        <ActionButton
                          label="Arquivar"
                          color="#9B9EB5"
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
            <div className="text-[12px] text-[var(--text-secondary)]">
              Nenhuma mudança aplicada ainda. O Brain está em v{BRAIN_VERSION} (base).
            </div>
          ) : (
            <div className="space-y-2">
              {data.versions.map((v) => (
                <div key={v.id} className="flex items-center gap-3 rounded-[8px] border border-white/[0.06] bg-[var(--navy)] px-4 py-2.5">
                  <span className="text-[12px] font-mono font-bold text-[var(--cyan)] shrink-0">v{v.version}</span>
                  <span className="text-[12px] text-[var(--text-subtle)] flex-1 truncate">{v.summary}</span>
                  <span className="text-[10px] text-[var(--text-secondary)] shrink-0">
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
      <div className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.06em] mb-1">{label}</div>
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
    <div className="rounded-[8px] border border-white/[0.06] bg-[var(--navy)] p-4">
      <div className="text-[24px] font-bold tracking-[-0.02em]" style={{ color }}>
        {value}
        <span className="text-[14px] text-[var(--text-secondary)] font-normal ml-1">/ {total}</span>
      </div>
      <div className="text-[11px] text-[var(--text-secondary)] mt-1">{label}</div>
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
    color: "#9B9EB5",
    name: "Brain Director",
    description: "Audita raciocínio, approva/rejeita BrainChangeRequests, versiona o Brain.",
  },
  {
    id: "brain",
    icon: "●",
    color: "#9B9EB5",
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
