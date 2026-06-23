"use client";

import { useState } from "react";
import type { TrafficCanvas } from "@/lib/dioli-brain/traffic-canvas";

const STATUS_STYLE: Record<TrafficCanvas["status"], { bg: string; text: string; label: string }> = {
  draft:    { bg: "bg-[#F0F0ED]", text: "text-[#6B6B65]", label: "Rascunho" },
  approved: { bg: "bg-[#DCFCE7]", text: "text-[#16A34A]", label: "Aprovado" },
  rejected: { bg: "bg-[#FEE2E2]", text: "text-[#DC2626]", label: "Rejeitado" },
};

const QG_STYLE = {
  PASS:    { badge: "bg-[#16A34A]", bg: "bg-[#DCFCE7]", border: "border-[#86EFAC]", text: "text-[#166534]" },
  WARNING: { badge: "bg-[#D97706]", bg: "bg-[#FEF3C7]", border: "border-[#FDE68A]", text: "text-[#92400E]" },
  FAIL:    { badge: "bg-[#DC2626]", bg: "bg-[#FEE2E2]", border: "border-[#FECACA]", text: "text-[#991B1B]" },
} as const;

const CHANNEL_LABELS: Record<string, string> = {
  meta_ads: "Meta Ads", google_ads: "Google Ads",
  youtube_ads: "YouTube Ads", tiktok_ads: "TikTok Ads", linkedin_ads: "LinkedIn Ads",
};

const PRIORITY_STYLE: Record<string, string> = {
  alta:  "bg-[#FDF2F8] text-[#DB2777]",
  media: "bg-[#FEF3C7] text-[#D97706]",
  baixa: "bg-[#F0F0ED] text-[#6B6B65]",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[9px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-1">{title}</div>
      {children}
    </div>
  );
}

export interface TrafficCanvasCardProps {
  canvas: TrafficCanvas;
  onApprove?: (note?: string) => void;
  onReject?: (note?: string) => void;
  onProposeBrainChange?: () => void;
  brainChangeCreated?: boolean;
}

