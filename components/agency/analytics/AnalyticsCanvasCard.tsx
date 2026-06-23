"use client";

import { useState } from "react";
import type { AnalyticsCanvas } from "@/lib/dioli-brain/analytics-canvas";

interface AnalyticsCanvasCardProps {
  canvas: AnalyticsCanvas;
  onApprove?: (note?: string) => void;
  onReject?: (note?: string) => void;
  onProposeBrainChange?: () => void;
  brainChangeCreated?: boolean;
}

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  draft:    { bg: "bg-[#E6FBFA]", text: "text-[#070A1F]", label: "Rascunho" },
  approved: { bg: "bg-[#DCFCE7]", text: "text-[#16A34A]", label: "Aprovado" },
  rejected: { bg: "bg-[#FEE2E2]", text: "text-[#DC2626]", label: "Rejeitado" },
};

const CATEGORY_LABEL: Record<string, string> = {
  business: "Negócio", content: "Conteúdo", traffic: "Tráfego", brand: "Marca", cross_dept: "Cross-dept",
};

const CATEGORY_COLOR: Record<string, string> = {
  business: "#070A1F", content: "#DB2777", traffic: "#0284C7", brand: "#EA580C", cross_dept: "#7C3AED",
};

const EFFORT_LABEL: Record<string, string>   = { baixo: "Baixo", medio: "Médio", alto: "Alto" };
const URGENCY_LABEL: Record<string, string>  = { imediata: "Imediata", proximos_30_dias: "30 dias", proximo_trimestre: "Trimestre" };
const URGENCY_COLOR: Record<string, string>  = { imediata: "#DC2626", proximos_30_dias: "#D97706", proximo_trimestre: "#6B6B65" };

