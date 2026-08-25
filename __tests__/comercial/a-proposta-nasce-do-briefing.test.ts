// A PROPOSTA NASCE DO BRIEFING — e não da tabela de planos.
//
// ═══ O DEFEITO, MEDIDO EM PRODUÇÃO (rodada 5 do case Farol 27, 25/08/2026) ═══
//
// A cliente (Ana) pediu, no briefing: 4 posts/semana, ZERO stories, 6 reels/mês,
// nos canais Instagram e TikTok, para lançar o Clube Farol 27.
//
// A proposta que saiu prometeu: "5 posts + 7 stories/semana · 4 reels/mês",
// cobrou os reels dela como EXTRA, mandou a verba de mídia para "Google/Meta" e
// não citou o Clube uma vez sequer.
//
// Nada disso foi alucinação de IA. Foi a TABELA:
//   `detectPackage(4 * 4 = 16)` → "starter" → `SOCIAL_PACKAGES[starter]`, que
//   diz 5 posts, 7 stories, 4 reels (`live-calculator.ts`). O que a cliente
//   escreveu escolhia a FAIXA DE PREÇO e era jogado fora como QUANTIDADE.
//
// E a contradição fechava o cerco do outro lado: o contrato interno da casa
// (`MISTURA_DE_FORMATOS`, `especialistas.ts`) admite no MÁXIMO 3 stories por
// entrega. A proposta prometia 7. O especialista obedecia à proposta, o contrato
// recusava, três tentativas, `blocked`. Impasse por construção: a verdade estava
// escrita em dois lugares e já estava errada em um deles.
//
// Este arquivo prova os dois lados e cobra a saída: a proposta oferece o que o
// cliente pediu, cortado pelos limites LIDOS DA FONTE ÚNICA, e diz em voz alta
// o que não cabe e o que cabe no lugar.

import { describe, it, expect } from "vitest";
import { computeEstimate, SOCIAL_PACKAGES, detectPackage } from "@/lib/agency/live-calculator";
import { MISTURA_DE_FORMATOS } from "@/lib/agency/execution/especialistas";
import { LIMITES_POR_FORMATO } from "@/lib/agency/contrato-de-quantidade";
import { lerEscopoDeConteudo, exigenciaDeConteudo } from "@/lib/agency/execution/escopo-do-cliente";
import { textoDoOrcamento } from "@/lib/agency/esteira/orcamento-do-briefing";
import type { BriefingScope } from "@/lib/agency/briefing-conversation";

/** O briefing da Ana, como ele chegou. */
const FAROL_27: BriefingScope = {
  businessName: "Farol 27",
  segment: "restaurante",
  objectives: ["Lançar o Clube Farol 27, nosso clube de assinatura"],
  wantsSocialMedia: true,
  social: {
    platforms: ["Instagram", "TikTok"],
    postsPerWeek: 4,
    storiesPerWeek: 0,
    reelsPerMonth: 6,
  },
  wantsPaidTraffic: true,
  traffic: { platforms: ["Meta", "TikTok"], monthlyAdBudget: "R$ 2.000" },
};

/** O QUE A PROPOSTA PROMETE — só a oferta, sem as recusas. É aqui que uma
 *  promessa impossível apareceria. */
const oferta = (e: ReturnType<typeof computeEstimate>) =>
  [...e.items.map((i) => `${i.label} — ${i.detail}`), ...e.included].join("\n");

/** O TEXTO QUE A CLIENTE LÊ — o mesmo que `/api/portal/briefing/proposta`
 *  devolve e que o e-mail carrega. Não é um irmão pouco usado: é a peça. */
const paraOCliente = (e: ReturnType<typeof computeEstimate>) =>
  textoDoOrcamento("Farol 27", e as never);

