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
import ApprovalSaveToast from "@/components/agency/ApprovalSaveToast";
import { computeQualityScorecard } from "@/lib/dioli-brain/quality-scorecard";
import { buildQualityChangeRequestInput } from "@/lib/dioli-brain/quality-training";
import type { QualityCanvas } from "@/lib/dioli-brain/quality-canvas";
import { saveArtifactToDb } from "@/lib/agency/persistence/save-artifact";
import { useDbRequests, type DbRequest } from "@/lib/agency/db-pipeline-hooks";
import { reasonAsDepartment } from "@/lib/dioli-brain/reason";
import { DbPipelineSection, PreviewField } from "@/components/agency/DbPipelineSection";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";

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
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  // ── DB pipeline state ──
  const { requests: dbQueue, loading: dbLoading, error: dbError, reload: reloadDb } = useDbRequests("waiting_quality");
  const [dbCanvases, setDbCanvases] = useState<Record<string, QualityCanvas>>({});
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
      const result = await reasonAsDepartment("quality", {
        businessName:    req.businessName,
        requestId:       req.id,
        strategyCanvas,
        socialCanvas:    get("social")    ?? undefined,
        designCanvas:    get("design")    ?? undefined,
        trafficCanvas:   get("traffic")   ?? undefined,
        analyticsCanvas: get("analytics") ?? undefined,
      });
      setDbCanvases((prev) => ({ ...prev, [req.id]: result.canvas as QualityCanvas }));
    } catch (e) {
      setDbError2(e instanceof Error ? e.message : "Falha ao gerar Quality Canvas.");
    } finally {
      setDbGenerating(null);
    }
  }

  async function handleDbApprove(req: DbRequest) {
    const canvas = dbCanvases[req.id];
    if (!canvas) return;
    if (canvas.overallVerdict === "BLOCKED" || canvas.overallVerdict === "FAIL") return;
    setDbApproving(req.id);
    setDbError2(null);
    try {
      await saveArtifactToDb({
        clientRequestId: req.id,
        department: "quality",
        canvasId: canvas.id,
        canvas,
        qualityGate: canvas.gateResult,
      });
      // After Quality is saved, publish the client-visible departments.
      for (const department of ["strategy", "social", "design", "quality"]) {
        const apr = await fetch("/api/brain/approvals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientRequestId: req.id,
            department,
            clientVisible: true,
            requestedBy: "master@dioli.studio",
          }),
        });
        if (!apr.ok) {
          throw new Error(`HTTP ${apr.status} ao registrar aprovação de ${department}.`);
        }
      }
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

  async function handleApprove(canvas: QualityCanvas, note?: string) {
    if (canvas.overallVerdict === "BLOCKED") return;
    if (approving) return;
    // DB persistence FIRST — approval only completes after a confirmed save.
    if (canvas.requestId) {
      setApproving(true);
      setApproveError(null);
      try {
        await saveArtifactToDb({
          clientRequestId: canvas.requestId,
          department: "quality",
          canvasId: canvas.id,
          canvas,
        });
      } catch (e) {
        setApproveError(e instanceof Error ? e.message : "Falha ao salvar no banco.");
        setApproving(false);
        return;
      }
      setApproving(false);
      updateClientRequest(canvas.requestId, { status: "in_progress" });
    }
    reviewCanvas(canvas.id, "approved", note);
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
      <DbPipelineSection
        title="Pipeline DB — Quality"
        dbQueue={dbQueue}
        dbLoading={dbLoading}
        dbError={dbError}
        dbError2={dbError2}
        canvases={dbCanvases}
        generatingId={dbGenerating}
        approvingId={dbApproving}
        onGenerate={handleDbGenerate}
        onApprove={handleDbApprove}
        getQg={(c) => ({ overall: c.overallVerdict === "BLOCKED" ? "FAIL" : c.overallVerdict })}
        renderPreview={(c) => (
          <>
            <PreviewField label="Veredicto" value={c.overallVerdict} />
            <PreviewField label="Status" value={c.status} />
            <PreviewField label="Checks" value={`${c.gateResult.passCount} pass · ${c.gateResult.failCount} fail`} />
          </>
        )}
      />

      <AgencyHeader
        title="Quality"
        subtitle="Auditoria cross-departamento: verifica qualidade, detecta padrões e candidatos a evidência em todo o pipeline"
        meta={
          <span className="h-5 px-2 rounded-full bg-[#E6FBFA] text-[#070A1F] text-[10px] font-semibold inline-flex items-center">Brain · Auditoria</span>
        }
        actions={
          <a href="/agency/simulations/quality" className="text-[11px] font-medium px-3 py-1.5 rounded-[6px] bg-[#E6FBFA] text-[#070A1F] hover:bg-[#9AF5F0]">Laboratório →</a>
        }
      />

      <div className="rounded-[10px] border border-[#070A1F]/20 bg-[#E6FBFA]/40 px-4 py-3">
        <div className="text-[9px] font-semibold text-[#070A1F] uppercase tracking-[0.08em] mb-2">Scorecard — Quality</div>
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
        <span className="font-semibold text-[#070A1F]">Dioli Standard:</span>{" "}
        Auditoria usa modelo diferente do que gerou o output. Falhas bloqueantes impedem aprovação. Problemas críticos são escalados — nunca omitidos.
      </div>

      {queue.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-[13px] font-semibold text-[#1A1A1A]">Fila de entrada ({queue.length})</h2>
          {queue.map((analytics) => {
            const hasStrategy = strategyCanvases.some((s) => s.id === analytics.strategyCanvasId);
            return (
              <div key={analytics.id} className="rounded-[10px] border border-[#070A1F]/30 bg-[#E6FBFA]/40 px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[13px] font-medium text-[#1A1A1A]">{analytics.clientName}</p>
                  <p className="text-[11px] text-[#6B6B65]">{analytics.segment} · Analytics Canvas aprovado</p>
                </div>
                <button
                  onClick={() => handleRunAudit(analytics)}
                  disabled={!hasStrategy}
                  className="shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-[6px] bg-[#070A1F] text-white hover:bg-[#0D1230] disabled:opacity-50 disabled:cursor-not-allowed"
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
      <ApprovalSaveToast saving={approving} error={approveError} onDismiss={() => setApproveError(null)} />
    </div>
  );
}
