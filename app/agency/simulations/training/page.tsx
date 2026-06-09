"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTrainingStore, type TrainingMode } from "@/store/training-store";
import { SEED_SCENARIOS } from "@/lib/agency/training/scenarios";
import type { SimulationRun, AgentImprovementSuggestion, ImprovementStatus } from "@/lib/agency/training/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function fmt(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: string | number; color?: "green" | "yellow" | "red" }) {
  const cl = color === "green" ? "text-[#16A34A]" : color === "yellow" ? "text-[#D97706]" : color === "red" ? "text-[#DC2626]" : "text-[#1A1A1A]";
  return (
    <div className="bg-white border border-[#E5E5E2] rounded-[10px] px-4 py-3.5">
      <p className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-1">{label}</p>
      <p className={`text-[22px] font-bold ${cl}`}>{value}</p>
    </div>
  );
}

function OriginBadge({ origin }: { origin: "seed" | "dynamic" }) {
  return origin === "dynamic"
    ? <span className="h-4 px-1.5 rounded-[3px] bg-[#EEF0FF] text-[#5B5BD6] text-[8px] font-bold uppercase tracking-wide">dinâmico</span>
    : <span className="h-4 px-1.5 rounded-[3px] bg-[#F0F0ED] text-[#9B9B95] text-[8px] font-bold uppercase tracking-wide">seed</span>;
}

function RunRow({ run, onExpand }: { run: SimulationRun; onExpand: (id: string) => void }) {
  const v = VERDICT_STYLE[run.verdict];
  return (
    <button
      onClick={() => onExpand(run.id)}
      className="w-full flex items-center gap-3 px-4 py-2.5 bg-white border border-[#E5E5E2] rounded-[8px] text-[12px] hover:border-[#9B9B95] transition-colors text-left"
    >
      <span className={`shrink-0 h-5 px-2 rounded-[4px] text-[10px] font-bold ${v.bg} ${v.text}`}>
        {v.label}
      </span>
      <OriginBadge origin={run.scenarioOrigin} />
      <span className="font-medium text-[#1A1A1A] flex-1 truncate">{run.scenarioName}</span>
      <span className="text-[#6B6B65] shrink-0">{run.score}/100</span>
      <span className="text-[#9B9B95] font-mono text-[10px] shrink-0">{fmt(run.completedAt)}</span>
      {run.issues.length > 0 && (
        <span className="text-[10px] text-[#DC2626] shrink-0">{run.issues.length} issue{run.issues.length > 1 ? "s" : ""}</span>
      )}
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
        <button onClick={onClose} className="text-[11px] text-[#9B9B95] hover:text-[#1A1A1A] transition-colors">Fechar</button>
      </div>

      {/* Scenario metadata (dynamic only) */}
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
          {run.scenarioSeed && (
            <p className="text-[9px] text-[#818CF8] font-mono">seed: {run.scenarioSeed}</p>
          )}
        </div>
      )}

      {/* Issues */}
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

      {/* Recommendations */}
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

// ── Mode selector ─────────────────────────────────────────────────────────────

const MODE_OPTIONS: { id: TrainingMode; label: string; desc: string }[] = [
  { id: "dynamic", label: "Dinâmico",  desc: "Gera cenários novos a cada ciclo — treino real." },
  { id: "mixed",   label: "Misto",     desc: "30% fixos (regressão) + 70% dinâmicos." },
  { id: "seed",    label: "Fixos",     desc: "Apenas os 22 cenários seed — prova de regressão." },
];