describe("o lado A da contradição: a tabela promete o que a cliente não pediu", () => {
  it("a faixa do plano é escolhida pelo volume — isso continua valendo", () => {
    expect(detectPackage(4 * 4)).toBe("starter");
    const starter = SOCIAL_PACKAGES.find((p) => p.id === "starter")!;
    // A tabela CONTINUA dizendo 5/7/4. Ela é preço, e preço é dela.
    expect(starter.storiesPerWeek).toBe(7);
    expect(starter.postsPerWeek).toBe(5);
  });
});

describe("o lado B da contradição: o contrato da casa admite no máximo 3 stories", () => {
  it("MISTURA_DE_FORMATOS e LIMITES_POR_FORMATO são a MESMA tabela, não duas cópias", () => {
    expect(MISTURA_DE_FORMATOS).toBe(LIMITES_POR_FORMATO);
    expect(LIMITES_POR_FORMATO.story[1]).toBe(3);
  });
});

describe("a proposta nasce do briefing", () => {
  const e = computeEstimate(FAROL_27);
  const texto = paraOCliente(e);
  const promessa = oferta(e);

  it("a cadência sai do briefing dela, nunca da tabela — os 5 posts do Starter sumiram", () => {
    expect(promessa).not.toMatch(/5 posts/);
    // Ela pediu 4; o teto real da casa é 3 — e é o teto que a proposta promete.
    expect(promessa).toMatch(/3 posts\/semana/);
    // E o que não coube é DITO, com o número dela dentro da frase.
    expect(e.notIncluded.join("\n")).toMatch(/pediu 4 posts por semana/);
  });

  it("ela pediu ZERO stories: a proposta não inventa 7", () => {
    expect(promessa).not.toMatch(/stories/i);
    expect(e.notIncluded.join("\n")).toMatch(/Stories — você pediu que não entrassem/);
  });

  it("os 6 reels que ela pediu como BASE não viram 'extra' cobrado", () => {
    expect(e.items.some((i) => /extra/i.test(i.label))).toBe(false);
    expect(promessa).toMatch(/6 reels/);
  });

  it("cita o Clube Farol 27 — a razão do projeto inteiro", () => {
    expect(texto).toMatch(/Clube Farol 27/);
  });

  it("a verba vai para os canais que ela pediu, e o Google não aparece", () => {
    expect(texto).toMatch(/Meta/);
    expect(texto).not.toMatch(/Google/);
  });

  it("TikTok: a casa não produz, e a proposta DIZ isso em vez de trocar em silêncio", () => {
    expect(texto).toMatch(/TikTok/);
    expect(texto).toMatch(/TikTok[^\n]*(não|nao)/);
  });
});

describe("falha fechada e VISÍVEL: quem pede mais do que a casa faz lê o porquê e o que cabe", () => {
  const pedeDemais: BriefingScope = {
    ...FAROL_27,
    social: { ...FAROL_27.social!, storiesPerWeek: 7 },
  };
  const e = computeEstimate(pedeDemais);
  const promessa = oferta(e);

  it("não promete os 7 — promete o teto real da casa", () => {
    expect(promessa).not.toMatch(/7 stories/);
    expect(promessa).toMatch(/3 stories\/semana/);
  });

  it("a proibição vem com a instrução gêmea: diz o que É possível", () => {
    expect(e.notIncluded.join("\n")).toMatch(/vai até 3 por semana/);
  });

  it("o que a proposta oferece PASSA no contrato de quantidade — o impasse acabou", () => {
    const oferecido = Number(/(\d+) stories\/semana/.exec(promessa)?.[1]);
    expect(oferecido).toBeLessThanOrEqual(LIMITES_POR_FORMATO.story[1]);
  });
});

describe("zero declarado é exclusão, não lacuna — senão o contrato cobra o que ela recusou", () => {
  it("storiesPerWeek: 0 tira story do escopo, e o especialista não é cobrado por ele", () => {
    const escopo = lerEscopoDeConteudo({ escopo: JSON.stringify({ scope: FAROL_27 }) });
    expect(escopo.excluidos).toContain("story");
    expect(exigenciaDeConteudo(escopo).permitidos).not.toContain("story");
  });
});
