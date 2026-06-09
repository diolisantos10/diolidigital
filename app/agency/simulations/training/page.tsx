"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTrainingStore, type TrainingMode } from "@/store/training-store";
import { SEED_SCENARIOS } from "@/lib/agency/training/scenarios";
import type { SimulationRun, AgentImprovementSuggestion, ImprovementStatus } from "@/lib/agency/training/types";
import type { BatchRunResult } from "@/lib/agency/training/batch-runner";
import type { CompactRun, CompactSuggestion, AlertItem, BatchSummary } from "@/lib/agency/training/training-store-service";
import GuidedTour, { usePageTour } from "@/components/agency/onboarding/GuidedTour";
import InfoTooltip from "@/components/agency/onboarding/InfoTooltip";
import ExplainScreenDrawer from "@/components/agency/onboarding/ExplainScreenDrawer";
import OnboardingActions from "@/components/agency/onboarding/OnboardingActions";
import { SDR_TRAINING_TOUR } from "@/lib/onboarding/tours/sdr-training";
import { buildTrainingExplanation } from "@/lib/onboarding/explanations/sdr-training";

// ── Types ─────────────────────────────────────────────────────────────────────

type RunFilter  = "last20" | "fails" | "warnings" | "passes" | "dynamic" | "seed";
type SuggFilter = "pending" | "approved" | "rejected" | "all";

// ── Constants ─────────────────────────────────────────────────────────────────

const VERDICT_STYLE = {
  pass:    { bg: "bg-[#DCFCE7]", text: "text-[#16A34A]", label: "Pass"    },
  warning: { bg: "bg-[#FEF3C7]", text: "text-[#D97706]", label: "Warning" },
  fail:    { bg: "bg-[#FEE2E2]", text: "text-[#DC2626]", label: "Fail"    },
};

const IMPACT_STYLE: Record<string, { bg: string; text: string }> = {
  low:      { bg: "bg-[#F0F0ED]",  text: "text-[#6B6B65]" },
  medium:   { bg: "bg-[#FEF3C7]",  text: "text-[#D97706]" },
  high:     { bg: "bg-[#EEF0FF]",  text: "text-[#5B5BD6]" },
  critical: { bg: "bg-[#FEE2E2]",  text: "text-[#DC2626]" },
};

const STATUS_STYLE: Record<ImprovementStatus, { bg: string; text: string; label: string }> = {
  pending:  { bg: "bg-[#FEF3C7]", text: "text-[#D97706]", label: "Pendente"  },
  approved: { bg: "bg-[#DCFCE7]", text: "text-[#16A34A]", label: "Aprovado"  },
  rejected: { bg: "bg-[#F0F0ED]", text: "text-[#9B9B95]", label: "Rejeitado" },
  applied:  { bg: "bg-[#EEF0FF]", text: "text-[#5B5BD6]", label: "Aplicado"  },
};

const MODE_OPTIONS: { id: TrainingMode; label: string; desc: string }[] = [
  { id: "dynamic", label: "Dinâmico", desc: "Gera cenários novos a cada ciclo — treino real." },
  { id: "mixed",   label: "Misto",    desc: "30% fixos (regressão) + 70% dinâmicos."          },
  { id: "seed",    label: "Fixos",    desc: "Apenas os 22 cenários seed — prova de regressão." },
];

const RUN_FILTER_OPTIONS: { id: RunFilter; label: string }[] = [
  { id: "last20",   label: "Últimas 20" },
  { id: "fails",    label: "Falhas"     },
  { id: "warnings", label: "Warnings"  },
  { id: "passes",   label: "Passes"    },
  { id: "dynamic",  label: "Dinâmicos" },
  { id: "seed",     label: "Fixos"     },
];

