"use client";

import { useState } from "react";
import { useAgencyStore } from "@/store/agency-store";
import { useStrategyStore } from "@/store/strategy-store";
import { useSocialStore } from "@/store/social-store";
import { SocialCanvasCard } from "@/components/agency/social/SocialCanvasCard";
import ApprovalSaveToast from "@/components/agency/ApprovalSaveToast";
import { computeSocialScorecard } from "@/lib/dioli-brain/social-scorecard";
import { buildSocialChangeRequestInput } from "@/lib/dioli-brain/social-training";
import type { StrategyCanvas } from "@/lib/dioli-brain/strategy-canvas";
import type { SocialCanvas } from "@/lib/dioli-brain/social-canvas";
import { saveArtifactToDb } from "@/lib/agency/persistence/save-artifact";
import { useDbRequests, type DbRequest } from "@/lib/agency/db-pipeline-hooks";
import { reasonAsDepartment } from "@/lib/dioli-brain/reason";
import { DbPipelineSection, PreviewField } from "@/components/agency/DbPipelineSection";

type CanvasFilter = "all" | "draft" | "approved" | "rejected";

const FILTERS: { label: string; value: CanvasFilter }[] = [
  { label: "Todos",      value: "all" },
  { label: "Rascunhos",  value: "draft" },
  { label: "Aprovados",  value: "approved" },
  { label: "Rejeitados", value: "rejected" },
];

