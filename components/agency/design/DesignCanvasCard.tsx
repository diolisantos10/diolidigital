"use client";

import { useState } from "react";
import type { DesignCanvas, DesignAssetStatus } from "@/lib/dioli-brain/design-canvas";

const STATUS_STYLE: Record<DesignCanvas["status"], { bg: string; text: string; label: string }> = {
  draft:    { bg: "bg-[var(--accent)]", text: "text-[var(--text-secondary)]", label: "Rascunho" },
  approved: { bg: "bg-[var(--success-bg)]", text: "text-[var(--success)]", label: "Aprovado" },
  rejected: { bg: "bg-[#FEE2E2]", text: "text-[var(--danger)]", label: "Rejeitado" },
};

const QG_STYLE = {
  PASS:    { badge: "bg-[var(--success)]", bg: "bg-[var(--success-bg)]", border: "border-[#86EFAC]", text: "text-[#166534]" },
  WARNING: { badge: "bg-[var(--warning)]", bg: "bg-[var(--warning-bg)]", border: "border-[#FDE68A]", text: "text-[#92400E]" },
  FAIL:    { badge: "bg-[var(--danger)]", bg: "bg-[#FEE2E2]", border: "border-[#FECACA]", text: "text-[#991B1B]" },
} as const;

const ASSET_STATUS_STYLE: Record<DesignAssetStatus, { bg: string; text: string; label: string }> = {
  pending:     { bg: "bg-[var(--accent)]",  text: "text-[var(--text-secondary)]", label: "Pendente" },
  in_progress: { bg: "bg-[var(--accent-light)]",  text: "text-[var(--navy)]", label: "Em produção" },
  review:      { bg: "bg-[var(--warning-bg)]",  text: "text-[var(--warning)]", label: "Em revisão" },
  approved:    { bg: "bg-[var(--success-bg)]",  text: "text-[var(--success)]", label: "Aprovado" },
  published:   { bg: "bg-[#E9EFFF]",  text: "text-[#0057FF]", label: "Publicado" },
};

const PRIORITY_STYLE: Record<string, string> = {
  alta:  "bg-[#E9EFFF] text-[#0057FF]",
  media: "bg-[var(--warning-bg)] text-[var(--warning)]",
  baixa: "bg-[var(--accent)] text-[var(--text-secondary)]",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em] mb-1">{title}</div>
      {children}
    </div>
  );
}

