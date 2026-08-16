import { describe, it, expect } from "vitest";
import { frequenciaSemanal } from "@/lib/agency/question-engine";
import { initProspectConvState, processProspectMessage } from "@/lib/agency/prospect-engine";
import { computeEstimate } from "@/lib/agency/live-calculator";

// ─────────────────────────────────────────────────────────────────────────────
// A QUEIXA DO CEO, E A METADE QUE QUASE FICOU DE FORA — 16/08/2026
//
// Ele declarou **"2 posts por dia"**. O painel mostrou "0 posts/mês" e a casa
// devolveu **3 posts por semana**. O dia inteiro isso foi tratado como
// consequência de um pacote truncado.
//
// **Havia um segundo caminho, independente, numa conversa que nem foi cortada.**
// A pergunta é "quantas postagens POR SEMANA?", e o parse fazia
// `extractNumber(answer)` — que lê o número e **ignora a unidade**. "2 posts por
// dia" virava `postsPerWeek: 2`.
//
// O preço medido do defeito, no mesmo roteiro, antes e depois:
//   • antes:  postsPerWeek = 2   → estimativa R$ 600 – R$ 900
//   • depois: postsPerWeek = 14  → estimativa R$ 4.000 – R$ 6.500
//
// A casa cotava SETE VEZES MENOS do que a pessoa pediu, e entregaria 2 posts por
// semana a quem contratou 14. Nada denunciava: "2" é um número plausível para a
// pergunta feita — a mesma doença do dia, "parece respondido, não está".
// ─────────────────────────────────────────────────────────────────────────────

describe("o número vale na unidade que a PESSOA usou", () => {
  it("o caso do CEO: 2 por dia são 14 por semana", () => {
    expect(frequenciaSemanal("2 posts por dia.")).toBe(14);
  });

  it("as outras unidades que aparecem numa conversa real", () => {
    expect(frequenciaSemanal("3 por dia")).toBe(21);
    expect(frequenciaSemanal("posto 1 diariamente")).toBe(7);
    // Por mês arredonda para CIMA: 10/mês são 2,5/semana, e entregar 2 seria
    // devolver menos do que foi contratado. Na dúvida, a favor de quem paga.
    expect(frequenciaSemanal("10 por mês")).toBe(3);
    expect(frequenciaSemanal("8 mensais")).toBe(2);
    expect(frequenciaSemanal("2 por quinzena")).toBe(1);
  });

  it("sem unidade declarada, vale a unidade da PERGUNTA — não se inventa outra", () => {
    // Ausência de unidade é diferente de unidade contrária. Quem responde "5" a
    // "quantas por semana?" está respondendo por semana; supor o contrário seria
    // inventar o pedido do cliente.
    expect(frequenciaSemanal("5")).toBe(5);
    expect(frequenciaSemanal("5 por semana")).toBe(5);
    expect(frequenciaSemanal("uns 4 posts semanais")).toBe(4);
  });

  it("sem número nenhum, devolve ausência — nunca um palpite", () => {
    // Trocar um número perdido por um número inventado é pior que perdê-lo:
    // inventado parece certo. Quem decide o que fazer com a ausência é a
    // pergunta, não este leitor.
    expect(frequenciaSemanal("todo dia")).toBeUndefined();
    expect(frequenciaSemanal("bastante coisa")).toBeUndefined();
    expect(frequenciaSemanal("")).toBeUndefined();
  });
});

describe("ponta a ponta: o que o CEO declarou chega ao escopo E à estimativa", () => {
  const ROTEIRO = [
    "Meu nome é Dioli Santos e meu negócio se chama Clínica Bela Face.",
    "Somos de estética.",
    "Quero social media: gestão de redes sociais no Instagram.",
    "Objetivo é atrair mais clientes novos.",
    "Público: mulheres de 25 a 45 anos em São Paulo.",
    "Quero que vocês criem e publiquem tudo.",
    "2 posts por dia.",
    "Sim, quero stories.",
    "Não quero reels.",
    "Não tenho fotos, preciso que vocês produzam.",
    "Sim, preciso que escrevam os textos.",
    "Não quero tráfego pago agora.",
  ];

  let estado = initProspectConvState();
  for (const fala of ROTEIRO) estado = processProspectMessage(fala, estado) as typeof estado;
  const scope = (estado as unknown as { conv: { scope: { social?: { postsPerWeek?: number } } } }).conv.scope;

  it("o escopo carrega o volume que a pessoa disse, convertido", () => {
    expect(scope.social?.postsPerWeek).toBe(14);
  });

  it("a estimativa cobra pelo que foi pedido, não por um sétimo dele", () => {
    // Antes do conserto este mesmo roteiro produzia R$ 600–900: o preço de 2
    // posts por semana. Se a estimativa sai diferente do que a pessoa declarou,
    // a estimativa está errada — não a pessoa.
    const est = computeEstimate(scope as never);
    expect(est.totalMin).toBeGreaterThan(900);
  });
});
