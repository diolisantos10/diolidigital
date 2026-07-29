"use client";

// Shared presentational section for the Operational UI Bridge.
// Renders the DB pipeline queue for a department: loading/error/empty states,
// per-request Generate → preview → QG badge → Approve. Department-specific
// canvas generation and approval live in each page; this component only renders.

import type { ReactNode } from "react";
import type { DbRequest } from "@/lib/agency/db-pipeline-hooks";

interface Qg {
  overall: "PASS" | "WARNING" | "FAIL" | "BLOCKED";
}

interface DbPipelineSectionProps<C> {
  title: string;
  dbQueue: DbRequest[];
  dbLoading: boolean;
  dbError: string | null;
  dbError2: string | null;
  canvases: Record<string, C>;
  generatingId: string | null;
  approvingId: string | null;
  onGenerate: (req: DbRequest) => void;
  onApprove: (req: DbRequest) => void;
  getQg: (canvas: C) => Qg | null | undefined;
  renderPreview: (canvas: C) => ReactNode;
}

function qgClass(overall: string): string {
  return overall === "PASS"
    ? "bg-[var(--success)]"
    : overall === "WARNING"
      ? "bg-[var(--warning)]"
      : "bg-[var(--danger)]";
}

export function DbPipelineSection<C>({
  title,
  dbQueue,
  dbLoading,
  dbError,
  dbError2,
  canvases,
  generatingId,
  approvingId,
  onGenerate,
  onApprove,
  getQg,
  renderPreview,
}: DbPipelineSectionProps<C>) {
  // Hide the entire section when empty (no loading, no error, no items).
  if (!dbLoading && !dbError && dbQueue.length === 0) return null;

  return (
    <div className="bg-white rounded-[10px] border border-[var(--cyan)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 bg-[var(--accent-light)] border-b border-[var(--cyan)]">
        <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">{title}</h2>
        <span className="h-5 px-2 rounded-full bg-white text-[var(--navy)] text-[10px] font-semibold flex items-center border border-[var(--cyan)]">
          {dbQueue.length}
        </span>
        <span className="h-5 px-2 rounded-full bg-[var(--navy)] text-white text-[10px] font-semibold flex items-center">
          ✦ Dioli Brain
        </span>
      </div>

      {dbLoading && (
        <div className="px-5 py-6 flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
          <span className="w-3.5 h-3.5 border-2 border-[var(--cyan)] border-t-[var(--navy)] rounded-full animate-spin" />
          Carregando fila do banco…
        </div>
      )}

      {dbError && !dbLoading && (
        <div className="px-5 py-3 bg-[#FEE2E2]">
          <p className="text-[11px] text-[#991B1B]">{dbError}</p>
        </div>
      )}

      {dbError2 && (
        <div className="px-5 py-2 bg-[#FEE2E2] border-b border-[#FECACA]">
          <p className="text-[11px] text-[#991B1B]">{dbError2}</p>
        </div>
      )}

      {!dbLoading && !dbError && (
        <div className="divide-y divide-[var(--border)]">
          {dbQueue.map((req) => {
            const canvas = canvases[req.id];
            const qg = canvas ? getQg(canvas) : null;
            return (
              <div key={req.id} className="px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-semibold text-[var(--text-primary)]">{req.businessName}</span>
                      {req.segment && (
                        <span className="h-5 px-2 rounded-full bg-[var(--accent)] text-[var(--text-secondary)] text-[10px] font-medium">{req.segment}</span>
                      )}
                      <span className="h-5 px-2 rounded-full bg-[var(--accent-light)] text-[var(--navy)] text-[10px] font-semibold">{req.status}</span>
                      {qg && (
                        <span className={`h-5 px-2 rounded-full text-white text-[9px] font-bold flex items-center ${qgClass(qg.overall)}`}>
                          QG {qg.overall}
                        </span>
                      )}
                    </div>
                  </div>
                  {!canvas ? (
                    <button
                      onClick={() => onGenerate(req)}
                      disabled={generatingId === req.id}
                      className="h-8 px-4 rounded-[7px] bg-[var(--navy)] hover:bg-[#0D1230] disabled:opacity-50 text-white text-[12px] font-medium transition-colors shrink-0"
                    >
                      {generatingId === req.id ? "Gerando…" : "✦ Generate"}
                    </button>
                  ) : (
                    <button
                      onClick={() => onApprove(req)}
                      disabled={approvingId === req.id || qg?.overall === "FAIL"}
                      className="h-8 px-4 rounded-[7px] bg-[var(--success)] hover:bg-[#15803D] disabled:opacity-50 text-white text-[12px] font-medium transition-colors shrink-0"
                    >
                      {approvingId === req.id ? "Aprovando…" : "Approve →"}
                    </button>
                  )}
                </div>
                {canvas && (
                  <dl className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[var(--bg)] rounded-[8px] px-4 py-3">
                    {renderPreview(canvas)}
                  </dl>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Small preview field helper for consistent <dt>/<dd> styling.
export function PreviewField({
  label,
  value,
  span,
}: {
  label: string;
  value: ReactNode;
  span?: 2 | 3;
}) {
  const cls = span === 3 ? "sm:col-span-3" : span === 2 ? "sm:col-span-2" : "";
  return (
    <div className={cls}>
      <dt className="text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">{label}</dt>
      <dd className="text-[11px] text-[var(--text-primary)] leading-snug mt-0.5">{value}</dd>
    </div>
  );
}
