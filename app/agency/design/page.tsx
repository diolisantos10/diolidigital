"use client";

import { useState } from "react";
import { useAgencyStore } from "@/store/agency-store";
import { useSocialStore } from "@/store/social-store";
import { useDesignStore } from "@/store/design-store";
import { DesignCanvasCard } from "@/components/agency/design/DesignCanvasCard";
import { computeDesignScorecard } from "@/lib/dioli-brain/design-scorecard";
import { buildDesignChangeRequestInput } from "@/lib/dioli-brain/design-training";
import type { SocialCanvas } from "@/lib/dioli-brain/social-canvas";
import type { DesignCanvas, DesignAssetStatus } from "@/lib/dioli-brain/design-canvas";

type CanvasFilter = "all" | "draft" | "approved" | "rejected";

const FILTERS: { label: string; value: CanvasFilter }[] = [
  { label: "Todos",      value: "all" },
  { label: "Rascunhos",  value: "draft" },
  { label: "Aprovados",  value: "approved" },
  { label: "Rejeitados", value: "rejected" },
];

export default function DesignWorkspacePage() {
  const { clientRequests, updateClientRequest, addActivity } = useAgencyStore();
  const { canvases: socialCanvases } = useSocialStore();
  const {
    canvases, changeRequestCanvasIds,
    createCanvas, reviewCanvas, setAssetStatus, markChangeRequestCreated,
  } = useDesignStore();

  const [filter, setFilter] = useState<CanvasFilter>("all");
  const [proposeError, setProposeError] = useState<string | null>(null);

  // ── Incoming queue: approved social canvases not yet with a design canvas ──
  // Dioli Standard: Design never produces output without an approved Social Canvas.
  const designBySocial = new Set(canvases.map((c) => c.socialCanvasId).filter(Boolean));
  const queue = socialCanvases.filter(
    (s) => s.status === "approved" && s.source === "request" && !designBySocial.has(s.id)
  );

  const scorecard = computeDesignScorecard(canvases, changeRequestCanvasIds.length);
  const filtered = canvases.filter((c) => filter === "all" || c.status === filter);

  function handleGenerateCanvas(social: SocialCanvas) {
    const request = (clientRequests ?? []).find((r) => r.id === social.requestId);
    createCanvas({
      socialCanvas: social,
      requestId: social.requestId,
      source: "request",
    });
    addActivity({
      type: "intelligence_run",
      message: `Design Canvas gerado a partir do plano social de "${social.clientName}"`,
      clientId: request?.clientId,
    });
  }

  function handleApprove(canvas: DesignCanvas, note?: string) {
    if (canvas.qualityGateResult.overall === "FAIL") return;
    reviewCanvas(canvas.id, "approved", note);
    if (canvas.requestId) {
      updateClientRequest(canvas.requestId, { status: "waiting_traffic" });
    }
    addActivity({
      type: "intelligence_run",
      message: `Design Canvas aprovado: ${canvas.clientName} — enviado para Tráfego`,
    });
  }

  function handleReject(canvas: DesignCanvas, note?: string) {
    reviewCanvas(canvas.id, "rejected", note);
  }

  async function handleProposeBrainChange(canvas: DesignCanvas) {
    setProposeError(null);
    const source = canvas.status === "approved" ? "approved_canvas" : "rejected_canvas";
    const proposedChange = canvas.status === "approved"
      ? `Reforçar o perfil visual do segmento "${canvas.segment}" no Design Engine — padrão validado por aprovação humana (conceito: ${canvas.visualConcept.slice(0, 80)}...).`
      : `Revisar o perfil visual do segmento "${canvas.segment}" no Design Engine.${canvas.reviewNote ? ` Motivo da rejeição: ${canvas.reviewNote}` : ""}`;
    const body = buildDesignChangeRequestInput(canvas, source, proposedChange);
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
    { label: "Canvases criados",  value: scorecard.canvasesCreated },
    { label: "Aprovados",         value: scorecard.canvasesApproved },
    { label: "Taxa de aprovação", value: `${scorecard.approvalRate}%` },
    { label: "Briefs gerados",    value: scorecard.briefsGenerated },
    { label: "Prompts gerados",   value: scorecard.promptsGenerated },
    { label: "Assets requeridos", value: scorecard.assetsRequired },
    { label: "QG Pass",           value: `${scorecard.qualityGatePassRate}%` },
    { label: "Brain Changes",     value: scorecard.brainChangeRequestsGenerated },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-semibold text-[#1A1A1A]">Design</h1>
            <span className="h-5 px-2 rounded-full bg-[#FFF7ED] text-[#EA580C] text-[10px] font-semibold flex items-center">
              Brain · Execução
            </span>
          </div>
          <p className="text-[12px] text-[#6B6B65] mt-0.5">
            Transforma planos de conteúdo em direção visual e briefs criativos
          </p>
        </div>
        <a
          href="/agency/simulations/design"
          className="text-[11px] font-medium px-3 py-1.5 rounded-[6px] bg-[#FFF7ED] text-[#EA580C] hover:bg-[#FED7AA]"
        >
          Laboratório →
        </a>
      </div>

      {/* Scorecard */}
      <div className="rounded-[10px] border border-[#EA580C]/20 bg-[#FFF7ED]/50 px-4 py-3">
        <div className="text-[9px] font-semibold text-[#EA580C] uppercase tracking-[0.08em] mb-2">
          Scorecard — Design Department
        </div>
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
          {scorecardMetrics.map((m) => (
            <div key={m.label} className="text-center">
              <div className="text-[16px] font-bold text-[#1A1A1A]">{m.value}</div>
              <div className="text-[9px] text-[#9B9B95] mt-0.5">{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Dioli Standard compliance notice */}
      <div className="rounded-[8px] bg-[#F0F0ED] px-3 py-2 text-[11px] text-[#6B6B65]">
        <span className="font-semibold text-[#EA580C]">Dioli Standard:</span>{" "}
        Design nunca produz output sem Social Canvas aprovado. Cada Design Canvas herda segmento, direção editorial e territórios do plano de conteúdo.
      </div>

      {/* Incoming queue */}
      {queue.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-[13px] font-semibold text-[#1A1A1A]">
            Fila de entrada ({queue.length})
          </h2>
          {queue.map((social) => (
            <div
              key={social.id}
              className="rounded-[10px] border border-[#EA580C]/30 bg-[#FFF7ED]/60 px-4 py-3 flex items-center justify-between gap-3"
            >
              <div>
                <p className="text-[13px] font-medium text-[#1A1A1A]">{social.clientName}</p>
                <p className="text-[11px] text-[#6B6B65]">
                  {social.segment} · {social.contentPlan.themes.length} temas · Social aprovado {new Date(social.reviewedAt ?? social.createdAt).toLocaleDateString("pt-BR")}
                </p>
              </div>
              <button
                onClick={() => handleGenerateCanvas(social)}
                className="shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-[6px] bg-[#EA580C] text-white hover:bg-[#C2410C] transition-colors"
              >
                Gerar Design Canvas
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Error banner */}
      {proposeError && (
        <div className="rounded-[8px] bg-[#FEE2E2] border border-[#FECACA] px-3 py-2 text-[11px] text-[#991B1B]">
          {proposeError}
        </div>
      )}

      {/* Canvas list */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-[#1A1A1A]">
            Design Canvases ({filtered.length})
          </h2>
          <div className="flex gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`text-[11px] px-2.5 py-1 rounded-[5px] font-medium transition-colors ${
                  filter === f.value
                    ? "bg-[#1A1A1A] text-white"
                    : "text-[#6B6B65] hover:text-[#1A1A1A]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-[10px] border border-[#E8E8E2] bg-[#FAFAF8] px-6 py-10 text-center">
            <p className="text-[13px] text-[#6B6B65]">
              {filter === "all"
                ? "Nenhum Design Canvas gerado ainda. Aguardando Social Canvases aprovados na fila de entrada."
                : `Nenhum canvas com status "${filter}".`}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((canvas) => (
              <DesignCanvasCard
                key={canvas.id}
                canvas={canvas}
                onApprove={canvas.status === "draft" ? (note) => handleApprove(canvas, note) : undefined}
                onReject={canvas.status === "draft" ? (note) => handleReject(canvas, note) : undefined}
                onProposeBrainChange={() => handleProposeBrainChange(canvas)}
                onSetAssetStatus={(assetId, status) => setAssetStatus(canvas.id, assetId, status)}
                brainChangeCreated={changeRequestCanvasIds.includes(canvas.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
