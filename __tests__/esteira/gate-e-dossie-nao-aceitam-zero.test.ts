// GATE E DOSSIÊ NÃO ACEITAM ZERO — o buraco que sobrou depois do preço.
//
// ─── O CASO REAL (Diego, City Jobs, 16/08/2026) ─────────────────────────────
//
// O laudo do `qualidade` provou que o zero que o Diego viu não vinha do motor
// de regras (`live-calculator.ts` já trava `postsPerWeek <= 0` desde a
// rodada anterior, via `volumeDeclarado`) — vinha de OUTRAS DUAS superfícies
// que reimplementavam a MESMA condição errada, sem a guarda:
//
//   1. `runSDRQualityGate` (sdr-agent.ts) — o item "Escopo de Social Media
//      completo" dava PASS com `s.social?.postsPerWeek !== undefined`, e 0 é
//      definido. Um escopo com ZERO posts destravava como se estivesse
//      completo.
//   2. `buildBrainReasoningOutput` (sdr-agent.ts) — o dossiê do lead
//      (`knownFacts`) empurrava "0 posts/mês" como se o cliente tivesse
//      declarado isso. Fato que ninguém declarou não é fato.
//
// A assimetria que provou o esquecimento: onde o código trata Stories e
// Reels com guarda de positividade, Posts ficava sem guarda nenhuma, do
// lado. Este arquivo prova as DUAS METADES da trava, nos dois pontos:
// (i) zero não passa; (ii) volume legítimo (14/semana, a fala real do Diego)
// continua passando normalmente.
//
// O conserto: uma função só, `volumeDeclarado` (live-calculator.ts),
// exportada e reusada nos dois pontos — nunca duas cópias da mesma regra.

import { describe, it, expect } from "vitest";
import { emptyScope, emptyEstimate, type ConvState } from "@/lib/agency/briefing-conversation";
import { emptySdrState, runSDRQualityGate, buildBrainReasoningOutput } from "@/lib/agency/sdr-agent";

// Um ConvState mínimo, com Social Media selecionado e o volume que o teste
// quiser exercitar — o mesmo formato que o "patch do LLM" grava depois de
// capturar o resto do escopo (nome, negócio, plataformas etc.), por isso o
// teste não precisa reproduzir a conversa inteira para provar o ponto: os
// dois locais sob teste leem só `scope.social?.postsPerWeek`.
function convComVolume(postsPerWeek: number | undefined): ConvState {
  return {
    messages: [],
    answeredQIds: [],
    isFirstMessage: false,
    canSubmit: false,
    estimate: emptyEstimate(),
    scope: {
      ...emptyScope(),
      businessName: "City Jobs",
      segment: "Recrutamento e vagas de emprego",
      wantsSocialMedia: true,
      social: { platforms: ["Instagram"], postsPerWeek },
    },
  };
}

describe("gate de qualificação — social_scope nunca dá PASS com zero", () => {
  it("ZERO: o item 'Escopo de Social Media completo' NÃO é PASS — 0 não é escopo completo", () => {
    const conv = convComVolume(0);
    const gate = runSDRQualityGate(conv, emptySdrState());
    const item = gate.items.find((i) => i.id === "social_scope")!;

    expect(item.status).not.toBe("PASS");
    // O detalhe também não pode fingir que 0 é um dado ("0 posts/mês
    // definidos.") — era exatamente essa frase que o Diego via na tela.
    expect(item.detail).not.toMatch(/^0 posts\/mês definidos\.$/);
  });

  it("AUSENTE: sem postsPerWeek nenhum, o item também não é PASS (comportamento preexistente, preservado)", () => {
    const conv = convComVolume(undefined);
    const gate = runSDRQualityGate(conv, emptySdrState());
    const item = gate.items.find((i) => i.id === "social_scope")!;

    expect(item.status).not.toBe("PASS");
  });

  it("LEGÍTIMO (a fala real do Diego, '14 posts por semana'): o item continua PASS, nada quebrou", () => {
    const conv = convComVolume(14);
    const gate = runSDRQualityGate(conv, emptySdrState());
    const item = gate.items.find((i) => i.id === "social_scope")!;

    expect(item.status).toBe("PASS");
    expect(item.detail).toBe("56 posts/mês definidos.");
  });
});

describe("dossiê do lead (knownFacts) — zero nunca vira fato conhecido", () => {
  it("ZERO: 'posts/mês' NÃO aparece em knownFacts — fato que o cliente não declarou não é fato", () => {
    const conv = convComVolume(0);
    const gate = runSDRQualityGate(conv, emptySdrState());
    const dossie = buildBrainReasoningOutput(conv, emptySdrState(), gate);

    expect(dossie.knownFacts.some((f) => f.includes("posts/mês"))).toBe(false);
  });

  it("LEGÍTIMO (14/semana): '56 posts/mês' aparece em knownFacts normalmente — nada quebrou", () => {
    const conv = convComVolume(14);
    const gate = runSDRQualityGate(conv, emptySdrState());
    const dossie = buildBrainReasoningOutput(conv, emptySdrState(), gate);

    expect(dossie.knownFacts).toContain("56 posts/mês");
  });
});
