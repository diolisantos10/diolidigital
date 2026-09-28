// semana-travada.test.ts — a TRAVA DA SEMANA (1C-C2, 28/09/2026, ordem do CEO).
//
// `semanaTravada` é PURA (fuso, sem banco, sem relógio real) — sem mock
// nenhum, só datas fixas. A semana-alvo destes testes é segunda 05/10/2026
// (00:00 BRT) a domingo 11/10 — gerada pela quinta 01/10/2026 10h BRT
// (= 01/10 13:00Z), a MESMA quinta que `semana-editorial.test.ts` já usa para
// `ehQuinta10hBrasilia`/`semanaSeguinte` (não é coincidência: é a mesma conta).

import { describe, it, expect } from "vitest";
import { semanaTravada } from "@/lib/agency/esteira/semana-editorial";

describe("semanaTravada", () => {
  // Terça 06/10/2026, dentro da semana gerada pela quinta 01/10 10h BRT.
  const POST_DA_SEMANA = { scheduledFor: new Date("2026-10-06T13:00:00.000Z") };

  it("quarta 23h Brasília, véspera da quinta de geração — não travada", () => {
    // Quarta 30/09 23:00 BRT = 01/10 02:00Z.
    expect(semanaTravada(POST_DA_SEMANA, new Date("2026-10-01T02:00:00.000Z"))).toBe(false);
  });

  it("quinta 13:00Z (10h Brasília — o instante exato da geração) — travada", () => {
    expect(semanaTravada(POST_DA_SEMANA, new Date("2026-10-01T13:00:00.000Z"))).toBe(true);
  });

  it("continua travada bem depois — MONOTÔNICO, não é 'só a hora exata'", () => {
    expect(semanaTravada(POST_DA_SEMANA, new Date("2026-10-01T14:30:00.000Z"))).toBe(true);
    expect(semanaTravada(POST_DA_SEMANA, new Date("2026-10-08T00:00:00.000Z"))).toBe(true);
  });

  it("post da semana CORRENTE (a quinta de geração dela já ficou bem para trás) — travada", () => {
    // Terça 29/09/2026 — semana 28/09 a 04/10, gerada pela quinta 24/09 10h BRT.
    const postDaSemanaCorrente = { scheduledFor: new Date("2026-09-29T13:00:00.000Z") };
    expect(semanaTravada(postDaSemanaCorrente, new Date("2026-10-01T13:00:00.000Z"))).toBe(true);
  });

  it("post FORA DA JANELA (a geração dele ainda não chegou) — não travada", () => {
    // Terça 20/10/2026 — semana 19/10 a 25/10, gerada só na quinta 15/10 10h BRT.
    const postDaquiATresSemanas = { scheduledFor: new Date("2026-10-20T13:00:00.000Z") };
    expect(semanaTravada(postDaquiATresSemanas, new Date("2026-10-01T13:00:00.000Z"))).toBe(false);
  });

  it("post sem scheduledFor nunca está travado — sem data não há semana a travar", () => {
    expect(semanaTravada({ scheduledFor: null }, new Date("2026-10-01T13:00:00.000Z"))).toBe(false);
  });
});
