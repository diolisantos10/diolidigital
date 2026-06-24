"use client";

import { useState } from "react";
import type { ContentStatus, SocialCanvas } from "@/lib/dioli-brain/social-canvas";

const STATUS_STYLE: Record<SocialCanvas["status"], { bg: string; text: string; label: string }> = {
  draft:    { bg: "bg-[#F0F0ED]", text: "text-[#6B6B65]", label: "Rascunho" },
  approved: { bg: "bg-[#DCFCE7]", text: "text-[#16A34A]", label: "Aprovado" },
  rejected: { bg: "bg-[#FEE2E2]", text: "text-[#DC2626]", label: "Rejeitado" },
};

const QG_STYLE = {
  PASS:    { badge: "bg-[#16A34A]", bg: "bg-[#DCFCE7]", border: "border-[#86EFAC]", text: "text-[#166534]" },
  WARNING: { badge: "bg-[#D97706]", bg: "bg-[#FEF3C7]", border: "border-[#FDE68A]", text: "text-[#92400E]" },
  FAIL:    { badge: "bg-[#DC2626]", bg: "bg-[#FEE2E2]", border: "border-[#FECACA]", text: "text-[#991B1B]" },
} as const;

const ENTRY_STATUS_STYLE: Record<ContentStatus, { bg: string; text: string; label: string }> = {
  draft:     { bg: "bg-[#F0F0ED]", text: "text-[#6B6B65]", label: "Rascunho" },
  planned:   { bg: "bg-[#E6FBFA]", text: "text-[#070A1F]", label: "Planejado" },
  approved:  { bg: "bg-[#DCFCE7]", text: "text-[#16A34A]", label: "Aprovado" },
  published: { bg: "bg-[#FDF2F8]", text: "text-[#DB2777]", label: "Publicado" },
};

