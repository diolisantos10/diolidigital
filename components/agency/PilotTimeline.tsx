"use client";

import type { TimelineWeek } from "@/lib/agency/reporting";

// ─── Pilot Execution Timeline ─────────────────────────────────────────────────
// A 4-week execution plan across the active departments (Social / Design / Ads).

export default function PilotTimeline({ weeks }: { weeks: TimelineWeek[] }) {
  return (
    <div className="bg-white rounded-[10px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="px-5 py-3.5 border-b border-[#F0F0ED]">
        <h3 className="text-[13px] font-semibold text-[#1A1A1A]">Linha do Tempo de Execução</h3>
        <p className="text-[11px] text-[#9B9B95] mt-0.5">Plano de 4 semanas por departamento</p>
      </div>
      <div className="divide-y divide-[#F0F0ED]">
        {weeks.map((w) => (
          <div key={w.week} className="px-5 py-3.5">
            <div className="flex items-center gap-2.5 mb-2.5">
              <span className="w-6 h-6 rounded-full bg-[#070A1F] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                {w.week}
              </span>
              <div>
                <span className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Semana {w.week}</span>
                <p className="text-[12px] font-semibold text-[#1A1A1A] leading-none mt-0.5">{w.theme}</p>
              </div>
            </div>
            {w.tracks.length === 0 ? (
              <p className="pl-[34px] text-[12px] text-[#9B9B95]">Sem departamento ativo.</p>
            ) : (
              <div className="pl-[34px] space-y-1.5">
                {w.tracks.map((track) => (
                  <div key={track.dept} className="flex items-start gap-2">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: track.accentHex }} />
                    <div className="min-w-0">
                      <span className="text-[11px] font-semibold" style={{ color: track.accentHex }}>{track.dept}</span>
                      <span className="text-[12px] text-[#6B6B65]"> — {track.items.join("; ")}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