function BulletList({ items, markerClass = "text-[var(--text-muted)]" }: { items: string[]; markerClass?: string }) {
  return (
    <div className="space-y-0.5">
      {items.map((item, i) => (
        <p key={i} className="flex items-start gap-1.5 text-[11px] text-[var(--text-primary)] leading-relaxed">
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
    <div className="rounded-[10px] border border-[var(--border)] bg-white overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 flex items-start justify-between gap-3 bg-[var(--bg-elevated)]">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{canvas.clientName}</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${st.bg} ${st.text}`}>{st.label}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${qgStyle.badge}`}>
              QG {qg.overall} {qg.passCount}/{qg.passCount + qg.warningCount + qg.failCount}
            </span>
            {canvas.source === "simulation" && (
              <span className="text-[10px] text-[var(--text-muted)] bg-[var(--accent)] px-2 py-0.5 rounded-full">Simulação</span>
            )}
          </div>
          <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">{canvas.segment} · {new Date(canvas.createdAt).toLocaleDateString("pt-BR")}</p>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="shrink-0 text-[11px] text-[var(--navy)] hover:underline"
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
      <div className="px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4 border-b border-[var(--border)]">
        <div>
          <div className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">Briefs</div>
          <div className="text-[13px] font-semibold text-[var(--text-primary)]">{canvas.creativeBriefs.length}</div>
        </div>
        <div>
          <div className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">Prompts</div>
          <div className="text-[13px] font-semibold text-[var(--text-primary)]">{canvas.imagePromptSpecs.length}</div>
        </div>
        <div>
          <div className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">Assets</div>
          <div className="text-[13px] font-semibold text-[var(--text-primary)]">{canvas.totalAssetsRequired}</div>
        </div>
        <div>
          <div className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">QG Pass</div>
          <div className="text-[13px] font-semibold text-[var(--text-primary)]">{qg.passCount}/{qg.items.length}</div>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 py-4 space-y-5 border-b border-[var(--border)]">

          {/* Visual Direction */}
          <Section title="Direção Visual">
            <div className="space-y-2 text-[11px] text-[var(--text-primary)]">
              <p><span className="font-semibold text-[var(--text-secondary)]">Conceito:</span> {canvas.visualConcept}</p>
              <p><span className="font-semibold text-[var(--text-secondary)]">Tom:</span> {canvas.visualTone}</p>
              <p><span className="font-semibold text-[var(--text-secondary)]">Cor:</span> {canvas.colorDirection}</p>
              <p><span className="font-semibold text-[var(--text-secondary)]">Tipografia:</span> {canvas.typographyDirection}</p>
              <p><span className="font-semibold text-[var(--text-secondary)]">Imagem:</span> {canvas.imageryDirection}</p>
            </div>
          </Section>

          {/* Brand Consistency Rules */}
          <Section title="Regras de Marca">
            <BulletList items={canvas.brandConsistencyRules} markerClass="text-[#0891B2]" />
          </Section>

          {/* Creative Briefs */}
          <Section title={`Briefs Criativos (${canvas.creativeBriefs.length})`}>
            <div className="space-y-3">
              {canvas.creativeBriefs.map((brief) => (
                <div key={brief.id} className="rounded-[8px] border border-[var(--border)] bg-[var(--bg-elevated)] p-3 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[12px] font-semibold text-[var(--text-primary)]">{brief.themeTitle}</span>
                    <span className="text-[10px] bg-[var(--accent-light)] text-[var(--navy)] px-2 py-0.5 rounded-full">{brief.pillar}</span>
                    <span className="text-[10px] bg-[var(--accent)] text-[var(--text-secondary)] px-2 py-0.5 rounded-full">{brief.format}</span>
                    <span className="text-[10px] bg-[var(--accent)] text-[var(--text-secondary)] px-2 py-0.5 rounded-full">{brief.channel}</span>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)]"><span className="font-semibold">Conceito:</span> {brief.visualConcept}</p>
                  <p className="text-[11px] text-[var(--text-secondary)]"><span className="font-semibold">Mensagem:</span> {brief.keyMessage}</p>
                  <p className="text-[11px] text-[var(--text-secondary)]"><span className="font-semibold">Tom:</span> {brief.toneOfVoice}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[9px] font-semibold text-[var(--success)] uppercase tracking-wider mb-1">Fazer</p>
                      {brief.doList.map((d, i) => (
                        <p key={i} className="text-[10px] text-[var(--text-primary)]">✓ {d}</p>
                      ))}
                    </div>
                    <div>
                      <p className="text-[9px] font-semibold text-[var(--danger)] uppercase tracking-wider mb-1">Não fazer</p>
                      {brief.dontList.map((d, i) => (
                        <p key={i} className="text-[10px] text-[var(--text-primary)]">✗ {d}</p>
                      ))}
                    </div>
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)]">Referência: {brief.referenceStyle}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* Image Prompt Specs */}
          <Section title={`Prompts de Imagem (${canvas.imagePromptSpecs.length})`}>
            <div className="space-y-3">
              {canvas.imagePromptSpecs.map((spec) => (
                <div key={spec.id} className="rounded-[8px] border border-[var(--border)] bg-[var(--bg-elevated)] p-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] bg-[var(--accent)] text-[var(--text-secondary)] px-2 py-0.5 rounded-full">{spec.aspectRatio}</span>
                    <span className="text-[10px] text-[var(--text-muted)]">{spec.mood}</span>
                  </div>
                  <div className="rounded bg-[var(--text-primary)] p-2">
                    <p className="text-[10px] text-[var(--text-subtle)] font-mono leading-relaxed">{spec.promptPrimary}</p>
                  </div>
                  <p className="text-[10px] text-[var(--danger)] font-mono">— {spec.promptNegative}</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {spec.colorPalette.map((c, i) => (
                      <span key={i} className="text-[10px] bg-[var(--accent-light)] text-[var(--navy)] px-1.5 py-0.5 rounded">{c}</span>
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
                  <div key={asset.id} className="flex items-center justify-between gap-2 rounded-[6px] bg-[var(--bg)] px-3 py-2 text-[11px]">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${PRIORITY_STYLE[asset.priority]}`}>{asset.priority}</span>
                      <span className="font-medium text-[var(--text-primary)]">{asset.assetType.replace("_", " ")}</span>
                      <span className="text-[var(--text-muted)]">{asset.channel} · {asset.dimensions}</span>
                    </div>
                    {onSetAssetStatus && canvas.status === "approved" ? (
                      <select
                        value={asset.status}
                        onChange={(e) => onSetAssetStatus(asset.id, e.target.value as DesignAssetStatus)}
                        className="text-[10px] border border-[var(--border)] rounded-[5px] px-1.5 py-0.5 bg-white"
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
                      item.status === "PASS" ? "text-[var(--success)] font-bold shrink-0" :
                      item.status === "WARNING" ? "text-[var(--warning)] font-bold shrink-0" :
                      "text-[var(--danger)] font-bold shrink-0"
                    }>
                      {item.status === "PASS" ? "✓" : item.status === "WARNING" ? "⚠" : "✗"}
                    </span>
                    <span className="text-[var(--text-primary)] leading-tight">{item.label}</span>
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
                      ? "bg-[var(--success-bg)] text-[#166534] border-[#86EFAC]"
                      : "bg-[var(--accent)] text-[var(--text-secondary)] border-[var(--border)]"
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
              <p className="text-[11px] text-[var(--text-primary)] bg-[var(--warning-bg)] rounded-[6px] px-3 py-2">{canvas.reviewNote}</p>
            </Section>
          )}
        </div>
      )}

      {/* Actions */}
      {(canApprove || canReject || onProposeBrainChange) && (
        <div className="px-4 py-3 flex items-center gap-2 flex-wrap bg-[var(--bg-elevated)]">
          {showNoteInput ? (
            <div className="flex-1 flex items-center gap-2">
              <input
                className="flex-1 text-[11px] border border-[var(--border)] rounded-[6px] px-2 py-1.5 outline-none focus:border-[var(--navy)]"
                placeholder={showNoteInput === "approve" ? "Nota de aprovação (opcional)" : "Motivo da rejeição"}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <button
                onClick={() => submitNote(showNoteInput)}
                className={`text-[11px] font-medium px-3 py-1.5 rounded-[6px] ${
                  showNoteInput === "approve"
                    ? "bg-[var(--success)] text-white hover:bg-[#15803D]"
                    : "bg-[var(--danger)] text-white hover:bg-[#B91C1C]"
                }`}
              >
                Confirmar
              </button>
              <button
                onClick={() => setShowNoteInput(null)}
                className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
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
                      ? "bg-[var(--accent)] text-[var(--text-muted)] cursor-not-allowed"
                      : "bg-[var(--success)] text-white hover:bg-[#15803D]"
                  }`}
                >
                  {qg.overall === "FAIL" ? "Aprovação bloqueada" : "Aprovar"}
                </button>
              )}
              {canReject && (
                <button
                  onClick={() => setShowNoteInput("reject")}
                  className="text-[11px] font-medium px-3 py-1.5 rounded-[6px] bg-[#FEE2E2] text-[var(--danger)] hover:bg-[#FECACA]"
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
                      ? "bg-[var(--accent-light)] text-[var(--text-muted)] cursor-default"
                      : "bg-[var(--accent-light)] text-[var(--navy)] hover:bg-[#E6EEFF]"
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
