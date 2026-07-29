import { describe, it, expect } from "vitest";

import { comoTexto, temSubstancia, MINIMO_DE_CONTEUDO } from "@/lib/agency/esteira/conteudo";

describe("o trabalho da IA vira texto que fica guardado", () => {
  it("nenhum campo se perde no caminho", () => {
    const t = comoTexto({
      items: [{ headline: "Bastidor da cozinha", format: "reel", caption: "Como nasce o pão de cada dia", visual: "close no forno" }],
    });
    expect(t).toContain("Bastidor da cozinha");
    expect(t).toContain("reel");
    expect(t).toContain("Como nasce o pão de cada dia");
    expect(t).toContain("close no forno");
  });

  it("título e resumo abrem o documento", () => {
    const t = comoTexto({ items: [] }, { titulo: "Pacote Social — Padaria", resumo: "Quatro peças para agosto." });
    expect(t.startsWith("# Pacote Social — Padaria")).toBe(true);
    expect(t).toContain("Quatro peças para agosto.");
  });

  it("as chaves viram rótulos legíveis, não nomes de programador", () => {
    const t = comoTexto({ items: [{ headline: "X", targetAudience: "mães de bairro", call_to_action: "peça agora" }] });
    expect(t).toContain("Público");   // targetAudience tem rótulo próprio? senão vira "Target audience"
    expect(t).not.toContain("call_to_action");
    expect(t).toContain("Call to action");
  });

  it("lista dentro de objeto é percorrida, não impressa como [object Object]", () => {
    const t = comoTexto({ calendar: [{ day: "Segunda", theme: "bastidor" }, { day: "Quarta", theme: "produto" }] });
    expect(t).not.toContain("[object Object]");
    expect(t).toContain("Segunda");
    expect(t).toContain("Quarta");
  });

  it("estrutura aninhada de verdade não quebra", () => {
    const t = comoTexto({
      strategy: { positioning: "padaria de bairro", pillars: [{ name: "Bastidor", why: "gera proximidade" }] },
    });
    expect(t).toContain("padaria de bairro");
    expect(t).toContain("Bastidor");
    expect(t).toContain("gera proximidade");
  });

  it("campo vazio não vira linha morta no documento", () => {
    const t = comoTexto({ items: [{ headline: "X", caption: "", visual: null, note: "   " }] });
    expect(t).not.toMatch(/Legenda:\s*$/m);
    expect(t).not.toContain("Visual:");
  });

  it("array de strings vira uma linha só, não um item por letra", () => {
    const t = comoTexto({ channels: ["Instagram", "TikTok"] });
    expect(t).toContain("Instagram, TikTok");
  });

  it("texto puro passa direto", () => {
    expect(comoTexto("um plano simples em uma frase")).toContain("um plano simples");
  });

  it("objeto vazio não quebra — devolve o que der", () => {
    expect(() => comoTexto({})).not.toThrow();
    expect(comoTexto({}, { titulo: "Vazio" })).toContain("Vazio");
  });
});

describe("o piso de substância", () => {
  it("conteúdo curto demais não vira entregável", () => {
    expect(temSubstancia("oi")).toBe(false);
    expect(temSubstancia("")).toBe(false);
    expect(temSubstancia(null)).toBe(false);
    expect(temSubstancia(undefined)).toBe(false);
  });

  it("conteúdo de verdade passa", () => {
    expect(temSubstancia("x".repeat(MINIMO_DE_CONTEUDO))).toBe(true);
  });

  it("um pacote real de social passa o piso com folga", () => {
    const t = comoTexto({
      items: [{ headline: "Bastidor da cozinha", format: "reel", caption: "Como nasce o pão de cada dia na Padaria do João" }],
    }, { titulo: "Pacote Social" });
    expect(temSubstancia(t)).toBe(true);
  });
});
