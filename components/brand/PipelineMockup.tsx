// ─── Mockup: Pipeline de execução (imagem em código) ──────────────────────────
// Tela idealizada do kanban de produção. Paleta da marca, sem fotos externas.

const COLS = [
  {
    nome: "Estratégia",
    tone: "#1FB7E7",
    cards: [{ t: "Diagnóstico de marca", p: 100 }, { t: "Roadmap Q3", p: 70 }],
  },
  {
    nome: "Design",
    tone: "#6D8BFF",
    cards: [{ t: "Identidade visual", p: 60 }, { t: "Kit de stories", p: 35 }],
  },
  {
    nome: "Tráfego",
    tone: "#12B5AC",
    cards: [{ t: "Campanha Meta", p: 80 }],
  },
];

export function PipelineMockup({ className = "" }: { className?: string }) {
  return (
    <div className={`glass rounded-[22px] p-4 sm:p-5 ${className}`}>
      <div className="flex items-center gap-2 px-1 pb-3">
        <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
        <span className="ml-3 text-[12px] font-semibold text-[var(--text-secondary)]">Pipeline · execução</span>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[var(--cyan)]/20 px-2.5 py-1 text-[10px] font-semibold text-[#0E7C74]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#12B5AC]" /> no prazo
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {COLS.map((c) => (
          <div key={c.nome} className="rounded-2xl border border-[var(--border)] bg-white/70 p-2.5">
            <div className="mb-2 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: c.tone }} />
              <span className="text-[10.5px] font-semibold text-[var(--navy)]">{c.nome}</span>
            </div>
            <div className="space-y-2">
              {c.cards.map((card) => (
                <div key={card.t} className="rounded-xl border border-[var(--border)] bg-white p-2 shadow-[var(--shadow-xs)]">
                  <p className="text-[9.5px] font-medium leading-snug text-[var(--text-primary)]">{card.t}</p>
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[var(--accent)]">
                    <div className="h-full rounded-full" style={{ width: `${card.p}%`, background: c.tone }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between rounded-2xl border border-[var(--border)] bg-white/80 px-3.5 py-2.5">
        <span className="text-[11px] font-medium text-[var(--text-secondary)]">5 tarefas em produção</span>
        <span className="text-[11px] font-semibold text-[var(--navy)]">2 entregas hoje</span>
      </div>
    </div>
  );
}
