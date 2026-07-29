// ─── Mockup: Planner de conteúdo (imagem em código) ───────────────────────────
// Tela idealizada do módulo de social/conteúdo. Paleta da marca, sem fotos externas.

const DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const POSTS = [
  { day: 0, tone: "#1FB7E7", plat: "IG", label: "Reels" },
  { day: 1, tone: "#6D8BFF", plat: "TT", label: "Trend" },
  { day: 3, tone: "#12B5AC", plat: "IG", label: "Carrossel" },
  { day: 4, tone: "#0057FF", plat: "IG", label: "Stories" },
  { day: 6, tone: "#22C7D8", plat: "YT", label: "Short" },
];

export function PlannerMockup({ className = "" }: { className?: string }) {
  return (
    <div className={`glass rounded-[22px] p-4 sm:p-5 ${className}`}>
      <div className="flex items-center gap-2 px-1 pb-3">
        <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
        <span className="ml-3 text-[12px] font-semibold text-[var(--text-secondary)]">Planner de conteúdo</span>
        <span className="ml-auto rounded-full bg-[var(--navy)] px-2.5 py-1 text-[10px] font-semibold text-white">Julho</span>
      </div>
      <div className="rounded-2xl border border-[var(--border)] bg-white/80 p-3.5">
        <div className="grid grid-cols-7 gap-1.5">
          {DAYS.map((d) => (
            <div key={d} className="pb-1 text-center text-[9.5px] font-semibold text-[var(--text-muted)]">{d}</div>
          ))}
          {DAYS.map((_, i) => {
            const post = POSTS.find((p) => p.day === i);
            return (
              <div key={i} className="aspect-[3/4] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg)]">
                {post ? (
                  <div className="flex h-full flex-col">
                    <div className="flex-1" style={{ background: `linear-gradient(150deg, ${post.tone}, ${post.tone}88)` }} />
                    <div className="flex items-center gap-1 px-1 py-1">
                      <span className="text-[7px] font-bold text-[var(--navy)]">{post.plat}</span>
                      <span className="truncate text-[7px] text-[var(--text-muted)]">{post.label}</span>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between rounded-2xl border border-[var(--border)] bg-white/80 px-3.5 py-2.5">
        <span className="text-[11px] font-medium text-[var(--text-secondary)]">5 posts agendados esta semana</span>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#12B5AC]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#12B5AC]" /> IA gerou 4
        </span>
      </div>
    </div>
  );
}