export function TrafficCanvasCard({
  canvas, onApprove, onReject, onProposeBrainChange, brainChangeCreated,
}: TrafficCanvasCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState("");
  const [showNoteInput, setShowNoteInput] = useState<"approve" | "reject" | null>(null);

  const st = STATUS_STYLE[canvas.status];
  const qg = canvas.qualityGateResult;
  const qgStyle = QG_STYLE[qg.overall];
  const isReviewed = canvas.status !== "draft";

  function submitNote(action: "approve" | "reject") {
    if (action === "approve") onApprove?.(note.trim() || undefined);
    else onReject?.(note.trim() || undefined);
    setNote(""); setShowNoteInput(null);
  }

  const ba = canvas.budgetAllocation;

  return (
    <div className="rounded-[10px] border border-[#E8E8E2] bg-white overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 flex items-start justify-between gap-3 bg-[#FAFAF8]">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-[#1A1A1A] truncate">{canvas.clientName}</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${st.bg} ${st.text}`}>{st.label}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${qgStyle.badge}`}>
              QG {qg.overall} {qg.passCount}/{qg.items.length}
            </span>
            <span className="text-[10px] bg-[#F0F9FF] text-[#0284C7] px-2 py-0.5 rounded-full">
              R$ {ba.mediaBudgetBRL.toLocaleString("pt-BR")}/mês
            </span>
            {canvas.source === "simulation" && (
              <span className="text-[10px] text-[#9B9B95] bg-[#F0F0ED] px-2 py-0.5 rounded-full">Simulação</span>
            )}
          </div>
          <p className="text-[11px] text-[#6B6B65] mt-0.5">
            {canvas.segment} · {canvas.budgetScenario} · {canvas.recommendedChannels.map((c) => CHANNEL_LABELS[c]).join(", ")}
          </p>
        </div>
        <button onClick={() => setExpanded(!expanded)} className="shrink-0 text-[11px] text-[#0284C7] hover:underline">
          {expanded ? "Fechar" : "Ver canvas"}
        </button>
      </div>

      {qg.overall === "FAIL" && canvas.status === "draft" && (
        <div className="px-4 py-2 bg-[#FEE2E2] border-b border-[#FECACA]">
          <p className="text-[11px] font-medium text-[#991B1B]">⚠ Quality Gate FAIL — aprovação bloqueada.</p>
        </div>
      )}

      {/* Quick summary */}
      <div className="px-4 py-3 grid grid-cols-3 gap-x-4 gap-y-2 sm:grid-cols-6 border-b border-[#E8E8E2]">
        {[
          { label: "Campanhas",  value: canvas.campaigns.length },
          { label: "Públicos",   value: canvas.audiences.length },
          { label: "Criativos",  value: canvas.creativeRequirements.length },
          { label: "Budget mídia", value: `R$ ${ba.mediaBudgetBRL.toLocaleString("pt-BR")}` },
          { label: "Fee",        value: `R$ ${ba.managementFeeBRL.toLocaleString("pt-BR")}` },
          { label: "QG Pass",    value: `${qg.passCount}/${qg.items.length}` },
        ].map((m) => (
          <div key={m.label} className="text-center">
            <div className="text-[13px] font-semibold text-[#1A1A1A]">{m.value}</div>
            <div className="text-[9px] text-[#9B9B95] mt-0.5">{m.label}</div>
          </div>
        ))}
      </div>

      {expanded && (
        <div className="px-4 py-4 space-y-5 border-b border-[#E8E8E2]">
          <Section title="Objetivo e Contexto">
            <p className="text-[11px] text-[#1A1A1A]">{canvas.mainObjective}</p>
            <p className="text-[11px] text-[#6B6B65] mt-1">{canvas.offerContext}</p>
          </Section>

          <Section title="Canais Recomendados">
            <div className="flex gap-2 flex-wrap mb-1">
              {canvas.recommendedChannels.map((ch) => (
                <span key={ch} className="text-[10px] bg-[#F0F9FF] text-[#0284C7] px-2 py-0.5 rounded-full">{CHANNEL_LABELS[ch]}</span>
              ))}
            </div>
            <p className="text-[11px] text-[#6B6B65]">{canvas.channelRationale}</p>
          </Section>

          <Section title={`Budget — ${canvas.budgetScenario.toUpperCase()}`}>
            <div className="rounded-[8px] border border-[#E8E8E2] bg-[#F0F9FF]/40 p-3 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#6B6B65]">Total mensal</span>
                <span className="font-semibold">R$ {ba.totalMonthlyBRL.toLocaleString("pt-BR")}</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#6B6B65]">Budget de mídia ({100 - ba.managementFeePercent}%)</span>
                <span className="font-semibold text-[#0284C7]">R$ {ba.mediaBudgetBRL.toLocaleString("pt-BR")}</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#6B6B65]">Management fee ({ba.managementFeePercent}%)</span>
                <span className="font-semibold text-[#D97706]">R$ {ba.managementFeeBRL.toLocaleString("pt-BR")}</span>
              </div>
              <div className="border-t border-[#E8E8E2] pt-2 space-y-1">
                {ba.channelBreakdown.map((ch) => (
                  <div key={ch.channel} className="flex items-center justify-between text-[10px]">
                    <span className="text-[#9B9B95]">{CHANNEL_LABELS[ch.channel]}</span>
                    <span>{ch.percent}% — R$ {ch.brl.toLocaleString("pt-BR")}</span>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          <Section title={`Campanhas (${canvas.campaigns.length})`}>
            <div className="space-y-2">
              {canvas.campaigns.map((camp) => (
                <div key={camp.id} className="rounded-[6px] border border-[#E8E8E2] px-3 py-2 flex items-center justify-between gap-2 text-[11px]">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${PRIORITY_STYLE[camp.priority]}`}>{camp.priority}</span>
                      <span className="font-medium text-[#1A1A1A]">{camp.name}</span>
                      <span className="text-[10px] text-[#9B9B95] bg-[#F0F9FF] px-1.5 py-0.5 rounded">{CHANNEL_LABELS[camp.channel]}</span>
                    </div>
                    <p className="text-[10px] text-[#9B9B95] mt-0.5">
                      {camp.budgetAllocation}% — R$ {camp.budgetBRL.toLocaleString("pt-BR")} | CAC: {camp.expectedCPA} | ROAS: {camp.expectedROAS}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section title={`Audiências (${canvas.audiences.length})`}>
            <div className="space-y-2">
              {canvas.audiences.map((aud) => (
                <div key={aud.id} className="rounded-[6px] bg-[#FAFAF8] px-3 py-2 text-[11px]">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-[#1A1A1A]">{aud.name}</span>
                    <span className="text-[10px] bg-[#E6FBFA] text-[#070A1F] px-1.5 py-0.5 rounded-full">{aud.funnelStage}</span>
                    <span className="text-[10px] text-[#9B9B95]">{aud.estimatedReach}</span>
                  </div>
                  <p className="text-[10px] text-[#6B6B65]">{aud.description}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Mapeamento de Ofertas">
            <div className="space-y-2">
              {canvas.offerMappings.map((offer) => (
                <div key={offer.id} className="rounded-[6px] bg-[#FAFAF8] px-3 py-2 text-[11px] flex items-center justify-between">
                  <div>
                    <span className="font-medium text-[#1A1A1A]">{offer.name}</span>
                    <p className="text-[10px] text-[#9B9B95]">{offer.funnelStage} · urgência {offer.urgencyLevel} · destino: {offer.landingPage}</p>
                  </div>
                  <span className="text-[10px] bg-[#0284C7] text-white px-2 py-0.5 rounded-full shrink-0">{offer.cta}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Projeções">
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: "Leads/mês", value: canvas.projectedMonthlyLeads },
                { label: "CAC",       value: canvas.projectedCAC },
                { label: "ROAS",      value: canvas.projectedROAS },
              ].map((m) => (
                <div key={m.label} className="rounded-[6px] bg-[#F0F9FF] px-2 py-2">
                  <div className="text-[12px] font-semibold text-[#0284C7]">{m.value}</div>
                  <div className="text-[9px] text-[#9B9B95] mt-0.5">{m.label}</div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Quality Gate">
            <div className={`rounded-[8px] border ${qgStyle.border} ${qgStyle.bg} p-3`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-[11px] font-bold text-white px-2 py-0.5 rounded-full ${qgStyle.badge}`}>{qg.overall}</span>
                <span className={`text-[11px] font-medium ${qgStyle.text}`}>{qg.passCount} PASS · {qg.warningCount} WARN · {qg.failCount} FAIL</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {qg.items.map((item) => (
                  <div key={item.id} className="flex items-start gap-1.5 text-[10px]">
                    <span className={item.status === "PASS" ? "text-[#16A34A] shrink-0" : item.status === "WARNING" ? "text-[#D97706] shrink-0" : "text-[#DC2626] shrink-0"}>
                      {item.status === "PASS" ? "✓" : item.status === "WARNING" ? "⚠" : "✗"}
                    </span>
                    <span className="text-[#1A1A1A]">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          <Section title="Fluxo Cognitivo">
            <div className="flex flex-wrap gap-1">
              {canvas.cognitiveFlowTrace.map((step) => (
                <span key={step.stepId} title={step.summary}
                  className="text-[9px] px-2 py-0.5 rounded-full bg-[#DCFCE7] text-[#166534] border border-[#86EFAC]">
                  {step.order}. {step.label}
                </span>
              ))}
            </div>
          </Section>

          {canvas.reviewNote && (
            <Section title="Nota de Revisão">
              <p className="text-[11px] text-[#1A1A1A] bg-[#FEF3C7] rounded-[6px] px-3 py-2">{canvas.reviewNote}</p>
            </Section>
          )}
        </div>
      )}

      {(onApprove || onReject || onProposeBrainChange) && (
        <div className="px-4 py-3 flex items-center gap-2 flex-wrap bg-[#FAFAF8]">
          {showNoteInput ? (
            <div className="flex-1 flex items-center gap-2">
              <input className="flex-1 text-[11px] border border-[#E8E8E2] rounded-[6px] px-2 py-1.5 outline-none focus:border-[#0284C7]"
                placeholder={showNoteInput === "approve" ? "Nota (opcional)" : "Motivo da rejeição"}
                value={note} onChange={(e) => setNote(e.target.value)} />
              <button onClick={() => submitNote(showNoteInput)}
                className={`text-[11px] font-medium px-3 py-1.5 rounded-[6px] ${showNoteInput === "approve" ? "bg-[#16A34A] text-white" : "bg-[#DC2626] text-white"}`}>
                Confirmar
              </button>
              <button onClick={() => setShowNoteInput(null)} className="text-[11px] text-[#6B6B65]">Cancelar</button>
            </div>
          ) : (
            <>
              {onApprove && canvas.status === "draft" && (
                <button disabled={qg.overall === "FAIL"} onClick={() => setShowNoteInput("approve")}
                  className={`text-[11px] font-medium px-3 py-1.5 rounded-[6px] ${qg.overall === "FAIL" ? "bg-[#F0F0ED] text-[#9B9B95] cursor-not-allowed" : "bg-[#16A34A] text-white hover:bg-[#15803D]"}`}>
                  {qg.overall === "FAIL" ? "Aprovação bloqueada" : "Aprovar"}
                </button>
              )}
              {onReject && canvas.status === "draft" && (
                <button onClick={() => setShowNoteInput("reject")}
                  className="text-[11px] font-medium px-3 py-1.5 rounded-[6px] bg-[#FEE2E2] text-[#DC2626] hover:bg-[#FECACA]">
                  Rejeitar
                </button>
              )}
              {onProposeBrainChange && isReviewed && (
                <button onClick={onProposeBrainChange} disabled={brainChangeCreated}
                  className={`text-[11px] font-medium px-3 py-1.5 rounded-[6px] ${brainChangeCreated ? "bg-[#E6FBFA] text-[#9B9B95] cursor-default" : "bg-[#E6FBFA] text-[#070A1F] hover:bg-[#E0E3FF]"}`}>
                  {brainChangeCreated ? "Brain Change criado ✓" : "Propor ao Brain"}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
