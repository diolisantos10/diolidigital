"use client";

import Link from "next/link";
import { useTrainingStore } from "@/store/training-store";
import { useAgencyStore } from "@/store/agency-store";
import { SDRSimulator } from "@/components/agency/simulations/SDRSimulator";
import { computeSDRScorecard } from "@/lib/dioli-brain/sdr-scorecard";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";

// ── SDR Scorecard Bar ─────────────────────────────────────────────────────────

function SDRScorecardBar() {
  const { runs, suggestions } = useTrainingStore();
  const { clientRequests } = useAgencyStore();

  const scorecard = computeSDRScorecard(clientRequests, runs, suggestions, 0);

  const metrics = [
    { label: "Briefings concluídos",    value: `${scorecard.briefingsCompleted}/${scorecard.briefingsStarted}`, note: `${scorecard.completionRate}%` },
    { label: "Taxa de qualificação",    value: `${scorecard.qualifiedRate}%` },
    { label: "Quality Gate pass",       value: scorecard.briefingsStarted > 0 ? `${scorecard.qualityGatePassRate}%` : "—" },
    { label: "Objeções resolvidas",     value: `${scorecard.objectionResolutionRate}%` },
    { label: "Confiança média",         value: `${scorecard.averageConfidence}%` },
    { label: "Runs de treinamento",     value: runs.length.toString() },
    { label: "Sugestões geradas",       value: scorecard.trainingSuggestionsGenerated.toString() },
  ];

  return (
    <div className="mb-5 bg-[#F7F7F6] border border-[#E5E5E2] rounded-[10px] px-4 py-3">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">SDR Scorecard</span>
        <span className="h-4 px-1.5 rounded-[3px] bg-[#DCFCE7] text-[#16A34A] text-[9px] font-bold">Operacional</span>
      </div>
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-7">
        {metrics.map((m) => (
          <div key={m.label} className="text-center">
            <div className="text-[16px] font-bold text-[#1A1A1A]">
              {m.value}
              {m.note && <span className="text-[10px] font-normal text-[#9B9B95] ml-0.5">{m.note}</span>}
            </div>
            <div className="text-[9px] text-[#9B9B95] mt-0.5 leading-tight">{m.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Training Summary Bar ──────────────────────────────────────────────────────

function TrainingSummaryBar() {
  const { runs } = useTrainingStore();
  if (runs.length === 0) return null;

  const avgScore  = Math.round(runs.reduce((a, r) => a + r.score, 0) / runs.length);
  const failCount = runs.filter((r) => r.verdict === "fail").length;
  const pending   = runs.filter((r) => r.issues.length > 0).flatMap((r) => r.issues);
  const topIssues = [...new Map(pending.map((i) => [i.criterion, i])).values()].slice(0, 3);

  return (
    <div className="mb-5 bg-[#F7F7F6] border border-[#E5E5E2] rounded-[10px] px-4 py-3 flex items-center gap-5 flex-wrap">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Treinamento SDR</span>
        <span className="text-[11px] text-[#1A1A1A] font-medium">{runs.length} run{runs.length > 1 ? "s" : ""}</span>
        <span className="text-[11px] text-[#6B6B65]">· score médio {avgScore}/100</span>
        {failCount > 0 && (
          <span className="text-[11px] text-[#DC2626]">· {failCount} fail{failCount > 1 ? "s" : ""}</span>
        )}
      </div>

      {topIssues.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-[#9B9B95]">Issues recorrentes:</span>
          {topIssues.map((issue) => (
            <span key={issue.criterion} className="h-5 px-2 rounded-[4px] bg-[#FEE2E2] text-[#DC2626] text-[9px] font-medium">
              {issue.criterion}
            </span>
          ))}
        </div>
      )}

      <Link
        href="/agency/simulations/training"
        className="ml-auto text-[11px] font-medium text-[#070A1F] hover:underline shrink-0"
      >
        Ver treinamento →
      </Link>
    </div>
  );
}

export default function SDRSimulatorPage() {
  return (
    <div>
      <AgencyHeader
        title="SDR Agent"
        actions={<Link href="/agency/simulations/training" className="text-[11px] text-[#9B9B95] hover:text-[#070A1F] transition-colors">Treinamento contínuo →</Link>}
      />

      <SDRScorecardBar />
      <TrainingSummaryBar />

      <SDRSimulator />
    </div>
  );
}
