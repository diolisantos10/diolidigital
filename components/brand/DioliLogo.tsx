// ─── Dioli Digital brand logo ─────────────────────────────────────────────────
// Fonte única do símbolo da marca (sidebar, auth, briefing e site público).
//
// Brand Book v1 (docs/brand/): o símbolo são DOIS ANÉIS (círculos vazados) — "Oo" —
// um grande + um menor à direita. SEM satélite e SEM disco preenchido (isso é
// elemento gráfico da órbita, não da logo). MONOCROMÁTICO (navy no claro, branco no
// escuro) — o cyan NÃO entra no logo.

type Variant = "full" | "mark";
type Tone = "light" | "dark"; // light = para fundos escuros; dark = para fundo claro

export function DioliLogo({
  variant = "full",
  tone = "light",
  className = "",
  markSize = 24,
}: {
  variant?: Variant;
  tone?: Tone;
  className?: string;
  markSize?: number;
}) {
  // Monocromático conforme brand book
  const ink = tone === "light" ? "#FFFFFF" : "#070A1F";

  const mark = (
    <svg
      width={Math.round((markSize * 50) / 34)}
      height={markSize}
      viewBox="0 0 50 34"
      fill="none"
      className="shrink-0"
      aria-hidden="true"
    >
      {/* anel grande */}
      <circle cx="13" cy="17" r="11" stroke={ink} strokeWidth="3" fill="none" />
      {/* anel pequeno — separado, com respiro (o "o") */}
      <circle cx="37.5" cy="13.5" r="6" stroke={ink} strokeWidth="2.8" fill="none" />
    </svg>
  );

  if (variant === "mark") {
    return (
      <span className={className} aria-label="Dioli Digital">
        {mark}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`} aria-label="Dioli Digital">
      {mark}
      <span className="inline-flex items-baseline gap-[0.4em] leading-none">
        <span
          className="font-semibold tracking-[-0.01em]"
          style={{ color: ink, fontFamily: "Sora, Inter, sans-serif" }}
        >
          Dioli
        </span>
        <span
          className="text-[0.62em] font-semibold uppercase tracking-[0.22em]"
          style={{ color: ink, opacity: 0.72 }}
        >
          Digital
        </span>
      </span>
    </span>
  );
}
