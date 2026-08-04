// resultados-view — a matemática da tela de Resultados (portal e agência).
//
// O que se protege aqui: formatação que nunca inventa zero para "não medido",
// datas que não deslizam de dia por fuso, e escala de gráfico com base no zero
// — os três jeitos clássicos de um dashboard mentir sem ninguém perceber.

import { describe, expect, it } from "vitest";
import {
  barrasDoGrafico,
  diaCurto,
  formatarNumeroCompacto,
  formatarPeriodo,
  resumoDaSerie,
} from "@/lib/agency/portal/resultados";

describe("formatarNumeroCompacto", () => {
  it("null (a Meta não mediu) sai null — nunca um zero inventado", () => {
    expect(formatarNumeroCompacto(null)).toBeNull();
  });
  it("NaN/Infinity não viram texto", () => {
    expect(formatarNumeroCompacto(Number.NaN)).toBeNull();
    expect(formatarNumeroCompacto(Number.POSITIVE_INFINITY)).toBeNull();
  });
  it("abaixo de mil sai inteiro em pt-BR", () => {
    expect(formatarNumeroCompacto(0)).toBe("0");
    expect(formatarNumeroCompacto(987)).toBe("987");
  });
  it("milhares saem compactos em pt-BR", () => {
    // O espaço do ICU pode ser NBSP/fino — normaliza antes de comparar.
    const norm = (s: string | null) => s?.replace(/[  ]/g, " ");
    expect(norm(formatarNumeroCompacto(1234))).toBe("1,2 mil");
    expect(norm(formatarNumeroCompacto(2_500_000))).toBe("2,5 mi");
  });
});

describe("diaCurto / formatarPeriodo", () => {
  it("AAAA-MM-DD vira dd/mm SEM passar por Date — fuso não desloca o dia", () => {
    expect(diaCurto("2026-08-04")).toBe("04/08");
    expect(formatarPeriodo("2026-07-08", "2026-08-04")).toBe("08/07 a 04/08");
  });
  it("entrada fora do formato passa intacta (nunca quebra a tela)", () => {
    expect(diaCurto("hoje")).toBe("hoje");
  });
});

describe("barrasDoGrafico", () => {
  const serie = [
    { data: "2026-08-01", alcance: 10 },
    { data: "2026-08-02", alcance: 40 },
    { data: "2026-08-03", alcance: 0 },
  ];

  it("série vazia devolve zero barras (o componente mostra texto, não gráfico)", () => {
    expect(barrasDoGrafico([], 320, 96)).toEqual([]);
  });

  it("a maior barra ocupa a altura toda e TODA barra parte do zero", () => {
    const barras = barrasDoGrafico(serie, 320, 96);
    const maior = barras[1];
    expect(maior.altura).toBeCloseTo(96);
    for (const b of barras) expect(b.y + b.altura).toBeCloseTo(96); // base comum
  });

  it("dia com alcance zero ganha presença mínima — dado medido não vira buraco", () => {
    const barras = barrasDoGrafico(serie, 320, 96);
    expect(barras[2].altura).toBeGreaterThanOrEqual(1);
  });

  it("valor negativo/inválido é descartado, não desenhado", () => {
    const barras = barrasDoGrafico(
      [{ data: "2026-08-01", alcance: -5 }, { data: "2026-08-02", alcance: 7 }],
      320,
      96,
    );
    expect(barras).toHaveLength(1);
    expect(barras[0].data).toBe("2026-08-02");
  });

  it("as barras cabem no viewBox pedido", () => {
    const barras = barrasDoGrafico(serie, 320, 96);
    const fim = barras[barras.length - 1];
    expect(fim.x + fim.largura).toBeLessThanOrEqual(320.01);
  });
});

describe("resumoDaSerie", () => {
  it("resume total e melhor dia para o leitor de tela", () => {
    const r = resumoDaSerie([
      { data: "2026-08-01", alcance: 10 },
      { data: "2026-08-02", alcance: 40 },
    ]);
    expect(r).toContain("01/08");
    expect(r).toContain("02/08");
    expect(r).toContain("50");
    expect(r).toContain("40");
  });
  it("série vazia tem frase própria", () => {
    expect(resumoDaSerie([])).toMatch(/sem dados/i);
  });
});
