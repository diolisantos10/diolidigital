// prova-com-fonte.test.ts — TODO NÚMERO DE PROVA PRECISA DE FONTE (W12a).
//
// Duas metades, como a ficha pede:
//   • número de prova QUE APARECE numa afirmação com fonte → passa;
//   • o MESMO número SEM fonte cadastrada → recusa, citando o número.
// Mais: a lista de ignorados (data, horário, "N passos", número de card)
// nunca gera recusa, mesmo sem fonte nenhuma.

import { describe, it, expect } from "vitest";
import { conferirNumeroComFonte } from "@/lib/agency/esteira/prova-com-fonte";

describe("conferirNumeroComFonte — número de prova COM fonte passa", () => {
  it("percentual com fonte que cita o mesmo número passa", () => {
    const r = conferirNumeroComFonte({
      texto: "Nossos clientes economizam 30% no primeiro mês.",
      fontes: [
        { afirmacao: "Redução média de 30% comprovada em estudo interno de 2025.", fonte: "https://exemplo.com/estudo" },
      ],
    });
    expect(r).toEqual({ passa: true });
  });

  it('multiplicador "Nx" com fonte passa', () => {
    const r = conferirNumeroComFonte({
      texto: "Multiplique seus resultados em até 3x com nosso método.",
      fontes: [{ afirmacao: "Case do cliente Y: resultados 3x maiores após 2 meses.", fonte: "portfólio interno" }],
    });
    expect(r).toEqual({ passa: true });
  });

  it('"N vezes" com fonte passa', () => {
    const r = conferirNumeroComFonte({
      texto: "Aumentamos as vendas em 3 vezes no último trimestre.",
      fontes: [{ afirmacao: "Estudo de caso: vendas cresceram 3 vezes em 90 dias.", fonte: "https://exemplo.com/caso" }],
    });
    expect(r).toEqual({ passa: true });
  });

  it("valor em reais com fonte passa", () => {
    const r = conferirNumeroComFonte({
      texto: "Peça já pelo combo especial por R$ 59,90.",
      fontes: [{ afirmacao: "Preço tabelado do combo: R$ 59,90 (tabela atualizada).", fonte: "tabela de preços interna" }],
    });
    expect(r).toEqual({ passa: true });
  });

  it('"N mil" com fonte passa', () => {
    const r = conferirNumeroComFonte({
      texto: "Mais de 50 mil clientes já compraram.",
      fontes: [{ afirmacao: "Base de mais de 50 mil clientes atendidos desde 2020.", fonte: "relatório interno" }],
    });
    expect(r).toEqual({ passa: true });
  });

  it("número com unidade de resultado (kg) com fonte passa", () => {
    const r = conferirNumeroComFonte({
      texto: "Emagreça até 10kg com acompanhamento nutricional.",
      fontes: [{ afirmacao: "Estudo de caso: perda média de 10kg em pacientes acompanhados.", fonte: "https://exemplo.com/estudo-2" }],
    });
    expect(r).toEqual({ passa: true });
  });

  it('multiplicador POR EXTENSO ("o dobro") com fonte que cita a palavra passa (W15)', () => {
    const r = conferirNumeroComFonte({
      texto: "É o dobro de sabor pela metade do preço.",
      fontes: [
        { afirmacao: "Case do cliente: o dobro de sabor comprovado em teste cego.", fonte: "portfólio interno" },
        { afirmacao: "Promoção tabelada: metade do preço na segunda unidade.", fonte: "tabela de preços interna" },
      ],
    });
    expect(r).toEqual({ passa: true });
  });

  it("texto sem número de prova nenhum passa mesmo sem fontes", () => {
    const r = conferirNumeroComFonte({ texto: "Venha conhecer nosso novo espaço.", fontes: [] });
    expect(r).toEqual({ passa: true });
  });
});

