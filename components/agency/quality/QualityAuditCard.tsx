"use client";

import { useState } from "react";
import type { QualityCanvas } from "@/lib/dioli-brain/quality-canvas";

const VERDICT_COLORS = {
  PASS:    { bg: "bg-[var(--success-bg)]", border: "border-[#86EFAC]", text: "text-[#166534]", badge: "bg-[var(--success)]", dot: "bg-[var(--success)]" },
  WARNING: { bg: "bg-[var(--warning-bg)]", border: "border-[#FDE68A]", text: "text-[#92400E]", badge: "bg-[var(--warning)]", dot: "bg-[var(--warning)]" },
  FAIL:    { bg: "bg-[#FEE2E2]", border: "border-[#FECACA]", text: "text-[#991B1B]", badge: "bg-[var(--danger)]", dot: "bg-[var(--danger)]" },
  BLOCKED: { bg: "bg-[#FEE2E2]", border: "border-[#FECACA]", text: "text-[#7F1D1D]", badge: "bg-[#991B1B]", dot: "bg-[#991B1B]" },
} as const;

const DEPT_LABELS: Record<string, string> = {
  strategy: "Estratégia", "social-media": "Social Media", design: "Design",
  "paid-traffic": "Tráfego Pago", analytics: "Analytics", quality: "Quality",
};

