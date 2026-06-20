"use client";

import { useState } from "react";
import { useAgencyStore } from "@/store/agency-store";
import { useStrategyStore } from "@/store/strategy-store";
import { useTrafficStore } from "@/store/traffic-store";
import { useAnalyticsStore } from "@/store/analytics-store";
import { AnalyticsCanvasCard } from "@/components/agency/analytics/AnalyticsCanvasCard";
import ApprovalSaveToast from "@/components/agency/ApprovalSaveToast";
import { computeAnalyticsScorecard } from "@/lib/dioli-brain/analytics-scorecard";
import { buildAnalyticsChangeRequestInput } from "@/lib/dioli-brain/analytics-training";
import type { AnalyticsCanvas } from "@/lib/dioli-brain/analytics-canvas";
import { saveArtifactToDb } from "@/lib/agency/persistence/save-artifact";
import { useDbRequests, type DbRequest } from "@/lib/agency/db-pipeline-hooks";
import { reasonAsDepartment } from "@/lib/dioli-brain/reason";
import { DbPipelineSection, PreviewField } from "@/components/agency/DbPipelineSection";

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
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  // ── DB pipeline state ──
  const { requests: dbQueue, loading: dbLoading, error: dbError, reload: reloadDb } = useDbRequests("waiting_analytics");
  const [dbCanvases, setDbCanvases] = useState<Record<string, AnalyticsCanvas>>({});
  const [dbGenerating, setDbGenerating] = useState<string | null>(null);
  const [dbApproving, setDbApproving] = useState<string | null>(null);
  const [dbError2, setDbError2] = useState<string | null>(null);

  async function handleDbGenerate(req: DbRequest) {
    setDbGenerating(req.id);
    setDbError2(null);
    try {
      const res = await fetch(`/api/brain/artifacts?clientRequestId=${encodeURIComponent(req.id)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} ao carregar artifacts.`);
      const data = await res.json();
      const list: { department: string; canvasJson: string }[] = Array.isArray(data) ? data : data?.artifacts ?? data?.data ?? [];
      const get = (dept: string) => {
        const art = list.find((a) => a.department === dept);
        return art ? JSON.parse(art.canvasJson) : null;
      };
      const strategyCanvas = get("strategy");
      if (!strategyCanvas) throw new Error("Strategy Canvas não encontrado para esta solicitação.");
      const result = await reasonAsDepartment("analytics", {
        businessName:  req.businessName,
        requestId:     req.id,
        strategyCanvas,
        socialCanvas:  get("social")   ?? undefined,
        designCanvas:  get("design")   ?? undefined,
        trafficCanvas: get("traffic")  ?? undefined,
      });
      setDbCanvases((prev) => ({ ...prev, [req.id]: result.canvas as AnalyticsCanvas }));
    } catch (e) {
      setDbError2(e instanceof Error ? e.message : "Falha ao gerar Analytics Canvas.");
    } finally {
      setDbGenerating(null);
    }
  }

  async function handleDbApprove(req: DbRequest) {
    const canvas = dbCanvases[req.id];
    if (!canvas) return;
    if (canvas.qualityGateResult.overall === "FAIL") return;
    setDbApproving(req.id);
    setDbError2(null);
    try {
      await saveArtifactToDb({
        clientRequestId: req.id,
        department: "analytics",
        canvasId: canvas.id,
        canvas,
        qualityGate: canvas.qualityGateResult,
      });
      setDbCanvases((prev) => {
        const next = { ...prev };
        delete next[req.id];
        return next;
      });
      await reloadDb();
    } catch (e) {
      setDbError2(e instanceof Error ? e.message : "Falha ao aprovar no banco.");
    } finally {
      setDbApproving(null);
    }
  }

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

  async function handleApprove(canvas: AnalyticsCanvas, note?: string) {
    if (canvas.qualityGateResult.overall === "FAIL") return;
    if (approving) return;
    // DB persistence FIRST — approval only completes after a confirmed save.
    if (canvas.requestId) {
      setApproving(true);
      setApproveError(null);
      try {
        await saveArtifactToDb({
          clientRequestId: canvas.requestId,
          department: "analytics",
          canvasId: canvas.id,
          canvas,
          qualityGate: canvas.qualityGateResult,
        });
      } catch (e) {
        setApproveError(e instanceof Error ? e.message : "Falha ao salvar no banco.");
        setApproving(false);
        return;
      }
      setApproving(false);
      updateClientRequest(canvas.requestId, { status: "waiting_quality" });
    }
    reviewCanvas(canvas.id, "approved", note);
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
      <DbPipelineSection
        title="Pipeline DB — Analytics"
        dbQueue={dbQueue}
        dbLoading={dbLoading}
        dbError={dbError}
        dbError2={dbError2}
        canvases={dbCanvases}
        generatingId={dbGenerating}
        approvingId={dbApproving}
        onGenerate={handleDbGenerate}
        onApprove={handleDbApprove}
        getQg={(c) => c.qualityGateResult}
        renderPreview={(c) => (
          <>
            <PreviewField span={2} label="KPI primário" value={c.primaryKPI} />
            <PreviewField label="Cadência" value={c.reportingCadence} />
          </>
        )}
      />

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
      <ApprovalSaveToast saving={approving} error={approveError} onDismiss={() => setApproveError(null)} />
    </div>
  );
}
