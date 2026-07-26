"use client";

import { useState } from "react";
import type { StrategyCanvas } from "@/lib/dioli-brain/strategy-canvas";

const STATUS_STYLE: Record<StrategyCanvas["status"], { bg: string; text: string; label: string }> = {
  draft:    { bg: "bg-[var(--accent)]", text: "text-[var(--text-secondary)]", label: "Rascunho" },
  approved: { bg: "bg-[var(--success-bg)]", text: "text-[var(--success)]", label: "Aprovada" },
  rejected: { bg: "bg-[#FEE2E2]", text: "text-[var(--danger)]", label: "Rejeitada" },
};

const QG_STYLE = {
  PASS:    { badge: "bg-[var(--success)]", bg: "bg-[var(--success-bg)]", border: "border-[#86EFAC]", text: "text-[#166534]" },
  WARNING: { badge: "bg-[var(--warning)]", bg: "bg-[var(--warning-bg)]", border: "border-[#FDE68A]", text: "text-[#92400E]" },
  FAIL:    { badge: "bg-[var(--danger)]", bg: "bg-[#FEE2E2]", border: "border-[#FECACA]", text: "text-[#991B1B]" },
} as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em] mb-1">{title}</div>
      {children}
    </div>
  );
}

function TagList({ items, color = "bg-[var(--accent-light)] text-[var(--navy)]" }: { items: string[]; color?: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <span key={i} className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${color}`}>{item}</span>
      ))}
    </div>
  );
}

function BulletList({ items, marker = "•", markerClass = "text-[var(--text-muted)]" }: { items: string[]; marker?: string; markerClass?: string }) {
  return (
    <div className="space-y-0.5">
      {items.map((item, i) => (
        <p key={i} className="flex items-start gap-1.5 text-[11px] text-[var(--text-primary)] leading-relaxed">
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
    <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-[var(--bg)] transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-[var(--text-primary)]">{canvas.clientName}</span>
            <span className={`h-5 px-2 rounded-full text-[10px] font-semibold ${status.bg} ${status.text}`}>
              {status.label}
            </span>
            <span className={`h-5 px-2 rounded-full text-white text-[9px] font-bold flex items-center ${qgStyle.badge}`}>
              QG {qg.overall}
            </span>
            {canvas.source === "simulation" && (
              <span className="h-5 px-2 rounded-full bg-[var(--warning-bg)] text-[var(--warning)] text-[10px] font-semibold">
                Simulação
              </span>
            )}
            {canvas.requestId && (
              <span className="h-5 px-2 rounded-full bg-[var(--info-bg)] text-[var(--info)] text-[10px] font-semibold">
                Solicitação vinculada
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[var(--text-muted)]">
            <span>{canvas.segment}</span>
            <span>·</span>
            <span>Fluxo {flowCompleted}/12</span>
            <span>·</span>
            <span>{new Date(canvas.createdAt).toLocaleDateString("pt-BR")}</span>
          </div>
        </div>
        <span className="text-[var(--text-subtle)] text-[12px] shrink-0">{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div className="border-t border-[var(--border)] px-5 py-5 space-y-4">
          {/* Business summary + objectives */}
          <Section title="Resumo do Negócio">
            <p className="text-[12px] text-[var(--text-primary)] leading-relaxed">{canvas.businessSummary}</p>
          </Section>

          <div className="grid grid-cols-2 gap-4">
            <Section title="Objetivo Principal">
              <p className="text-[12px] text-[var(--text-primary)] font-medium leading-relaxed">{canvas.mainObjective}</p>
            </Section>
            <Section title="Objetivos Secundários">
              <BulletList items={canvas.secondaryObjectives} />
            </Section>
          </div>

          <Section title="Público-Alvo">
            <p className="text-[12px] text-[var(--text-primary)] leading-relaxed">{canvas.audience}</p>
          </Section>

          <div className="grid grid-cols-2 gap-4">
            <Section title="Dores">
              <BulletList items={canvas.painPoints} marker="–" />
            </Section>
            <Section title="Diferenciais">
              <BulletList items={canvas.differentiators} marker="✦" markerClass="text-[var(--navy)]" />
            </Section>
          </div>

          <Section title="Vantagens Competitivas">
            <BulletList items={canvas.competitiveAdvantages} marker="▸" markerClass="text-[var(--navy)]" />
          </Section>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[var(--warning-bg)] border border-[#FDE68A] rounded-[8px] px-3 py-2.5">
              <div className="text-[9px] font-semibold text-[var(--warning)] uppercase tracking-[0.06em] mb-1">Riscos</div>
              {canvas.risks.map((r, i) => (
                <p key={i} className="text-[11px] text-[#92400E] leading-relaxed">⚠ {r}</p>
              ))}
            </div>
            <div className="bg-[var(--success-bg)] border border-[#86EFAC] rounded-[8px] px-3 py-2.5">
              <div className="text-[9px] font-semibold text-[var(--success)] uppercase tracking-[0.06em] mb-1">Oportunidades</div>
              {canvas.opportunities.map((o, i) => (
                <p key={i} className="text-[11px] text-[#166534] leading-relaxed">✓ {o}</p>
              ))}
            </div>
          </div>

          {/* Positioning */}
          <div className="bg-[var(--accent-light)] border border-[var(--cyan)] rounded-[8px] px-4 py-3">
            <div className="text-[9px] font-semibold text-[var(--navy)] uppercase tracking-[0.06em] mb-1">
              Declaração de Posicionamento
            </div>
            <p className="text-[12px] text-[#1E3A8A] leading-relaxed font-medium">{canvas.positioningStatement}</p>
          </div>

          <Section title="Direção de Comunicação">
            <p className="text-[12px] text-[var(--text-primary)] leading-relaxed">{canvas.communicationDirection}</p>
          </Section>

          <div className="grid grid-cols-2 gap-4">
            <Section title="Territórios de Conteúdo">
              <TagList items={canvas.contentTerritories} color="bg-[var(--accent-light)] text-[var(--navy)]" />
            </Section>
            <Section title="Canais Prioritários">
              <TagList items={canvas.priorityChannels} />
            </Section>
          </div>

          <Section title="Serviços Recomendados">
            <TagList items={canvas.recommendedServices} color="bg-[var(--success-bg)] text-[var(--success)]" />
          </Section>

          {/* Roadmap */}
          <Section title="Roadmap Recomendado">
            <div className="space-y-2">
              {canvas.recommendedRoadmap.map((phase, i) => (
                <div key={i} className="flex items-start gap-3 bg-[var(--bg)] rounded-[8px] px-3 py-2.5">
                  <span className="w-5 h-5 rounded-full bg-[var(--text-primary)] text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-[var(--text-primary)]">{phase.phase}</span>
                      <span className="text-[10px] text-[var(--text-muted)]">{phase.durationWeeks} semanas</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed mt-0.5">{phase.focus}</p>
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
              <span className="text-[10px] text-[var(--text-secondary)]">
                {qg.passCount} pass · {qg.warningCount} warn · {qg.failCount} fail
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {qg.items.map((item) => (
                <div key={item.id} className="flex items-start gap-1 text-[10px]" title={item.detail}>
                  <span className={`shrink-0 font-bold ${
                    item.status === "PASS" ? "text-[var(--success)]"
                    : item.status === "WARNING" ? "text-[var(--warning)]"
                    : "text-[var(--danger)]"
                  }`}>
                    {item.status === "PASS" ? "✓" : item.status === "WARNING" ? "!" : "✗"}
                  </span>
                  <span className="text-[var(--text-secondary)] leading-tight">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Cognitive Flow trace */}
          <div className="bg-[#EFF4FF] border border-[#D6DEFF] rounded-[8px] px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-[var(--navy)] uppercase tracking-[0.06em]">
                Fluxo Cognitivo
              </span>
              <span className="text-[11px] font-bold text-[var(--navy)]">{flowCompleted}/12 passos</span>
            </div>
            <div className="space-y-1">
              {canvas.cognitiveFlowTrace.map((step) => (
                <div key={step.stepId} className="flex items-start gap-1.5 text-[10px]">
                  <span className={`shrink-0 ${step.completed ? "text-[var(--navy)]" : "text-[var(--text-subtle)]"}`}>
                    {step.completed ? "✓" : "○"}
                  </span>
                  <span className="text-[var(--text-secondary)] shrink-0 font-medium">{step.order}. {step.label}:</span>
                  <span className="text-[var(--text-muted)] leading-tight">{step.summary}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Review note */}
          {canvas.reviewNote && (
            <div className="bg-[var(--bg)] rounded-[8px] px-3 py-2.5">
              <div className="text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em] mb-0.5">Nota de revisão</div>
              <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{canvas.reviewNote}</p>
            </div>
          )}

          {/* Review actions */}
          {canvas.status === "draft" && (onApprove || onReject) && (
            <div className="border-t border-[var(--border)] pt-3 space-y-2">
              <textarea
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder="Nota de revisão (opcional)…"
                rows={2}
                className="w-full px-3 py-2 text-[12px] bg-[var(--bg)] border border-[var(--border)] rounded-[8px] outline-none focus:border-[var(--navy)] focus:bg-white transition-all resize-none"
              />
              <div className="flex items-center gap-2">
                {onApprove && (
                  <button
                    onClick={() => onApprove(reviewNote)}
                    className="h-8 px-4 rounded-[7px] bg-[var(--success)] hover:bg-[#15803D] text-white text-[12px] font-medium transition-colors"
                  >
                    Aprovar estratégia
                  </button>
                )}
                {onReject && (
                  <button
                    onClick={() => onReject(reviewNote)}
                    className="h-8 px-4 rounded-[7px] border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--danger)] hover:text-[var(--danger)] text-[12px] font-medium transition-colors"
                  >
                    Rejeitar
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Governance: propose brain change from reviewed strategies */}
          {canvas.status !== "draft" && onProposeBrainChange && (
            <div className="border-t border-[var(--border)] pt-3">
              {brainChangeCreated ? (
                <span className="h-7 px-3 rounded-full bg-[var(--success-bg)] text-[var(--success)] text-[10px] font-semibold inline-flex items-center gap-1">
                  ✓ BrainChangeRequest criado — na fila do Brain Director
                </span>
              ) : (
                <button
                  onClick={onProposeBrainChange}
                  className="h-8 px-4 rounded-[7px] border border-[var(--navy)] text-[var(--navy)] hover:bg-[var(--accent-light)] text-[12px] font-medium transition-colors"
                >
                  ✦ Propor melhoria ao Brain
                </button>
              )}
              <p className="text-[10px] text-[var(--text-subtle)] mt-1.5">
                Gera um BrainChangeRequest na governança — nunca modifica o Brain diretamente.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
