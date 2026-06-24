"use client";

import { useState } from "react";
import { useAgencyStore } from "@/store/agency-store";
import { useStrategyStore } from "@/store/strategy-store";
import { StrategyCanvasCard } from "@/components/agency/strategy/StrategyCanvasCard";
import ApprovalSaveToast from "@/components/agency/ApprovalSaveToast";
import { computeStrategyScorecard } from "@/lib/dioli-brain/strategy-scorecard";
import { buildStrategyChangeRequestInput } from "@/lib/dioli-brain/strategy-training";
import type { ClientRequest } from "@/lib/agency/client-requests";
import type { StrategyCanvas } from "@/lib/dioli-brain/strategy-canvas";
import { saveArtifactToDb } from "@/lib/agency/persistence/save-artifact";
import { useDbRequests, parseJson, type DbRequest } from "@/lib/agency/db-pipeline-hooks";
import { reasonAsDepartment } from "@/lib/dioli-brain/reason";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";

type CanvasFilter = "all" | "draft" | "approved" | "rejected";

const FILTERS: { label: string; value: CanvasFilter }[] = [
  { label: "Todas",      value: "all" },
  { label: "Rascunhos",  value: "draft" },
  { label: "Aprovadas",  value: "approved" },
  { label: "Rejeitadas", value: "rejected" },
];

