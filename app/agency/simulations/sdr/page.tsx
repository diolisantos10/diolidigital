"use client";

import Link from "next/link";
import { useTrainingStore } from "@/store/training-store";
import { SDRSimulator } from "@/components/agency/simulations/SDRSimulator";

function TrainingSummaryBar() {
  const { runs } = useTrainingStore();
  if (runs.length === 0) return null;

  const latest    = [...runs].reverse()[0];
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
        className="ml-auto text-[11px] font-medium text-[#5B5BD6] hover:underline shrink-0"
      >
        Ver treinamento →
      </Link>
    </div>
  );
}

export default function SDRSimulatorPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 mb-4 text-[12px] text-[#9B9B95]">
        <Link href="/agency/simulations" className="hover:text-[#6B6B65] transition-colors">
          Laboratório
        </Link>
        <span>/</span>
        <span className="text-[#1A1A1A] font-medium">SDR Agent</span>
        <span className="ml-1 text-[9px] font-bold text-[#C0C0BC] bg-[#F0F0ED] px-1.5 py-0.5 rounded-full tracking-wide">
          INTERNO
        </span>
        <Link
          href="/agency/simulations/training"
          className="ml-auto text-[11px] text-[#9B9B95] hover:text-[#5B5BD6] transition-colors"
        >
          Treinamento contínuo →
        </Link>
      </div>

      <TrainingSummaryBar />

      <SDRSimulator />
    </div>
  );
}
