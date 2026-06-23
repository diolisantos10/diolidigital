"use client";

import { useState } from "react";
import type { DesignCanvas, DesignAssetStatus } from "@/lib/dioli-brain/design-canvas";

const STATUS_STYLE: Record<DesignCanvas["status"], { bg: string; text: string; label: string }> = {
  draft:    { bg: "bg-[#F0F0ED]", text: "text-[#6B6B65]", label: "Rascunho" },
  approved: { bg: "bg-[#DCFCE7]", text: "text-[#16A34A]", label: "Aprovado" },
  rejected: { bg: "bg-[#FEE2E2]", text: "text-[#DC2626]", label: "Rejeitado" },
};

const QG_STYLE = {
  PASS:    { badge: "bg-[#16A34A]", bg: "bg-[#DCFCE7]", border: "border-[#86EFAC]", text: "text-[#166534]" },
  WARNING: { badge: "bg-[#D97706]", bg: "bg-[#FEF3C7]", border: "border-[#FDE68A]", text: "text-[#92400E]" },
  FAIL:    { badge: "bg-[#DC2626]", bg: "bg-[#FEE2E2]", border: "border-[#FECACA]", text: "text-[#991B1B]" },
} as const;

const ASSET_STATUS_STYLE: Record<DesignAssetStatus, { bg: string; text: string; label: string }> = {
  pending:     { bg: "bg-[#F0F0ED]",  text: "text-[#6B6B65]", label: "Pendente" },
  in_progress: { bg: "bg-[#E6FBFA]",  text: "text-[#070A1F]", label: "Em produção" },
  review:      { bg: "bg-[#FEF3C7]",  text: "text-[#D97706]", label: "Em revisão" },
  approved:    { bg: "bg-[#DCFCE7]",  text: "text-[#16A34A]", label: "Aprovado" },
  published:   { bg: "bg-[#FDF2F8]",  text: "text-[#DB2777]", label: "Publicado" },
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

function BulletList({ items, markerClass = "text-[#9B9B95]" }: { items: string[]; markerClass?: string }) {
  return (
    <div className="space-y-0.5">
      {items.map((item, i) => (
        <p key={i} className="flex items-start gap-1.5 text-[11px] text-[#1A1A1A] leading-relaxed">
          <span className={`shrink-0 ${markerClass}`}>•</span>{item}
        </p>
      ))}
    </div>
  );
}

export interface DesignCanvasCardProps {
  canvas: DesignCanvas;
  onApprove?: (note?: string) => void;
  onReject?: (note?: string) => void;
  onProposeBrainChange?: () => void;
  onSetAssetStatus?: (assetId: string, status: DesignAssetStatus) => void;
  brainChangeCreated?: boolean;
}

export function DesignCanvasCard({
  canvas,
  onApprove,
  onReject,
  onProposeBrainChange,
  onSetAssetStatus,
  brainChangeCreated,
}: DesignCanvasCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState("");
  const [showNoteInput, setShowNoteInput] = useState<"approve" | "reject" | null>(null);

  const st = STATUS_STYLE[canvas.status];
  const qg = canvas.qualityGateResult;
  const qgStyle = QG_STYLE[qg.overall];
  const isReviewed = canvas.status !== "draft";
  const canApprove = onApprove && canvas.status === "draft";
  const canReject  = onReject  && canvas.status === "draft";

  function submitNote(action: "approve" | "reject") {
    if (action === "approve") onApprove?.(note.trim() || undefined);
    else onReject?.(note.trim() || undefined);
    setNote("");
    setShowNoteInput(null);
  }

  return (
    <div className="rounded-[10px] border border-[#E8E8E2] bg-white overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 flex items-start justify-between gap-3 bg-[#FAFAF8]">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-[#1A1A1A] truncate">{canvas.clientName}</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${st.bg} ${st.text}`}>{st.label}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${qgStyle.badge}`}>
              QG {qg.overall} {qg.passCount}/{qg.passCount + qg.warningCount + qg.failCount}
            </span>
            {canvas.source === "simulation" && (
              <span className="text-[10px] text-[#9B9B95] bg-[#F0F0ED] px-2 py-0.5 rounded-full">Simulação</span>
            )}
          </div>
          <p className="text-[11px] text-[#6B6B65] mt-0.5">{canvas.segment} · {new Date(canvas.createdAt).toLocaleDateString("pt-BR")}</p>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="shrink-0 text-[11px] text-[#070A1F] hover:underline"
        >
          {expanded ? "Fechar" : "Ver canvas"}
        </button>
      </div>

      {/* FAIL blocker banner */}
      {qg.overall === "FAIL" && canvas.status === "draft" && (
        <div className="px-4 py-2 bg-[#FEE2E2] border-b border-[#FECACA]">
          <p className="text-[11px] font-medium text-[#991B1B]">
            ⚠ Quality Gate FAIL — aprovação bloqueada. Corrija os itens abaixo antes de prosseguir.
          </p>
        </div>
      )}

      {/* Quick summary (always visible) */}
      <div className="px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4 border-b border-[#E8E8E2]">
        <div>
          <div className="text-[9px] text-[#9B9B95] uppercase tracking-wider">Briefs</div>
          <div className="text-[13px] font-semibold text-[#1A1A1A]">{canvas.creativeBriefs.length}</div>
        </div>
        <div>
          <div className="text-[9px] text-[#9B9B95] uppercase tracking-wider">Prompts</div>
          <div className="text-[13px] font-semibold text-[#1A1A1A]">{canvas.imagePromptSpecs.length}</div>
        </div>
        <div>
          <div className="text-[9px] text-[#9B9B95] uppercase tracking-wider">Assets</div>
          <div className="text-[13px] font-semibold text-[#1A1A1A]">{canvas.totalAssetsRequired}</div>
        </div>
        <div>
          <div className="text-[9px] text-[#9B9B95] uppercase tracking-wider">QG Pass</div>
          <div className="text-[13px] font-semibold text-[#1A1A1A]">{qg.passCount}/{qg.items.length}</div>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 py-4 space-y-5 border-b border-[#E8E8E2]">

          {/* Visual Direction */}
          <Section title="Direção Visual">
            <div className="space-y-2 text-[11px] text-[#1A1A1A]">
              <p><span className="font-semibold text-[#6B6B65]">Conceito:</span> {canvas.visualConcept}</p>
              <p><span className="font-semibold text-[#6B6B65]">Tom:</span> {canvas.visualTone}</p>
              <p><span className="font-semibold text-[#6B6B65]">Cor:</span> {canvas.colorDirection}</p>
              <p><span className="font-semibold text-[#6B6B65]">Tipografia:</span> {canvas.typographyDirection}</p>
              <p><span className="font-semibold text-[#6B6B65]">Imagem:</span> {canvas.imageryDirection}</p>
            </div>
          </Section>

          {/* Brand Consistency Rules */}
          <Section title="Regras de Marca">
            <BulletList items={canvas.brandConsistencyRules} markerClass="text-[#EA580C]" />
          </Section>

          {/* Creative Briefs */}
          <Section title={`Briefs Criativos (${canvas.creativeBriefs.length})`}>
            <div className="space-y-3">
              {canvas.creativeBriefs.map((brief) => (
                <div key={brief.id} className="rounded-[8px] border border-[#E8E8E2] bg-[#FAFAF8] p-3 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[12px] font-semibold text-[#1A1A1A]">{brief.themeTitle}</span>
                    <span className="text-[10px] bg-[#E6FBFA] text-[#070A1F] px-2 py-0.5 rounded-full">{brief.pillar}</span>
                    <span className="text-[10px] bg-[#F0F0ED] text-[#6B6B65] px-2 py-0.5 rounded-full">{brief.format}</span>
                    <span className="text-[10px] bg-[#F0F0ED] text-[#6B6B65] px-2 py-0.5 rounded-full">{brief.channel}</span>
                  </div>
                  <p className="text-[11px] text-[#6B6B65]"><span className="font-semibold">Conceito:</span> {brief.visualConcept}</p>
                  <p className="text-[11px] text-[#6B6B65]"><span className="font-semibold">Mensagem:</span> {brief.keyMessage}</p>
                  <p className="text-[11px] text-[#6B6B65]"><span className="font-semibold">Tom:</span> {brief.toneOfVoice}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[9px] font-semibold text-[#16A34A] uppercase tracking-wider mb-1">Fazer</p>
                      {brief.doList.map((d, i) => (
                        <p key={i} className="text-[10px] text-[#1A1A1A]">✓ {d}</p>
                      ))}
                    </div>
                    <div>
                      <p className="text-[9px] font-semibold text-[#DC2626] uppercase tracking-wider mb-1">Não fazer</p>
                      {brief.dontList.map((d, i) => (
                        <p key={i} className="text-[10px] text-[#1A1A1A]">✗ {d}</p>
                      ))}
                    </div>
                  </div>
                  <p className="text-[10px] text-[#9B9B95]">Referência: {brief.referenceStyle}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* Image Prompt Specs */}
          <Section title={`Prompts de Imagem (${canvas.imagePromptSpecs.length})`}>
            <div className="space-y-3">
              {canvas.imagePromptSpecs.map((spec) => (
                <div key={spec.id} className="rounded-[8px] border border-[#E8E8E2] bg-[#FAFAF8] p-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] bg-[#F0F0ED] text-[#6B6B65] px-2 py-0.5 rounded-full">{spec.aspectRatio}</span>
                    <span className="text-[10px] text-[#9B9B95]">{spec.mood}</span>
                  </div>
                  <div className="rounded bg-[#1A1A1A] p-2">
                    <p className="text-[10px] text-[#C0C0BA] font-mono leading-relaxed">{spec.promptPrimary}</p>
                  </div>
                  <p className="text-[10px] text-[#DC2626] font-mono">— {spec.promptNegative}</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {spec.colorPalette.map((c, i) => (
                      <span key={i} className="text-[10px] bg-[#E6FBFA] text-[#070A1F] px-1.5 py-0.5 rounded">{c}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Asset Requirements */}
          <Section title={`Assets Requeridos (${canvas.assetRequirements.length})`}>
            <div className="space-y-2">
              {canvas.assetRequirements.map((asset) => {
                const as = ASSET_STATUS_STYLE[asset.status];
                return (
                  <div key={asset.id} className="flex items-center justify-between gap-2 rounded-[6px] bg-[#F8F8F5] px-3 py-2 text-[11px]">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${PRIORITY_STYLE[asset.priority]}`}>{asset.priority}</span>
                      <span className="font-medium text-[#1A1A1A]">{asset.assetType.replace("_", " ")}</span>
                      <span className="text-[#9B9B95]">{asset.channel} · {asset.dimensions}</span>
                    </div>
                    {onSetAssetStatus && canvas.status === "approved" ? (
                      <select
                        value={asset.status}
                        onChange={(e) => onSetAssetStatus(asset.id, e.target.value as DesignAssetStatus)}
                        className="text-[10px] border border-[#E8E8E2] rounded-[5px] px-1.5 py-0.5 bg-white"
                      >
                        {(Object.keys(ASSET_STATUS_STYLE) as DesignAssetStatus[]).map((s) => (
                          <option key={s} value={s}>{ASSET_STATUS_STYLE[s].label}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${as.bg} ${as.text}`}>{as.label}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>

          {/* Production Notes */}
          {canvas.productionNotes.length > 0 && (
            <Section title="Notas de Produção">
              <BulletList items={canvas.productionNotes} />
            </Section>
          )}

          {/* Quality Gate */}
          <Section title="Quality Gate">
            <div className={`rounded-[8px] border ${qgStyle.border} ${qgStyle.bg} p-3`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-[11px] font-bold text-white px-2 py-0.5 rounded-full ${qgStyle.badge}`}>
                  {qg.overall}
                </span>
                <span className={`text-[11px] font-medium ${qgStyle.text}`}>
                  {qg.passCount} PASS · {qg.warningCount} WARNING · {qg.failCount} FAIL
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {qg.items.map((item) => (
                  <div key={item.id} className="flex items-start gap-1.5 text-[10px]">
                    <span className={
                      item.status === "PASS" ? "text-[#16A34A] font-bold shrink-0" :
                      item.status === "WARNING" ? "text-[#D97706] font-bold shrink-0" :
                      "text-[#DC2626] font-bold shrink-0"
                    }>
                      {item.status === "PASS" ? "✓" : item.status === "WARNING" ? "⚠" : "✗"}
                    </span>
                    <span className="text-[#1A1A1A] leading-tight">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          {/* Cognitive Flow Trace */}
          <Section title="Fluxo Cognitivo">
            <div className="flex flex-wrap gap-1">
              {canvas.cognitiveFlowTrace.map((step) => (
                <span
                  key={step.stepId}
                  title={step.summary}
                  className={`text-[9px] px-2 py-0.5 rounded-full border ${
                    step.completed
                      ? "bg-[#DCFCE7] text-[#166534] border-[#86EFAC]"
                      : "bg-[#F0F0ED] text-[#6B6B65] border-[#E8E8E2]"
                  }`}
                >
                  {step.order}. {step.label}
                </span>
              ))}
            </div>
          </Section>

          {/* Review note */}
          {canvas.reviewNote && (
            <Section title="Nota de Revisão">
              <p className="text-[11px] text-[#1A1A1A] bg-[#FEF3C7] rounded-[6px] px-3 py-2">{canvas.reviewNote}</p>
            </Section>
          )}
        </div>
      )}

      {/* Actions */}
      {(canApprove || canReject || onProposeBrainChange) && (
        <div className="px-4 py-3 flex items-center gap-2 flex-wrap bg-[#FAFAF8]">
          {showNoteInput ? (
            <div className="flex-1 flex items-center gap-2">
              <input
                className="flex-1 text-[11px] border border-[#E8E8E2] rounded-[6px] px-2 py-1.5 outline-none focus:border-[#070A1F]"
                placeholder={showNoteInput === "approve" ? "Nota de aprovação (opcional)" : "Motivo da rejeição"}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <button
                onClick={() => submitNote(showNoteInput)}
                className={`text-[11px] font-medium px-3 py-1.5 rounded-[6px] ${
                  showNoteInput === "approve"
                    ? "bg-[#16A34A] text-white hover:bg-[#15803D]"
                    : "bg-[#DC2626] text-white hover:bg-[#B91C1C]"
                }`}
              >
                Confirmar
              </button>
              <button
                onClick={() => setShowNoteInput(null)}
                className="text-[11px] text-[#6B6B65] hover:text-[#1A1A1A]"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <>
              {canApprove && (
                <button
                  disabled={qg.overall === "FAIL"}
                  onClick={() => setShowNoteInput("approve")}
                  className={`text-[11px] font-medium px-3 py-1.5 rounded-[6px] transition-colors ${
                    qg.overall === "FAIL"
                      ? "bg-[#F0F0ED] text-[#9B9B95] cursor-not-allowed"
                      : "bg-[#16A34A] text-white hover:bg-[#15803D]"
                  }`}
                >
                  {qg.overall === "FAIL" ? "Aprovação bloqueada" : "Aprovar"}
                </button>
              )}
              {canReject && (
                <button
                  onClick={() => setShowNoteInput("reject")}
                  className="text-[11px] font-medium px-3 py-1.5 rounded-[6px] bg-[#FEE2E2] text-[#DC2626] hover:bg-[#FECACA]"
                >
                  Rejeitar
                </button>
              )}
              {onProposeBrainChange && isReviewed && (
                <button
                  onClick={onProposeBrainChange}
                  disabled={brainChangeCreated}
                  className={`text-[11px] font-medium px-3 py-1.5 rounded-[6px] transition-colors ${
                    brainChangeCreated
                      ? "bg-[#E6FBFA] text-[#9B9B95] cursor-default"
                      : "bg-[#E6FBFA] text-[#070A1F] hover:bg-[#E0E3FF]"
                  }`}
                >
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
