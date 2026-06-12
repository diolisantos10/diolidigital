"use client";

import { useState } from "react";
import { useAgencyStore } from "@/store/agency-store";
import { useStrategyStore } from "@/store/strategy-store";
import { useTrafficStore } from "@/store/traffic-store";
import { TrafficCanvasCard } from "@/components/agency/traffic/TrafficCanvasCard";
import ApprovalSaveToast from "@/components/agency/ApprovalSaveToast";
import { computeTrafficScorecard } from "@/lib/dioli-brain/traffic-scorecard";
import { buildTrafficChangeRequestInput } from "@/lib/dioli-brain/traffic-training";
import type { StrategyCanvas } from "@/lib/dioli-brain/strategy-canvas";
import type { TrafficCanvas } from "@/lib/dioli-brain/traffic-canvas";
import { saveArtifactToDb } from "@/lib/agency/persistence/save-artifact";

type CanvasFilter = "all" | "draft" | "approved" | "rejected";
type BudgetScenario = "low" | "medium" | "high" | "premium";

const FILTERS: { label: string; value: CanvasFilter }[] = [
  { label: "Todos", value: "all" }, { label: "Rascunhos", value: "draft" },
  { label: "Aprovados", value: "approved" }, { label: "Rejeitados", value: "rejected" },
];

const BUDGET_LABELS: Record<BudgetScenario, string> = {
  low: "Low (~R$ 1.200/mês)", medium: "Medium (~R$ 3.200/mês)",
  high: "High (~R$ 8.000/mês)", premium: "Premium (~R$ 20.000/mês)",
};

