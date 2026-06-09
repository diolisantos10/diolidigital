"use client";

// ─── InfoTooltip — click-to-open ⓘ explanation ────────────────────────────────
//
// Usage:
//   <InfoTooltip title="Score Médio">
//     Média de pontuação (0–100) de todas as simulações.
//   </InfoTooltip>
//
// Renders a small ⓘ button; clicking it opens a popover with the explanation.
// Closes on outside click or Escape.
// ─────────────────────────────────────────────────────────────────────────────

import { ReactNode, useEffect, useRef, useState } from "react";

export default function InfoTooltip({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        aria-label={title ? `Explicar: ${title}` : "Explicar"}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`inline-flex items-center justify-center w-[14px] h-[14px] rounded-full transition-colors ${
          open ? "text-[#5B5BD6]" : "text-[#C0C0BC] hover:text-[#5B5BD6]"
        }`}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M8 7.5v3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <circle cx="8" cy="5" r="0.75" fill="currentColor" />
        </svg>
      </button>

      {open && (
        <span className="absolute z-[60] top-full left-1/2 -translate-x-1/2 mt-1.5 w-[240px] bg-[#1A1A1A] text-white rounded-[8px] px-3 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
          {title && (
            <span className="block text-[10px] font-bold uppercase tracking-[0.05em] text-white/60 mb-1">
              {title}
            </span>
          )}
          <span className="block text-[11px] leading-relaxed text-white/90 font-normal normal-case tracking-normal text-left">
            {children}
          </span>
        </span>
      )}
    </span>
  );
}
