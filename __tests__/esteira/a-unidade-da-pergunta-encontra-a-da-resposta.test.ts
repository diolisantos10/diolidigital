import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { volumeNaUnidade } from "@/lib/agency/question-engine";

// ─────────────────────────────────────────────────────────────────────────────
// A VARREDURA — porque duas perguntas com o mesmo defeito significam mais
//
// O incidente do CEO ("2 posts por dia" virando `postsPerWeek: 2`) foi
// consertado em duas perguntas. A varredura do motor então mediu quantos lugares
// leem número com unidade: **SEIS**, e QUATRO ainda estavam errados —
//
//   1. `posts_per_week`            → postsPerWeek   (semana)  já consertado
//   2. `stories`                   → storiesPerWeek (semana)  já consertado
//   3. `reels`                     → reelsPerMonth  (MÊS)     estava errado
//   4. negociação "quero reels"    → reelsPerMonth  (MÊS)     estava errado
//   5. negociação "mais posts"     → postsPerWeek   (semana)  estava errado
//   6. negociação "menos posts"    → postsPerWeek   (semana)  estava errado
//
// Os dois últimos são a lição: a NEGOCIAÇÃO é uma segunda porta para o mesmo
// campo. Consertar só a pergunta deixaria o defeito escolher por onde entrar.
//
// E o conserto teve de ser ESTRUTURAL: a unidade de destino virou parâmetro de
// `volumeNaUnidade`. Três consertos manuais viram um quarto defeito no dia em
// que alguém adicionar a quarta pergunta — com o parâmetro, quem escreve a
// pergunta é obrigado a dizer em que unidade o campo guarda.
// ─────────────────────────────────────────────────────────────────────────────

describe("a conversão respeita as DUAS unidades — a da pergunta e a da resposta", () => {
  it("para SEMANA: o caso do CEO", () => {
    expect(volumeNaUnidade("2 posts por dia.", "semana")).toBe(14);
    expect(volumeNaUnidade("10 por mês", "semana")).toBe(3);
    expect(volumeNaUnidade("5 por semana", "semana")).toBe(5);
  });

  it("para MÊS: o campo dos reels", () => {
    expect(volumeNaUnidade("4 por mês", "mes")).toBe(4);
    expect(volumeNaUnidade("2 por semana", "mes")).toBe(8);
    expect(volumeNaUnidade("1 por dia", "mes")).toBe(28);
  });

  it("🔴 O ERRO INVERSO: por mês não pode virar por semana, nem o contrário", () => {
    // Esta é a razão de a unidade de destino ser parâmetro. Se `reels` usasse a
    // conversão semanal, "2 reels por semana" viraria 2 reels POR MÊS — a casa
    // entregaria um quarto do combinado, com a cara de conserto.
    expect(volumeNaUnidade("2 por semana", "mes")).not.toBe(volumeNaUnidade("2 por semana", "semana"));
    expect(volumeNaUnidade("8 por mês", "semana")).toBe(2);
    expect(volumeNaUnidade("8 por mês", "mes")).toBe(8);
  });

  it("sem unidade declarada, vale a da PERGUNTA — nos dois destinos", () => {
    // Ausência de unidade é diferente de unidade contrária.
    expect(volumeNaUnidade("4", "semana")).toBe(4);
    expect(volumeNaUnidade("4", "mes")).toBe(4);
  });

  it("sem número, devolve ausência — nunca palpite", () => {
    expect(volumeNaUnidade("bastante", "semana")).toBeUndefined();
    expect(volumeNaUnidade("todo dia", "mes")).toBeUndefined();
  });

  it("nunca devolve zero por arredondamento — some com o pedido da pessoa", () => {
    // "1 por mês" para destino semanal é 0,25. Arredondar para 0 apagaria um
    // serviço que a pessoa contratou.
    expect(volumeNaUnidade("1 por mês", "semana")).toBe(1);
  });
});

describe("nenhuma porta ficou sem a conversão", () => {
  const FONTE = readFileSync(join(process.cwd(), "lib/agency/question-engine.ts"), "utf8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");

  it("nenhum parse ou negociação lê o número cru", () => {
    // `extractNumber` continua existindo — é ele que `volumeNaUnidade` usa por
    // dentro. O que não pode voltar é alguém gravar volume com ele direto.
    expect(FONTE).not.toMatch(/extractNumber\((answer|text)\)/);
  });

  it("os campos por mês pedem destino 'mes', e os por semana pedem 'semana'", () => {
    // Os dois campos POR MÊS pedem o destino "mes", explicitamente.
    for (const trecho of FONTE.split("\n").filter((l) => /reelsPerMonth:\s*(isNo|volumeNaUnidade|n\b)/.test(l))) {
      expect(trecho, `reelsPerMonth sem destino "mes": ${trecho.trim()}`).toMatch(/"mes"|reelsPerMonth: n/);
    }
    // Os semanais usam o atalho `frequenciaSemanal`, que é `volumeNaUnidade(…,
    // "semana")` — o nome que o incidente do CEO batizou.
    expect(FONTE).toMatch(/postsPerWeek:[^\n]*frequenciaSemanal/);
    expect(FONTE).toMatch(/storiesPerWeek:[^\n]*frequenciaSemanal/);
    expect(FONTE).toMatch(/volumeNaUnidade\(text, "semana"\)/);
  });
});
