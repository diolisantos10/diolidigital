"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useTrainingStore } from "@/store/training-store";
import { SEED_SCENARIOS } from "@/lib/agency/training/scenarios";
import type { SimulationRun, AgentImprovementSuggestion, ImprovementStatus } from "@/lib/agency/training/types";

// ── helpers ───────────────────────────────────────────────────────────────────

const VERDICT_STYLE = {
  pass:    { bg: "bg-[#DCFCE7]", text: "text-[#16A34A]", label: "Pass"    },
  warning: { bg: "bg-[#FEF3C7]", text: "text-[#D97706]", label: "Warning" },
  fail:    { bg: "bg-[#FEE2E2]", text: "text-[#DC2626]", label: "Fail"    },
};

const IMPACT_STYLE: Record<string, { bg: string; text: string }> = {
  low:      { bg: "bg-[#F0F0ED]",  text: "text-[#6B6B65]"  },
  medium:   { bg: "bg-[#FEF3C7]",  text: "text-[#D97706]"  },
  high:     { bg: "bg-[#EEF0FF]",  text: "text-[#5B5BD6]"  },
  critical: { bg: "bg-[#FEE2E2]",  text: "text-[#DC2626]"  },
};

const STATUS_STYLE: Record<ImprovementStatus, { bg: string; text: string; label: string }> = {
  pending:  { bg: "bg-[#FEF3C7]", text: "text-[#D97706]", label: "Pendente"  },
  approved: { bg: "bg-[#DCFCE7]", text: "text-[#16A34A]", label: "Aprovado"  },
  rejected: { bg: "bg-[#F0F0ED]", text: "text-[#9B9B95]", label: "Rejeitado" },
  applied:  { bg: "bg-[#EEF0FF]", text: "text-[#5B5BD6]", label: "Aplicado"  },
};

function fmt(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ── sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: string | number; color?: "green" | "yellow" | "red" }) {
  const colorClass =
    color === "green"  ? "text-[#16A34A]" :
    color === "yellow" ? "text-[#D97706]" :
    color === "red"    ? "text-[#DC2626]" :
    "text-[#1A1A1A]";
  return (
    <div className="bg-white border border-[#E5E5E2] rounded-[10px] px-4 py-3.5">
      <p className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-1">{label}</p>
      <p className={`text-[22px] font-bold ${colorClass}`}>{value}</p>
    </div>
  );
}

function RunRow({ run }: { run: SimulationRun }) {
  const v = VERDICT_STYLE[run.verdict];
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-white border border-[#E5E5E2] rounded-[8px] text-[12px]">
      <span className={`shrink-0 h-5 px-2 rounded-[4px] text-[10px] font-bold ${v.bg} ${v.text}`}>
        {v.label}
      </span>
      <span className="font-medium text-[#1A1A1A] flex-1 truncate">{run.scenarioName}</span>
      <span className="text-[#6B6B65] shrink-0">{run.score}/100</span>
      <span className="text-[#9B9B95] font-mono text-[10px] shrink-0">{fmt(run.completedAt)}</span>
      {run.issues.length > 0 && (
        <span className="text-[10px] text-[#DC2626] shrink-0">{run.issues.length} issue{run.issues.length > 1 ? "s" : ""}</span>
      )}
    </div>
  );
}

