"use client";

// ─── RoleGuide — "por onde começo" por função ─────────────────────────────────
//
// A self-contained modal that walks a role through its mission and day-to-day
// flow. Opens automatically the first time a role is used (persisted via
// localStorage role_guide_seen_[role]) and is re-openable on demand from the
// sidebar. Each step can deep-link to the relevant screen.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { AgencyRole } from "@/lib/agency/roles";
import { getRoleGuide } from "@/lib/onboarding/role-guides";

const KEY_PREFIX = "role_guide_seen_";

function isGuideSeen(role: AgencyRole): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(KEY_PREFIX + role) === "true";
  } catch {
    return true;
  }
}

function markGuideSeen(role: AgencyRole): void {
  try {
    window.localStorage.setItem(KEY_PREFIX + role, "true");
  } catch {
    // storage unavailable — guide re-offers next visit, acceptable
  }
}

/** Auto-opens the guide the first time `role` is seen; exposes manual controls. */
export function useRoleGuide(role: AgencyRole) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isGuideSeen(role)) return;
    const t = setTimeout(() => setOpen(true), 700);
    return () => clearTimeout(t);
  }, [role]);

  const openGuide = useCallback(() => setOpen(true), []);
  const closeGuide = useCallback(() => {
    markGuideSeen(role);
    setOpen(false);
  }, [role]);

  return { guideOpen: open, openGuide, closeGuide };
}

export default function RoleGuide({
  role,
  open,
  onClose,
}: {
  role: AgencyRole;
  open: boolean;
  onClose: () => void;
}) {
  const guide = getRoleGuide(role);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: "rgba(7,10,31,0.55)" }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="relative w-full max-w-[560px] max-h-[88vh] overflow-hidden flex flex-col bg-white rounded-[16px] shadow-[0_24px_70px_rgba(0,0,0,0.35)]"
        role="dialog"
        aria-label={guide.title}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-5 shrink-0" style={{ background: "#070A1F" }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 h-5 px-2 rounded-full bg-[var(--cyan)]/15 text-[var(--cyan)] text-[10px] font-semibold mb-2">
                ✦ Dioli Brain · Guia
              </div>
              <h2 className="text-[19px] font-semibold text-white leading-tight">{guide.title}</h2>
            </div>
            <button
              onClick={onClose}
              aria-label="Fechar guia"
              className="shrink-0 w-8 h-8 rounded-[8px] flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <p className="text-[13px] text-[var(--cyan)]/80 leading-relaxed mt-2">{guide.mission}</p>
        </div>

        {/* Steps */}
        <div className="px-6 py-5 overflow-y-auto space-y-3">
          {guide.steps.map((step, i) => (
            <div key={i} className="flex gap-3">
              <div className="shrink-0 w-7 h-7 rounded-full bg-[var(--accent-light)] text-[var(--navy)] text-[13px] font-bold flex items-center justify-center">
                {step.icon}
              </div>
              <div className="flex-1 min-w-0 pb-1">
                <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-0.5">{step.title}</h3>
                <p className="text-[12.5px] text-[var(--text-secondary)] leading-relaxed">{step.body}</p>
                {step.href && (
                  <Link
                    href={step.href}
                    onClick={onClose}
                    className="inline-flex items-center gap-1 mt-1.5 h-7 px-3 rounded-[7px] bg-[var(--accent-light)] text-[var(--navy)] text-[11px] font-semibold hover:bg-[#CFF8F5] transition-colors"
                  >
                    {step.cta ?? "Abrir"} →
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--border)] shrink-0 flex items-center justify-between">
          <span className="text-[11px] text-[var(--text-muted)]">Você pode reabrir este guia pelo menu lateral.</span>
          <button
            onClick={onClose}
            className="h-9 px-5 rounded-[8px] bg-[var(--navy)] text-white text-[12px] font-semibold hover:bg-[#0D1230] transition-colors"
          >
            Entendi, começar
          </button>
        </div>
      </div>
    </div>
  );
}
