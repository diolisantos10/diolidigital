"use client";

import { useState } from "react";
import { useAgencyStore } from "@/store/agency-store";
import { useStrategyStore } from "@/store/strategy-store";
import { useSocialStore } from "@/store/social-store";
import { useDesignStore } from "@/store/design-store";
import { useTrafficStore } from "@/store/traffic-store";
import { useAnalyticsStore } from "@/store/analytics-store";
import { useQualityStore } from "@/store/quality-store";
import { QualityAuditCard } from "@/components/agency/quality/QualityAuditCard";
import { computeQualityScorecard } from "@/lib/dioli-brain/quality-scorecard";
import { buildQualityChangeRequestInput } from "@/lib/dioli-brain/quality-training";
import type { QualityCanvas } from "@/lib/dioli-brain/quality-canvas";
import { saveArtifactToDb } from "@/lib/agency/persistence/save-artifact";

type CanvasFilter = "all" | "draft" | "approved" | "rejected";

const FILTERS: { label: string; value: CanvasFilter }[] = [
  { label: "Todos", value: "all" }, { label: "Rascunhos", value: "draft" },
  { label: "Aprovados", value: "approved" }, { label: "Rejeitados", value: "rejected" },
];

export default function QualityWorkspacePage() {
  const { addActivity, updateClientRequest } = useAgencyStore();
  const { canvases: strategyCanvases } = useStrategyStore();
  const { canvases: socialCanvases }   = useSocialStore();
  const { canvases: designCanvases }   = useDesignStore();
  const { canvases: trafficCanvases }  = useTrafficStore();
  const { canvases: analyticsCanvases }= useAnalyticsStore();
  const { canvases, changeRequestCanvasIds, createCanvas, reviewCanvas, markChangeRequestCreated } = useQualityStore();

  const [filter, setFilter] = useState<CanvasFilter>("all");
  const [proposeError, setProposeError] = useState<string | null>(null);

  // Queue: approved analytics canvases that don't yet have a quality audit
  const auditedCanvasIds = new Set(canvases.map((c) => c.auditedCanvasId).filter(Boolean));
  const queue = analyticsCanvases.filter(
    (a) => a.status === "approved" && a.source === "request" && !auditedCanvasIds.has(a.id)
  );

  const scorecard = computeQualityScorecard(canvases, changeRequestCanvasIds.length);
  const filtered  = canvases.filter((c) => filter === "all" || c.status === filter);

  function handleRunAudit(analyticsCanvas: typeof analyticsCanvases[number]) {
    const strategy = strategyCanvases.find((s) => s.id === analyticsCanvas.strategyCanvasId);
    if (!strategy) return;
    const traffic  = trafficCanvases.find((t) => t.id === analyticsCanvas.trafficCanvasId);
    const social   = socialCanvases.find((s) => s.strategyCanvasId === strategy.id);
    const design   = designCanvases.find((d) => d.strategyCanvasId === strategy.id || d.socialCanvasId === social?.id);
    createCanvas({ strategyCanvas: strategy, socialCanvas: social, designCanvas: design, trafficCanvas: traffic, analyticsCanvas, requestId: analyticsCanvas.requestId, source: "request" });
    addActivity({ type: "intelligence_run", message: `Quality Audit gerado para "${analyticsCanvas.clientName}"` });
  }

  function handleApprove(canvas: QualityCanvas, note?: string) {
    if (canvas.overallVerdict === "BLOCKED") return;
    reviewCanvas(canvas.id, "approved", note);
    if (canvas.requestId) {
      updateClientRequest(canvas.requestId, { status: "in_progress" });
      saveArtifactToDb({
        clientRequestId: canvas.requestId,
        department: "quality",
        canvasId: canvas.id,
        canvas,
      });
    }
    addActivity({ type: "intelligence_run", message: `Quality Audit aprovado: ${canvas.clientName} — pipeline Brain concluído` });
  }

  async function handleProposeBrainChange(canvas: QualityCanvas) {
    setProposeError(null);
    const source = canvas.status === "approved" ? "approved_audit" : "rejected_audit";
    const proposed = canvas.patternsIdentified.filter((p) => p.type === "risk").length > 0
      ? `Corrigir padrões de risco identificados em "${canvas.auditedDepartment}" para o segmento "${canvas.segment}".`
      : `Reforçar padrões de qualidade em "${canvas.auditedDepartment}" para o segmento "${canvas.segment}".`;
    const body = buildQualityChangeRequestInput(canvas, source, proposed);
    try {
      const res = await fetch("/api/brain/changes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { setProposeError(`Falha HTTP ${res.status}.`); return; }
      markChangeRequestCreated(canvas.id);
    } catch { setProposeError("Erro de rede."); }
  }

  const scorecardMetrics = [
    { label: "Auditorias",          value: scorecard.auditsRun },
    { label: "Aprovadas",           value: scorecard.auditsApproved },
    { label: "Aprovação",           value: `${scorecard.approvalRate}%` },
    { label: "Falhas bloqueantes",  value: scorecard.blockingFailuresFound },
    { label: "Padrões",             value: scorecard.patternsIdentified },
    { label: "QG Pass",             value: `${scorecard.qualityGatePassRate}%` },
    { label: "Candidatos evidência",value: scorecard.evidenceCandidatesFound },
    { label: "Brain Changes",       value: scorecard.brainChangeRequestsGenerated },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-semibold text-[#1A1A1A]">Quality</h1>
            <span className="h-5 px-2 rounded-full bg-[#EEF0FF] text-[#5B5BD6] text-[10px] font-semibold flex items-center">Brain · Auditoria</span>
          </div>
          <p className="text-[12px] text-[#6B6B65] mt-0.5">Auditoria cross-departamento: verifica qualidade, detecta padrões e candidatos a evidência em todo o pipeline</p>
        </div>
        <a href="/agency/simulations/quality" className="text-[11px] font-medium px-3 py-1.5 rounded-[6px] bg-[#EEF0FF] text-[#5B5BD6] hover:bg-[#DDD6FE]">Laboratório →</a>
      </div>

      <div className="rounded-[10px] border border-[#5B5BD6]/20 bg-[#EEF0FF]/40 px-4 py-3">
        <div className="text-[9px] font-semibold text-[#5B5BD6] uppercase tracking-[0.08em] mb-2">Scorecard — Quality</div>
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
        <span className="font-semibold text-[#5B5BD6]">Dioli Standard:</span>{" "}
        Auditoria usa modelo diferente do que gerou o output. Falhas bloqueantes impedem aprovação. Problemas críticos são escalados — nunca omitidos.
      </div>

      {queue.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-[13px] font-semibold text-[#1A1A1A]">Fila de entrada ({queue.length})</h2>
          {queue.map((analytics) => {
            const hasStrategy = strategyCanvases.some((s) => s.id === analytics.strategyCanvasId);
            return (
              <div key={analytics.id} className="rounded-[10px] border border-[#5B5BD6]/30 bg-[#EEF0FF]/40 px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[13px] font-medium text-[#1A1A1A]">{analytics.clientName}</p>
                  <p className="text-[11px] text-[#6B6B65]">{analytics.segment} · Analytics Canvas aprovado</p>
                </div>
                <button
                  onClick={() => handleRunAudit(analytics)}
                  disabled={!hasStrategy}
                  className="shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-[6px] bg-[#5B5BD6] text-white hover:bg-[#4A4AC5] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Rodar Auditoria
                </button>
              </div>
            );
          })}
        </div>
      )}

      {proposeError && <div className="rounded-[8px] bg-[#FEE2E2] border border-[#FECACA] px-3 py-2 text-[11px] text-[#991B1B]">{proposeError}</div>}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-[#1A1A1A]">Quality Audits ({filtered.length})</h2>
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
            <p className="text-[13px] text-[#6B6B65]">Nenhuma auditoria gerada ainda.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((canvas) => (
              <QualityAuditCard key={canvas.id} canvas={canvas}
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