const SUGG_FILTER_OPTIONS: { id: SuggFilter; label: string }[] = [
  { id: "pending",  label: "Pendentes"  },
  { id: "approved", label: "Aprovadas"  },
  { id: "rejected", label: "Rejeitadas" },
  { id: "all",      label: "Todas"      },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

function applyRunFilter(runs: SimulationRun[], f: RunFilter): SimulationRun[] {
  const rev = [...runs].reverse();
  switch (f) {
    case "last20":   return rev.slice(0, 20);
    case "fails":    return rev.filter((r) => r.verdict === "fail");
    case "warnings": return rev.filter((r) => r.verdict === "warning");
    case "passes":   return rev.filter((r) => r.verdict === "pass");
    case "dynamic":  return rev.filter((r) => r.scenarioOrigin === "dynamic");
    case "seed":     return rev.filter((r) => r.scenarioOrigin === "seed");
  }
}

function applySuggFilter(suggs: AgentImprovementSuggestion[], f: SuggFilter): AgentImprovementSuggestion[] {
  if (f === "all") return suggs;
  return suggs.filter((s) => s.status === f);
}

// ── Shared micro-components ───────────────────────────────────────────────────

function OriginBadge({ origin }: { origin: "seed" | "dynamic" }) {
  return origin === "dynamic"
    ? <span className="h-4 px-1.5 rounded-[3px] bg-[#EEF0FF] text-[#5B5BD6] text-[8px] font-bold uppercase tracking-wide">dinâmico</span>
    : <span className="h-4 px-1.5 rounded-[3px] bg-[#F0F0ED] text-[#9B9B95] text-[8px] font-bold uppercase tracking-wide">seed</span>;
}

// ── Part 1 — Status card ──────────────────────────────────────────────────────

function StatusCard({ continuousMode, isRunning }: { continuousMode: boolean; isRunning: boolean }) {
  return (
    <div className="bg-white border border-[#E5E5E2] rounded-[10px] overflow-hidden">
      <div className="flex divide-x divide-[#F0F0ED]">

        {/* Status dot */}
        <div className="px-5 py-4 shrink-0 min-w-[160px]">
          <p className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-2">Status</p>
          {continuousMode ? (
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${isRunning ? "bg-[#16A34A] animate-pulse" : "bg-[#D97706]"}`} />
              <span className={`text-[13px] font-semibold ${isRunning ? "text-[#16A34A]" : "text-[#D97706]"}`}>
                {isRunning ? "Rodando" : "Aguardando…"}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#C0C0BC] shrink-0" />
              <span className="text-[13px] font-semibold text-[#6B6B65]">Pausado</span>
            </div>
          )}
        </div>

        {/* Mode name + explanation */}
        <div className="px-5 py-4 flex-1">
          <p className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-1">Modo atual</p>
          <p className="text-[13px] font-semibold text-[#D97706]">Treinamento contínuo experimental</p>
          <p className="text-[11px] text-[#6B6B65] mt-0.5 leading-relaxed">
            As simulações rodam apenas enquanto{" "}
            <span className="font-medium text-[#1A1A1A]">esta tela estiver aberta</span>.
          </p>
        </div>

        {/* Engine status */}
        <div className="px-5 py-4 shrink-0">
          <p className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-2">Motor de execução</p>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A] shrink-0" />
              <span className="text-[11px] text-[#1A1A1A]">Navegador aberto</span>
              <span className="text-[9px] font-bold text-[#16A34A] bg-[#DCFCE7] px-1.5 py-0.5 rounded-[3px]">ATIVO</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D0D0CC] shrink-0" />
              <span className="text-[11px] text-[#9B9B95]">Worker 24h backend</span>
              <span className="text-[9px] font-bold text-[#9B9B95] bg-[#F0F0ED] px-1.5 py-0.5 rounded-[3px]">PRÓXIMA FASE</span>
            </div>
          </div>
        </div>

      </div>

      {/* Warning strip — always visible */}
      <div className="border-t border-[#F0F0ED] bg-[#FAFAF9] px-5 py-2 flex items-center gap-2">
        <span className="text-[11px] text-[#D97706] shrink-0">⚠</span>
        <p className="text-[11px] text-[#9B9B95]">
          Se você <span className="font-medium text-[#6B6B65]">fechar esta aba</span>, o treino contínuo pausa automaticamente. Nenhum log é apagado.
        </p>
      </div>
    </div>
  );
}

// ── Part 4 — Summary cards ────────────────────────────────────────────────────

function SummaryCards({
  pending, approved, rejected, runsToday, avgScore, criticalFails,
}: {
  pending: number; approved: number; rejected: number;
  runsToday: number; avgScore: number; criticalFails: number;
}) {
  const cards: { label: string; value: string | number; color: string; info: string }[] = [
    {
      label: "Pendentes",
      value: pending,
      color: pending > 0 ? "text-[#D97706]" : "text-[#1A1A1A]",
      info: "Sugestões de melhoria geradas pelo treino que aguardam sua decisão. Aprove ou rejeite na seção \"Melhorias sugeridas\".",
    },
    {
      label: "Aprovadas",
      value: approved,
      color: approved > 0 ? "text-[#16A34A]" : "text-[#1A1A1A]",
      info: "Sugestões aprovadas. Elas não são aplicadas automaticamente ao brain do SDR — aguardam aplicação manual.",
    },
    {
      label: "Rejeitadas",
      value: rejected,
      color: "text-[#1A1A1A]",
      info: "Sugestões descartadas. Ficam arquivadas para referência e nunca são apagadas.",
    },
    {
      label: "Runs hoje",
      value: runsToday,
      color: "text-[#1A1A1A]",
      info: "Quantidade de simulações executadas hoje nesta sessão de navegador.",
    },
    {
      label: "Score médio",
      value: avgScore > 0 ? avgScore : "—",
      color: avgScore >= 80 ? "text-[#16A34A]" : avgScore >= 60 ? "text-[#D97706]" : avgScore > 0 ? "text-[#DC2626]" : "text-[#1A1A1A]",
      info: "Média de pontuação (0–100) de todas as simulações da sessão. Verde ≥ 80, amarelo ≥ 60, vermelho < 60.",
    },
    {
      label: "Falhas críticas",
      value: criticalFails,
      color: criticalFails > 0 ? "text-[#DC2626]" : "text-[#1A1A1A]",
      info: "Simulações com pelo menos um erro grave (severidade \"error\"). Exigem atenção imediata.",
    },
  ];

  return (
    <div className="grid grid-cols-6 gap-2.5">
      {cards.map((c) => (
        <div key={c.label} className="bg-white border border-[#E5E5E2] rounded-[10px] px-4 py-3.5">
          <div className="flex items-center gap-1 mb-1">
            <p className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em]">{c.label}</p>
            <InfoTooltip title={c.label}>{c.info}</InfoTooltip>
          </div>
          <p className={`text-[22px] font-bold ${c.color}`}>{c.value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Overfitting warning (unchanged) ──────────────────────────────────────────

function OverfitWarning({ runs }: { runs: SimulationRun[] }) {
  const last20  = runs.slice(-20);
  const allSeed = last20.length >= 10 && last20.every((r) => r.scenarioOrigin === "seed");
  if (!allSeed) return null;
  return (
    <div className="bg-[#FEF3C7] border border-[#FDE68A] rounded-[8px] px-4 py-3 flex items-start gap-3">
      <span className="text-[14px] shrink-0">⚠</span>
      <div className="text-[12px]">
        <p className="font-semibold text-[#92400E]">Overfitting detectado</p>
        <p className="text-[#B45309] leading-relaxed mt-0.5">
          Você está rodando apenas cenários fixos. Use cenários dinâmicos para treino real.
        </p>
      </div>
    </div>
  );
}

// ── Mode selector (unchanged) ─────────────────────────────────────────────────

function ModeSelector({ mode, onChange }: { mode: TrainingMode; onChange: (m: TrainingMode) => void }) {
  return (
    <div className="flex gap-1 p-1 bg-[#F0F0ED] rounded-[8px] w-fit">
      {MODE_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          title={opt.desc}
          className={`h-7 px-3.5 rounded-[6px] text-[11px] font-medium transition-all ${
            mode === opt.id
              ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] text-[#1A1A1A]"
              : "text-[#6B6B65] hover:text-[#1A1A1A]"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Part 3 — Run history filter bar ──────────────────────────────────────────

function RunFilterBar({
  filter, onChange, counts,
}: {
  filter: RunFilter;
  onChange: (f: RunFilter) => void;
  counts: Record<RunFilter, number>;
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {RUN_FILTER_OPTIONS.map((opt) => {
        const active = filter === opt.id;
        const n      = counts[opt.id];
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            className={`h-7 px-3 rounded-[6px] text-[11px] font-medium transition-all flex items-center gap-1.5 ${
              active
                ? "bg-[#1A1A1A] text-white"
                : "bg-white border border-[#E5E5E2] text-[#6B6B65] hover:border-[#9B9B95] hover:text-[#1A1A1A]"
            }`}
          >
            {opt.label}
            {n > 0 && (
              <span className={`text-[9px] font-bold px-1 rounded-[3px] leading-4 ${
                active ? "bg-white/20 text-white" : "bg-[#F0F0ED] text-[#9B9B95]"
              }`}>{n}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Part 3 — Run row (compact, expand on click) ───────────────────────────────

function RunRow({ run, onExpand }: { run: SimulationRun; onExpand: (id: string) => void }) {
  const v = VERDICT_STYLE[run.verdict];
  return (
    <button
      onClick={() => onExpand(run.id)}
      className="group w-full flex items-center gap-3 px-4 py-2.5 bg-white border border-[#E5E5E2] rounded-[8px] text-[12px] hover:border-[#9B9B95] transition-colors text-left"
    >
      <span className={`shrink-0 h-5 px-2 rounded-[4px] text-[10px] font-bold ${v.bg} ${v.text}`}>{v.label}</span>
      <OriginBadge origin={run.scenarioOrigin} />
      <span className="font-medium text-[#1A1A1A] flex-1 truncate">{run.scenarioName}</span>
      <span className="text-[#6B6B65] shrink-0">{run.score}/100</span>
      {run.issues.length > 0 && (
        <span className="text-[10px] text-[#DC2626] shrink-0">{run.issues.length} issue{run.issues.length > 1 ? "s" : ""}</span>
      )}
      <span className="text-[#9B9B95] font-mono text-[10px] shrink-0">{fmt(run.completedAt)}</span>
      <span className="text-[10px] text-[#C0C0BC] group-hover:text-[#9B9B95] shrink-0 transition-colors">Ver detalhes →</span>
    </button>
  );
}

function RunDetail({ run, onClose }: { run: SimulationRun; onClose: () => void }) {
  const v = VERDICT_STYLE[run.verdict];
  return (
    <div className="bg-white border border-[#E5E5E2] rounded-[10px] p-4 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`h-5 px-2 rounded-[4px] text-[10px] font-bold ${v.bg} ${v.text}`}>{v.label}</span>
            <OriginBadge origin={run.scenarioOrigin} />
            <span className="text-[12px] font-semibold text-[#1A1A1A]">{run.scenarioName}</span>
          </div>
          <p className="text-[11px] text-[#9B9B95]">Score: {run.score}/100 · {fmt(run.completedAt)}</p>
        </div>
        <button onClick={onClose} className="text-[11px] text-[#9B9B95] hover:text-[#1A1A1A] transition-colors">Fechar ×</button>
      </div>

      {run.scenarioOrigin === "dynamic" && run.scenarioMetadata && (
        <div className="bg-[#EEF0FF] border border-[#C7D2FE] rounded-[8px] px-3 py-2.5 space-y-2">
          <p className="text-[9px] font-semibold text-[#5B5BD6] uppercase tracking-[0.06em]">Dimensões do cenário gerado</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
            {Object.entries(run.scenarioMetadata).map(([k, v]) => (
              <div key={k} className="flex items-center gap-1.5">
                <span className="text-[#818CF8] w-[100px] shrink-0 capitalize">{k.replace(/([A-Z])/g, " $1").toLowerCase()}</span>
                <span className="text-[#3730A3] font-medium truncate">{v}</span>
              </div>
            ))}
          </div>
          {run.scenarioSeed && <p className="text-[9px] text-[#818CF8] font-mono">seed: {run.scenarioSeed}</p>}
        </div>
      )}

      {run.issues.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">Issues ({run.issues.length})</p>
          <div className="space-y-1.5">
            {run.issues.map((issue, i) => (
              <div key={i} className={`flex items-start gap-2 px-3 py-2 rounded-[6px] text-[11px] ${issue.severity === "error" ? "bg-[#FEE2E2]" : "bg-[#FEF3C7]"}`}>
                <span className={`font-mono text-[9px] shrink-0 mt-0.5 ${issue.severity === "error" ? "text-[#DC2626]" : "text-[#D97706]"}`}>{issue.criterion}</span>
                <span className={issue.severity === "error" ? "text-[#7F1D1D]" : "text-[#78350F]"}>{issue.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {run.recommendations.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">Recomendações</p>
          <div className="space-y-1">
            {run.recommendations.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px] text-[#1A1A1A]">
                <span className="text-[#5B5BD6] shrink-0">→</span>{r}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Part 2 — Suggestion tab bar ───────────────────────────────────────────────

function SuggTabBar({
  active, onChange, counts,
}: {
  active: SuggFilter;
  onChange: (t: SuggFilter) => void;
  counts: Record<SuggFilter, number>;
}) {
  return (
    <div className="flex gap-1 p-1 bg-[#F0F0ED] rounded-[8px] w-fit">
      {SUGG_FILTER_OPTIONS.map((opt) => {
        const isActive = active === opt.id;
        const n        = counts[opt.id];
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            className={`h-7 px-3.5 rounded-[6px] text-[11px] font-medium transition-all flex items-center gap-1.5 ${
              isActive
                ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] text-[#1A1A1A]"
                : "text-[#6B6B65] hover:text-[#1A1A1A]"
            }`}
          >
            {opt.label}
            {n > 0 && (
              <span className={`text-[9px] font-bold px-1 rounded-[3px] leading-4 ${
                opt.id === "pending"
                  ? "bg-[#D97706] text-white"
                  : isActive
                  ? "bg-[#F0F0ED] text-[#6B6B65]"
                  : "bg-[#D5D5D0] text-[#6B6B65]"
              }`}>{n}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Part 2 — Suggestion card ──────────────────────────────────────────────────

function SuggestionCard({ suggestion, onDecide }: {
  suggestion: AgentImprovementSuggestion;
  onDecide: (id: string, status: ImprovementStatus) => void;
}) {
  const imp = IMPACT_STYLE[suggestion.impact] ?? IMPACT_STYLE.medium;
  const st  = STATUS_STYLE[suggestion.status];
  return (
    <div className="bg-white border border-[#E5E5E2] rounded-[10px] p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`h-5 px-2 rounded-[4px] text-[9px] font-bold uppercase tracking-wide ${imp.bg} ${imp.text}`}>{suggestion.impact}</span>
            <span className={`h-5 px-2 rounded-[4px] text-[9px] font-semibold ${st.bg} ${st.text}`}>{st.label}</span>
          </div>
          <h3 className="text-[13px] font-semibold text-[#1A1A1A]">{suggestion.title}</h3>
        </div>
        {suggestion.status === "pending" && (
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => onDecide(suggestion.id, "approved")}
              className="h-7 px-3 rounded-[6px] bg-[#DCFCE7] text-[#16A34A] text-[11px] font-semibold hover:bg-[#BBF7D0] transition-colors"
            >Aprovar</button>
            <button
              onClick={() => onDecide(suggestion.id, "rejected")}
              className="h-7 px-3 rounded-[6px] bg-[#F0F0ED] text-[#6B6B65] text-[11px] font-medium hover:bg-[#E5E5E2] transition-colors"
            >Rejeitar</button>
          </div>
        )}
      </div>
      <div className="space-y-2.5 text-[12px]">
        <div>
          <p className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-0.5">Problema</p>
          <p className="text-[#1A1A1A] leading-relaxed">{suggestion.problem}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-0.5">Evidência</p>
          <p className="text-[#6B6B65] leading-relaxed whitespace-pre-line">{suggestion.evidence}</p>
        </div>
        <div className="bg-[#F7F7F6] border border-[#E5E5E2] rounded-[8px] px-3 py-2.5">
          <p className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-0.5">Mudança sugerida</p>
          <p className="text-[#1A1A1A] leading-relaxed">{suggestion.suggestedChange}</p>
        </div>
      </div>
      {suggestion.decidedAt && (
        <p className="text-[10px] text-[#C0C0BC]">Decisão em {fmt(suggestion.decidedAt)}</p>
      )}
    </div>
  );
}

// ── Part 6 — Server training panel V3 (persistent DB) ────────────────────────

interface ServerStatus {
  cronConfigured:       boolean;
  enabled:              boolean;
  totalServerRuns:      number;
  runsToday:            number;
  runsThisWeek:         number;
  averageScore:         number;
  passCount:            number;
  warnCount:            number;
  failCount:            number;
  pendingSuggestions:   number;
  approvedSuggestions:  number;
  rejectedSuggestions:  number;
  activeAlerts:         number;
  lastBatchAt:          string | null;
  lastBatchSummary:     BatchSummary | null;
  recentRuns:           CompactRun[];
  activeSuggestions:    CompactSuggestion[];
  alertItems:           AlertItem[];
}

const SERVER_MODE_OPTIONS: { id: TrainingMode; label: string }[] = [
  { id: "dynamic", label: "Dinâmico" },
  { id: "mixed",   label: "Misto"    },
  { id: "seed",    label: "Fixos"    },
];

const SEVERITY_STYLE: Record<string, { bg: string; text: string }> = {
  critical: { bg: "bg-[#FEE2E2]", text: "text-[#DC2626]" },
  warning:  { bg: "bg-[#FEF3C7]", text: "text-[#D97706]" },
  info:     { bg: "bg-[#EEF0FF]", text: "text-[#5B5BD6]" },
};

function ServerTrainingPanel() {
  const [status,          setStatus]          = useState<ServerStatus | null>(null);
  const [loadError,       setLoadError]       = useState(false);
  const [serverMode,      setServerMode]      = useState<TrainingMode>("dynamic");
  const [serverCount,     setServerCount]     = useState(10);
  const [isServerRunning, setIsServerRunning] = useState(false);
  const [lastResult,      setLastResult]      = useState<BatchRunResult | null>(null);
  const [runError,        setRunError]        = useState<string | null>(null);
  const [approvingId,     setApprovingId]     = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/training/sdr/run");
      if (!res.ok) { setLoadError(true); return; }
      const data: ServerStatus = await res.json();
      setStatus(data);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  async function runServerBatch() {
    setIsServerRunning(true);
    setRunError(null);
    try {
      const res  = await fetch("/api/admin/training/sdr/run", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ mode: serverMode, count: serverCount, triggeredBy: "manual" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRunError(data.error ?? "Erro desconhecido");
      } else {
        setLastResult(data as BatchRunResult);
        fetchStatus();
      }
    } catch {
      setRunError("Falha na requisição — verifique a conexão.");
    } finally {
      setIsServerRunning(false);
    }
  }

  async function decideSuggestion(id: string, newStatus: "approved" | "rejected") {
    setApprovingId(id);
    try {
      const res = await fetch(`/api/admin/training/sdr/suggestions/${id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ status: newStatus }),
      });
      if (res.ok) fetchStatus();
    } finally {
      setApprovingId(null);
    }
  }

  const configStatus = !status
    ? null
    : !status.cronConfigured
    ? "unconfigured"
    : status.enabled
    ? "active"
    : "disabled";

  const CONFIG_CHIP = {
    unconfigured: { bg: "bg-[#F0F0ED]", text: "text-[#9B9B95]", label: "não configurado" },
    active:       { bg: "bg-[#DCFCE7]", text: "text-[#16A34A]", label: "configurado"     },
    disabled:     { bg: "bg-[#FEF3C7]", text: "text-[#D97706]", label: "desabilitado"    },
  };

  const lastBatch = status?.lastBatchSummary;

  return (
    <div className="border border-[#C7D2FE] rounded-[10px] bg-[#EEF0FF]/20 overflow-hidden">

      {/* Header */}
      <div className="px-5 py-4 flex items-center gap-3 border-b border-[#C7D2FE]/50 flex-wrap">
        <h3 className="text-[13px] font-semibold text-[#3730A3]">Treino 24h — Servidor</h3>
        <InfoTooltip title="Treino 24h">
          Batches executados no servidor via cron, independentes da aba aberta. Resultados, sugestões e alertas são persistidos no banco de dados.
        </InfoTooltip>
        {configStatus && (
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-[3px] tracking-wide ${CONFIG_CHIP[configStatus].bg} ${CONFIG_CHIP[configStatus].text}`}>
            {CONFIG_CHIP[configStatus].label.toUpperCase()}
          </span>
        )}
        {status && (
          <span className="text-[10px] text-[#6B6B65]">{status.totalServerRuns} runs persistidos no DB</span>
        )}
        {status && status.activeAlerts > 0 && (
          <span className="text-[9px] font-bold text-[#DC2626] bg-[#FEE2E2] px-1.5 py-0.5 rounded-[3px]">
            {status.activeAlerts} ALERTA{status.activeAlerts > 1 ? "S" : ""}
          </span>
        )}
      </div>

      <div className="px-5 py-4 space-y-4">

        {loadError && (
          <div className="bg-[#FEE2E2] border border-[#FECACA] rounded-[8px] px-3 py-2 text-[11px] text-[#DC2626]">
            Não foi possível carregar o status do servidor. Você precisa ser master para ver esta seção.
          </div>
        )}

        {/* Stats grid */}
        {status && (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {([
              ["Runs hoje",   status.runsToday,            "text-[#1A1A1A]"],
              ["Runs semana", status.runsThisWeek,          "text-[#1A1A1A]"],
              ["Score médio", status.averageScore || "—",   status.averageScore >= 80 ? "text-[#16A34A]" : status.averageScore >= 60 ? "text-[#D97706]" : status.averageScore > 0 ? "text-[#DC2626]" : "text-[#1A1A1A]"],
              ["Falhas",      status.failCount,             status.failCount > 0 ? "text-[#DC2626]" : "text-[#1A1A1A]"],
              ["Pendentes",   status.pendingSuggestions,    status.pendingSuggestions > 0 ? "text-[#D97706]" : "text-[#1A1A1A]"],
              ["Aprovadas",   status.approvedSuggestions,   status.approvedSuggestions > 0 ? "text-[#16A34A]" : "text-[#1A1A1A]"],
              ["Rejeitadas",  status.rejectedSuggestions,   "text-[#1A1A1A]"],
              ["Alertas",     status.activeAlerts,          status.activeAlerts > 0 ? "text-[#DC2626]" : "text-[#1A1A1A]"],
            ] as [string, string | number, string][]).map(([label, val, color]) => (
              <div key={label} className="bg-white border border-[#E5E5E2] rounded-[8px] px-3 py-2.5 text-center">
                <p className="text-[9px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-0.5">{label}</p>
                <p className={`text-[18px] font-bold ${color}`}>{val}</p>
              </div>
            ))}
          </div>
        )}

        {/* Active alerts */}
        {status && status.alertItems.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em]">Alertas ativos</p>
            {status.alertItems.map((alert) => {
              const s = SEVERITY_STYLE[alert.severity] ?? SEVERITY_STYLE.info;
              return (
                <div key={alert.id} className={`flex items-start gap-3 px-3 py-2.5 rounded-[8px] border ${s.bg} border-transparent`}>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-[3px] shrink-0 mt-0.5 ${s.bg} ${s.text} border border-current/20`}>
                    {alert.severity.toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[11px] font-semibold ${s.text}`}>{alert.title}</p>
                    <p className="text-[10px] text-[#6B6B65] mt-0.5 leading-relaxed">{alert.message}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Manual run controls */}
        <div data-tour="training-batch" className="bg-white border border-[#E5E5E2] rounded-[8px] p-3 space-y-3">
          <p className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em]">Rodar batch no servidor</p>
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <p className="text-[10px] text-[#9B9B95] mb-1">Modo</p>
              <div className="flex gap-1 p-1 bg-[#F0F0ED] rounded-[7px]">
                {SERVER_MODE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setServerMode(opt.id)}
                    className={`h-6 px-3 rounded-[5px] text-[10px] font-medium transition-all ${
                      serverMode === opt.id
                        ? "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08)] text-[#1A1A1A]"
                        : "text-[#6B6B65] hover:text-[#1A1A1A]"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-[#9B9B95] mb-1">Quantidade (máx. 100)</p>
              <input
                type="number" min={1} max={100} value={serverCount}
                onChange={(e) => setServerCount(Math.min(100, Math.max(1, Number(e.target.value))))}
                className="h-8 w-20 px-2 rounded-[6px] border border-[#E5E5E2] bg-white text-[12px] text-[#1A1A1A] focus:outline-none focus:ring-1 focus:ring-[#C7D2FE]"
              />
            </div>
            <div className="pt-4">
              <button
                onClick={runServerBatch}
                disabled={isServerRunning || loadError}
                className="h-8 px-4 rounded-[7px] bg-[#EEF0FF] border border-[#C7D2FE] text-[#5B5BD6] text-[12px] font-semibold hover:bg-[#E0E7FF] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isServerRunning ? "Rodando…" : "Rodar batch no servidor agora"}
              </button>
            </div>
          </div>
          {runError && <p className="text-[11px] text-[#DC2626]">{runError}</p>}
        </div>

        {/* Last batch summary */}
        {(lastBatch ?? lastResult) && (() => {
          const b = lastBatch ?? (lastResult ? {
            totalRuns: lastResult.totalRuns, pass: lastResult.pass, warning: lastResult.warning,
            fail: lastResult.fail, averageScore: lastResult.averageScore,
            durationMs: lastResult.durationMs, triggeredBy: lastResult.triggeredBy,
            mode: lastResult.mode, completedAt: lastResult.completedAt,
          } : null);
          if (!b) return null;
          return (
            <div className="bg-white border border-[#E5E5E2] rounded-[8px] p-3 space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em]">Último batch</p>
                <span className="text-[9px] bg-[#F0F0ED] text-[#6B6B65] px-1.5 py-0.5 rounded-[3px]">{b.mode}</span>
                <span className="text-[9px] bg-[#F0F0ED] text-[#6B6B65] px-1.5 py-0.5 rounded-[3px]">{b.triggeredBy}</span>
              </div>
              <div className="flex flex-wrap gap-4">
                {([
                  ["Runs",   String(b.totalRuns)],
                  ["Pass",   String(b.pass)],
                  ["Warn",   String(b.warning)],
                  ["Fail",   String(b.fail)],
                  ["Score",  `${b.averageScore}/100`],
                  ["Tempo",  `${b.durationMs}ms`],
                ] as [string, string][]).map(([k, v]) => (
                  <div key={k} className="text-center">
                    <p className="text-[9px] text-[#9B9B95]">{k}</p>
                    <p className="text-[12px] font-semibold text-[#1A1A1A]">{v}</p>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-[#C0C0BC]">{new Date(b.completedAt).toLocaleString("pt-BR")}</p>
            </div>
          );
        })()}

        {/* Pending server suggestions */}
        {status && status.activeSuggestions.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em]">
              Melhorias pendentes — servidor ({status.activeSuggestions.length})
            </p>
            {status.activeSuggestions.map((s) => {
              const imp = IMPACT_STYLE[s.impact] ?? IMPACT_STYLE.medium;
              return (
                <div key={s.id} className="bg-white border border-[#E5E5E2] rounded-[8px] px-3 py-2.5 flex items-center gap-3">
                  <span className={`h-5 px-2 rounded-[4px] text-[9px] font-bold uppercase shrink-0 ${imp.bg} ${imp.text}`}>{s.impact}</span>
                  <span className="text-[12px] font-medium text-[#1A1A1A] flex-1 truncate">{s.title}</span>
                  <span className="text-[10px] text-[#9B9B95] shrink-0">{s.sourceRunCount} runs</span>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => decideSuggestion(s.id, "approved")}
                      disabled={approvingId === s.id}
                      className="h-6 px-2.5 rounded-[5px] bg-[#DCFCE7] text-[#16A34A] text-[10px] font-semibold hover:bg-[#BBF7D0] transition-colors disabled:opacity-40"
                    >Aprovar</button>
                    <button
                      onClick={() => decideSuggestion(s.id, "rejected")}
                      disabled={approvingId === s.id}
                      className="h-6 px-2.5 rounded-[5px] bg-[#F0F0ED] text-[#6B6B65] text-[10px] font-medium hover:bg-[#E5E5E2] transition-colors disabled:opacity-40"
                    >Rejeitar</button>
                  </div>
                </div>
              );
            })}
            <p className="text-[10px] text-[#9B9B95] leading-relaxed">
              Ao aprovar: criado BrainChangeRequest com status <span className="font-mono bg-[#F0F0ED] px-1 rounded text-[9px]">pending</span> — aguarda aplicação manual ao SDR brain.
            </p>
          </div>
        )}

        {/* Recent server runs */}
        {status && status.recentRuns.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em]">
              Runs recentes — servidor (últimas {status.recentRuns.length})
            </p>
            <div className="space-y-1">
              {status.recentRuns.map((run) => {
                const v = VERDICT_STYLE[run.verdict as keyof typeof VERDICT_STYLE] ?? VERDICT_STYLE.fail;
                return (
                  <div key={run.id} className="flex items-center gap-2.5 px-3 py-2 bg-white border border-[#E5E5E2] rounded-[7px] text-[11px]">
                    <span className={`shrink-0 h-4 px-1.5 rounded-[3px] text-[9px] font-bold ${v.bg} ${v.text}`}>{v.label}</span>
                    <span className={`h-4 px-1.5 rounded-[3px] text-[8px] font-bold uppercase shrink-0 ${run.scenarioOrigin === "dynamic" ? "bg-[#EEF0FF] text-[#5B5BD6]" : "bg-[#F0F0ED] text-[#9B9B95]"}`}>{run.scenarioOrigin}</span>
                    <span className="flex-1 truncate text-[#1A1A1A] font-medium">{run.scenarioName}</span>
                    <span className="text-[#6B6B65] shrink-0">{run.score}/100</span>
                    <span className="text-[#C0C0BC] font-mono shrink-0 text-[9px]">
                      {new Date(run.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Setup instructions */}
        {configStatus === "unconfigured" && (
          <div className="border border-dashed border-[#C7D2FE] rounded-[8px] px-4 py-3 space-y-2">
            <p className="text-[11px] font-semibold text-[#5B5BD6]">Para ativar o worker 24h:</p>
            <div className="space-y-1 text-[11px] text-[#6B6B65]">
              <p>1. Adicione <code className="bg-[#EEF0FF] text-[#5B5BD6] px-1 rounded text-[10px]">CRON_SECRET=&lt;valor&gt;</code> e <code className="bg-[#EEF0FF] text-[#5B5BD6] px-1 rounded text-[10px]">TRAINING_ENABLED=true</code> nas Railway Variables</p>
              <p>2. Configure um scheduler chamando <code className="bg-[#EEF0FF] text-[#5B5BD6] px-1 rounded text-[10px]">POST /api/cron/training/sdr</code> com header <code className="bg-[#EEF0FF] text-[#5B5BD6] px-1 rounded text-[10px]">Authorization: Bearer &lt;CRON_SECRET&gt;</code></p>
              <p>3. O batch roda 10 dinâmicos + 5 mistos por acionamento, persiste no DB e gera alertas automaticamente.</p>
            </div>
          </div>
        )}

        {configStatus === "disabled" && (
          <div className="bg-[#FEF3C7] border border-[#FDE68A] rounded-[8px] px-3 py-2 text-[11px] text-[#92400E]">
            <span className="font-semibold">Worker desabilitado.</span> O endpoint cron existe mas retorna no-op.
            Adicione <code className="bg-white/50 px-1 rounded text-[10px]">TRAINING_ENABLED=true</code> nas Railway Variables para ativar.
          </div>
        )}

      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TrainingPage() {
  const {
    runs, suggestions, isRunning, continuousMode, trainingMode,
    setTrainingMode, runSeedScenarios, runDynamicScenarios, runMixedScenarios,
    updateSuggestionStatus, toggleContinuousMode, clearRuns,
  } = useTrainingStore();

  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [runFilter,     setRunFilter]     = useState<RunFilter>("last20");
  const [suggTab,       setSuggTab]       = useState<SuggFilter>("pending");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Onboarding — auto-starts on first visit, persisted as tour_completed_sdr-training
  const { tourOpen, startTour, closeTour } = usePageTour(SDR_TRAINING_TOUR);
  const [explainOpen, setExplainOpen] = useState(false);

  // Continuous loop — clears itself when mode stops or component unmounts
  useEffect(() => {
    if (continuousMode && !isRunning) {
      intervalRef.current = setInterval(() => {
        if      (trainingMode === "seed")    runSeedScenarios(3);
        else if (trainingMode === "dynamic") runDynamicScenarios(3);
        else                                 runMixedScenarios(3);
      }, 8000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [continuousMode, isRunning, trainingMode, runSeedScenarios, runDynamicScenarios, runMixedScenarios]);

  // ── Derived counts ────────────────────────────────────────────────────────

  const totalRuns    = runs.length;
  const seedCount    = runs.filter((r) => r.scenarioOrigin === "seed").length;
  const dynCount     = runs.filter((r) => r.scenarioOrigin === "dynamic").length;
  const passCount    = runs.filter((r) => r.verdict === "pass").length;
  const warnCount    = runs.filter((r) => r.verdict === "warning").length;
  const failCount    = runs.filter((r) => r.verdict === "fail").length;
  const avgScore     = totalRuns > 0 ? Math.round(runs.reduce((a, r) => a + r.score, 0) / totalRuns) : 0;
  const runsToday    = runs.filter((r) => isToday(r.startedAt)).length;
  const critFails    = runs.filter((r) => r.issues.some((i) => i.severity === "error")).length;

  const pendingCount  = suggestions.filter((s) => s.status === "pending").length;
  const approvedCount = suggestions.filter((s) => s.status === "approved").length;
  const rejectedCount = suggestions.filter((s) => s.status === "rejected").length;

  // ── Filtered views ────────────────────────────────────────────────────────

  const visibleRuns = applyRunFilter(runs, runFilter);
  const visibleSugg = applySuggFilter(suggestions, suggTab);
  const expandedRun = expandedRunId ? runs.find((r) => r.id === expandedRunId) : null;

  const runFilterCounts: Record<RunFilter, number> = {
    last20:   Math.min(totalRuns, 20),
    fails:    failCount,
    warnings: warnCount,
    passes:   passCount,
    dynamic:  dynCount,
    seed:     seedCount,
  };

  const suggCounts: Record<SuggFilter, number> = {
    pending:  pendingCount,
    approved: approvedCount,
    rejected: rejectedCount,
    all:      suggestions.length,
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  function runNow(count: number) {
    if      (trainingMode === "seed")    runSeedScenarios(count);
    else if (trainingMode === "dynamic") runDynamicScenarios(count);
    else                                 runMixedScenarios(count);
  }

  function changeRunFilter(f: RunFilter) {
    setRunFilter(f);
    setExpandedRunId(null);
  }

  const BTN = "h-8 px-4 rounded-[7px] border text-[12px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const BTN_DARK   = `${BTN} bg-[#1A1A1A] border-[#1A1A1A] text-white hover:bg-[#111111]`;
  const BTN_LIGHT  = `${BTN} bg-white border-[#E5E5E2] text-[#6B6B65] hover:border-[#9B9B95] hover:text-[#1A1A1A]`;
  const BTN_YELLOW = `${BTN} bg-[#FEF3C7] border-[#FDE68A] text-[#D97706] hover:bg-[#FEF08A]`;
  const BTN_BLUE   = `${BTN} bg-[#EEF0FF] border-[#C7D2FE] text-[#5B5BD6] hover:bg-[#E0E7FF]`;

  const modeDesc = MODE_OPTIONS.find((m) => m.id === trainingMode)?.desc ?? "";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 max-w-[900px]">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-1.5 mb-1.5 text-[12px] text-[#9B9B95]">
            <Link href="/agency/simulations" className="hover:text-[#6B6B65] transition-colors">Laboratório</Link>
            <span>/</span>
            <span className="text-[#1A1A1A] font-medium">Treinamento Contínuo — SDR</span>
            <span className="ml-1 text-[9px] font-bold text-[#C0C0BC] bg-[#F0F0ED] px-1.5 py-0.5 rounded-full tracking-wide">INTERNO</span>
          </div>
          <p className="text-[12px] text-[#6B6B65] leading-relaxed max-w-[500px]">
            Simule conversas, avalie performance e gerencie melhorias. Nenhum dado real é salvo.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <OnboardingActions onStartTour={startTour} onExplain={() => setExplainOpen(true)} />
          <button onClick={clearRuns} className="text-[11px] text-[#9B9B95] hover:text-[#DC2626] transition-colors">
            Limpar logs
          </button>
        </div>
      </div>

      {/* Part 1 — Status card */}
      <StatusCard continuousMode={continuousMode} isRunning={isRunning} />

      {/* Part 4 — Summary cards */}
      <div data-tour="training-stats">
        <SummaryCards
          pending={pendingCount}
          approved={approvedCount}
          rejected={rejectedCount}
          runsToday={runsToday}
          avgScore={avgScore}
          criticalFails={critFails}
        />
      </div>

      {/* Overfitting warning */}
      <OverfitWarning runs={runs} />

      {/* Mode + run controls — Modo navegador */}
      <div data-tour="training-controls" className="bg-white border border-[#E5E5E2] rounded-[10px] px-4 py-4 space-y-3">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em]">Modo navegador</p>
          <span className="text-[9px] font-bold text-[#D97706] bg-[#FEF3C7] px-1.5 py-0.5 rounded-[3px] tracking-wide">REQUER ABA ABERTA</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <p className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-1.5">Modo de treino</p>
            <ModeSelector mode={trainingMode} onChange={setTrainingMode} />
          </div>
          <div className="ml-4 pt-5">
            <p className="text-[11px] text-[#6B6B65] max-w-[320px]">{modeDesc}</p>
          </div>
        </div>

        <div className="text-[10px] text-[#9B9B95] leading-relaxed border-t border-[#F0F0ED] pt-2.5">
          <span className="font-semibold text-[#6B6B65]">Cenários seed</span> = prova de regressão.&nbsp;&nbsp;
          <span className="font-semibold text-[#5B5BD6]">Cenários dinâmicos</span> = treino real (evita overfitting).
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button className={BTN_DARK}  onClick={() => runNow(1)}  disabled={isRunning}>Rodar 1</button>
          <button className={BTN_LIGHT} onClick={() => runNow(10)} disabled={isRunning}>Rodar 10</button>
          <button className={BTN_LIGHT} onClick={() => runNow(50)} disabled={isRunning}>Rodar 50</button>

          {trainingMode !== "dynamic" && (
            <button className={BTN_BLUE}  onClick={() => runDynamicScenarios(10)} disabled={isRunning}>10 dinâmicos</button>
          )}
          {trainingMode !== "seed" && (
            <button className={BTN_LIGHT} onClick={() => runSeedScenarios(SEED_SCENARIOS.length)} disabled={isRunning}>
              {SEED_SCENARIOS.length} seed (regressão)
            </button>
          )}
          {trainingMode !== "mixed" && (
            <button className={BTN_LIGHT} onClick={() => runMixedScenarios(20)} disabled={isRunning}>20 misto</button>
          )}

          <div className="ml-auto flex items-center gap-2">
            {isRunning && (
              <span className="flex items-center gap-1.5 text-[11px] text-[#D97706]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D97706] animate-pulse" />Rodando…
              </span>
            )}
            <button onClick={toggleContinuousMode} className={continuousMode ? BTN_YELLOW : BTN_LIGHT}>
              {continuousMode ? "⏸ Parar" : "▶ Contínuo"}
            </button>
          </div>
        </div>

        {continuousMode && (
          <div className="bg-[#FEF3C7] border border-[#FDE68A] rounded-[8px] px-3 py-2 text-[11px] text-[#92400E]">
            Modo contínuo ativo: roda 3 simulações a cada 8 s.{" "}
            <span className="font-semibold">Pausa se você fechar ou trocar de aba.</span>
          </div>
        )}
      </div>

      {/* Distribution strip */}
      {totalRuns > 0 && (
        <div className="flex items-center gap-3 text-[11px] text-[#6B6B65]">
          <span>{seedCount} fixo{seedCount !== 1 ? "s" : ""}</span>
          <span className="text-[#C0C0BC]">+</span>
          <span className="text-[#5B5BD6] font-medium">{dynCount} dinâmico{dynCount !== 1 ? "s" : ""}</span>
          <span className="text-[#C0C0BC]">=</span>
          <span className="font-medium text-[#1A1A1A]">{totalRuns} total</span>
        </div>
      )}

      {/* Part 3 — Run history with filter bar */}
      <section data-tour="training-runs">
        <div className="flex items-center justify-between mb-3 gap-4 flex-wrap">
          <h2 className="text-[13px] font-semibold text-[#1A1A1A] shrink-0 inline-flex items-center gap-1">
            Histórico de simulações
            <InfoTooltip title="Histórico">
              Cada linha é uma simulação de conversa do SDR avaliada com verdict e score. Clique em uma linha para ver issues e recomendações.
            </InfoTooltip>
            {totalRuns > 0 && (
              <span className="text-[#9B9B95] font-normal ml-1.5 text-[12px]">
                ({visibleRuns.length}
                {runFilter === "last20" && totalRuns > 20 ? ` de ${totalRuns}` : ""})
              </span>
            )}
          </h2>
          <RunFilterBar filter={runFilter} onChange={changeRunFilter} counts={runFilterCounts} />
        </div>

        {visibleRuns.length === 0 ? (
          <div className="border border-dashed border-[#E5E5E2] rounded-[10px] px-6 py-8 text-center">
            <p className="text-[13px] text-[#9B9B95]">
              {totalRuns === 0
                ? "Nenhuma simulação ainda. Clique em \"Rodar 1\" para começar."
                : "Nenhuma simulação corresponde ao filtro selecionado."}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {visibleRuns.map((run) =>
              expandedRunId === run.id && expandedRun ? (
                <RunDetail key={run.id} run={expandedRun} onClose={() => setExpandedRunId(null)} />
              ) : (
                <RunRow key={run.id} run={run} onExpand={setExpandedRunId} />
              )
            )}
          </div>
        )}
      </section>

      {/* Part 2 + 5 — Suggestion queue with tabs */}
      <section data-tour="training-suggestions">
        <div className="flex items-center gap-3 mb-1 flex-wrap">
          <h2 className="text-[13px] font-semibold text-[#1A1A1A] shrink-0 inline-flex items-center gap-1">
            Melhorias sugeridas
            <InfoTooltip title="Sugestões">
              Geradas automaticamente quando o mesmo critério falha em 2+ runs. Aprovar não altera o brain do SDR — a sugestão aguarda aplicação manual.
            </InfoTooltip>
          </h2>
          <SuggTabBar active={suggTab} onChange={setSuggTab} counts={suggCounts} />
        </div>

        <p className="text-[11px] text-[#9B9B95] mb-3 leading-relaxed">
          {suggTab === "pending" &&
            "Geradas quando o mesmo critério falha em 2+ runs. Aprovar ou rejeitar move a sugestão para o arquivo correspondente."}
          {suggTab === "approved" &&
            "Sugestões que foram aprovadas para revisão futura."}
          {suggTab === "rejected" &&
            "Sugestões descartadas. Ficam aqui para referência, nunca são apagadas."}
          {suggTab === "all" &&
            "Todas as sugestões geradas nesta sessão de treino."}
        </p>

        {/* Part 5 — Approved archive note */}
        {suggTab === "approved" && approvedCount > 0 && (
          <div className="mb-3 bg-[#F0FDF4] border border-[#BBF7D0] rounded-[8px] px-4 py-3 flex items-start gap-3">
            <span className="text-[#16A34A] shrink-0 mt-0.5">✓</span>
            <div>
              <p className="text-[12px] font-semibold text-[#15803D] leading-snug">
                Estas sugestões foram aprovadas, mas ainda não foram aplicadas automaticamente ao brain do SDR.
              </p>
              <span className="inline-flex items-center gap-1.5 mt-2 text-[10px] font-semibold text-[#5B5BD6] bg-[#EEF0FF] border border-[#C7D2FE] px-2 py-1 rounded-[4px]">
                ⏳ aguardando aplicação futura
              </span>
            </div>
          </div>
        )}

        {visibleSugg.length === 0 ? (
          <div className="border border-dashed border-[#E5E5E2] rounded-[10px] px-6 py-8 text-center">
            <p className="text-[13px] text-[#9B9B95]">
              {suggestions.length === 0
                ? "Nenhuma melhoria detectada ainda."
                : suggTab === "pending"
                ? "Nenhuma sugestão pendente. Todas as melhorias foram decididas."
                : suggTab === "approved"
                ? "Nenhuma sugestão aprovada ainda."
                : suggTab === "rejected"
                ? "Nenhuma sugestão rejeitada."
                : "Nenhuma sugestão encontrada."}
            </p>
            {suggestions.length === 0 && (
              <p className="text-[11px] text-[#C0C0BC] mt-1">
                Sugestões surgem quando o mesmo critério falha em 2+ simulações.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {visibleSugg.map((s) => (
              <SuggestionCard key={s.id} suggestion={s} onDecide={updateSuggestionStatus} />
            ))}
          </div>
        )}
      </section>

      {/* Part 6 — Server training panel */}
      <div data-tour="training-server">
        <ServerTrainingPanel />
      </div>

      {/* Onboarding — tour guiado + explicação da tela */}
      <GuidedTour tour={SDR_TRAINING_TOUR} open={tourOpen} onClose={closeTour} />
      <ExplainScreenDrawer
        open={explainOpen}
        onClose={() => setExplainOpen(false)}
        screenTitle="Treinamento Contínuo — SDR"
        explanation={buildTrainingExplanation({
          totalRuns,
          runsToday,
          avgScore,
          failCount,
          criticalFails: critFails,
          pendingSuggestions: pendingCount,
          approvedSuggestions: approvedCount,
          continuousMode,
        })}
      />

    </div>
  );
}