export default function StrategyWorkspacePage() {
  const { clientRequests, updateClientRequest, addActivity } = useAgencyStore();
  const {
    canvases, changeRequestCanvasIds,
    createCanvas, reviewCanvas, markChangeRequestCreated,
  } = useStrategyStore();

  const [filter, setFilter] = useState<CanvasFilter>("all");
  const [proposeError, setProposeError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  // ── DB pipeline state ──
  const { requests: dbQueue, loading: dbLoading, error: dbError, reload: reloadDb } = useDbRequests("waiting_strategy");
  const [dbCanvases, setDbCanvases] = useState<Record<string, StrategyCanvas>>({});
  const [dbGenerating, setDbGenerating] = useState<string | null>(null);
  const [dbApproving, setDbApproving] = useState<string | null>(null);
  const [dbError2, setDbError2] = useState<string | null>(null);

  async function handleDbGenerate(req: DbRequest) {
    setDbGenerating(req.id);
    setDbError2(null);
    try {
      const result = await reasonAsDepartment("strategy", {
        businessName: req.businessName,
        segment:      req.segment ?? "",
        objectives:   parseJson<string[]>(req.objectives, []),
        services:     parseJson<string[]>(req.services, []),
        rawContext:   req.rawContext ?? "",
        requestId:    req.id,
      });
      setDbCanvases((prev) => ({ ...prev, [req.id]: result.canvas as StrategyCanvas }));
    } catch (e) {
      setDbError2(e instanceof Error ? e.message : "Falha ao gerar Strategy Canvas.");
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
        department: "strategy",
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

  // ── Incoming queue: requests handed off by the SDR ──
  const queue = (clientRequests ?? []).filter((r) => r.status === "waiting_strategy");
  const canvasByRequest = new Set(canvases.map((c) => c.requestId).filter(Boolean));

  const scorecard = computeStrategyScorecard(canvases, changeRequestCanvasIds.length);

  const filtered = canvases.filter((c) => filter === "all" || c.status === filter);

  function handleGenerateCanvas(req: ClientRequest) {
    const scope = req.v2Scope;
    const brain = req.sdrHandoff?.brainReasoningOutput;
    const services = brain?.recommendedServices
      ?? req.extractedSummary.services;
    createCanvas({
      businessName: scope?.businessName ?? req.extractedSummary.clientName ?? req.prospectName ?? "Cliente",
      segment: scope?.segment ?? req.extractedSummary.segment ?? "",
      objectives: scope?.objectives ?? req.extractedSummary.objectives ?? [],
      services,
      rawContext: req.rawText,
      brainReasoning: brain,
      requestId: req.id,
      source: "request",
    });
    addActivity({
      type: "intelligence_run",
      message: `Strategy Canvas gerado para "${req.title}"`,
      clientId: req.clientId,
    });
  }

  async function handleApprove(canvas: StrategyCanvas, note?: string) {
    if (canvas.qualityGateResult.overall === "FAIL") return;
    if (approving) return;
    // DB persistence FIRST — the approval only completes after the artifact
    // is confirmed saved. On failure: no state change, visible error.
    if (canvas.requestId) {
      setApproving(true);
      setApproveError(null);
      try {
        await saveArtifactToDb({
          clientRequestId: canvas.requestId,
          department: "strategy",
          canvasId: canvas.id,
          canvas,
          qualityGate: canvas.qualityGateResult,
          cognitiveFlow: canvas.cognitiveFlowTrace,
        });
      } catch (e) {
        setApproveError(e instanceof Error ? e.message : "Falha ao salvar no banco.");
        setApproving(false);
        return;
      }
      setApproving(false);
      updateClientRequest(canvas.requestId, { status: "waiting_social" });
    }
    reviewCanvas(canvas.id, "approved", note);
    addActivity({
      type: "intelligence_run",
      message: `Estratégia aprovada: ${canvas.clientName} — enviada para Social Media`,
    });
  }

  function handleReject(canvas: StrategyCanvas, note?: string) {
    reviewCanvas(canvas.id, "rejected", note);
  }

  // Governance: reviewed strategies can propose Brain improvements.
  // Creates a BrainChangeRequest (pending_review) — never modifies the Brain.
  async function handleProposeBrainChange(canvas: StrategyCanvas) {
    setProposeError(null);
    const source = canvas.status === "approved" ? "approved_strategy" : "rejected_strategy";
    const proposedChange = canvas.status === "approved"
      ? `Reforçar as heurísticas do segmento "${canvas.segment}" no Strategy Engine — padrão validado por aprovação humana (territórios: ${canvas.contentTerritories.slice(0, 3).join(", ")}).`
      : `Revisar as heurísticas do segmento "${canvas.segment}" no Strategy Engine.${canvas.reviewNote ? ` Motivo da rejeição: ${canvas.reviewNote}` : ""}`;
    const body = buildStrategyChangeRequestInput(canvas, source, proposedChange);
    try {
      const res = await fetch("/api/brain/changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setProposeError(`Falha ao criar BrainChangeRequest (HTTP ${res.status}).`);
        return;
      }
      markChangeRequestCreated(canvas.id);
    } catch {
      setProposeError("Erro de rede ao criar BrainChangeRequest.");
    }
  }

  const scorecardMetrics = [
    { label: "Estratégias criadas",   value: scorecard.strategiesCreated },
    { label: "Aprovadas",             value: scorecard.strategiesApproved },
    { label: "Taxa de aprovação",     value: `${scorecard.approvalRate}%` },
    { label: "QG Pass",               value: `${scorecard.qualityGatePassRate}%` },
    { label: "Roadmaps gerados",      value: scorecard.roadmapsGenerated },
    { label: "Territórios definidos", value: scorecard.territoriesDefined },
    { label: "Evidências",            value: scorecard.evidenceGenerated },
    { label: "Brain Changes",         value: scorecard.brainChangeRequestsGenerated },
  ];

  return (
    <div className="space-y-6">
      {/* ── DB Pipeline — Estratégia ── */}
      {(dbLoading || dbError || dbQueue.length > 0) && (
        <div className="bg-white rounded-[10px] border border-[#9AF5F0] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 bg-[#E6FBFA] border-b border-[#9AF5F0]">
            <h2 className="text-[14px] font-semibold text-[#1A1A1A]">Pipeline DB — Estratégia</h2>
            <span className="h-5 px-2 rounded-full bg-white text-[#070A1F] text-[10px] font-semibold flex items-center border border-[#9AF5F0]">
              {dbQueue.length}
            </span>
            <span className="h-5 px-2 rounded-full bg-[#070A1F] text-white text-[10px] font-semibold flex items-center">
              ✦ Dioli Brain
            </span>
          </div>
          {dbLoading && (
            <div className="px-5 py-6 flex items-center gap-2 text-[12px] text-[#9B9B95]">
              <span className="w-3.5 h-3.5 border-2 border-[#9AF5F0] border-t-[#070A1F] rounded-full animate-spin" />
              Carregando fila do banco…
            </div>
          )}
          {dbError && !dbLoading && (
            <div className="px-5 py-3 bg-[#FEE2E2]">
              <p className="text-[11px] text-[#991B1B]">{dbError}</p>
            </div>
          )}
          {dbError2 && (
            <div className="px-5 py-2 bg-[#FEE2E2] border-b border-[#FECACA]">
              <p className="text-[11px] text-[#991B1B]">{dbError2}</p>
            </div>
          )}
          {!dbLoading && !dbError && (
            <div className="divide-y divide-[#F0F0ED]">
              {dbQueue.map((req) => {
                const canvas = dbCanvases[req.id];
                const qg = canvas?.qualityGateResult;
                return (
                  <div key={req.id} className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[13px] font-semibold text-[#1A1A1A]">{req.businessName}</span>
                          {req.segment && (
                            <span className="h-5 px-2 rounded-full bg-[#F0F0ED] text-[#6B6B65] text-[10px] font-medium">{req.segment}</span>
                          )}
                          <span className="h-5 px-2 rounded-full bg-[#E6FBFA] text-[#070A1F] text-[10px] font-semibold">{req.status}</span>
                          {qg && (
                            <span className={`h-5 px-2 rounded-full text-white text-[9px] font-bold flex items-center ${qg.overall === "PASS" ? "bg-[#16A34A]" : qg.overall === "WARNING" ? "bg-[#D97706]" : "bg-[#DC2626]"}`}>
                              QG {qg.overall}
                            </span>
                          )}
                        </div>
                      </div>
                      {!canvas ? (
                        <button
                          onClick={() => handleDbGenerate(req)}
                          disabled={dbGenerating === req.id}
                          className="h-8 px-4 rounded-[7px] bg-[#070A1F] hover:bg-[#0D1230] disabled:opacity-50 text-white text-[12px] font-medium transition-colors shrink-0"
                        >
                          {dbGenerating === req.id ? "Gerando…" : "✦ Generate"}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleDbApprove(req)}
                          disabled={dbApproving === req.id || qg?.overall === "FAIL"}
                          className="h-8 px-4 rounded-[7px] bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-50 text-white text-[12px] font-medium transition-colors shrink-0"
                        >
                          {dbApproving === req.id ? "Aprovando…" : "Approve →"}
                        </button>
                      )}
                    </div>
                    {canvas && (
                      <dl className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[#F7F7F6] rounded-[8px] px-4 py-3">
                        <div className="sm:col-span-3">
                          <dt className="text-[9px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Posicionamento</dt>
                          <dd className="text-[11px] text-[#1A1A1A] leading-snug mt-0.5">{canvas.positioningStatement}</dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="text-[9px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Público</dt>
                          <dd className="text-[11px] text-[#1A1A1A] leading-snug mt-0.5">{canvas.audience}</dd>
                        </div>
                        <div>
                          <dt className="text-[9px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Territórios</dt>
                          <dd className="text-[11px] text-[#1A1A1A] leading-snug mt-0.5">{canvas.contentTerritories.slice(0, 3).join(", ")}</dd>
                        </div>
                      </dl>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Header */}
      <AgencyHeader
        title="Estratégia"
        subtitle="Transforme clientes qualificados em direção estratégica. Diagnóstico, posicionamento e roadmap — nada de criativos finais."
        meta={
          <span className="h-5 px-2 rounded-full bg-[#E6FBFA] text-[#070A1F] text-[10px] font-semibold inline-flex items-center">
            ✦ Dioli Brain
          </span>
        }
        actions={
          <a
            href="/agency/simulations/strategy"
            className="h-8 px-4 rounded-[7px] border border-[#E5E5E2] text-[#6B6B65] hover:border-[#070A1F] hover:text-[#070A1F] text-[12px] font-medium transition-colors inline-flex items-center gap-1.5"
          >
            Simulador de Estratégia →
          </a>
        }
      />

      {/* Scorecard */}
      <div className="bg-[#F7F7F6] border border-[#E5E5E2] rounded-[10px] px-4 py-3">
        <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-2.5">
          Strategy Scorecard
        </div>
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
          {scorecardMetrics.map((m) => (
            <div key={m.label} className="text-center">
              <div className="text-[16px] font-bold text-[#1A1A1A]">{m.value}</div>
              <div className="text-[9px] text-[#9B9B95] mt-0.5 leading-tight">{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Incoming queue */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-[14px] font-semibold text-[#1A1A1A]">Fila de entrada</h2>
          {queue.length > 0 && (
            <span className="h-5 px-2 rounded-full bg-[#E6FBFA] text-[#070A1F] text-[10px] font-semibold flex items-center">
              {queue.length} aguardando
            </span>
          )}
        </div>

        {queue.length === 0 ? (
          <div className="bg-white rounded-[12px] border border-[#E5E5E2] px-6 py-8 text-center">
            <p className="text-[13px] text-[#9B9B95]">
              Nenhuma solicitação aguardando estratégia. Use &ldquo;Enviar para Estratégia&rdquo; em uma solicitação qualificada pelo SDR.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {queue.map((req) => {
              const brain = req.sdrHandoff?.brainReasoningOutput;
              const qg = req.sdrHandoff?.qualityGateResult;
              const flow = req.sdrHandoff?.cognitiveFlowSummary;
              const hasCanvas = canvasByRequest.has(req.id);
              return (
                <div key={req.id} className="bg-white rounded-[12px] border border-[#E5E5E2] px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-semibold text-[#1A1A1A]">{req.title}</span>
                        {qg && (
                          <span className={`h-5 px-2 rounded-full text-white text-[9px] font-bold flex items-center ${
                            qg.overall === "PASS" ? "bg-[#16A34A]" : qg.overall === "WARNING" ? "bg-[#D97706]" : "bg-[#DC2626]"
                          }`}>
                            SDR QG {qg.overall}
                          </span>
                        )}
                        {flow && (
                          <span className="h-5 px-2 rounded-full bg-[#F0F0FF] text-[#070A1F] text-[10px] font-semibold">
                            Fluxo {flow.stepsCompleted}/{flow.totalSteps}
                          </span>
                        )}
                      </div>
                      {brain && (
                        <p className="text-[11px] text-[#6B6B65] mt-1 leading-relaxed">{brain.intentionDetected}</p>
                      )}
                    </div>
                    {hasCanvas ? (
                      <span className="h-7 px-3 rounded-full bg-[#DCFCE7] text-[#16A34A] text-[10px] font-semibold flex items-center shrink-0">
                        ✓ Canvas gerado
                      </span>
                    ) : (
                      <button
                        onClick={() => handleGenerateCanvas(req)}
                        className="h-8 px-4 rounded-[7px] bg-[#070A1F] hover:bg-[#0D1230] text-white text-[12px] font-medium transition-colors shrink-0"
                      >
                        ✦ Gerar Strategy Canvas
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Canvases */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[14px] font-semibold text-[#1A1A1A]">Strategy Canvases</h2>
          <div className="flex gap-1">
            {FILTERS.map((f) => {
              const count = f.value === "all" ? canvases.length : canvases.filter((c) => c.status === f.value).length;
              return (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={`h-7 px-3 rounded-[6px] text-[12px] font-medium transition-colors ${
                    filter === f.value
                      ? "bg-[#1A1A1A] text-white"
                      : "bg-[#F0F0ED] text-[#6B6B65] hover:bg-[#E5E5E2]"
                  }`}
                >
                  {f.label}{count > 0 && <span className="opacity-60 ml-0.5"> ({count})</span>}
                </button>
              );
            })}
          </div>
        </div>

        {proposeError && (
          <div className="mb-3 bg-[#FEE2E2] border border-[#FECACA] rounded-[8px] px-4 py-2.5">
            <p className="text-[11px] text-[#991B1B]">{proposeError}</p>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="bg-white rounded-[12px] border border-[#E5E5E2] px-6 py-10 text-center">
            <p className="text-[13px] text-[#9B9B95]">
              {filter === "all"
                ? "Nenhum Strategy Canvas ainda. Gere o primeiro a partir da fila de entrada."
                : "Nenhum canvas com esse status."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((canvas) => (
              <StrategyCanvasCard
                key={canvas.id}
                canvas={canvas}
                onApprove={(note) => handleApprove(canvas, note)}
                onReject={(note) => handleReject(canvas, note)}
                onProposeBrainChange={() => handleProposeBrainChange(canvas)}
                brainChangeCreated={changeRequestCanvasIds.includes(canvas.id)}
              />
            ))}
          </div>
        )}
      </div>
      <ApprovalSaveToast saving={approving} error={approveError} onDismiss={() => setApproveError(null)} />
    </div>
  );
}
