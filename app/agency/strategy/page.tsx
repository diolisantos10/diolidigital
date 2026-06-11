"use client";

import { useState } from "react";
import { useAgencyStore } from "@/store/agency-store";
import { useStrategyStore } from "@/store/strategy-store";
import { StrategyCanvasCard } from "@/components/agency/strategy/StrategyCanvasCard";
import { computeStrategyScorecard } from "@/lib/dioli-brain/strategy-scorecard";
import { buildStrategyChangeRequestInput } from "@/lib/dioli-brain/strategy-training";
import type { ClientRequest } from "@/lib/agency/client-requests";
import type { StrategyCanvas } from "@/lib/dioli-brain/strategy-canvas";
import { saveArtifactToDb } from "@/lib/agency/persistence/save-artifact";

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

  function handleApprove(canvas: StrategyCanvas, note?: string) {
    if (canvas.qualityGateResult.overall === "FAIL") return;
    reviewCanvas(canvas.id, "approved", note);
    if (canvas.requestId) {
      updateClientRequest(canvas.requestId, { status: "waiting_social" });
      saveArtifactToDb({
        clientRequestId: canvas.requestId,
        department: "strategy",
        canvasId: canvas.id,
        canvas,
        qualityGate: canvas.qualityGateResult,
        cognitiveFlow: canvas.cognitiveFlowTrace,
      });
    }
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
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-semibold text-[#1A1A1A]">Estratégia</h1>
            <span className="h-5 px-2 rounded-full bg-[#F5F3FF] text-[#7C3AED] text-[10px] font-semibold flex items-center">
              ✦ Dioli Brain
            </span>
          </div>
          <p className="text-[13px] text-[#9B9B95] mt-0.5">
            Transforme clientes qualificados em direção estratégica. Diagnóstico, posicionamento e roadmap — nada de criativos finais.
          </p>
        </div>
        <a
          href="/agency/simulations/strategy"
          className="h-8 px-4 rounded-[7px] border border-[#E5E5E2] text-[#6B6B65] hover:border-[#7C3AED] hover:text-[#7C3AED] text-[12px] font-medium transition-colors inline-flex items-center gap-1.5"
        >
          Simulador de Estratégia →
        </a>
      </div>

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
            <span className="h-5 px-2 rounded-full bg-[#F5F3FF] text-[#7C3AED] text-[10px] font-semibold flex items-center">
              {queue.length} aguardando
            </span>
          )}
        </div>

        {queue.length === 0 ? (
          <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-6 py-8 text-center">
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
                <div key={req.id} className="bg-white rounded-[10px] border border-[#E5E5E2] px-5 py-4">
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
                          <span className="h-5 px-2 rounded-full bg-[#F0F0FF] text-[#5B5BD6] text-[10px] font-semibold">
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
                        className="h-8 px-4 rounded-[7px] bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-[12px] font-medium transition-colors shrink-0"
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
          <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-6 py-10 text-center">
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
    </div>
  );
}
