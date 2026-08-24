// O laudo do `price_leak` — medir a forma sem gravar a fala.
//
// A bateria ao vivo achou `price_leak ×1` em toda rodada, sempre uma só. A
// leitura provável era a exceção da régua não fechando, mas era HIPÓTESE: a
// fala barrada não é gravada, de propósito. Estes dois números a transformam em
// fato sem contrabandear uma palavra do que o guarda impediu de sair.

import { describe, it, expect } from "vitest";
import { formaDoPrecoNaFala, ehPerguntaDeFaixa } from "@/lib/agency/comercial/negociacao";

describe("formaDoPrecoNaFala", () => {
  it("a pergunta da faixa INTEIRA: quatro degraus, nada fora — e a exceção fecha", () => {
    const fala = "Qual faixa de investimento? R$ 150, R$ 500, R$ 1.500 ou R$ 5.000 por mês?";
    expect(formaDoPrecoNaFala(fala)).toEqual({ degraus: 4, foraDaRegua: 0 });
    expect(ehPerguntaDeFaixa(fala)).toBe(true);
  });

  // ── A HIPÓTESE DE 24/08, agora mensurável ────────────────────────────────
  it("o modelo ABREVIANDO as opções: dois degraus — a exceção não fecha, e o laudo diz por quê", () => {
    const fala = "Seu investimento mensal fica entre R$ 500 e R$ 1.500?";
    expect(formaDoPrecoNaFala(fala)).toEqual({ degraus: 2, foraDaRegua: 0 });
    expect(ehPerguntaDeFaixa(fala), "dois degraus não podem liberar a fala").toBe(false);
  });

  it("COTAÇÃO de verdade: valor fora da régua — é o que o guarda existe para pegar", () => {
    const fala = "Para o seu caso o investimento fica em R$ 4.200 por mês.";
    const forma = formaDoPrecoNaFala(fala);
    expect(forma.foraDaRegua).toBeGreaterThan(0);
    expect(ehPerguntaDeFaixa(fala)).toBe(false);
  });

  it("fala sem dinheiro nenhum não inventa número", () => {
    expect(formaDoPrecoNaFala("Qual é o seu público-alvo?")).toEqual({ degraus: 0, foraDaRegua: 0 });
  });

  it("não quebra com entrada que não é texto", () => {
    expect(() => formaDoPrecoNaFala(undefined as unknown as string)).not.toThrow();
  });
});