describe("conferirNumeroComFonte — o MESMO número SEM fonte recusa", () => {
  it("percentual sem fonte recusa citando o número", () => {
    const r = conferirNumeroComFonte({
      texto: "Nossos clientes economizam 30% no primeiro mês.",
      fontes: [],
    });
    expect(r.passa).toBe(false);
    if (!r.passa) {
      expect(r.motivo).toBe("preciso confirmar a fonte: 30%");
      expect(r.numeros).toEqual(["30%"]);
    }
  });

  it('"Nx" sem fonte recusa', () => {
    const r = conferirNumeroComFonte({
      texto: "Multiplique seus resultados em até 3x com nosso método.",
      fontes: [],
    });
    expect(r.passa).toBe(false);
    if (!r.passa) expect(r.numeros).toEqual(["3x"]);
  });

  it("R$ sem fonte recusa", () => {
    const r = conferirNumeroComFonte({
      texto: "Peça já pelo combo especial por R$ 59,90.",
      fontes: [],
    });
    expect(r.passa).toBe(false);
    if (!r.passa) expect(r.numeros).toEqual(["R$ 59,90"]);
  });

  it("fonte que existe mas não cita ESTE número ainda recusa", () => {
    const r = conferirNumeroComFonte({
      texto: "Nossos clientes economizam 30% no primeiro mês.",
      fontes: [{ afirmacao: "A marca existe desde 2018.", fonte: "site institucional" }],
    });
    expect(r.passa).toBe(false);
    if (!r.passa) expect(r.motivo).toMatch(/^preciso confirmar a fonte: 30%$/);
  });

  it("dois números de prova, só um com fonte, recusa citando só o que falta", () => {
    const r = conferirNumeroComFonte({
      texto: "São 3x mais resultados por R$ 59,90.",
      fontes: [{ afirmacao: "Preço do combo: R$ 59,90.", fonte: "tabela interna" }],
    });
    expect(r.passa).toBe(false);
    if (!r.passa) expect(r.numeros).toEqual(["3x"]);
  });

  it('multiplicador POR EXTENSO ("o dobro de sabor pela metade do preço") sem fonte recusa (W15)', () => {
    const r = conferirNumeroComFonte({
      texto: "É o dobro de sabor pela metade do preço.",
      fontes: [],
    });
    expect(r.passa).toBe(false);
    if (!r.passa) {
      expect(r.numeros).toEqual(["dobro", "metade"]);
      expect(r.motivo).toBe("preciso confirmar a fonte: dobro, metade");
    }
  });

  // Decisão desta ficha (W15): "metade" NÃO tem exceção por parecer um texto
  // comum — é afirmação mensurável sobre a marca (quantidade/origem de
  // equipe) tanto quanto "metade do preço", e passa pela MESMA régua de
  // sempre: barra sem fonte, passa com fonte que cita a palavra. Coerência >
  // achar que uma frase institucional é "óbvia demais para precisar de prova".
  it('"metade" fora de contexto de promoção ("metade da equipe é de Recife") BARRA sem fonte — mesma régua, sem exceção (W15)', () => {
    const semFonte = conferirNumeroComFonte({
      texto: "Metade da equipe é de Recife.",
      fontes: [],
    });
    expect(semFonte.passa).toBe(false);
    if (!semFonte.passa) expect(semFonte.numeros).toEqual(["Metade"]);

    const comFonte = conferirNumeroComFonte({
      texto: "Metade da equipe é de Recife.",
      fontes: [{ afirmacao: "Quadro interno: Metade da equipe é natural de Recife.", fonte: "RH" }],
    });
    expect(comFonte).toEqual({ passa: true });
  });
});

describe("conferirNumeroComFonte — o que NÃO é número de prova nunca recusa", () => {
  it("data, horário, contagem de passo e número de card não geram recusa", () => {
    const r = conferirNumeroComFonte({
      texto: "No dia 27/09/2026 às 12:00 publicamos o carrossel com 3 passos (card 3/6).",
      fontes: [],
    });
    expect(r).toEqual({ passa: true });
  });

  it("mistura número ignorado (data) com número de prova real (unidade de resultado)", () => {
    const semFonte = conferirNumeroComFonte({
      texto: "No dia 27/09/2026 batemos a marca de 500 clientes atendidos.",
      fontes: [],
    });
    expect(semFonte.passa).toBe(false);
    if (!semFonte.passa) expect(semFonte.numeros).toEqual(["500 clientes"]);

    const comFonte = conferirNumeroComFonte({
      texto: "No dia 27/09/2026 batemos a marca de 500 clientes atendidos.",
      fontes: [{ afirmacao: "Marco histórico: 500 clientes atendidos até setembro de 2026.", fonte: "relatório interno" }],
    });
    expect(comFonte).toEqual({ passa: true });
  });
});