const PRIORITY_COLORS: Record<string, string> = {
  alta:  "bg-[#FEE2E2] text-[#991B1B] border-[#FECACA]",
  media: "bg-[var(--warning-bg)] text-[#92400E] border-[#FDE68A]",
  baixa: "bg-[var(--accent)] text-[var(--text-secondary)] border-[var(--border)]",
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
    <div className="rounded-[12px] border border-[var(--border)] bg-white overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
      {/* Header */}
      <div className="px-5 py-4 flex items-start gap-4 cursor-pointer hover:bg-[var(--bg-elevated)] transition-colors" onClick={() => setExpanded((e) => !e)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-[13px] font-semibold text-[var(--text-primary)]">{canvas.clientName}</span>
            <span className={`h-5 px-2 rounded-full text-white text-[9px] font-bold ${verdict.badge}`}>{canvas.overallVerdict}</span>
            <span className="h-5 px-2 rounded-full bg-[var(--accent)] text-[var(--text-secondary)] text-[9px] font-semibold">
              {DEPT_LABELS[canvas.auditedDepartment] ?? canvas.auditedDepartment}
            </span>
            <span className={`h-5 px-2 rounded-full text-[9px] font-semibold ${
              canvas.status === "approved" ? "bg-[var(--success-bg)] text-[var(--success)]"
              : canvas.status === "rejected" ? "bg-[#FEE2E2] text-[var(--danger)]"
              : "bg-[var(--accent)] text-[var(--text-secondary)]"
            }`}>{statusLabel}</span>
            {canvas.auditType === "cross_dept_audit" && (
              <span className="h-5 px-2 rounded-full bg-[var(--accent-light)] text-[var(--navy)] text-[9px] font-semibold">Cross-dept</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
            <span>{canvas.segment}</span>
            <span>·</span>
            <span>{canvas.gateResult.passCount} pass · {canvas.gateResult.warningCount} warn · {canvas.gateResult.failCount} fail</span>
            <span>·</span>
            <span>{new Date(canvas.createdAt).toLocaleDateString("pt-BR")}</span>
          </div>
        </div>
        <span className="text-[var(--text-subtle)] text-[11px] shrink-0">{expanded ? "▲" : "▼"}</span>
      </div>

      {/* Blocked banner */}
      {isBlocked && (
        <div className="mx-5 mb-3 rounded-[8px] bg-[#FEE2E2] border border-[#FECACA] px-4 py-2.5">
          <p className="text-[11px] font-semibold text-[#991B1B]">⛔ Entrega bloqueada — {canvas.gateResult.blockingFailures} falha(s) bloqueante(s) detectada(s). Corrigir antes de avançar.</p>
        </div>
      )}

      {!expanded && (
        <div className="px-5 pb-3">
          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed line-clamp-2">{canvas.verdictRationale}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {canvas.keyFindings.slice(0, 2).map((f, i) => (
              <span key={i} className="text-[10px] text-[var(--text-muted)]">• {f}</span>
            ))}
          </div>
        </div>
      )}

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-[var(--border)] px-5 py-5 space-y-5">
          {/* Verdict rationale */}
          <div className={`rounded-[8px] border px-4 py-3 ${verdict.bg} ${verdict.border}`}>
            <div className={`text-[10px] font-semibold uppercase tracking-[0.06em] mb-1 ${verdict.text}`}>Veredicto — {canvas.overallVerdict}</div>
            <p className={`text-[11px] leading-relaxed ${verdict.text}`}>{canvas.verdictRationale}</p>
          </div>

          {/* Key findings */}
          <div>
            <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em] mb-2">Principais Achados</div>
            <div className="space-y-1.5">
              {canvas.keyFindings.map((f, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px] text-[var(--text-primary)]">
                  <span className="text-[var(--text-secondary)] shrink-0">—</span>
                  <span>{f}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Global gate */}
          <div>
            <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em] mb-2">Quality Gate Global ({canvas.gateResult.globalItems.length} itens)</div>
            <div className="grid grid-cols-2 gap-1.5">
              {canvas.gateResult.globalItems.map((item) => (
                <div key={item.id} className="flex items-start gap-1.5 text-[10px]" title={item.detail}>
                  <span className={`shrink-0 font-bold ${item.status === "PASS" ? "text-[var(--success)]" : item.status === "WARNING" ? "text-[var(--warning)]" : "text-[var(--danger)]"}`}>
                    {item.status === "PASS" ? "✓" : item.status === "WARNING" ? "!" : "✗"}
                  </span>
                  <span className="text-[var(--text-secondary)] leading-tight">{item.label}</span>
                  {item.blocking && item.status === "FAIL" && <span className="text-[var(--danger)] font-bold ml-0.5">⛔</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Dept-specific gate */}
          {canvas.gateResult.deptItems.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em] mb-2">Quality Gate — {DEPT_LABELS[canvas.auditedDepartment] ?? canvas.auditedDepartment} ({canvas.gateResult.deptItems.length} itens)</div>
              <div className="grid grid-cols-2 gap-1.5">
                {canvas.gateResult.deptItems.map((item) => (
                  <div key={item.id} className="flex items-start gap-1.5 text-[10px]" title={item.detail}>
                    <span className={`shrink-0 font-bold ${item.status === "PASS" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
                      {item.status === "PASS" ? "✓" : "✗"}
                    </span>
                    <span className="text-[var(--text-secondary)] leading-tight">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Patterns */}
          {canvas.patternsIdentified.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em] mb-2">Padrões Identificados ({canvas.patternsIdentified.length})</div>
              <div className="space-y-1.5">
                {canvas.patternsIdentified.map((p) => (
                  <div key={p.id} className={`flex items-start gap-2 text-[10px] px-3 py-1.5 rounded-[6px] ${
                    p.type === "strength" ? "bg-[var(--success-bg)] text-[#166534]"
                    : p.type === "risk" ? "bg-[#FEE2E2] text-[#991B1B]"
                    : p.type === "opportunity" ? "bg-[var(--accent-light)] text-[var(--navy)]"
                    : "bg-[var(--warning-bg)] text-[#92400E]"
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
            <div className="rounded-[8px] bg-[var(--warning-bg)] border border-[#FDE68A] px-4 py-3">
              <div className="text-[10px] font-semibold text-[var(--warning)] uppercase tracking-[0.06em] mb-1.5">Alertas de Risco</div>
              {canvas.riskFlags.map((f, i) => (
                <p key={i} className="text-[11px] text-[#92400E]">⚠ {f}</p>
              ))}
            </div>
          )}

          {/* Recommendations */}
          {canvas.recommendations.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em] mb-2">Recomendações ({canvas.recommendations.length})</div>
              <div className="space-y-2">
                {canvas.recommendations.map((r) => (
                  <div key={r.id} className="border border-[var(--border)] rounded-[8px] px-3 py-2.5">
                    <div className="flex items-start gap-2 mb-1">
                      <span className={`h-4 px-1.5 rounded-[3px] text-[9px] font-semibold border ${PRIORITY_COLORS[r.priority]}`}>{r.priority}</span>
                      <span className="text-[10px] text-[var(--text-muted)] font-medium">{DEPT_LABELS[r.department] ?? r.department}</span>
                      {r.brainChangeCandidate && <span className="ml-auto h-4 px-1.5 rounded-[3px] bg-[var(--accent-light)] text-[var(--navy)] text-[9px] font-semibold border border-[#D6DEFF]">Brain Change</span>}
                    </div>
                    <p className="text-[11px] font-medium text-[var(--text-primary)] mb-0.5">{r.issue}</p>
                    <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{r.recommendation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Training signals */}
          {canvas.trainingSignals.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em] mb-2">Sinais de Treinamento</div>
              {canvas.trainingSignals.map((s, i) => (
                <p key={i} className="text-[11px] text-[var(--text-secondary)]">→ {s}</p>
              ))}
            </div>
          )}

          {/* Evidence candidates */}
          {canvas.evidenceCandidates.length > 0 && (
            <div className="rounded-[8px] bg-[#F0FDF4] border border-[#86EFAC] px-4 py-3">
              <div className="text-[10px] font-semibold text-[var(--success)] uppercase tracking-[0.06em] mb-1.5">Candidatos a Evidência</div>
              {canvas.evidenceCandidates.map((e, i) => (
                <p key={i} className="text-[11px] text-[#166534]">✓ {e}</p>
              ))}
            </div>
          )}

          {/* Cognitive flow */}
          <div className="border border-[var(--border)] rounded-[8px] px-4 py-3">
            <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em] mb-2">Fluxo Cognitivo</div>
            <div className="grid grid-cols-3 gap-1.5">
              {canvas.cognitiveFlowTrace.map((step) => (
                <div key={step.stepId} className="flex items-center gap-1 text-[10px]">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${step.completed ? "bg-[var(--navy)]" : "bg-[var(--border-strong)]"}`} />
                  <span className={step.completed ? "text-[var(--navy)]" : "text-[var(--text-subtle)]"} title={step.summary}>{step.order}. {step.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Review note */}
          {canvas.reviewNote && (
            <div className="rounded-[8px] bg-[var(--bg)] border border-[var(--border)] px-4 py-3">
              <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em] mb-1">Nota da revisão</div>
              <p className="text-[11px] text-[var(--text-primary)]">{canvas.reviewNote}</p>
            </div>
          )}

          {/* Actions */}
          {canvas.status === "draft" && (onApprove || onReject) && (
            <div className="border-t border-[var(--border)] pt-4">
              {!showActions ? (
                <div className="flex gap-2 flex-wrap">
                  {onApprove && (
                    <button onClick={() => setShowActions(true)} disabled={isBlocked}
                      className="h-8 px-4 rounded-[7px] bg-[var(--success)] hover:bg-[#15803D] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[12px] font-medium">
                      Aprovar auditoria
                    </button>
                  )}
                  {onReject && (
                    <button onClick={() => { setShowActions(true); }}
                      className="h-8 px-4 rounded-[7px] border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--danger)] hover:text-[var(--danger)] text-[12px] font-medium">
                      Rejeitar
                    </button>
                  )}
                  {onProposeBrainChange && !brainChangeCreated && (
                    <button onClick={onProposeBrainChange}
                      className="h-8 px-4 rounded-[7px] border border-[var(--navy)] text-[var(--navy)] hover:bg-[var(--accent-light)] text-[12px] font-medium">
                      ✦ Propor Brain Change
                    </button>
                  )}
                  {brainChangeCreated && (
                    <span className="h-8 px-4 rounded-[7px] bg-[var(--accent-light)] text-[var(--navy)] text-[12px] font-medium flex items-center">✓ Brain Change criado</span>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (opcional)..."
                    rows={2} className="w-full px-3 py-2 text-[12px] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] resize-none" />
                  <div className="flex gap-2">
                    {onApprove && !isBlocked && (
                      <button onClick={() => { onApprove(note); setShowActions(false); setNote(""); }}
                        className="h-8 px-4 rounded-[7px] bg-[var(--success)] hover:bg-[#15803D] text-white text-[12px] font-medium">
                        Confirmar aprovação
                      </button>
                    )}
                    {onReject && (
                      <button onClick={() => { onReject(note); setShowActions(false); setNote(""); }}
                        className="h-8 px-4 rounded-[7px] bg-[var(--danger)] hover:bg-[#B91C1C] text-white text-[12px] font-medium">
                        Confirmar rejeição
                      </button>
                    )}
                    <button onClick={() => { setShowActions(false); setNote(""); }}
                      className="h-8 px-4 rounded-[7px] border border-[var(--border)] text-[var(--text-secondary)] text-[12px] font-medium">
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
                  className="h-8 px-4 rounded-[7px] border border-[var(--navy)] text-[var(--navy)] hover:bg-[var(--accent-light)] text-[12px] font-medium">
                  ✦ Propor Brain Change
                </button>
              ) : (
                <span className="h-8 px-4 rounded-[7px] bg-[var(--accent-light)] text-[var(--navy)] text-[12px] font-medium flex items-center">✓ Brain Change criado</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