function SuggestionCard({
  suggestion,
  onDecide,
}: {
  suggestion: AgentImprovementSuggestion;
  onDecide: (id: string, status: ImprovementStatus) => void;
}) {
  const imp = IMPACT_STYLE[suggestion.impact] ?? IMPACT_STYLE.medium;
  const st  = STATUS_STYLE[suggestion.status];
  const isPending = suggestion.status === "pending";

  return (
    <div className="bg-white border border-[#E5E5E2] rounded-[10px] p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`h-5 px-2 rounded-[4px] text-[9px] font-bold uppercase tracking-wide ${imp.bg} ${imp.text}`}>
              {suggestion.impact}
            </span>
            <span className={`h-5 px-2 rounded-[4px] text-[9px] font-semibold ${st.bg} ${st.text}`}>
              {st.label}
            </span>
          </div>
          <h3 className="text-[13px] font-semibold text-[#1A1A1A]">{suggestion.title}</h3>
        </div>
        {isPending && (
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => onDecide(suggestion.id, "approved")}
              className="h-7 px-3 rounded-[6px] bg-[#DCFCE7] text-[#16A34A] text-[11px] font-semibold hover:bg-[#BBF7D0] transition-colors"
            >
              Aprovar
            </button>
            <button
              onClick={() => onDecide(suggestion.id, "rejected")}
              className="h-7 px-3 rounded-[6px] bg-[#F0F0ED] text-[#6B6B65] text-[11px] font-medium hover:bg-[#E5E5E2] transition-colors"
            >
              Rejeitar
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2.5 text-[12px]">
        <div>
          <p className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-0.5">Problema detectado</p>
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TrainingPage() {
  const {
    runs, suggestions, isRunning, continuousMode,
    runScenarios, updateSuggestionStatus, toggleContinuousMode, clearRuns,
  } = useTrainingStore();

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (continuousMode && !isRunning) {
      intervalRef.current = setInterval(() => {
        runScenarios(3);
      }, 8000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [continuousMode, isRunning, runScenarios]);

  const totalRuns   = runs.length;
  const passCount   = runs.filter((r) => r.verdict === "pass").length;
  const warnCount   = runs.filter((r) => r.verdict === "warning").length;
  const failCount   = runs.filter((r) => r.verdict === "fail").length;
  const avgScore    = totalRuns > 0 ? Math.round(runs.reduce((a, r) => a + r.score, 0) / totalRuns) : 0;
  const latestRuns  = [...runs].reverse().slice(0, 15);
  const pendingCount = suggestions.filter((s) => s.status === "pending").length;

  const BTN = "h-8 px-4 rounded-[7px] border text-[12px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const BTN_DARK   = `${BTN} bg-[#1A1A1A] border-[#1A1A1A] text-white hover:bg-[#111111]`;
  const BTN_LIGHT  = `${BTN} bg-white border-[#E5E5E2] text-[#6B6B65] hover:border-[#9B9B95] hover:text-[#1A1A1A]`;
  const BTN_GREEN  = `${BTN} bg-[#DCFCE7] border-[#86EFAC] text-[#16A34A] hover:bg-[#BBF7D0]`;
  const BTN_YELLOW = `${BTN} bg-[#FEF3C7] border-[#FDE68A] text-[#D97706] hover:bg-[#FEF08A]`;

  return (
    <div className="space-y-6 max-w-[900px]">

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
            Simule conversas do SDR Agent, avalie performance e gerencie sugestões de melhoria.
            Nenhum dado é salvo no sistema de produção.
          </p>
        </div>
        <button onClick={clearRuns} className="text-[11px] text-[#9B9B95] hover:text-[#DC2626] transition-colors">
          Limpar logs
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3">
        <StatCard label="Total de Runs"    value={totalRuns}          />
        <StatCard label="Score Médio"      value={`${avgScore}/100`}  />
        <StatCard label="Pass (≥ 80)"     value={passCount}  color="green"  />
        <StatCard label="Warning (60–79)"  value={warnCount}  color="yellow" />
        <StatCard label="Fail (< 60)"     value={failCount}  color="red"    />
      </div>

      {/* Run controls */}
      <div className="bg-white border border-[#E5E5E2] rounded-[10px] px-4 py-4 space-y-3">
        <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em]">
          Executar simulações ({SEED_SCENARIOS.length} cenários disponíveis)
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <button className={BTN_DARK}  onClick={() => runScenarios(1)}  disabled={isRunning}>Rodar 1 cenário</button>
          <button className={BTN_LIGHT} onClick={() => runScenarios(10)} disabled={isRunning}>Rodar 10 cenários</button>
          <button className={BTN_LIGHT} onClick={() => runScenarios(50)} disabled={isRunning}>Rodar 50 cenários</button>

          <div className="ml-auto flex items-center gap-2">
            {isRunning && (
              <span className="flex items-center gap-1.5 text-[11px] text-[#D97706]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D97706] animate-pulse" />
                Rodando…
              </span>
            )}
            <button
              onClick={toggleContinuousMode}
              className={continuousMode ? BTN_YELLOW : BTN_LIGHT}
            >
              {continuousMode ? "⏸ Parar modo contínuo" : "▶ Modo contínuo"}
            </button>
          </div>
        </div>

        {continuousMode && (
          <div className="bg-[#FEF3C7] border border-[#FDE68A] rounded-[8px] px-3 py-2.5 text-[11px] text-[#92400E]">
            Modo contínuo experimental: roda 3 simulações a cada 8 s enquanto esta tela estiver aberta.
          </div>
        )}
      </div>

      {/* Latest runs */}
      <section>
        <h2 className="text-[13px] font-semibold text-[#1A1A1A] mb-2.5">
          Últimas simulações
          {latestRuns.length > 0 && <span className="text-[#9B9B95] font-normal ml-1.5">({latestRuns.length} de {totalRuns})</span>}
        </h2>
        {latestRuns.length === 0 ? (
          <div className="border border-dashed border-[#E5E5E2] rounded-[10px] px-6 py-8 text-center">
            <p className="text-[13px] text-[#9B9B95]">Nenhuma simulação realizada ainda.</p>
            <p className="text-[11px] text-[#C0C0BC] mt-1">Clique em "Rodar 1 cenário" para começar.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {latestRuns.map((run) => <RunRow key={run.id} run={run} />)}
          </div>
        )}
      </section>

      {/* Improvement suggestions */}
      <section>
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-[13px] font-semibold text-[#1A1A1A]">Melhorias sugeridas</h2>
          {pendingCount > 0 && (
            <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-[#D97706] text-white text-[10px] font-bold flex items-center justify-center">
              {pendingCount}
            </span>
          )}
        </div>
        <p className="text-[11px] text-[#9B9B95] mb-3 leading-relaxed">
          Sugestões geradas por padrões detectados nas simulações. A aplicação automática ao brain será feita em fase futura.
        </p>
        {suggestions.length === 0 ? (
          <div className="border border-dashed border-[#E5E5E2] rounded-[10px] px-6 py-8 text-center">
            <p className="text-[13px] text-[#9B9B95]">Nenhuma melhoria detectada ainda.</p>
            <p className="text-[11px] text-[#C0C0BC] mt-1">
              Rode mais cenários — sugestões são geradas quando o mesmo problema aparece em 2+ simulações.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {suggestions.map((s) => (
              <SuggestionCard key={s.id} suggestion={s} onDecide={updateSuggestionStatus} />
            ))}
          </div>
        )}
      </section>

    </div>
  );
}
