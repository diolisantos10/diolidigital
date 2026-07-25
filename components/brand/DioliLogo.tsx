// ─── Dioli Digital brand logo ─────────────────────────────────────────────────
// Usa os ARQUIVOS OFICIAIS extraídos em alta resolução do Brand Book v1
// (public/brand/). Monocromático: navy para fundos claros, branco para escuros.
//   variant="full" → lockup horizontal (símbolo + "Dioli DIGITAL")
//   variant="mark" → só o símbolo "Oo" (dois anéis)

type Variant = "full" | "mark";
type Tone = "light" | "dark"; // light = para fundos escuros (branco); dark = fundo claro (navy)

// Proporções reais dos arquivos (largura / altura)
const ASPECT: Record<Variant, number> = {
  full: 1577 / 440,
  mark: 644 / 395,
};

export function DioliLogo({
  variant = "full",
  tone = "light",
  className = "",
  markSize = 30,
}: {
  variant?: Variant;
  tone?: Tone;
  className?: string;
  markSize?: number;
}) {
  const color = tone === "light" ? "white" : "navy";
  const src =
    variant === "mark"
      ? `/brand/dioli-mark-${color}.png`
      : `/brand/dioli-logo-h-${color}.png`;
  const height = markSize;
  const width = Math.round(markSize * ASPECT[variant]);

  return (
    <span className={`inline-flex shrink-0 items-center ${className}`} aria-label="Dioli Digital">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Dioli Digital"
        width={width}
        height={height}
        style={{ height, width }}
        className="max-w-none select-none"
        draggable={false}
      />
    </span>
  );
}
