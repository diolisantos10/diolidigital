"use client";

import { useState } from "react";
import type { StrategyCanvas } from "@/lib/dioli-brain/strategy-canvas";

const STATUS_STYLE: Record<StrategyCanvas["status"], { bg: string; text: string; label: string }> = {
  draft:    { bg: "bg-[#F0F0ED]", text: "text-[#6B6B65]", label: "Rascunho" },
  approved: { bg: "bg-[#DCFCE7]", text: "text-[#16A34A]", label: "Aprovada" },
  rejected: { bg: "bg-[#FEE2E2]", text: "text-[#DC2626]", label: "Rejeitada" },
};

const QG_STYLE = {
  PASS:    { badge: "bg-[#16A34A]", bg: "bg-[#DCFCE7]", border: "border-[#86EFAC]", text: "text-[#166534]" },
  WARNING: { badge: "bg-[#D97706]", bg: "bg-[#FEF3C7]", border: "border-[#FDE68A]", text: "text-[#92400E]" },
  FAIL:    { badge: "bg-[#DC2626]", bg: "bg-[#FEE2E2]", border: "border-[#FECACA]", text: "text-[#991B1B]" },
} as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[9px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-1">{title}</div>
      {children}
    </div>
  );
}

function TagList({ items, color = "bg-[#E6FBFA] text-[#070A1F]" }: { items: string[]; color?: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <span key={i} className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${color}`}>{item}</span>
      ))}
    </div>
  );
}

function BulletList({ items, marker = "•", markerClass = "text-[#9B9B95]" }: { items: string[]; marker?: string; markerClass?: string }) {
  return (
    <div className="space-y-0.5">
      {items.map((item, i) => (
        <p key={i} className="flex items-start gap-1.5 text-[11px] text-[#1A1A1A] leading-relaxed">
          <span className={`shrink-0 ${markerClass}`}>{marker}</span>{item}
        </p>
      ))}
    </div>
  );
}

export interface StrategyCanvasCardProps {
  canvas: StrategyCanvas;
  // Review actions (workspace only — simulator passes undefined)
  onApprove?: (note?: string) => void;
  onReject?: (note?: string) => void;
  onProposeBrainChange?: () => void;
  brainChangeCreated?: boolean;
}

export function StrategyCanvasCard({
  canvas,
  onApprove,
  onReject,
  onProposeBrainChange,
  brainChangeCreated,
}: StrategyCanvasCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const status = STATUS_STYLE[canvas.status];
  const qg = canvas.qualityGateResult;
  const qgStyle = QG_STYLE[qg.overall];
  const flowCompleted = canvas.cognitiveFlowTrace.filter((s) => s.completed).length;

  return (
    <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-[#F7F7F6] transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-[#1A1A1A]">{canvas.clientName}</span>
            <span className={`h-5 px-2 rounded-full text-[10px] font-semibold ${status.bg} ${status.text}`}>
              {status.label}
            </span>
            <span className={`h-5 px-2 rounded-full text-white text-[9px] font-bold flex items-center ${qgStyle.badge}`}>
              QG {qg.overall}
            </span>
            {canvas.source === "simulation" && (
              <span className="h-5 px-2 rounded-full bg-[#FEF3C7] text-[#D97706] text-[10px] font-semibold">
                Simulação
              </span>
            )}
            {canvas.requestId && (
              <span className="h-5 px-2 rounded-full bg-[#EFF6FF] text-[#2563EB] text-[10px] font-semibold">
                Solicitação vinculada
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[#9B9B95]">
            <span>{canvas.segment}</span>
            <span>·</span>
            <span>Fluxo {flowCompleted}/12</span>
            <span>·</span>
            <span>{new Date(canvas.createdAt).toLocaleDateString("pt-BR")}</span>
          </div>
        </div>
        <span className="text-[#C0C0BC] text-[12px] shrink-0">{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div className="border-t border-[#F0F0ED] px-5 py-5 space-y-4">
          {/* Business summary + objectives */}
          <Section title="Resumo do Negócio">
            <p className="text-[12px] text-[#1A1A1A] leading-relaxed">{canvas.businessSummary}</p>
          </Section>

          <div className="grid grid-cols-2 gap-4">
            <Section title="Objetivo Principal">
              <p className="text-[12px] text-[#1A1A1A] font-medium leading-relaxed">{canvas.mainObjective}</p>
            </Section>
            <Section title="Objetivos Secundários">
              <BulletList items={canvas.secondaryObjectives} />
            </Section>
          </div>

          <Section title="Público-Alvo">
            <p className="text-[12px] text-[#1A1A1A] leading-relaxed">{canvas.audience}</p>
          </Section>

          <div className="grid grid-cols-2 gap-4">
            <Section title="Dores">
              <BulletList items={canvas.painPoints} marker="–" />
            </Section>
            <Section title="Diferenciais">
              <BulletList items={canvas.differentiators} marker="✦" markerClass="text-[#7C3AED]" />
            </Section>
          </div>

          <Section title="Vantagens Competitivas">
            <BulletList items={canvas.competitiveAdvantages} marker="▸" markerClass="text-[#070A1F]" />
          </Section>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#FEF3C7] border border-[#FDE68A] rounded-[8px] px-3 py-2.5">
              <div className="text-[9px] font-semibold text-[#D97706] uppercase tracking-[0.06em] mb-1">Riscos</div>
              {canvas.risks.map((r, i) => (
                <p key={i} className="text-[11px] text-[#92400E] leading-relaxed">⚠ {r}</p>
              ))}
            </div>
            <div className="bg-[#DCFCE7] border border-[#86EFAC] rounded-[8px] px-3 py-2.5">
              <div className="text-[9px] font-semibold text-[#16A34A] uppercase tracking-[0.06em] mb-1">Oportunidades</div>
              {canvas.opportunities.map((o, i) => (
                <p key={i} className="text-[11px] text-[#166534] leading-relaxed">✓ {o}</p>
              ))}
            </div>
          </div>

          {/* Positioning */}
          <div className="bg-[#F5F3FF] border border-[#DDD6FE] rounded-[8px] px-4 py-3">
            <div className="text-[9px] font-semibold text-[#7C3AED] uppercase tracking-[0.06em] mb-1">
              Declaração de Posicionamento
            </div>
            <p className="text-[12px] text-[#4C1D95] leading-relaxed font-medium">{canvas.positioningStatement}</p>
          </div>

          <Section title="Direção de Comunicação">
            <p className="text-[12px] text-[#1A1A1A] leading-relaxed">{canvas.communicationDirection}</p>
          </Section>

          <div className="grid grid-cols-2 gap-4">
            <Section title="Territórios de Conteúdo">
              <TagList items={canvas.contentTerritories} color="bg-[#F5F3FF] text-[#7C3AED]" />
            </Section>
            <Section title="Canais Prioritários">
              <TagList items={canvas.priorityChannels} />
            </Section>
          </div>

          <Section title="Serviços Recomendados">
            <TagList items={canvas.recommendedServices} color="bg-[#DCFCE7] text-[#16A34A]" />
          </Section>

          {/* Roadmap */}
          <Section title="Roadmap Recomendado">
            <div className="space-y-2">
              {canvas.recommendedRoadmap.map((phase, i) => (
                <div key={i} className="flex items-start gap-3 bg-[#F7F7F6] rounded-[8px] px-3 py-2.5">
                  <span className="w-5 h-5 rounded-full bg-[#1A1A1A] text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-[#1A1A1A]">{phase.phase}</span>
                      <span className="text-[10px] text-[#9B9B95]">{phase.durationWeeks} semanas</span>
                    </div>
                    <p className="text-[11px] text-[#6B6B65] leading-relaxed mt-0.5">{phase.focus}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Quality Gate */}
          <div className={`border rounded-[8px] px-4 py-3 ${qgStyle.bg} ${qgStyle.border}`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-[10px] font-semibold uppercase tracking-[0.06em] ${qgStyle.text}`}>
                Quality Gate Estratégia — {qg.overall}
              </span>
              <span className="text-[10px] text-[#6B6B65]">
                {qg.passCount} pass · {qg.warningCount} warn · {qg.failCount} fail
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {qg.items.map((item) => (
                <div key={item.id} className="flex items-start gap-1 text-[10px]" title={item.detail}>
                  <span className={`shrink-0 font-bold ${
                    item.status === "PASS" ? "text-[#16A34A]"
                    : item.status === "WARNING" ? "text-[#D97706]"
                    : "text-[#DC2626]"
                  }`}>
                    {item.status === "PASS" ? "✓" : item.status === "WARNING" ? "!" : "✗"}
                  </span>
                  <span className="text-[#6B6B65] leading-tight">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Cognitive Flow trace */}
          <div className="bg-[#F0F0FF] border border-[#C7C7FF] rounded-[8px] px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-[#070A1F] uppercase tracking-[0.06em]">
                Fluxo Cognitivo
              </span>
              <span className="text-[11px] font-bold text-[#070A1F]">{flowCompleted}/12 passos</span>
            </div>
            <div className="space-y-1">
              {canvas.cognitiveFlowTrace.map((step) => (
                <div key={step.stepId} className="flex items-start gap-1.5 text-[10px]">
                  <span className={`shrink-0 ${step.completed ? "text-[#070A1F]" : "text-[#C0C0BC]"}`}>
                    {step.completed ? "✓" : "○"}
                  </span>
                  <span className="text-[#6B6B65] shrink-0 font-medium">{step.order}. {step.label}:</span>
                  <span className="text-[#9B9B95] leading-tight">{step.summary}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Review note */}
          {canvas.reviewNote && (
            <div className="bg-[#F7F7F6] rounded-[8px] px-3 py-2.5">
              <div className="text-[9px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-0.5">Nota de revisão</div>
              <p className="text-[11px] text-[#6B6B65] leading-relaxed">{canvas.reviewNote}</p>
            </div>
          )}

          {/* Review actions */}
          {canvas.status === "draft" && (onApprove || onReject) && (
            <div className="border-t border-[#F0F0ED] pt-3 space-y-2">
              <textarea
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder="Nota de revisão (opcional)…"
                rows={2}
                className="w-full px-3 py-2 text-[12px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[8px] outline-none focus:border-[#070A1F] focus:bg-white transition-all resize-none"
              />
              <div className="flex items-center gap-2">
                {onApprove && (
                  <button
                    onClick={() => onApprove(reviewNote)}
                    className="h-8 px-4 rounded-[7px] bg-[#16A34A] hover:bg-[#15803D] text-white text-[12px] font-medium transition-colors"
                  >
                    Aprovar estratégia
                  </button>
                )}
                {onReject && (
                  <button
                    onClick={() => onReject(reviewNote)}
                    className="h-8 px-4 rounded-[7px] border border-[#E5E5E2] text-[#9B9B95] hover:border-[#DC2626] hover:text-[#DC2626] text-[12px] font-medium transition-colors"
                  >
                    Rejeitar
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Governance: propose brain change from reviewed strategies */}
          {canvas.status !== "draft" && onProposeBrainChange && (
            <div className="border-t border-[#F0F0ED] pt-3">
              {brainChangeCreated ? (
                <span className="h-7 px-3 rounded-full bg-[#DCFCE7] text-[#16A34A] text-[10px] font-semibold inline-flex items-center gap-1">
                  ✓ BrainChangeRequest criado — na fila do Brain Director
                </span>
              ) : (
                <button
                  onClick={onProposeBrainChange}
                  className="h-8 px-4 rounded-[7px] border border-[#7C3AED] text-[#7C3AED] hover:bg-[#F5F3FF] text-[12px] font-medium transition-colors"
                >
                  ✦ Propor melhoria ao Brain
                </button>
              )}
              <p className="text-[10px] text-[#C0C0BC] mt-1.5">
                Gera um BrainChangeRequest na governança — nunca modifica o Brain diretamente.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