function ModeSelector({ mode, onChange }: { mode: TrainingMode; onChange: (m: TrainingMode) => void }) {
  return (
    <div className="flex gap-1 p-1 bg-[#F0F0ED] rounded-[8px] w-fit">
      {MODE_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          className={`h-7 px-3.5 rounded-[6px] text-[11px] font-medium transition-all ${
            mode === opt.id
              ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] text-[#1A1A1A]"
              : "text-[#6B6B65] hover:text-[#1A1A1A]"
          }`}
          title={opt.desc}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Overfitting warning ───────────────────────────────────────────────────────

function OverfitWarning({ runs }: { runs: SimulationRun[] }) {
  const last20      = runs.slice(-20);
  const allSeed     = last20.length >= 10 && last20.every((r) => r.scenarioOrigin === "seed");
  if (!allSeed) return null;
  return (
    <div className="bg-[#FEF3C7] border border-[#FDE68A] rounded-[8px] px-4 py-3 flex items-start gap-3">
      <span className="text-[14px] shrink-0">⚠</span>
      <div className="text-[12px]">
        <p className="font-semibold text-[#92400E]">Overfitting detectado</p>
        <p className="text-[#B45309] leading-relaxed mt-0.5">
          Você está rodando apenas cenários fixos. O SDR pode "decorar" os testes sem generalizar.
          Use cenários dinâmicos para treino real.
        </p>
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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (continuousMode && !isRunning) {
      intervalRef.current = setInterval(() => {
        if (trainingMode === "seed")    runSeedScenarios(3);
        else if (trainingMode === "dynamic") runDynamicScenarios(3);
        else runMixedScenarios(3);
      }, 8000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [continuousMode, isRunning, trainingMode, runSeedScenarios, runDynamicScenarios, runMixedScenarios]);

  const totalRuns    = runs.length;
  const seedCount    = runs.filter((r) => r.scenarioOrigin === "seed").length;
  const dynCount     = runs.filter((r) => r.scenarioOrigin === "dynamic").length;
  const passCount    = runs.filter((r) => r.verdict === "pass").length;
  const warnCount    = runs.filter((r) => r.verdict === "warning").length;
  const failCount    = runs.filter((r) => r.verdict === "fail").length;
  const avgScore     = totalRuns > 0 ? Math.round(runs.reduce((a, r) => a + r.score, 0) / totalRuns) : 0;
  const latestRuns   = [...runs].reverse().slice(0, 15);
  const pendingCount = suggestions.filter((s) => s.status === "pending").length;
  const expandedRun  = expandedRunId ? runs.find((r) => r.id === expandedRunId) : null;

  function runNow(count: number) {
    if (trainingMode === "seed")         runSeedScenarios(count);
    else if (trainingMode === "dynamic") runDynamicScenarios(count);
    else runMixedScenarios(count);
  }

  const BTN = "h-8 px-4 rounded-[7px] border text-[12px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const BTN_DARK   = `${BTN} bg-[#1A1A1A] border-[#1A1A1A] text-white hover:bg-[#111111]`;
  const BTN_LIGHT  = `${BTN} bg-white border-[#E5E5E2] text-[#6B6B65] hover:border-[#9B9B95] hover:text-[#1A1A1A]`;
  const BTN_YELLOW = `${BTN} bg-[#FEF3C7] border-[#FDE68A] text-[#D97706] hover:bg-[#FEF08A]`;
  const BTN_BLUE   = `${BTN} bg-[#EEF0FF] border-[#C7D2FE] text-[#5B5BD6] hover:bg-[#E0E7FF]`;

  const modeDesc = MODE_OPTIONS.find((m) => m.id === trainingMode)?.desc ?? "";

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
        <button onClick={clearRuns} className="text-[11px] text-[#9B9B95] hover:text-[#DC2626] transition-colors">
          Limpar logs
        </button>
      </div>

      {/* Overfitting warning */}
      <OverfitWarning runs={runs} />

      {/* Stats */}
      <div className="grid grid-cols-6 gap-2.5">
        <StatCard label="Total de Runs"   value={totalRuns}         />
        <StatCard label="Score Médio"     value={`${avgScore}/100`} />
        <StatCard label="Dinâmicos"       value={dynCount}  color="green"  />
        <StatCard label="Pass (≥ 80)"    value={passCount}  color="green"  />
        <StatCard label="Warning (60–79)" value={warnCount} color="yellow" />
        <StatCard label="Fail (< 60)"    value={failCount}  color="red"    />
      </div>

      {/* Mode + run controls */}
      <div className="bg-white border border-[#E5E5E2] rounded-[10px] px-4 py-4 space-y-3">
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

          {/* Quick overrides */}
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
            Modo contínuo: roda 3 simulações a cada 8 s enquanto esta tela estiver aberta.
          </div>
        )}
      </div>

      {/* Distribution */}
      {totalRuns > 0 && (
        <div className="flex items-center gap-3 text-[11px] text-[#6B6B65]">
          <span>{seedCount} fixo{seedCount !== 1 ? "s" : ""}</span>
          <span className="text-[#C0C0BC]">+</span>
          <span className="text-[#5B5BD6] font-medium">{dynCount} dinâmico{dynCount !== 1 ? "s" : ""}</span>
          <span className="text-[#C0C0BC]">=</span>
          <span className="font-medium text-[#1A1A1A]">{totalRuns} total</span>
        </div>
      )}

      {/* Latest runs */}
      <section>
        <h2 className="text-[13px] font-semibold text-[#1A1A1A] mb-2.5">
          Últimas simulações
          {latestRuns.length > 0 && <span className="text-[#9B9B95] font-normal ml-1.5">({latestRuns.length} de {totalRuns})</span>}
        </h2>
        {latestRuns.length === 0 ? (
          <div className="border border-dashed border-[#E5E5E2] rounded-[10px] px-6 py-8 text-center">
            <p className="text-[13px] text-[#9B9B95]">Nenhuma simulação ainda. Clique em "Rodar 1" para começar.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {latestRuns.map((run) =>
              expandedRunId === run.id && expandedRun ? (
                <RunDetail key={run.id} run={expandedRun} onClose={() => setExpandedRunId(null)} />
              ) : (
                <RunRow key={run.id} run={run} onExpand={setExpandedRunId} />
              )
            )}
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
          Geradas automaticamente quando o mesmo problema aparece em 2+ runs.
          A aplicação automática ao brain será feita em fase futura.
        </p>
        {suggestions.length === 0 ? (
          <div className="border border-dashed border-[#E5E5E2] rounded-[10px] px-6 py-8 text-center">
            <p className="text-[13px] text-[#9B9B95]">Nenhuma melhoria detectada ainda.</p>
            <p className="text-[11px] text-[#C0C0BC] mt-1">Sugestões surgem quando o mesmo critério falha em 2+ simulações.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {suggestions.map((s) => <SuggestionCard key={s.id} suggestion={s} onDecide={updateSuggestionStatus} />)}
          </div>
        )}
      </section>

    </div>
  );
}
