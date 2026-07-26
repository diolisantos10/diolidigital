"use client";

// ─── OnboardingActions — standard page-header buttons ─────────────────────────
//
// Drop-in pair of buttons every screen must expose (FASE 5 product standard):
//   · "Rever tour"        — restarts the page's guided tour
//   · "Explique esta tela" — opens the ExplainScreenDrawer
// ─────────────────────────────────────────────────────────────────────────────

export default function OnboardingActions({
  onStartTour,
  onExplain,
}: {
  onStartTour: () => void;
  onExplain: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={onStartTour}
        className="h-7 px-2.5 rounded-[6px] border border-[var(--border)] bg-white text-[11px] font-medium text-[var(--text-secondary)] hover:border-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
      >
        Rever tour
      </button>
      <button
        onClick={onExplain}
        className="h-7 px-2.5 rounded-[6px] border border-[#C7D2FE] bg-[var(--accent-light)] text-[11px] font-semibold text-[var(--navy)] hover:bg-[#E0E7FF] transition-colors flex items-center gap-1"
      >
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 1.5l1.4 3.6a1 1 0 00.6.6l3.5 1.3-3.5 1.3a1 1 0 00-.6.6L8 12.5 6.6 8.9a1 1 0 00-.6-.6L2.5 7l3.5-1.3a1 1 0 00.6-.6L8 1.5z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <path d="M13 11.5l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5.5-1.2z" fill="currentColor" />
        </svg>
        Explique esta tela
      </button>
    </div>
  );
}
