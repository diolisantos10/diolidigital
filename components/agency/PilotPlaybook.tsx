"use client";

import type { OperatorPlaybook } from "@/lib/agency/reporting";

// ─── First Client Playbook ────────────────────────────────────────────────────
// Internal four-phase operational playbook. Highlights the current phase and
// always surfaces a single "what do I do next?" answer.

export default function PilotPlaybook({ playbook }: { playbook: OperatorPlaybook }) {
  return (
    <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#F0F0ED]">
        <div>
          <h3 className="text-[13px] font-semibold text-[#1A1A1A]">Playbook do Primeiro Cliente</h3>
          <p className="text-[11px] text-[#9B9B95] mt-0.5">Fase atual: {playbook.currentPhaseTitle}</p>
        </div>
      </div>

      {/* What next */}
      <div className="px-5 py-3 bg-[#EEF0FF] border-b border-[#E0E3FB]">
        <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-[#5B5BD6]">O que fazer agora</span>
        <p className="text-[13px] font-medium text-[#1A1A1A] leading-snug">{playbook.nextAction}</p>
      </div>

      {/* Phases */}
      <div className="divide-y divide-[#F0F0ED]">
        {playbook.phases.map((phase, idx) => (
          <div key={phase.key} className={`px-5 py-3 ${phase.current ? "bg-[#FAFAFE]" : ""}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold ${
                phase.complete ? "bg-[#DCFCE7] text-[#16A34A]" : phase.current ? "bg-[#5B5BD6] text-white" : "bg-[#F0F0ED] text-[#9B9B95]"
              }`}>
                {phase.complete ? "✓" : idx + 1}
              </span>
              <h4 className={`text-[12px] font-semibold ${phase.current ? "text-[#5B5BD6]" : "text-[#1A1A1A]"}`}>{phase.title}</h4>
              {phase.current && !phase.complete && (
                <span className="h-4 px-1.5 rounded-full bg-[#EEF0FF] text-[#5B5BD6] text-[9px] font-semibold flex items-center">ATUAL</span>
              )}
            </div>
            <div className="pl-7 space-y-1">
              {phase.items.map((item) => (
                <div key={item.key} className="flex items-start gap-2">
                  <span className={`mt-0.5 w-3.5 h-3.5 rounded-[4px] shrink-0 flex items-center justify-center text-[9px] font-bold ${
                    item.done ? "bg-[#DCFCE7] text-[#16A34A]" : "border border-[#D0D0CC] text-transparent"
                  }`}>
                    {item.done ? "✓" : ""}
                  </span>
                  <div className="min-w-0">
                    <p className={`text-[12px] leading-snug ${item.done ? "text-[#6B6B65]" : "text-[#1A1A1A] font-medium"}`}>{item.label}</p>
                    {!item.done && <p className="text-[11px] text-[#9B9B95]">{item.hint}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
