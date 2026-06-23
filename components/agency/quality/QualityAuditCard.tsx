"use client";

import { useState } from "react";
import type { QualityCanvas } from "@/lib/dioli-brain/quality-canvas";

const VERDICT_COLORS = {
  PASS:    { bg: "bg-[#DCFCE7]", border: "border-[#86EFAC]", text: "text-[#166534]", badge: "bg-[#16A34A]", dot: "bg-[#16A34A]" },
  WARNING: { bg: "bg-[#FEF3C7]", border: "border-[#FDE68A]", text: "text-[#92400E]", badge: "bg-[#D97706]", dot: "bg-[#D97706]" },
  FAIL:    { bg: "bg-[#FEE2E2]", border: "border-[#FECACA]", text: "text-[#991B1B]", badge: "bg-[#DC2626]", dot: "bg-[#DC2626]" },
  BLOCKED: { bg: "bg-[#FEE2E2]", border: "border-[#FECACA]", text: "text-[#7F1D1D]", badge: "bg-[#991B1B]", dot: "bg-[#991B1B]" },
} as const;

const DEPT_LABELS: Record<string, string> = {
  strategy: "Estratégia", "social-media": "Social Media", design: "Design",
  "paid-traffic": "Tráfego Pago", analytics: "Analytics", quality: "Quality",
};

const PRIORITY_COLORS: Record<string, string> = {
  alta:  "bg-[#FEE2E2] text-[#991B1B] border-[#FECACA]",
  media: "bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]",
  baixa: "bg-[#F0F0ED] text-[#6B6B65] border-[#E8E8E2]",
};

const PATTERN_ICONS: Record<string, string> = {
  strength: "✓", weakness: "⚠", risk: "✗", opportunity: "→",
};

interface Props {
  canvas: QualityCanvas;
  onApprove?: (note?: string) => void;
  onReject?: (note?: string) => void;
  onProposeBrainChange?: () => void;
  brainChangeCreated?: boolean;
}

