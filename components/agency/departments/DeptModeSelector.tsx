"use client";

// ─── DeptModeSelector — department operation mode toggle ──────────────────────
//
// Shows a 3-mode pill picker in the department header. The selected mode is
// persisted in the agency store (DepartmentConfig.operationMode) and drives:
//
//   full_ai   — AI runs autonomously; deliverables from this dept are
//               auto-approved (logged but no human gate shown).
//
//   hybrid    — AI produces, PM/Master approves (default, current behavior).
//
//   full_human — IA disabled for this dept; "Rodar Inteligência" buttons are
//                hidden and work is tracked as manual.
//
// ─────────────────────────────────────────────────────────────────────────────

import type { DepartmentOperationMode } from "@/store/agency-store";

interface Mode {
  id: DepartmentOperationMode;
  label: string;
  shortLabel: string;
  description: string;
  icon: string;
}

const MODES: Mode[] = [
  {
    id: "full_ai",
    label: "100% Autônomo IA",
    shortLabel: "IA Autônoma",
    description: "IA produz e aprova automaticamente. Resultados são registrados para auditoria.",
    icon: "✦",
  },
  {
    id: "hybrid",
    label: "IA + Decisão Humana",
    shortLabel: "Híbrido",
    description: "IA produz, PM ou Master aprova antes de avançar. Padrão recomendado.",
    icon: "⚡",
  },
  {
    id: "full_human",
    label: "100% Humano",
    shortLabel: "Humano",
    description: "IA desligada neste departamento. Trabalho gerenciado manualmente.",
    icon: "👤",
  },
];

const MODE_STYLE: Record<DepartmentOperationMode, { active: string; activeText: string; ring: string }> = {
  full_ai:    { active: "#070A1F", activeText: "#FFFFFF", ring: "#9AF5F0" },
  hybrid:     { active: "#166534", activeText: "#FFFFFF", ring: "#86EFAC" },
  full_human: { active: "#92400E", activeText: "#FFFFFF", ring: "#FDE68A" },
};

const MODE_BADGE_STYLE: Record<DepartmentOperationMode, string> = {
  full_ai:    "bg-[var(--accent-light)] text-[var(--navy)] border border-[var(--cyan)]",
  hybrid:     "bg-[var(--success-bg)] text-[#166534] border border-[#86EFAC]",
  full_human: "bg-[var(--warning-bg)] text-[#92400E] border border-[#FDE68A]",
};

export function DeptModeBadge({ mode }: { mode: DepartmentOperationMode }) {
  const m = MODES.find((x) => x.id === mode) ?? MODES[1];
  return (
    <span className={`inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10px] font-semibold ${MODE_BADGE_STYLE[mode]}`}>
      {m.icon} {m.shortLabel}
    </span>
  );
}

export default function DeptModeSelector({
  mode,
  onChange,
  deptColor,
}: {
  mode: DepartmentOperationMode;
  onChange: (next: DepartmentOperationMode) => void;
  deptColor?: string;
}) {
  const current = MODES.find((m) => m.id === mode) ?? MODES[1];

  return (
    <div className="rounded-[12px] border border-[var(--border)] bg-white px-5 py-4 mb-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
          Modo de operação
        </span>
        <DeptModeBadge mode={mode} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {MODES.map((m) => {
          const active = mode === m.id;
          const style = MODE_STYLE[m.id];
          return (
            <button
              key={m.id}
              onClick={() => onChange(m.id)}
              title={m.description}
              className="relative flex flex-col items-start gap-1 rounded-[10px] border-2 px-3.5 py-3 text-left transition-all"
              style={
                active
                  ? {
                      borderColor: style.ring,
                      background: style.active,
                      color: style.activeText,
                      boxShadow: `0 0 0 3px ${style.ring}33`,
                    }
                  : {
                      borderColor: "#E8E8E3",
                      background: "#FAFAFA",
                      color: "#6B6B65",
                    }
              }
            >
              <span className={`text-[15px] ${active ? "opacity-100" : "opacity-60"}`}>{m.icon}</span>
              <span className="text-[12px] font-semibold leading-tight">{m.shortLabel}</span>
              <span className={`text-[10px] leading-snug ${active ? "opacity-80" : "text-[var(--text-muted)]"}`}>
                {m.description}
              </span>
              {active && (
                <span
                  className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full"
                  style={{ background: style.ring }}
                />
              )}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-[var(--text-muted)] mt-2.5 leading-relaxed">
        {current.description}
        {mode === "full_ai" && " Audite os resultados periodicamente em Qualidade."}
        {mode === "full_human" && " Os botões de IA ficam ocultos neste departamento."}
      </p>
    </div>
  );
}
