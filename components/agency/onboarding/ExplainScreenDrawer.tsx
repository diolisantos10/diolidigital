"use client";

// ─── ExplainScreenDrawer — "Explique esta tela" ───────────────────────────────
//
// Right-side drawer that explains the current screen:
//   · summary of the live state ("Você possui 3 alertas ativos…")
//   · what exists on the screen / what matters most
//   · what needs attention right now
//   · what to do first
//
// Content comes from a ScreenExplanation built by a per-screen builder
// (see lib/onboarding/explanations/). Builders are deterministic and run
// locally — no external AI API calls. The interface is AI-pluggable: a
// future builder can call a configured model and return the same shape.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";
import type { ScreenExplanation } from "@/lib/onboarding/types";

export default function ExplainScreenDrawer({
  open,
  onClose,
  screenTitle,
  explanation,
}: {
  open: boolean;
  onClose: () => void;
  screenTitle: string;
  explanation: ScreenExplanation;
}) {
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90]">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />

      <aside className="absolute right-0 top-0 h-full w-[400px] max-w-[92vw] bg-white shadow-[-8px_0_40px_rgba(0,0,0,0.12)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E5E2] shrink-0">
          <div>
            <p className="text-[10px] font-semibold text-[#5B5BD6] uppercase tracking-[0.06em]">
              Explicação da tela
            </p>
            <h2 className="text-[14px] font-semibold text-[#1A1A1A]">{screenTitle}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-[6px] flex items-center justify-center text-[#9B9B95] hover:bg-[#F0F0ED] hover:text-[#1A1A1A] transition-colors"
            aria-label="Fechar"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <p className="text-[12px] text-[#3730A3] leading-relaxed bg-[#EEF0FF] border border-[#C7D2FE] rounded-[8px] px-3 py-2.5">
            {explanation.summary}
          </p>

          {explanation.sections.map((sec) => (
            <div key={sec.title}>
              <h3 className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-1.5">
                {sec.title}
              </h3>
              <ul className="space-y-1.5">
                {sec.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] text-[#1A1A1A] leading-relaxed">
                    <span className="text-[#5B5BD6] shrink-0">·</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {explanation.attention.length > 0 && (
            <div>
              <h3 className="text-[11px] font-semibold text-[#D97706] uppercase tracking-[0.05em] mb-1.5">
                Precisa de atenção
              </h3>
              <ul className="space-y-1.5">
                {explanation.attention.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-[12px] text-[#92400E] leading-relaxed bg-[#FEF3C7] border border-[#FDE68A] rounded-[7px] px-3 py-2"
                  >
                    <span className="shrink-0">⚠</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {explanation.firstSteps.length > 0 && (
            <div>
              <h3 className="text-[11px] font-semibold text-[#16A34A] uppercase tracking-[0.05em] mb-1.5">
                Faça primeiro
              </h3>
              <ol className="space-y-1.5">
                {explanation.firstSteps.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] text-[#1A1A1A] leading-relaxed">
                    <span className="shrink-0 w-[18px] h-[18px] rounded-full bg-[#F0FDF4] border border-[#BBF7D0] text-[#16A34A] text-[10px] font-bold flex items-center justify-center mt-[1px]">
                      {i + 1}
                    </span>
                    {item}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
