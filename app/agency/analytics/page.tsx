"use client";

import { useState } from "react";
import { useAgencyStore } from "@/store/agency-store";
import { useStrategyStore } from "@/store/strategy-store";
import { useTrafficStore } from "@/store/traffic-store";
import { useAnalyticsStore } from "@/store/analytics-store";
import { AnalyticsCanvasCard } from "@/components/agency/analytics/AnalyticsCanvasCard";
import { computeAnalyticsScorecard } from "@/lib/dioli-brain/analytics-scorecard";
import { buildAnalyticsChangeRequestInput } from "@/lib/dioli-brain/analytics-training";
import type { AnalyticsCanvas } from "@/lib/dioli-brain/analytics-canvas";

type CanvasFilter = "all" | "draft" | "approved" | "rejected";

const FILTERS: { label: string; value: CanvasFilter }[] = [
  { label: "Todos", value: "all" }, { label: "Rascunhos", value: "draft" },
  { label: "Aprovados", value: "approved" }, { label: "Rejeitados", value: "rejected" },
];

export default function AnalyticsWorkspacePage() {
  const { clientRequests, updateClientRequest, addActivity } = useAgencyStore();
  const { canvases: strategyCanvases } = useStrategyStore();
  const { canvases: trafficCanvases } = useTrafficStore();
  const { canvases, changeRequestCanvasIds, createCanvas, reviewCanvas, markChangeRequestCreated } = useAnalyticsStore();

  const [filter, setFilter] = useState<CanvasFilter>("all");
  const [proposeError, setProposeError] = useState<string | null>(null);

  // Queue: approved traffic canvases that don't yet have an analytics canvas
  const analyticsByTraffic = new Set(canvases.map((c) => c.trafficCanvasId).filter(Boolean));
  const analyticsByStrategy = new Set(canvases.map((c) => c.strategyCanvasId).filter(Boolean));

  const queue = trafficCanvases.filter(
    (t) => t.status === "approved" && t.source === "request" && !analyticsByTraffic.has(t.id)
  );

  const scorecard = computeAnalyticsScorecard(canvases, changeRequestCanvasIds.length);
  const filtered = canvases.filter((c) => filter === "all" || c.status === filter);

  function handleGenerateFromTraffic(trafficCanvas: typeof trafficCanvases[number]) {
    const strategy = strategyCanvases.find((s) => s.id === trafficCanvas.strategyCanvasId);
    if (!strategy) return;
    const request = (clientRequests ?? []).find((r) => r.id === trafficCanvas.requestId);
    createCanvas({
      strategyCanvas: strategy,
      trafficCanvas,
      requestId: trafficCanvas.requestId,
      source: "request",
    });
    addActivity({
      type: "intelligence_run",
      message: `Analytics Canvas gerado para "${strategy.clientName}"`,
      clientId: request?.clientId,
    });
  }

  function handleApprove(canvas: AnalyticsCanvas, note?: string) {
    if (canvas.qualityGateResult.overall === "FAIL") return;
    reviewCanvas(canvas.id, "approved", note);
    if (canvas.requestId) updateClientRequest(canvas.requestId, { status: "waiting_quality" });
    addActivity({ type: "intelligence_run", message: `Analytics Canvas aprovado: ${canvas.clientName} — enviado para Quality` });
  }

  async function handleProposeBrainChange(canvas: AnalyticsCanvas) {
    setProposeError(null);
    const source = canvas.status === "approved" ? "approved_canvas" : "rejected_canvas";
    const proposed = canvas.status === "approved"
      ? `Reforçar perfil de analytics do segmento "${canvas.segment}" — KPI primário: ${canvas.primaryKPI}.`
      : `Revisar perfil de analytics do segmento "${canvas.segment}".${canvas.reviewNote ? ` Motivo: ${canvas.reviewNote}` : ""}`;
    const body = buildAnalyticsChangeRequestInput(canvas, source, proposed);
    try {
      const res = await fetch("/api/brain/changes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { setProposeError(`Falha HTTP ${res.status}.`); return; }
      markChangeRequestCreated(canvas.id);
    } catch { setProposeError("Erro de rede."); }
  }

  const scorecardMetrics = [
    { label: "Canvases",       value: scorecard.canvasesCreated },
    { label: "Aprovados",      value: scorecard.canvasesApproved },
    { label: "Aprovação",      value: `${scorecard.approvalRate}%` },
    { label: "KPIs mapeados",  value: scorecard.kpisFramed },
    { label: "Recomendações",  value: scorecard.recommendationsGenerated },
    { label: "QG Pass",        value: `${scorecard.qualityGatePassRate}%` },
    { label: "Evidências",     value: scorecard.evidenceGenerated },
    { label: "Brain Changes",  value: scorecard.brainChangeRequestsGenerated },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-semibold text-[#1A1A1A]">Analytics</h1>
            <span className="h-5 px-2 rounded-full bg-[#F0FDF4] text-[#16A34A] text-[10px] font-semibold flex items-center">Brain · Mensuração</span>
          </div>
          <p className="text-[12px] text-[#6B6B65] mt-0.5">Framework de KPIs, atribuição de canais, gaps de performance e recomendações de melhoria</p>
        </div>
        <a href="/agency/simulations/analytics" className="text-[11px] font-medium px-3 py-1.5 rounded-[6px] bg-[#F0FDF4] text-[#16A34A] hover:bg-[#DCFCE7]">Laboratório →</a>
      </div>

      <div className="rounded-[10px] border border-[#16A34A]/20 bg-[#F0FDF4]/50 px-4 py-3">
        <div className="text-[9px] font-semibold text-[#16A34A] uppercase tracking-[0.08em] mb-2">Scorecard — Analytics</div>
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
          {scorecardMetrics.map((m) => (
            <div key={m.label} className="text-center">
              <div className="text-[16px] font-bold text-[#1A1A1A]">{m.value}</div>
              <div className="text-[9px] text-[#9B9B95] mt-0.5">{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[8px] bg-[#F0F0ED] px-3 py-2 text-[11px] text-[#6B6B65]">
        <span className="font-semibold text-[#16A34A]">Dioli Standard:</span>{" "}
        Analytics Canvas requer Strategy Canvas aprovado. KPIs sempre mensuráveis e com responsável definido. Nenhuma campanha otimizada sem attribution model configurado.
      </div>

      {queue.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-[13px] font-semibold text-[#1A1A1A]">Fila de entrada ({queue.length})</h2>
          {queue.map((traffic) => {
            const strategy = strategyCanvases.find((s) => s.id === traffic.strategyCanvasId);
            return (
              <div key={traffic.id} className="rounded-[10px] border border-[#16A34A]/30 bg-[#F0FDF4]/60 px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[13px] font-medium text-[#1A1A1A]">{traffic.clientName}</p>
                  <p className="text-[11px] text-[#6B6B65]">{traffic.segment} · Traffic Canvas aprovado</p>
                </div>
                <button
                  onClick={() => handleGenerateFromTraffic(traffic)}
                  disabled={!strategy}
                  className="shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-[6px] bg-[#16A34A] text-white hover:bg-[#15803D] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Gerar Analytics Canvas
                </button>
              </div>
            );
          })}
        </div>
      )}

      {proposeError && <div className="rounded-[8px] bg-[#FEE2E2] border border-[#FECACA] px-3 py-2 text-[11px] text-[#991B1B]">{proposeError}</div>}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-[#1A1A1A]">Analytics Canvases ({filtered.length})</h2>
          <div className="flex gap-1">
            {FILTERS.map((f) => (
              <button key={f.value} onClick={() => setFilter(f.value)}
                className={`text-[11px] px-2.5 py-1 rounded-[5px] font-medium ${filter === f.value ? "bg-[#1A1A1A] text-white" : "text-[#6B6B65] hover:text-[#1A1A1A]"}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className="rounded-[10px] border border-[#E8E8E2] bg-[#FAFAF8] px-6 py-10 text-center">
            <p className="text-[13px] text-[#6B6B65]">Nenhum Analytics Canvas gerado ainda.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((canvas) => (
              <AnalyticsCanvasCard key={canvas.id} canvas={canvas}
                onApprove={canvas.status === "draft" ? (note) => handleApprove(canvas, note) : undefined}
                onReject={canvas.status === "draft" ? (note) => reviewCanvas(canvas.id, "rejected", note) : undefined}
                onProposeBrainChange={() => handleProposeBrainChange(canvas)}
                brainChangeCreated={changeRequestCanvasIds.includes(canvas.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
