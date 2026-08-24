// O SDR não repete valor em reais — nem o que o cliente acabou de dizer.
//
// ─── MEDIDO AO VIVO EM 24/08/2026 ───────────────────────────────────────────
//
// Depois de o SDR entrar na camada multi-IA e ganhar trava de formato, o
// `malformado` foi a zero e 15 dos 16 turnos passaram a ser atendidos pelo
// modelo. Sobrou UM turno barrado, e o laudo de forma disse exatamente o que
// era: **1 degrau da régua citado, 0 valores fora dela** — no turno seguinte ao
// cliente declarar "nosso orçamento é de R$ 500 por mês".
//
// Ou seja: não era cotação (0 valores fora da régua) e não era a pergunta da
// faixa abreviada (essa citaria 2 ou 3 degraus). Era o modelo CONFIRMANDO ao
// cliente o número que o próprio cliente tinha acabado de dar.
//
// O guarda está certo em barrar: por regex, "R$ 500" ecoado é indistinguível de
// "R$ 500" cotado, e deixar passar cotação é o erro caro. A exceção da régua NÃO
// foi alargada — o conserto é o modelo parar de produzir a fala que o guarda
// tem de barrar. É a regra da casa: o objetivo não é o guarda barrar menos, é
// ele não ter mais o que barrar.

import { describe, it, expect } from "vitest";
import { sistemaDoSdr } from "@/lib/agency/comercial/prompt-do-sdr";
import { ehPerguntaDeFaixa, formaDoPrecoNaFala } from "@/lib/agency/comercial/negociacao";

describe("a regra está escrita na ficha que o modelo recebe", () => {
  const prompt = sistemaDoSdr();

  it("manda confirmar a verba COM PALAVRAS, não com o número", () => {
    expect(prompt).toMatch(/NÃO REPITA VALOR EM REAIS NA SUA FALA/);
    expect(prompt).toMatch(/NEM O QUE O CLIENTE ACABOU DE DIZER/);
  });

  it("explica o CUSTO da desobediência — regra sem porquê é regra que se ignora", () => {
    expect(prompt).toMatch(/motor de regras/);
    expect(prompt).toMatch(/24\/08\/2026/);
  });

  it("preserva a única exceção: a régua INTEIRA continua liberada", () => {
    expect(prompt).toMatch(/régua INTEIRA|régua toda/);
  });
});

describe("o guarda NÃO foi afrouxado — a exceção segue exigindo a régua inteira", () => {
  it("o eco do valor do cliente continua sendo barrado", () => {
    const eco = "Perfeito, anotei os R$ 500 por mês de investimento.";
    expect(ehPerguntaDeFaixa(eco), "um degrau solto não pode liberar a fala").toBe(false);
    expect(formaDoPrecoNaFala(eco)).toEqual({ degraus: 1, foraDaRegua: 0 });
  });

  it("a confirmação COM PALAVRAS passa — é o caminho que a regra manda usar", () => {
    const comPalavras = "Perfeito, anotei sua faixa de investimento. E para quando você quer começar?";
    expect(formaDoPrecoNaFala(comPalavras)).toEqual({ degraus: 0, foraDaRegua: 0 });
  });

  it("a pergunta da faixa inteira continua liberada", () => {
    const regua = "Qual faixa de investimento? R$ 150, R$ 500, R$ 1.500 ou R$ 5.000 por mês?";
    expect(ehPerguntaDeFaixa(regua)).toBe(true);
  });
});
