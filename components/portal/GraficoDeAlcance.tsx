"use client";

// GraficoDeAlcance — a série diária de alcance como barras simples.
//
// Regras de honestidade do gráfico (as mesmas da casa para qualquer chart):
//  • base no zero, sem suavização — barra é o dia como a Meta mediu;
//  • só ALCANCE tem série diária na API vigente (as demais métricas de conta
//    só têm total) — este gráfico não promete o que a fonte não dá;
//  • com menos de 2 dias medidos, não desenha: diz o porquê em texto.
//
// Usado no portal do cliente e na ficha do cliente na agência.

import {
  barrasDoGrafico,
  diaCurto,
  formatarNumeroCompacto,
  resumoDaSerie,
  type PontoDeAlcance,
} from "@/lib/agency/portal/resultados";

const LARGURA = 320;
const ALTURA = 96;

export function GraficoDeAlcance({ serie }: { serie: PontoDeAlcance[] }) {
  if (serie.length < 2) {
    return (
      <p className="text-[12.5px] text-[var(--text-muted)]">
        O gráfico diário aparece quando houver pelo menos dois dias medidos no período.
      </p>
    );
  }

  const barras = barrasDoGrafico(serie, LARGURA, ALTURA);
  const maximo = Math.max(...serie.map((p) => p.alcance));

  return (
    <figure className="m-0">
      <div className="flex items-baseline justify-between gap-2">
        <figcaption className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)]">
          Alcance por dia
        </figcaption>
        <span className="text-[11px] text-[var(--text-muted)]">
          pico {formatarNumeroCompacto(maximo)}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA + 1}`}
        className="mt-2 h-auto w-full"
        role="img"
        aria-label={resumoDaSerie(serie)}
      >
        {barras.map((b) => (
          <rect
            key={b.data}
            x={b.x}
            y={b.y}
            width={b.largura}
            height={b.altura}
            rx={1}
            fill="var(--navy)"
            opacity={0.88}
          >
            <title>{`${diaCurto(b.data)}: ${new Intl.NumberFormat("pt-BR").format(b.alcance)} contas`}</title>
          </rect>
        ))}
        {/* linha de base no zero — o chão do gráfico é explícito */}
        <line x1="0" y1={ALTURA + 0.5} x2={LARGURA} y2={ALTURA + 0.5} stroke="var(--border)" strokeWidth="1" />
      </svg>
      <div className="mt-1 flex justify-between text-[10.5px] text-[var(--text-muted)]" aria-hidden>
        <span>{diaCurto(serie[0].data)}</span>
        <span>{diaCurto(serie[serie.length - 1].data)}</span>
      </div>
    </figure>
  );
}