export default function SocialWorkspacePage() {
  const { clientRequests, updateClientRequest, addActivity } = useAgencyStore();
  const { canvases: strategyCanvases } = useStrategyStore();
  const {
    canvases, changeRequestCanvasIds,
    createCanvas, reviewCanvas, setCalendarEntryStatus, markChangeRequestCreated,
  } = useSocialStore();

  const [filter, setFilter] = useState<CanvasFilter>("all");
  const [proposeError, setProposeError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  // ── DB pipeline state ──
  const { requests: dbQueue, loading: dbLoading, error: dbError, reload: reloadDb } = useDbRequests("waiting_social");
  const [dbCanvases, setDbCanvases] = useState<Record<string, SocialCanvas>>({});
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
      const strategyArt = list.find((a) => a.department === "strategy");
      if (!strategyArt) throw new Error("Strategy Canvas não encontrado para esta solicitação.");
      const strategyCanvas = JSON.parse(strategyArt.canvasJson) as StrategyCanvas;
      const result = await reasonAsDepartment("social", { businessName: req.businessName, requestId: req.id, strategyCanvas });
      setDbCanvases((prev) => ({ ...prev, [req.id]: result.canvas as SocialCanvas }));
    } catch (e) {
      setDbError2(e instanceof Error ? e.message : "Falha ao gerar Social Canvas.");
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
        department: "social",
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

  // ── Incoming queue: approved strategies handed off to Social ──
  // Dioli Standard: Social never produces output without an approved Strategy.
  const socialByStrategy = new Set(canvases.map((c) => c.strategyCanvasId).filter(Boolean));
  const queue = strategyCanvases.filter(
    (s) => s.status === "approved" && s.source === "request" && !socialByStrategy.has(s.id)
  );

  const scorecard = computeSocialScorecard(canvases, changeRequestCanvasIds.length);

  const filtered = canvases.filter((c) => filter === "all" || c.status === filter);

  function handleGenerateCanvas(strategy: StrategyCanvas) {
    const request = (clientRequests ?? []).find((r) => r.id === strategy.requestId);
    createCanvas({
      strategyCanvas: strategy,
      brainReasoning: request?.sdrHandoff?.brainReasoningOutput,
      requestId: strategy.requestId,
      source: "request",
    });
    addActivity({
      type: "intelligence_run",
      message: `Social Canvas gerado a partir da estratégia de "${strategy.clientName}"`,
      clientId: request?.clientId,
    });
  }

  async function handleApprove(canvas: SocialCanvas, note?: string) {
    if (canvas.qualityGateResult.overall === "FAIL") return;
    if (approving) return;
    // DB persistence FIRST — approval only completes after a confirmed save.
    if (canvas.requestId) {
      setApproving(true);
      setApproveError(null);
      try {
        await saveArtifactToDb({
          clientRequestId: canvas.requestId,
          department: "social",
          canvasId: canvas.id,
          canvas,
          qualityGate: canvas.qualityGateResult,
          cognitiveFlow: (canvas as { cognitiveFlowTrace?: object }).cognitiveFlowTrace,
        });
      } catch (e) {
        setApproveError(e instanceof Error ? e.message : "Falha ao salvar no banco.");
        setApproving(false);
        return;
      }
      setApproving(false);
      updateClientRequest(canvas.requestId, { status: "waiting_design" });
    }
    reviewCanvas(canvas.id, "approved", note);
    addActivity({
      type: "intelligence_run",
      message: `Plano de conteúdo aprovado: ${canvas.clientName} — enviado para Design`,
    });
  }

  function handleReject(canvas: SocialCanvas, note?: string) {
    reviewCanvas(canvas.id, "rejected", note);
  }

  // Governance: reviewed plans can propose Brain improvements.
  // Creates a BrainChangeRequest (pending_review) — never modifies the Brain.
  async function handleProposeBrainChange(canvas: SocialCanvas) {
    setProposeError(null);
    const source = canvas.status === "approved" ? "approved_plan" : "rejected_plan";
    const proposedChange = canvas.status === "approved"
      ? `Reforçar o perfil social do segmento "${canvas.segment}" no Social Engine — padrão validado por aprovação humana (pilares: ${canvas.editorialPillars.map((p) => p.name).join(", ")}; frequência: ${canvas.recommendedFrequency}).`
      : `Revisar o perfil social do segmento "${canvas.segment}" no Social Engine.${canvas.reviewNote ? ` Motivo da rejeição: ${canvas.reviewNote}` : ""}`;
    const body = buildSocialChangeRequestInput(canvas, source, proposedChange);
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
    { label: "Planos criados",     value: scorecard.plansCreated },
    { label: "Aprovados",          value: scorecard.plansApproved },
    { label: "Taxa de aprovação",  value: `${scorecard.approvalRate}%` },
    { label: "Calendários",        value: scorecard.calendarsGenerated },
    { label: "QG Pass",            value: `${scorecard.qualityGatePassRate}%` },
    { label: "Evidências",         value: scorecard.evidenceGenerated },
    { label: "Publicados",         value: scorecard.publishedContent },
    { label: "Brain Changes",      value: scorecard.brainChangeRequestsGenerated },
  ];

  return (
    <div className="space-y-6">
      <DbPipelineSection
        title="Pipeline DB — Social Media"
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
            <PreviewField span={3} label="Direção de comunicação" value={c.communicationDirection} />
            <PreviewField span={3} label="Pilares" value={c.editorialPillars.slice(0, 3).map((p) => p.name).join(", ")} />
          </>
        )}
      />

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-semibold text-[#1A1A1A]">Social Media</h1>
            <span className="h-5 px-2 rounded-full bg-[#FDF2F8] text-[#DB2777] text-[10px] font-semibold flex items-center">
              ✦ Dioli Brain
            </span>
          </div>
          <p className="text-[13px] text-[#9B9B95] mt-0.5">
            Transforme estratégia aprovada em operação de conteúdo: pilares, plano mensal e calendário editorial — sem alterar posicionamento ou estratégia.
          </p>
        </div>
        <a
          href="/agency/simulations/social"
          className="h-8 px-4 rounded-[7px] border border-[#E5E5E2] text-[#6B6B65] hover:border-[#DB2777] hover:text-[#DB2777] text-[12px] font-medium transition-colors inline-flex items-center gap-1.5"
        >
          Simulador Social →
        </a>
      </div>

      {/* Scorecard */}
      <div className="bg-[#F7F7F6] border border-[#E5E5E2] rounded-[10px] px-4 py-3">
        <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-2.5">
          Social Scorecard
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

      {/* Incoming strategies */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-[14px] font-semibold text-[#1A1A1A]">Estratégias recebidas</h2>
          {queue.length > 0 && (
            <span className="h-5 px-2 rounded-full bg-[#FDF2F8] text-[#DB2777] text-[10px] font-semibold flex items-center">
              {queue.length} aguardando
            </span>
          )}
        </div>

        {queue.length === 0 ? (
          <div className="bg-white rounded-[10px] border border-[#E5E5E2] px-6 py-8 text-center">
            <p className="text-[13px] text-[#9B9B95]">
              Nenhuma estratégia aprovada aguardando Social. Aprove um Strategy Canvas no workspace de Estratégia para iniciar o handoff.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {queue.map((strategy) => (
              <div key={strategy.id} className="bg-white rounded-[10px] border border-[#E5E5E2] px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-semibold text-[#1A1A1A]">{strategy.clientName}</span>
                      <span className={`h-5 px-2 rounded-full text-white text-[9px] font-bold flex items-center ${
                        strategy.qualityGateResult.overall === "PASS" ? "bg-[#16A34A]"
                        : strategy.qualityGateResult.overall === "WARNING" ? "bg-[#D97706]" : "bg-[#DC2626]"
                      }`}>
                        Estratégia QG {strategy.qualityGateResult.overall}
                      </span>
                      <span className="h-5 px-2 rounded-full bg-[#F0F0FF] text-[#5B5BD6] text-[10px] font-semibold">
                        Fluxo {strategy.cognitiveFlowTrace.filter((s) => s.completed).length}/12
                      </span>
                    </div>
                    <p className="text-[11px] text-[#6B6B65] mt-1 leading-relaxed">
                      {strategy.mainObjective} · Territórios: {strategy.contentTerritories.slice(0, 3).join(", ")} · Canais: {strategy.priorityChannels.join(", ")}
                    </p>
                  </div>
                  <button
                    onClick={() => handleGenerateCanvas(strategy)}
                    className="h-8 px-4 rounded-[7px] bg-[#DB2777] hover:bg-[#BE185D] text-white text-[12px] font-medium transition-colors shrink-0"
                  >
                    ✦ Gerar Social Canvas
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Canvases */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[14px] font-semibold text-[#1A1A1A]">Social Canvases</h2>
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
                ? "Nenhum Social Canvas ainda. Gere o primeiro a partir de uma estratégia aprovada."
                : "Nenhum canvas com esse status."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((canvas) => (
              <SocialCanvasCard
                key={canvas.id}
                canvas={canvas}
                onApprove={(note) => handleApprove(canvas, note)}
                onReject={(note) => handleReject(canvas, note)}
                onProposeBrainChange={() => handleProposeBrainChange(canvas)}
                onSetEntryStatus={(entryId, status) => setCalendarEntryStatus(canvas.id, entryId, status)}
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