export default function TrafficWorkspacePage() {
  const { clientRequests, updateClientRequest, addActivity } = useAgencyStore();
  const { canvases: strategyCanvases } = useStrategyStore();
  const { canvases, changeRequestCanvasIds, createCanvas, reviewCanvas, markChangeRequestCreated } = useTrafficStore();

  const [filter, setFilter] = useState<CanvasFilter>("all");
  const [budgetScenario, setBudgetScenario] = useState<BudgetScenario>("medium");
  const [proposeError, setProposeError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  const trafficByStrategy = new Set(canvases.map((c) => c.strategyCanvasId).filter(Boolean));
  const queue = strategyCanvases.filter(
    (s) => s.status === "approved" && s.source === "request" && !trafficByStrategy.has(s.id)
  );

  const scorecard = computeTrafficScorecard(canvases, changeRequestCanvasIds.length);
  const filtered = canvases.filter((c) => filter === "all" || c.status === filter);

  function handleGenerateCanvas(strategy: StrategyCanvas) {
    const request = (clientRequests ?? []).find((r) => r.id === strategy.requestId);
    createCanvas({ strategyCanvas: strategy, budgetScenario, requestId: strategy.requestId, source: "request" });
    addActivity({ type: "intelligence_run", message: `Traffic Canvas gerado para "${strategy.clientName}" — budget: ${budgetScenario}`, clientId: request?.clientId });
  }

  async function handleApprove(canvas: TrafficCanvas, note?: string) {
    if (canvas.qualityGateResult.overall === "FAIL") return;
    if (approving) return;
    // DB persistence FIRST — approval only completes after a confirmed save.
    if (canvas.requestId) {
      setApproving(true);
      setApproveError(null);
      try {
        await saveArtifactToDb({
          clientRequestId: canvas.requestId,
          department: "traffic",
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
      updateClientRequest(canvas.requestId, { status: "waiting_analytics" });
    }
    reviewCanvas(canvas.id, "approved", note);
    addActivity({ type: "intelligence_run", message: `Traffic Canvas aprovado: ${canvas.clientName} — enviado para Analytics` });
  }

  async function handleProposeBrainChange(canvas: TrafficCanvas) {
    setProposeError(null);
    const source = canvas.status === "approved" ? "approved_canvas" : "rejected_canvas";
    const proposed = canvas.status === "approved"
      ? `Reforçar perfil de tráfego do segmento "${canvas.segment}" — canais: ${canvas.recommendedChannels.join(", ")}.`
      : `Revisar perfil de tráfego do segmento "${canvas.segment}".${canvas.reviewNote ? ` Motivo: ${canvas.reviewNote}` : ""}`;
    const body = buildTrafficChangeRequestInput(canvas, source, proposed);
    try {
      const res = await fetch("/api/brain/changes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { setProposeError(`Falha HTTP ${res.status}.`); return; }
      markChangeRequestCreated(canvas.id);
    } catch { setProposeError("Erro de rede."); }
  }

  const scorecardMetrics = [
    { label: "Canvases",    value: scorecard.canvasesCreated },
    { label: "Aprovados",   value: scorecard.canvasesApproved },
    { label: "Aprovação",   value: `${scorecard.approvalRate}%` },
    { label: "Campanhas",   value: scorecard.campaignsPlanned },
    { label: "Budget total", value: `R$ ${scorecard.totalBudgetAllocated.toLocaleString("pt-BR")}` },
    { label: "QG Pass",     value: `${scorecard.qualityGatePassRate}%` },
    { label: "Evidências",  value: scorecard.evidenceGenerated },
    { label: "Brain Changes", value: scorecard.brainChangeRequestsGenerated },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-semibold text-[#1A1A1A]">Tráfego Pago</h1>
            <span className="h-5 px-2 rounded-full bg-[#F0F9FF] text-[#0284C7] text-[10px] font-semibold flex items-center">Brain · Execução</span>
          </div>
          <p className="text-[12px] text-[#6B6B65] mt-0.5">Transforma estratégia em planos de campanhas pagas com budget, audiências e criativos</p>
        </div>
        <a href="/agency/simulations/traffic" className="text-[11px] font-medium px-3 py-1.5 rounded-[6px] bg-[#F0F9FF] text-[#0284C7] hover:bg-[#BAE6FD]">Laboratório →</a>
      </div>

      <div className="rounded-[10px] border border-[#0284C7]/20 bg-[#F0F9FF]/50 px-4 py-3">
        <div className="text-[9px] font-semibold text-[#0284C7] uppercase tracking-[0.08em] mb-2">Scorecard — Paid Traffic</div>
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
        <span className="font-semibold text-[#0284C7]">Dioli Standard:</span>{" "}
        Management fee sempre separado do budget de mídia. Traffic Canvas requer Strategy Canvas aprovado. Nenhuma campanha lançada sem aprovação do canvas.
      </div>

      {queue.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-[#1A1A1A]">Fila de entrada ({queue.length})</h2>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[#6B6B65]">Cenário de budget:</span>
              <select value={budgetScenario} onChange={(e) => setBudgetScenario(e.target.value as BudgetScenario)}
                className="text-[11px] border border-[#E8E8E2] rounded-[6px] px-2 py-1 bg-white outline-none">
                {(Object.entries(BUDGET_LABELS) as [BudgetScenario, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>
          {queue.map((strategy) => (
            <div key={strategy.id} className="rounded-[10px] border border-[#0284C7]/30 bg-[#F0F9FF]/60 px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[13px] font-medium text-[#1A1A1A]">{strategy.clientName}</p>
                <p className="text-[11px] text-[#6B6B65]">{strategy.segment} · Estratégia aprovada</p>
              </div>
              <button onClick={() => handleGenerateCanvas(strategy)}
                className="shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-[6px] bg-[#0284C7] text-white hover:bg-[#0369A1]">
                Gerar Traffic Canvas
              </button>
            </div>
          ))}
        </div>
      )}

      {proposeError && <div className="rounded-[8px] bg-[#FEE2E2] border border-[#FECACA] px-3 py-2 text-[11px] text-[#991B1B]">{proposeError}</div>}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-[#1A1A1A]">Traffic Canvases ({filtered.length})</h2>
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
            <p className="text-[13px] text-[#6B6B65]">Nenhum Traffic Canvas gerado ainda.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((canvas) => (
              <TrafficCanvasCard key={canvas.id} canvas={canvas}
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
