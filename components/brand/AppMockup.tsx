// ─── Mockup de produto (imagem em código) ─────────────────────────────────────
// Painel de app em "vidro" no espírito dos dashboards do Brand Book Dioli Digital
// ("Visão geral" com métricas + gráfico). Serve de imagem-herói sem depender de
// fotos externas. Tudo dentro da paleta da marca (navy / cyan / azul).

export function AppMockup({ className = "" }: { className?: string }) {
  const stats = [
    { label: "Receita", value: "R$ 86.420", delta: "+22,4%" },
    { label: "Oportunidades", value: "312", delta: "+15,3%" },
    { label: "Conversão", value: "23,6%", delta: "+13,1%" },
  ];

  // pontos do mini gráfico de área (0–100)
  const pts = [22, 34, 28, 46, 40, 58, 52, 70, 64, 82, 78, 94];
  const W = 320;
  const H = 96;
  const step = W / (pts.length - 1);
  const y = (v: number) => H - (v / 100) * H;
  const line = pts.map((v, i) => `${i === 0 ? "M" : "L"} ${i * step} ${y(v)}`).join(" ");
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;

  return (
    <div className={`glass rounded-[26px] p-4 sm:p-5 ${className}`}>
      {/* barra de janela */}
      <div className="flex items-center gap-2 px-1 pb-4">
        <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
        <span className="ml-3 text-[12px] font-semibold text-[var(--text-secondary)]">
          Dioli · Visão geral
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[var(--cyan)]/20 px-2.5 py-1 text-[10.5px] font-semibold text-[#0E7C74]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#12B5AC]" /> ao vivo
        </span>
      </div>

      {/* stat tiles */}
      <div className="grid grid-cols-3 gap-2.5">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-[var(--border)] bg-white/80 p-3">
            <p className="text-[10.5px] font-medium text-[var(--text-muted)]">{s.label}</p>
            <p className="mt-1 font-display text-[15px] font-bold text-[var(--navy)] sm:text-[17px]">
              {s.value}
            </p>
            <p className="mt-0.5 text-[10.5px] font-semibold text-[#12B5AC]">▲ {s.delta}</p>
          </div>
        ))}
      </div>

      {/* gráfico */}
      <div className="mt-3 rounded-2xl border border-[var(--border)] bg-white/80 p-4">
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-semibold text-[var(--navy)]">Crescimento</p>
          <div className="flex gap-1">
            {["6M", "1A", "Tudo"].map((t, i) => (
              <span
                key={t}
                className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                  i === 0 ? "bg-[var(--navy)] text-white" : "text-[var(--text-muted)]"
                }`}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-24 w-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="mk-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1FB7E7" stopOpacity="0.34" />
              <stop offset="100%" stopColor="#1FB7E7" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="mk-line" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#22C7D8" />
              <stop offset="100%" stopColor="#0057FF" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#mk-area)" />
          <path d={line} fill="none" stroke="url(#mk-line)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={W} cy={y(pts[pts.length - 1])} r="4" fill="#0057FF" />
          <circle cx={W} cy={y(pts[pts.length - 1])} r="8" fill="#0057FF" opacity="0.18" />
        </svg>
      </div>
    </div>
  );
}