const IMPORTANCE_STYLE: Record<string, string> = {
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

export interface SocialCanvasCardProps {
  canvas: SocialCanvas;
  // Review actions (workspace only — simulator passes undefined)
  onApprove?: (note?: string) => void;
  onReject?: (note?: string) => void;
  onProposeBrainChange?: () => void;
  onSetEntryStatus?: (entryId: string, status: ContentStatus) => void;
  brainChangeCreated?: boolean;
}

export function SocialCanvasCard({
  canvas,
  onApprove,
  onReject,
  onProposeBrainChange,
  onSetEntryStatus,
  brainChangeCreated,
}: SocialCanvasCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const status = STATUS_STYLE[canvas.status];
  const qg = canvas.qualityGateResult;
  const qgStyle = QG_STYLE[qg.overall];
  const flowCompleted = canvas.cognitiveFlowTrace.filter((s) => s.completed).length;
  // Dioli Standard: FAIL blocks approval.
  const approvalBlocked = qg.overall === "FAIL";

  return (
    <div className="bg-white rounded-[12px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
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
            {canvas.strategyCanvasId && (
              <span className="h-5 px-2 rounded-full bg-[#E6FBFA] text-[#070A1F] text-[10px] font-semibold">
                Estratégia vinculada
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[#9B9B95]">
            <span>{canvas.segment}</span>
            <span>·</span>
            <span>Fluxo {flowCompleted}/12</span>
            <span>·</span>
            <span>{canvas.contentPlan.totalPosts} posts/mês</span>
            <span>·</span>
            <span>{new Date(canvas.createdAt).toLocaleDateString("pt-BR")}</span>
          </div>
        </div>
        <span className="text-[#C0C0BC] text-[12px] shrink-0">{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div className="border-t border-[#F0F0ED] px-5 py-5 space-y-4">
          {/* Objective + role */}
          <div className="grid grid-cols-2 gap-4">
            <Section title="Objetivo de Conteúdo">
              <p className="text-[12px] text-[#1A1A1A] font-medium leading-relaxed">{canvas.contentObjective}</p>
            </Section>
            <Section title="Papel do Conteúdo">
              <p className="text-[12px] text-[#1A1A1A] leading-relaxed">{canvas.contentRole}</p>
            </Section>
          </div>

          <Section title="Público-Alvo">
            <p className="text-[12px] text-[#1A1A1A] leading-relaxed">{canvas.targetAudience}</p>
          </Section>

          <Section title="Direção de Comunicação (herdada da Estratégia)">
            <p className="text-[12px] text-[#1A1A1A] leading-relaxed">{canvas.communicationDirection}</p>
          </Section>

          {/* Territories */}
          <Section title="Territórios de Conteúdo">
            <div className="space-y-1.5">
              {canvas.contentTerritories.map((t) => (
                <div key={t.id} className="flex items-start gap-2 bg-[#F7F7F6] rounded-[8px] px-3 py-2">
                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold shrink-0 mt-0.5 ${IMPORTANCE_STYLE[t.importance]}`}>
                    {t.importance}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-semibold text-[#1A1A1A]">{t.name}</span>
                    <p className="text-[10px] text-[#9B9B95] leading-relaxed">{t.examples.join(" · ")}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Pillars */}
          <Section title="Pilares Editoriais">
            <div className="space-y-1.5">
              {canvas.editorialPillars.map((p) => (
                <div key={p.id} className="flex items-start gap-3 bg-[#FDF2F8] border border-[#FBCFE8] rounded-[8px] px-3 py-2">
                  <span className="w-5 h-5 rounded-full bg-[#DB2777] text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {p.priority}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-[#1A1A1A]">{p.name}</span>
                      <span className="text-[10px] text-[#9B9B95]">{p.frequency}</span>
                    </div>
                    <p className="text-[11px] text-[#6B6B65] leading-relaxed">{p.objective}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Frequency / formats / channels */}
          <div className="grid grid-cols-3 gap-4">
            <Section title="Frequência">
              <p className="text-[12px] text-[#1A1A1A] font-medium">{canvas.recommendedFrequency}</p>
            </Section>
            <Section title="Formatos">
              <TagList items={canvas.recommendedFormats} color="bg-[#FDF2F8] text-[#DB2777]" />
            </Section>
            <Section title="Canais Prioritários">
              <TagList items={canvas.priorityChannels} />
            </Section>
          </div>

          {/* Campaign support */}
          <Section title="Suporte a Campanhas">
            <BulletList items={canvas.campaignSupport} marker="▸" markerClass="text-[#070A1F]" />
          </Section>

          {/* Opportunities / risks */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#DCFCE7] border border-[#86EFAC] rounded-[8px] px-3 py-2.5">
              <div className="text-[9px] font-semibold text-[#16A34A] uppercase tracking-[0.06em] mb-1">Oportunidades de Conteúdo</div>
              {canvas.contentOpportunities.map((o, i) => (
                <p key={i} className="text-[11px] text-[#166534] leading-relaxed">✓ {o}</p>
              ))}
            </div>
            <div className="bg-[#FEF3C7] border border-[#FDE68A] rounded-[8px] px-3 py-2.5">
              <div className="text-[9px] font-semibold text-[#D97706] uppercase tracking-[0.06em] mb-1">Riscos de Conteúdo</div>
              {canvas.contentRisks.map((r, i) => (
                <p key={i} className="text-[11px] text-[#92400E] leading-relaxed">⚠ {r}</p>
              ))}
            </div>
          </div>

          {/* Monthly + weekly direction */}
          <div className="bg-[#FDF2F8] border border-[#FBCFE8] rounded-[8px] px-4 py-3">
            <div className="text-[9px] font-semibold text-[#DB2777] uppercase tracking-[0.06em] mb-1">
              Direção Mensal
            </div>
            <p className="text-[12px] text-[#831843] leading-relaxed font-medium">{canvas.monthlyDirection}</p>
            <div className="mt-2 space-y-0.5">
              {canvas.weeklyDirection.map((w, i) => (
                <p key={i} className="text-[11px] text-[#9D174D] leading-relaxed">{w}</p>
              ))}
            </div>
          </div>

          {/* Themes */}
          <Section title={`Temas de Conteúdo (${canvas.contentThemes.length})`}>
            <div className="grid grid-cols-2 gap-1.5">
              {canvas.contentThemes.map((t) => (
                <div key={t.id} className="bg-[#F7F7F6] rounded-[8px] px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-[#1A1A1A] truncate">{t.title}</span>
                    <span className="px-1.5 py-0.5 rounded-full bg-[#E6FBFA] text-[#070A1F] text-[9px] font-semibold shrink-0">{t.format}</span>
                  </div>
                  <p className="text-[10px] text-[#9B9B95] mt-0.5">{t.pillar} · {t.channel}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* Publishing recommendations + success indicators */}
          <div className="grid grid-cols-2 gap-4">
            <Section title="Recomendações de Publicação">
              <BulletList items={canvas.publishingRecommendations} marker="→" markerClass="text-[#DB2777]" />
            </Section>
            <Section title="Indicadores de Sucesso">
              <BulletList items={canvas.successIndicators} marker="◎" markerClass="text-[#16A34A]" />
            </Section>
          </div>

          {/* Content plan weeks */}
          <Section title={`Plano de Conteúdo — ${canvas.contentPlan.monthLabel} (${canvas.contentPlan.totalPosts} posts)`}>
            <div className="space-y-1.5">
              {canvas.contentPlan.weeks.map((w) => (
                <div key={w.week} className="flex items-start gap-3 bg-[#F7F7F6] rounded-[8px] px-3 py-2">
                  <span className="w-5 h-5 rounded-full bg-[#1A1A1A] text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {w.week}
                  </span>
                  <p className="text-[11px] text-[#6B6B65] leading-relaxed flex-1">{w.focus}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* Editorial calendar */}
          <Section title={`Calendário Editorial — ${canvas.editorialCalendar.monthLabel} (${canvas.editorialCalendar.entries.length} entradas)`}>
            <div className="space-y-1">
              {canvas.editorialCalendar.entries.map((e) => {
                const es = ENTRY_STATUS_STYLE[e.status];
                return (
                  <div key={e.id} className="flex items-center gap-2 bg-[#F7F7F6] rounded-[7px] px-3 py-1.5">
                    <span className="text-[10px] font-semibold text-[#6B6B65] w-[120px] shrink-0">{e.date}</span>
                    <span className="text-[11px] text-[#1A1A1A] flex-1 truncate">{e.theme}</span>
                    <span className="px-1.5 py-0.5 rounded-full bg-[#E6FBFA] text-[#070A1F] text-[9px] font-semibold shrink-0">{e.format}</span>
                    <span className="text-[10px] text-[#9B9B95] shrink-0 hidden sm:inline">{e.pillar}</span>
                    {onSetEntryStatus && canvas.status === "approved" ? (
                      <select
                        value={e.status}
                        onChange={(ev) => onSetEntryStatus(e.id, ev.target.value as ContentStatus)}
                        onClick={(ev) => ev.stopPropagation()}
                        className={`text-[9px] font-semibold rounded-full px-1.5 py-0.5 outline-none cursor-pointer ${es.bg} ${es.text}`}
                      >
                        <option value="draft">Rascunho</option>
                        <option value="planned">Planejado</option>
                        <option value="approved">Aprovado</option>
                        <option value="published">Publicado</option>
                      </select>
                    ) : (
                      <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold shrink-0 ${es.bg} ${es.text}`}>
                        {es.label}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>

          {/* Quality Gate */}
          <div className={`border rounded-[8px] px-4 py-3 ${qgStyle.bg} ${qgStyle.border}`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-[10px] font-semibold uppercase tracking-[0.06em] ${qgStyle.text}`}>
                Quality Gate Social — {qg.overall}
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

          {/* Review actions — FAIL blocks approval */}
          {canvas.status === "draft" && (onApprove || onReject) && (
            <div className="border-t border-[#F0F0ED] pt-3 space-y-2">
              {approvalBlocked && (
                <div className="bg-[#FEE2E2] border border-[#FECACA] rounded-[8px] px-3 py-2">
                  <p className="text-[11px] text-[#991B1B] font-medium">
                    ✗ Quality Gate FAIL — aprovação bloqueada até os itens reprovados serem resolvidos.
                  </p>
                </div>
              )}
              <textarea
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder="Nota de revisão (opcional)…"
                rows={2}
                className="w-full px-3 py-2 text-[12px] bg-[#F7F7F6] border border-[#E5E5E2] rounded-[8px] outline-none focus:border-[#DB2777] focus:bg-white transition-all resize-none"
              />
              <div className="flex items-center gap-2">
                {onApprove && (
                  <button
                    onClick={() => onApprove(reviewNote)}
                    disabled={approvalBlocked}
                    className="h-8 px-4 rounded-[7px] bg-[#16A34A] hover:bg-[#15803D] disabled:bg-[#C0C0BC] disabled:cursor-not-allowed text-white text-[12px] font-medium transition-colors"
                  >
                    Aprovar plano
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

          {/* Governance: propose brain change from reviewed plans */}
          {canvas.status !== "draft" && onProposeBrainChange && (
            <div className="border-t border-[#F0F0ED] pt-3">
              {brainChangeCreated ? (
                <span className="h-7 px-3 rounded-full bg-[#DCFCE7] text-[#16A34A] text-[10px] font-semibold inline-flex items-center gap-1">
                  ✓ BrainChangeRequest criado — na fila do Brain Director
                </span>
              ) : (
                <button
                  onClick={onProposeBrainChange}
                  className="h-8 px-4 rounded-[7px] border border-[#DB2777] text-[#DB2777] hover:bg-[#FDF2F8] text-[12px] font-medium transition-colors"
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
