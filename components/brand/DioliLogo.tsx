// ─── Dioli Digital brand logo ─────────────────────────────────────────────────
// Usa o KIT EM VETOR de `public/brand/`, redesenhado a partir do Brand Book v1
// em 08/08/2026 (`scripts/gerar-kit-de-marca.mjs`). SVG e não PNG: o cabeçalho
// do portal desenha o logo a 30px numa tela retina, e vetor é o único formato
// que não pede um arquivo novo a cada densidade de pixel.
// Monocromático: navy para fundos claros, branco para escuros.
//   variant="full" → lockup horizontal (símbolo + "Dioli DIGITAL")
//   variant="mark" → só o símbolo "Oo" (dois anéis)

type Variant = "full" | "mark";
type Tone = "light" | "dark"; // light = para fundos escuros (branco); dark = fundo claro (navy)

// Proporções reais dos arquivos oficiais (largura / altura)
const ASPECT: Record<Variant, number> = {
  full: 1331 / 338,
  mark: 548 / 338,
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
      ? `/brand/dioli-mark-${color}.svg`
      : `/brand/dioli-logo-h-${color}.svg`;
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
