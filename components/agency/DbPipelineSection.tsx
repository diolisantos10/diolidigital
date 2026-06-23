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
    ? "bg-[#16A34A]"
    : overall === "WARNING"
      ? "bg-[#D97706]"
      : "bg-[#DC2626]";
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
    <div className="bg-white rounded-[10px] border border-[#DDD6FE] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 bg-[#F5F3FF] border-b border-[#DDD6FE]">
        <h2 className="text-[14px] font-semibold text-[#1A1A1A]">{title}</h2>
        <span className="h-5 px-2 rounded-full bg-white text-[#7C3AED] text-[10px] font-semibold flex items-center border border-[#DDD6FE]">
          {dbQueue.length}
        </span>
        <span className="h-5 px-2 rounded-full bg-[#7C3AED] text-white text-[10px] font-semibold flex items-center">
          ✦ Dioli Brain
        </span>
      </div>

      {dbLoading && (
        <div className="px-5 py-6 flex items-center gap-2 text-[12px] text-[#9B9B95]">
          <span className="w-3.5 h-3.5 border-2 border-[#DDD6FE] border-t-[#7C3AED] rounded-full animate-spin" />
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
        <div className="divide-y divide-[#F0F0ED]">
          {dbQueue.map((req) => {
            const canvas = canvases[req.id];
            const qg = canvas ? getQg(canvas) : null;
            return (
              <div key={req.id} className="px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-semibold text-[#1A1A1A]">{req.businessName}</span>
                      {req.segment && (
                        <span className="h-5 px-2 rounded-full bg-[#F0F0ED] text-[#6B6B65] text-[10px] font-medium">{req.segment}</span>
                      )}
                      <span className="h-5 px-2 rounded-full bg-[#E6FBFA] text-[#070A1F] text-[10px] font-semibold">{req.status}</span>
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
                      className="h-8 px-4 rounded-[7px] bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-50 text-white text-[12px] font-medium transition-colors shrink-0"
                    >
                      {generatingId === req.id ? "Gerando…" : "✦ Generate"}
                    </button>
                  ) : (
                    <button
                      onClick={() => onApprove(req)}
                      disabled={approvingId === req.id || qg?.overall === "FAIL"}
                      className="h-8 px-4 rounded-[7px] bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-50 text-white text-[12px] font-medium transition-colors shrink-0"
                    >
                      {approvingId === req.id ? "Aprovando…" : "Approve →"}
                    </button>
                  )}
                </div>
                {canvas && (
                  <dl className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[#F7F7F6] rounded-[8px] px-4 py-3">
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
      <dt className="text-[9px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">{label}</dt>
      <dd className="text-[11px] text-[#1A1A1A] leading-snug mt-0.5">{value}</dd>
    </div>
  );
}