export function QualityAuditCard({ canvas, onApprove, onReject, onProposeBrainChange, brainChangeCreated }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [note, setNote] = useState("");

  const verdict = VERDICT_COLORS[canvas.overallVerdict];
  const isBlocked = canvas.overallVerdict === "BLOCKED";
  const statusLabel = canvas.status === "draft" ? "Rascunho" : canvas.status === "approved" ? "Aprovado" : "Rejeitado";

  return (
    <div className="rounded-[12px] border border-[#E8E8E2] bg-white overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
      {/* Header */}
      <div className="px-5 py-4 flex items-start gap-4 cursor-pointer hover:bg-[#FAFAF8] transition-colors" onClick={() => setExpanded((e) => !e)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-[13px] font-semibold text-[#1A1A1A]">{canvas.clientName}</span>
            <span className={`h-5 px-2 rounded-full text-white text-[9px] font-bold ${verdict.badge}`}>{canvas.overallVerdict}</span>
            <span className="h-5 px-2 rounded-full bg-[#F0F0ED] text-[#6B6B65] text-[9px] font-semibold">
              {DEPT_LABELS[canvas.auditedDepartment] ?? canvas.auditedDepartment}
            </span>
            <span className={`h-5 px-2 rounded-full text-[9px] font-semibold ${
              canvas.status === "approved" ? "bg-[#DCFCE7] text-[#16A34A]"
              : canvas.status === "rejected" ? "bg-[#FEE2E2] text-[#DC2626]"
              : "bg-[#F0F0ED] text-[#6B6B65]"
            }`}>{statusLabel}</span>
            {canvas.auditType === "cross_dept_audit" && (
              <span className="h-5 px-2 rounded-full bg-[#E6FBFA] text-[#070A1F] text-[9px] font-semibold">Cross-dept</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-[#9B9B95]">
            <span>{canvas.segment}</span>
            <span>·</span>
            <span>{canvas.gateResult.passCount} pass · {canvas.gateResult.warningCount} warn · {canvas.gateResult.failCount} fail</span>
            <span>·</span>
            <span>{new Date(canvas.createdAt).toLocaleDateString("pt-BR")}</span>
          </div>
        </div>
        <span className="text-[#C0C0BC] text-[11px] shrink-0">{expanded ? "▲" : "▼"}</span>
      </div>

      {/* Blocked banner */}
      {isBlocked && (
        <div className="mx-5 mb-3 rounded-[8px] bg-[#FEE2E2] border border-[#FECACA] px-4 py-2.5">
          <p className="text-[11px] font-semibold text-[#991B1B]">⛔ Entrega bloqueada — {canvas.gateResult.blockingFailures} falha(s) bloqueante(s) detectada(s). Corrigir antes de avançar.</p>
        </div>
      )}

      {!expanded && (
        <div className="px-5 pb-3">
          <p className="text-[11px] text-[#6B6B65] leading-relaxed line-clamp-2">{canvas.verdictRationale}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {canvas.keyFindings.slice(0, 2).map((f, i) => (
              <span key={i} className="text-[10px] text-[#9B9B95]">• {f}</span>
            ))}
          </div>
        </div>
      )}

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-[#F0F0ED] px-5 py-5 space-y-5">
          {/* Verdict rationale */}
          <div className={`rounded-[8px] border px-4 py-3 ${verdict.bg} ${verdict.border}`}>
            <div className={`text-[10px] font-semibold uppercase tracking-[0.06em] mb-1 ${verdict.text}`}>Veredicto — {canvas.overallVerdict}</div>
            <p className={`text-[11px] leading-relaxed ${verdict.text}`}>{canvas.verdictRationale}</p>
          </div>

          {/* Key findings */}
          <div>
            <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-2">Principais Achados</div>
            <div className="space-y-1.5">
              {canvas.keyFindings.map((f, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px] text-[#1A1A1A]">
                  <span className="text-[#6B6B65] shrink-0">—</span>
                  <span>{f}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Global gate */}
          <div>
            <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-2">Quality Gate Global ({canvas.gateResult.globalItems.length} itens)</div>
            <div className="grid grid-cols-2 gap-1.5">
              {canvas.gateResult.globalItems.map((item) => (
                <div key={item.id} className="flex items-start gap-1.5 text-[10px]" title={item.detail}>
                  <span className={`shrink-0 font-bold ${item.status === "PASS" ? "text-[#16A34A]" : item.status === "WARNING" ? "text-[#D97706]" : "text-[#DC2626]"}`}>
                    {item.status === "PASS" ? "✓" : item.status === "WARNING" ? "!" : "✗"}
                  </span>
                  <span className="text-[#6B6B65] leading-tight">{item.label}</span>
                  {item.blocking && item.status === "FAIL" && <span className="text-[#DC2626] font-bold ml-0.5">⛔</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Dept-specific gate */}
          {canvas.gateResult.deptItems.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-2">Quality Gate — {DEPT_LABELS[canvas.auditedDepartment] ?? canvas.auditedDepartment} ({canvas.gateResult.deptItems.length} itens)</div>
              <div className="grid grid-cols-2 gap-1.5">
                {canvas.gateResult.deptItems.map((item) => (
                  <div key={item.id} className="flex items-start gap-1.5 text-[10px]" title={item.detail}>
                    <span className={`shrink-0 font-bold ${item.status === "PASS" ? "text-[#16A34A]" : "text-[#DC2626]"}`}>
                      {item.status === "PASS" ? "✓" : "✗"}
                    </span>
                    <span className="text-[#6B6B65] leading-tight">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Patterns */}
          {canvas.patternsIdentified.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-2">Padrões Identificados ({canvas.patternsIdentified.length})</div>
              <div className="space-y-1.5">
                {canvas.patternsIdentified.map((p) => (
                  <div key={p.id} className={`flex items-start gap-2 text-[10px] px-3 py-1.5 rounded-[6px] ${
                    p.type === "strength" ? "bg-[#DCFCE7] text-[#166534]"
                    : p.type === "risk" ? "bg-[#FEE2E2] text-[#991B1B]"
                    : p.type === "opportunity" ? "bg-[#E6FBFA] text-[#070A1F]"
                    : "bg-[#FEF3C7] text-[#92400E]"
                  }`}>
                    <span className="font-bold shrink-0">{PATTERN_ICONS[p.type]}</span>
                    <span>{p.description}</span>
                    <span className="ml-auto shrink-0 font-semibold">{DEPT_LABELS[p.department] ?? p.department}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Risk flags */}
          {canvas.riskFlags.length > 0 && (
            <div className="rounded-[8px] bg-[#FEF3C7] border border-[#FDE68A] px-4 py-3">
              <div className="text-[10px] font-semibold text-[#D97706] uppercase tracking-[0.06em] mb-1.5">Alertas de Risco</div>
              {canvas.riskFlags.map((f, i) => (
                <p key={i} className="text-[11px] text-[#92400E]">⚠ {f}</p>
              ))}
            </div>
          )}

          {/* Recommendations */}
          {canvas.recommendations.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-2">Recomendações ({canvas.recommendations.length})</div>
              <div className="space-y-2">
                {canvas.recommendations.map((r) => (
                  <div key={r.id} className="border border-[#E8E8E2] rounded-[8px] px-3 py-2.5">
                    <div className="flex items-start gap-2 mb-1">
                      <span className={`h-4 px-1.5 rounded-[3px] text-[9px] font-semibold border ${PRIORITY_COLORS[r.priority]}`}>{r.priority}</span>
                      <span className="text-[10px] text-[#9B9B95] font-medium">{DEPT_LABELS[r.department] ?? r.department}</span>
                      {r.brainChangeCandidate && <span className="ml-auto h-4 px-1.5 rounded-[3px] bg-[#E6FBFA] text-[#070A1F] text-[9px] font-semibold border border-[#C7C7F5]">Brain Change</span>}
                    </div>
                    <p className="text-[11px] font-medium text-[#1A1A1A] mb-0.5">{r.issue}</p>
                    <p className="text-[11px] text-[#6B6B65] leading-relaxed">{r.recommendation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Training signals */}
          {canvas.trainingSignals.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-2">Sinais de Treinamento</div>
              {canvas.trainingSignals.map((s, i) => (
                <p key={i} className="text-[11px] text-[#6B6B65]">→ {s}</p>
              ))}
            </div>
          )}

          {/* Evidence candidates */}
          {canvas.evidenceCandidates.length > 0 && (
            <div className="rounded-[8px] bg-[#F0FDF4] border border-[#86EFAC] px-4 py-3">
              <div className="text-[10px] font-semibold text-[#16A34A] uppercase tracking-[0.06em] mb-1.5">Candidatos a Evidência</div>
              {canvas.evidenceCandidates.map((e, i) => (
                <p key={i} className="text-[11px] text-[#166534]">✓ {e}</p>
              ))}
            </div>
          )}

          {/* Cognitive flow */}
          <div className="border border-[#E8E8E2] rounded-[8px] px-4 py-3">
            <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-2">Fluxo Cognitivo</div>
            <div className="grid grid-cols-3 gap-1.5">
              {canvas.cognitiveFlowTrace.map((step) => (
                <div key={step.stepId} className="flex items-center gap-1 text-[10px]">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${step.completed ? "bg-[#070A1F]" : "bg-[#D0D0CC]"}`} />
                  <span className={step.completed ? "text-[#070A1F]" : "text-[#C0C0BC]"} title={step.summary}>{step.order}. {step.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Review note */}
          {canvas.reviewNote && (
            <div className="rounded-[8px] bg-[#F7F7F6] border border-[#E8E8E2] px-4 py-3">
              <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-1">Nota da revisão</div>
              <p className="text-[11px] text-[#1A1A1A]">{canvas.reviewNote}</p>
            </div>
          )}

          {/* Actions */}
          {canvas.status === "draft" && (onApprove || onReject) && (
            <div className="border-t border-[#F0F0ED] pt-4">
              {!showActions ? (
                <div className="flex gap-2 flex-wrap">
                  {onApprove && (
                    <button onClick={() => setShowActions(true)} disabled={isBlocked}
                      className="h-8 px-4 rounded-[7px] bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[12px] font-medium">
                      Aprovar auditoria
                    </button>
                  )}
                  {onReject && (
                    <button onClick={() => { setShowActions(true); }}
                      className="h-8 px-4 rounded-[7px] border border-[#E8E8E2] text-[#6B6B65] hover:border-[#DC2626] hover:text-[#DC2626] text-[12px] font-medium">
                      Rejeitar
                    </button>
                  )}
                  {onProposeBrainChange && !brainChangeCreated && (
                    <button onClick={onProposeBrainChange}
                      className="h-8 px-4 rounded-[7px] border border-[#070A1F] text-[#070A1F] hover:bg-[#E6FBFA] text-[12px] font-medium">
                      ✦ Propor Brain Change
                    </button>
                  )}
                  {brainChangeCreated && (
                    <span className="h-8 px-4 rounded-[7px] bg-[#E6FBFA] text-[#070A1F] text-[12px] font-medium flex items-center">✓ Brain Change criado</span>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (opcional)..."
                    rows={2} className="w-full px-3 py-2 text-[12px] border border-[#E8E8E2] rounded-[7px] outline-none focus:border-[#070A1F] resize-none" />
                  <div className="flex gap-2">
                    {onApprove && !isBlocked && (
                      <button onClick={() => { onApprove(note); setShowActions(false); setNote(""); }}
                        className="h-8 px-4 rounded-[7px] bg-[#16A34A] hover:bg-[#15803D] text-white text-[12px] font-medium">
                        Confirmar aprovação
                      </button>
                    )}
                    {onReject && (
                      <button onClick={() => { onReject(note); setShowActions(false); setNote(""); }}
                        className="h-8 px-4 rounded-[7px] bg-[#DC2626] hover:bg-[#B91C1C] text-white text-[12px] font-medium">
                        Confirmar rejeição
                      </button>
                    )}
                    <button onClick={() => { setShowActions(false); setNote(""); }}
                      className="h-8 px-4 rounded-[7px] border border-[#E8E8E2] text-[#6B6B65] text-[12px] font-medium">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {canvas.status !== "draft" && onProposeBrainChange && (
            <div className="flex gap-2 pt-2">
              {!brainChangeCreated ? (
                <button onClick={onProposeBrainChange}
                  className="h-8 px-4 rounded-[7px] border border-[#070A1F] text-[#070A1F] hover:bg-[#E6FBFA] text-[12px] font-medium">
                  ✦ Propor Brain Change
                </button>
              ) : (
                <span className="h-8 px-4 rounded-[7px] bg-[#E6FBFA] text-[#070A1F] text-[12px] font-medium flex items-center">✓ Brain Change criado</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
