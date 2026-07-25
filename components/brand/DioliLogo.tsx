// ─── Dioli Digital brand logo ─────────────────────────────────────────────────
// Fonte única do símbolo da marca (sidebar, auth, briefing e site público).
//
// Brand Book v1 (docs/brand/): o símbolo são "dois círculos minimalistas — eclipse":
// um anel grande (estratégia humana) + um disco menor (execução inteligente), com um
// micro-satélite. O logo é MONOCROMÁTICO (navy no claro, branco no escuro) — o cyan
// NÃO entra no logo, é assinatura de acento em outros lugares.

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
      width={markSize}
      height={markSize}
      viewBox="0 0 40 40"
      fill="none"
      className="shrink-0"
      aria-hidden="true"
    >
      {/* anel grande — estratégia humana */}
      <circle cx="16" cy="22" r="11.5" stroke={ink} strokeWidth="2.4" />
      {/* disco menor — execução inteligente */}
      <circle cx="30" cy="20" r="5" fill={ink} />
      {/* micro-satélite */}
      <circle cx="33.5" cy="10.5" r="2" fill={ink} />
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
