// ─── Dioli brand logo ─────────────────────────────────────────────────────────
// Single source of truth for the brand mark, so the sidebar, auth screens, the
// public briefing and the future website all render the same identity.
//
// The mark = two interlocking circles: the solid ring (human / strategy) and
// the filled disc (tech / execution) — "estratégia humana, execução inteligente".

type Variant = "full" | "mark";
type Tone = "light" | "dark"; // light = for dark backgrounds; dark = for light bg

export function DioliLogo({
  variant = "full",
  tone = "light",
  className = "",
  markSize = 22,
}: {
  variant?: Variant;
  tone?: Tone;
  className?: string;
  markSize?: number;
}) {
  const accent = "#9AF5F0";
  const wordmark = tone === "light" ? "#FFFFFF" : "#070A1F";

  const mark = (
    <svg
      width={markSize}
      height={markSize}
      viewBox="0 0 32 32"
      fill="none"
      className="shrink-0"
      aria-hidden="true"
    >
      <circle cx="13" cy="16" r="7.5" stroke={accent} strokeWidth="1.9" />
      <circle cx="21" cy="16" r="4.5" fill={accent} fillOpacity="0.22" stroke={accent} strokeWidth="1.7" />
    </svg>
  );

  if (variant === "mark") {
    return <span className={className} aria-label="Dioli">{mark}</span>;
  }

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`} aria-label="Dioli Digital">
      {mark}
      <span
        className="font-semibold tracking-[-0.01em]"
        style={{ color: wordmark, fontFamily: "Sora, Inter, sans-serif" }}
      >
        Dioli<span style={{ color: accent }}> Digital</span>
      </span>
    </span>
  );
}
