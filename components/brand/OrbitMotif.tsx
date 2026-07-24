// ─── Órbita / Eclipse — assinatura visual da Dioli Digital ────────────────────
// Brand Book v1: "formas circulares inspiradas no eclipse", órbitas tracejadas com
// uma esfera cyan luminosa. Decorativo. A cor das linhas herda `currentColor` do pai
// (navy no claro, branco no escuro) — a esfera é sempre o gradiente cyan da marca.

export function OrbitMotif({
  className = "",
  id = "orbit",
}: {
  className?: string;
  id?: string;
}) {
  return (
    <svg
      viewBox="0 0 460 300"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`${id}-sphere`} cx="38%" cy="34%" r="70%">
          <stop offset="0%" stopColor="#EAFFFE" />
          <stop offset="38%" stopColor="#9AF5F0" />
          <stop offset="100%" stopColor="#22C7D8" />
        </radialGradient>
        <filter id={`${id}-glow`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="14" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* órbita externa */}
      <ellipse
        cx="230" cy="150" rx="205" ry="96"
        stroke="currentColor" strokeOpacity="0.28"
        strokeWidth="1.2" strokeDasharray="2 7" strokeLinecap="round"
      />
      {/* órbita interna */}
      <ellipse
        cx="230" cy="150" rx="132" ry="60"
        stroke="currentColor" strokeOpacity="0.22"
        strokeWidth="1.2" strokeDasharray="2 7" strokeLinecap="round"
      />

      {/* glow da esfera */}
      <circle cx="230" cy="150" r="30" fill="#9AF5F0" opacity="0.28" filter={`url(#${id}-glow)`} className="animate-glow" style={{ transformOrigin: "230px 150px" }} />
      {/* esfera central — execução inteligente */}
      <circle cx="230" cy="150" r="26" fill={`url(#${id}-sphere)`} />
      <circle cx="222" cy="142" r="7" fill="#FFFFFF" opacity="0.55" />

      {/* pontos em órbita */}
      <circle cx="35" cy="132" r="5" fill="#070A1F" />
      <circle cx="445" cy="150" r="6.5" fill="#0057FF" />
      <circle cx="232" cy="246" r="4.5" fill="currentColor" opacity="0.5" />
    </svg>
  );
}