export function AnalyticsCanvasCard({
  canvas, onApprove, onReject, onProposeBrainChange, brainChangeCreated,
}: AnalyticsCanvasCardProps) {
  const [note, setNote]           = useState("");
  const [showNote, setShowNote]   = useState(false);
  const [expanded, setExpanded]   = useState(false);

  const qg     = canvas.qualityGateResult;
  const status = STATUS_STYLE[canvas.status] ?? STATUS_STYLE.draft;
  const isFail = qg.overall === "FAIL";

  return (
    <div className="rounded-[12px] border border-[#E5E5E2] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.05)] overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-[14px] font-semibold text-[#1A1A1A]">{canvas.clientName}</span>
            <span className={`h-5 px-2 rounded-full text-[10px] font-semibold ${status.bg} ${status.text}`}>{status.label}</span>
            <span className="h-5 px-2 rounded-full bg-[#E0F2FE] text-[#0284C7] text-[10px] font-semibold">Analytics</span>
            {canvas.source === "simulation" && (
              <span className="h-5 px-1.5 rounded-full bg-[#F0F0ED] text-[#9B9B95] text-[9px] font-bold">SIM</span>
            )}
          </div>
          <p className="text-[12px] text-[#6B6B65]">{canvas.segment} · KPI: {canvas.primaryKPI}</p>
          <p className="text-[11px] text-[#9B9B95] mt-0.5">{canvas.dashboardPlatform} · {canvas.reportingCadence}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
            qg.overall === "PASS" ? "text-[#16A34A] border-[#16A34A]/30 bg-[#DCFCE7]"
            : qg.overall === "WARNING" ? "text-[#D97706] border-[#D97706]/30 bg-[#FEF3C7]"
            : "text-[#DC2626] border-[#DC2626]/30 bg-[#FEE2E2]"
          }`}>
            QG: {qg.overall}
          </span>
          <button
            onClick={() => setExpanded((x) => !x)}
            className="text-[11px] text-[#9B9B95] hover:text-[#1A1A1A] px-2 py-1 rounded-[5px] border border-[#E5E5E2] transition-colors"
          >
            {expanded ? "Recolher ▲" : "Expandir ▼"}
          </button>
        </div>
      </div>

      {/* KPI Summary (always visible) */}
      <div className="px-5 pb-3">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {canvas.kpis.slice(0, 6).map((k) => (
            <div key={k.id} className="rounded-[7px] border border-[#E5E5E2] bg-[#FAFAF8] px-2.5 py-2 text-center">
              <div className="text-[9px] font-semibold uppercase tracking-[0.05em] mb-0.5"
                style={{ color: CATEGORY_COLOR[k.category] ?? "#6B6B65" }}>
                {CATEGORY_LABEL[k.category] ?? k.category}
              </div>
              <div className="text-[11px] font-semibold text-[#1A1A1A] truncate" title={k.targetValue}>{k.targetValue}</div>
              <div className="text-[9px] text-[#9B9B95] mt-0.5 truncate" title={k.name}>{k.name}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-[#F0F0ED] px-5 py-4 space-y-5">

          {/* Attribution Layer */}
          <div>
            <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-2">
              Modelo de Atribuição — {canvas.attributionLayer.recommendedModel}
            </div>
            <p className="text-[11px] text-[#6B6B65] leading-relaxed mb-2">{canvas.attributionLayer.modelRationale}</p>
            <div className="grid grid-cols-2 gap-2">
              {canvas.attributionLayer.touchpoints.map((tp) => (
                <div key={tp.id} className="rounded-[7px] border border-[#E5E5E2] bg-[#F7F7F6] px-3 py-2">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[11px] font-medium text-[#1A1A1A]">{tp.channel}</span>
                    <span className="text-[11px] font-bold text-[#0284C7]">{tp.estimatedContribution}%</span>
                  </div>
                  <p className="text-[10px] text-[#9B9B95]">{tp.role}</p>
                </div>
              ))}
            </div>
            {canvas.attributionLayer.analyticsSetupRequired.length > 0 && (
              <div className="mt-2">
                <div className="text-[9px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1">Setup necessário</div>
                <div className="flex flex-wrap gap-1">
                  {canvas.attributionLayer.analyticsSetupRequired.map((s, i) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-[4px] bg-[#E0F2FE] text-[#0284C7]">{s}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Full KPI Framework */}
          <div>
            <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-2">
              KPI Framework ({canvas.kpis.length} KPIs)
            </div>
            <div className="space-y-1.5">
              {canvas.kpis.map((k) => (
                <div key={k.id} className="flex items-center gap-3 text-[11px] bg-[#FAFAF8] rounded-[6px] px-3 py-1.5 border border-[#E5E5E2]">
                  <span className="w-14 shrink-0 text-[9px] font-semibold uppercase"
                    style={{ color: CATEGORY_COLOR[k.category] ?? "#6B6B65" }}>
                    {CATEGORY_LABEL[k.category] ?? k.category}
                  </span>
                  <span className="flex-1 font-medium text-[#1A1A1A]">{k.name}</span>
                  <span className="text-[#9B9B95] shrink-0">Meta: <strong className="text-[#1A1A1A]">{k.targetValue}</strong></span>
                  <span className="text-[10px] text-[#C0C0BC] shrink-0">{k.dataSource}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Performance Gaps */}
          {canvas.performanceGaps.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-2">
                Gaps de Performance ({canvas.performanceGaps.length})
              </div>
              <div className="space-y-2">
                {canvas.performanceGaps.map((g) => (
                  <div key={g.id} className="rounded-[8px] border border-[#E5E5E2] bg-[#FAFAF8] px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-[12px] font-semibold text-[#1A1A1A]">{g.area}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        g.priority === "alta" ? "bg-[#FEE2E2] text-[#DC2626]"
                        : g.priority === "media" ? "bg-[#FEF3C7] text-[#D97706]"
                        : "bg-[#F0F0ED] text-[#9B9B95]"
                      }`}>
                        {g.priority.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#6B6B65] mb-1">{g.gapDescription}</p>
                    <p className="text-[10px] text-[#16A34A] font-medium">Impacto: {g.estimatedImpact}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          <div>
            <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-2">
              Recomendações ({canvas.recommendations.length})
            </div>
            <div className="space-y-1.5">
              {canvas.recommendations.map((r) => (
                <div key={r.id} className="flex items-start gap-3 rounded-[7px] border border-[#E5E5E2] bg-[#FAFAF8] px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                      <span className="text-[11px] font-semibold text-[#1A1A1A]">{r.title}</span>
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                        style={{ color: URGENCY_COLOR[r.urgency], background: `${URGENCY_COLOR[r.urgency]}15` }}>
                        {URGENCY_LABEL[r.urgency]}
                      </span>
                    </div>
                    <p className="text-[10px] text-[#6B6B65]">{r.rationale}</p>
                    <p className="text-[10px] text-[#16A34A] font-medium mt-0.5">{r.expectedImpact}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[9px] text-[#9B9B95]">{r.department}</div>
                    <div className="text-[9px] text-[#9B9B95]">Esforço: {EFFORT_LABEL[r.effort]}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cross-dept summary */}
          {canvas.deptSummaries.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-2">
                Resumo Cross-Departamental
              </div>
              <div className="grid grid-cols-3 gap-2">
                {canvas.deptSummaries.map((d, i) => (
                  <div key={i} className="rounded-[7px] border border-[#E5E5E2] bg-[#FAFAF8] px-3 py-2">
                    <div className="text-[10px] font-semibold text-[#1A1A1A] mb-0.5">{d.department}</div>
                    <div className="text-[11px] font-bold text-[#0284C7]">{d.keyMetricValue}</div>
                    <div className="text-[9px] text-[#9B9B95]">{d.keyMetric}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Key Insights */}
          {canvas.keyInsights.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-1.5">Insights-chave</div>
              <div className="space-y-1">
                {canvas.keyInsights.map((insight, i) => (
                  <div key={i} className="flex items-start gap-2 text-[11px] text-[#1A1A1A]">
                    <span className="text-[#0284C7] shrink-0 mt-0.5">→</span>
                    <span>{insight}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Alert Thresholds */}
          {canvas.alertThresholds.length > 0 && (
            <div className="rounded-[8px] bg-[#FEF3C7] border border-[#FDE68A] px-3 py-2.5">
              <div className="text-[9px] font-semibold text-[#D97706] uppercase tracking-[0.05em] mb-1">Limites de Alerta</div>
              <div className="space-y-0.5">
                {canvas.alertThresholds.map((t, i) => (
                  <p key={i} className="text-[11px] text-[#92400E]">⚠ {t}</p>
                ))}
              </div>
            </div>
          )}

          {/* Quality Gate */}
          <div>
            <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-2">
              Quality Gate — {qg.overall} ({qg.passCount} pass · {qg.warningCount} warn · {qg.failCount} fail)
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {qg.items.map((item) => (
                <div key={item.id} className="flex items-start gap-1.5 text-[11px]" title={item.detail}>
                  <span className={`shrink-0 font-bold text-[13px] leading-tight ${
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

          {/* Cognitive Flow */}
          <div>
            <div className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-2">Fluxo Cognitivo</div>
            <div className="grid grid-cols-3 gap-1 sm:grid-cols-4">
              {canvas.cognitiveFlowTrace.map((step) => (
                <div key={step.stepId} className="flex items-start gap-1 text-[9px]" title={step.summary}>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-0.5 ${step.completed ? "bg-[#0284C7]" : "bg-[#D0D0CC]"}`} />
                  <span className={step.completed ? "text-[#0284C7]" : "text-[#C0C0BC]"}>
                    {step.order}. {step.label.split(" ")[0]}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* FAIL blocker */}
          {isFail && canvas.status === "draft" && (
            <div className="rounded-[8px] bg-[#FEE2E2] border border-[#FECACA] px-4 py-3">
              <p className="text-[12px] font-semibold text-[#DC2626]">Analytics Canvas com FAIL no Quality Gate</p>
              <p className="text-[11px] text-[#991B1B] mt-0.5">
                Corrija os itens reprovados antes de aprovar. Verifique KPIs, modelo de atribuição e recomendações.
              </p>
            </div>
          )}

          {/* Approve / Reject actions */}
          {(onApprove || onReject) && (
            <div className="border-t border-[#F0F0ED] pt-3 space-y-2">
              {showNote && (
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Nota de revisão (opcional)"
                  rows={2}
                  className="w-full px-3 py-2 text-[12px] border border-[#E5E5E2] rounded-[7px] outline-none focus:border-[#0284C7] resize-none"
                />
              )}
              <div className="flex items-center gap-2 flex-wrap">
                {onApprove && (
                  <button
                    onClick={() => { onApprove(note || undefined); setNote(""); setShowNote(false); }}
                    disabled={isFail}
                    className={`h-8 px-4 rounded-[7px] text-[12px] font-medium transition-colors ${
                      isFail
                        ? "bg-[#F0F0ED] text-[#C0C0BC] cursor-not-allowed"
                        : "bg-[#16A34A] hover:bg-[#15803D] text-white"
                    }`}
                    title={isFail ? "Quality Gate FAIL — não pode aprovar" : undefined}
                  >
                    Aprovar
                  </button>
                )}
                {onReject && (
                  <button
                    onClick={() => { if (note.trim()) { onReject(note); setNote(""); setShowNote(false); } else setShowNote(true); }}
                    className="h-8 px-4 rounded-[7px] border border-[#E5E5E2] text-[#9B9B95] hover:border-[#DC2626] hover:text-[#DC2626] text-[12px] font-medium transition-colors"
                  >
                    {showNote && note.trim() ? "Confirmar rejeição" : "Rejeitar"}
                  </button>
                )}
                <button
                  onClick={() => setShowNote((x) => !x)}
                  className="h-8 px-3 rounded-[7px] border border-[#E5E5E2] text-[#9B9B95] hover:text-[#1A1A1A] text-[11px] transition-colors"
                >
                  {showNote ? "Ocultar nota" : "Adicionar nota"}
                </button>
                {canvas.status !== "draft" && onProposeBrainChange && (
                  brainChangeCreated ? (
                    <span className="h-7 px-3 rounded-full bg-[#DCFCE7] text-[#16A34A] text-[10px] font-semibold flex items-center gap-1">
                      ✓ Brain Change criado
                    </span>
                  ) : (
                    <button
                      onClick={onProposeBrainChange}
                      className="h-8 px-3 rounded-[7px] border border-[#070A1F] text-[#070A1F] hover:bg-[#E6FBFA] text-[11px] font-medium transition-colors"
                    >
                      ✦ Propor Brain Change
                    </button>
                  )
                )}
                {canvas.reviewNote && (
                  <span className="text-[10px] text-[#6B6B65] italic ml-auto">Nota: {canvas.reviewNote}</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
