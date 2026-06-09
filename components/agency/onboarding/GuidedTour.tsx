"use client";

// ─── GuidedTour — spotlight tour engine ───────────────────────────────────────
//
// Highlights real DOM elements (located via the step's CSS selector, by
// convention a `data-tour="…"` attribute) with a dimmed overlay + spotlight,
// and shows a popover with title, body and controls:
// Próximo · Voltar · Pular · Concluir.
//
// Pair with `usePageTour(tour)`, which auto-starts the tour on first visit and
// persists completion in localStorage (tour_completed_[id]) on skip/finish.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import type { TourDefinition } from "@/lib/onboarding/types";
import { isTourCompleted, markTourCompleted } from "@/lib/onboarding/storage";

export function usePageTour(tour: TourDefinition) {
  const [tourOpen, setTourOpen] = useState(false);

  // Auto-start on first visit — small delay lets the page layout settle.
  useEffect(() => {
    if (isTourCompleted(tour.id)) return;
    const t = setTimeout(() => setTourOpen(true), 600);
    return () => clearTimeout(t);
  }, [tour.id]);

  const startTour = useCallback(() => setTourOpen(true), []);

  // Both "Pular" and "Concluir" persist completion — never annoy twice.
  const closeTour = useCallback(() => {
    markTourCompleted(tour.id);
    setTourOpen(false);
  }, [tour.id]);

  return { tourOpen, startTour, closeTour };
}

interface SpotRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const SPOT_PAD = 6;
const POPOVER_W = 330;
const POPOVER_EST_H = 210; // estimate used to decide above/below placement

export default function GuidedTour({
  tour,
  open,
  onClose,
}: {
  tour: TourDefinition;
  open: boolean;
  onClose: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<SpotRect | null>(null);

  const step = open ? tour.steps[stepIndex] : undefined;

  useEffect(() => {
    if (open) setStepIndex(0);
  }, [open]);

  // Locate + measure the target; re-measure on resize/scroll so the spotlight
  // follows the element while smooth-scroll brings it into view.
  useEffect(() => {
    if (!open || !step) return;
    const selector = step.target;

    const el = document.querySelector(selector);
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });

    function measure() {
      const target = document.querySelector(selector);
      if (!target) {
        setRect(null);
        return;
      }
      const r = target.getBoundingClientRect();
      setRect({
        top: r.top - SPOT_PAD,
        left: r.left - SPOT_PAD,
        width: r.width + SPOT_PAD * 2,
        height: r.height + SPOT_PAD * 2,
      });
    }

    measure();
    const settle = setTimeout(measure, 400);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(settle);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !step) return null;

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === tour.steps.length - 1;

  // Popover below the spotlight when there is room, above otherwise; clamped
  // to the viewport. Falls back to centered when the target is missing.
  let popStyle: React.CSSProperties;
  if (rect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.min(Math.max(rect.left, 12), Math.max(vw - POPOVER_W - 12, 12));
    const below = rect.top + rect.height + 12;
    popStyle =
      below + POPOVER_EST_H < vh
        ? { top: below, left }
        : { top: Math.max(rect.top - POPOVER_EST_H - 12, 12), left };
  } else {
    popStyle = { top: "40%", left: "50%", transform: "translateX(-50%)" };
  }

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Click blocker — dim comes from the spotlight's box-shadow when a
          target exists, otherwise from this layer itself. */}
      <div
        className="absolute inset-0"
        style={rect ? undefined : { background: "rgba(17,17,17,0.55)" }}
      />

      {rect && (
        <div
          className="absolute rounded-[10px] pointer-events-none transition-all duration-200"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            boxShadow: "0 0 0 9999px rgba(17,17,17,0.55)",
            outline: "2px solid #5B5BD6",
          }}
        />
      )}

      {/* Step popover */}
      <div
        className="absolute bg-white rounded-[12px] shadow-[0_20px_60px_rgba(0,0,0,0.25)] p-4"
        style={{ ...popStyle, width: POPOVER_W }}
        role="dialog"
        aria-label={step.title}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-[#5B5BD6] bg-[#EEF0FF] px-2 py-0.5 rounded-full">
            {stepIndex + 1} de {tour.steps.length}
          </span>
          <button
            onClick={onClose}
            className="text-[11px] text-[#9B9B95] hover:text-[#1A1A1A] transition-colors"
          >
            Pular tour
          </button>
        </div>

        <h3 className="text-[14px] font-semibold text-[#1A1A1A] mb-1">{step.title}</h3>
        <p className="text-[12px] text-[#6B6B65] leading-relaxed mb-3.5">{step.body}</p>

        <div className="flex items-center justify-between">
          <button
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            disabled={isFirst}
            className="h-7 px-3 rounded-[6px] border border-[#E5E5E2] text-[11px] font-medium text-[#6B6B65] hover:border-[#9B9B95] hover:text-[#1A1A1A] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Voltar
          </button>
          {isLast ? (
            <button
              onClick={onClose}
              className="h-7 px-3.5 rounded-[6px] bg-[#16A34A] text-white text-[11px] font-semibold hover:bg-[#15803D] transition-colors"
            >
              Concluir
            </button>
          ) : (
            <button
              onClick={() => setStepIndex((i) => i + 1)}
              className="h-7 px-3.5 rounded-[6px] bg-[#5B5BD6] text-white text-[11px] font-semibold hover:bg-[#4A4AC0] transition-colors"
            >
              Próximo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
