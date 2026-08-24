// ─── O ESCOPO QUE A CASA NÃO ENTENDEU ────────────────────────────────────────
//
// ─── O CASO (Farol 27, 24/08/2026) ───────────────────────────────────────────
//
// Ana, dona de uma padaria premium-acessível com 3 lojas e R$ 420 mil/mês de
// faturamento, abriu a conversa pedindo **reposicionamento de marca** e o
// **lançamento de um clube de assinatura**, e declarou **R$ 8.000** de verba de
// honorários. O que a casa gravou:
//
//     wantsSocialMedia: false · branding.requested: false
//     services: ["paid_traffic"] · businessName: "Farol"
//     orçamento: R$ 500–1.200/mês · confianca: "high"
//
// Um terço do pedido entendido, o serviço PRINCIPAL marcado como não pedido, o
// nome do cliente cortado, e um número sete vezes menor que a verba declarada —
// tudo isso com CONFIANÇA ALTA. Não é orçar barato: é orçar com convicção sobre
// um escopo que não é o do cliente.
//
// ─── ESTE TESTE NÃO É SOBRE A FAROL 27 ───────────────────────────────────────
//
// Se ele só provasse que aquele texto agora funciona, seria uma cerca em volta
// de uma pedra. Ele guarda a FAMÍLIA de defeitos, que é o que volta:
//
//   1. o serviço principal dito com o vocabulário do CLIENTE, não o da casa
//      (radical com sufixo: "reposicionamento", "reposicionando");
//   2. nome composto com NÚMERO — identidade cortada por regex de letras;
//   3. escopo incompleto ou ambíguo tentando sair com `confidence: "high"`;
//   4. verba declarada e conta divergindo por mais de uma ordem de grandeza,
//      em silêncio.
//
// A régua da casa é uma só: **ausência de informação não é informação**. Quando
// a casa não entende, ela diz que não entendeu — nunca grava `false`, nunca
// devolve número firme.

import { describe, it, expect } from "vitest";
import { parseInitialMessage, detectBrandingRequest } from "@/lib/agency/question-engine";
import { computeEstimate } from "@/lib/agency/live-calculator";
import { lacunasAbertas } from "@/lib/agency/comercial/lacuna-de-escopo";
import { divergenciaDeVerba } from "@/lib/agency/comercial/verba-declarada";
import { emptyScope } from "@/lib/agency/briefing-conversation";
import type { BriefingScope } from "@/lib/agency/briefing-conversation";

// ── 1. O serviço pedido com todas as letras não some ──────────────────────────
describe("serviço principal fora do vocabulário da casa", () => {
  // Nenhuma destas frases usa a palavra exata que o detector procurava. Todas
  // pedem marca com todas as letras.
  const PEDIDOS_DE_MARCA = [
    "Quero um reposicionamento de marca para a padaria.",
    "Preciso reposicionar a marca da minha loja.",
    "Estamos reposicionando a marca este ano.",
    "Queria um rebranding completo.",
    "O que eu quero é repensar a identidade visual da casa.",
  ];

  for (const texto of PEDIDOS_DE_MARCA) {
    it(`não grava \`false\` para: "${texto.slice(0, 44)}…"`, () => {
      const scope = parseInitialMessage(texto);
      const pedido = scope.branding?.requested === true;
      const lacuna = (scope.lacunasDeEscopo ?? []).some((l) => l.id === "marca");

      // A trava é esta: o pedido vira SERVIÇO ou vira LACUNA. O que não pode
      // acontecer é a casa afirmar que a pessoa não pediu.
      expect(pedido || lacuna).toBe(true);
    });
  }

  it("o radical casa com o sufixo — era o `\\b` final que matava", () => {
    expect(detectBrandingRequest("reposicionamento de marca")).toBe(true);
    expect(detectBrandingRequest("reposicionar a marca")).toBe(true);
    expect(detectBrandingRequest("rebranding")).toBe(true);
  });

  it("continua NÃO inventando pedido de marca onde não houve", () => {
    // O outro lado da régua: detectar demais é tão defeito quanto detectar de
    // menos. Quem só quer posts não recebe cotação de identidade visual.
    const scope = parseInitialMessage("Quero 3 posts por semana no Instagram da minha loja.");
    expect(scope.branding?.requested).toBe(false);
    expect((scope.lacunasDeEscopo ?? []).some((l) => l.id === "marca")).toBe(false);
  });
});

// ── 2. Nome de cliente é identidade: número faz parte ─────────────────────────
describe("nome de negócio com número", () => {
  const CASOS: [string, string][] = [
    ["Tenho uma padaria chamada Farol 27, com 3 lojas.", "Farol 27"],
    ["Sou da Farol 27, quero reposicionar a marca.", "Farol 27"],
    ["Trabalho na Bistro 220 e preciso de ajuda.", "Bistro 220"],
  ];

  for (const [texto, esperado] of CASOS) {
    it(`preserva "${esperado}"`, () => {
      const scope = parseInitialMessage(texto);
      expect(scope.businessName).toBe(esperado);
    });
  }

  it("o corte é o defeito: o nome nunca volta sem o número que ele tem", () => {
    const scope = parseInitialMessage("Sou da Farol 27, quero reposicionar a marca.");
    expect(scope.businessName).not.toBe("Farol");
  });
});

// ── 3. Escopo incompleto não sai com confiança alta ───────────────────────────
describe("confiança do orçamento", () => {
  /** Escopo cotável e completo pelos critérios antigos: social com volume
   *  declarado, nada faltando em `missingForEstimate`. */
  function escopoCotavel(extra: Partial<BriefingScope> = {}): BriefingScope {
    return {
      ...emptyScope(),
      wantsSocialMedia: true,
      social: { platforms: ["Instagram"], postsPerWeek: 3 },
      ...extra,
    };
  }

  it("sem lacuna e sem divergência, a confiança alta continua existindo", () => {
    // Sem esta âncora o teste passaria com um `confidence = "low"` fixo, que
    // não é conserto nenhum — é a casa desistindo de afirmar qualquer coisa.
    const est = computeEstimate(escopoCotavel());
    expect(est.confidence).toBe("high");
  });

  it("lacuna de escopo ABERTA derruba a confiança e viaja com o número", () => {
    const est = computeEstimate(escopoCotavel({
      lacunasDeEscopo: [{
        id: "lancamento",
        oQueOClienteDisse: "lançar um clube de assinatura",
        precisaConfirmar: "Confirmar o que o cliente espera do lançamento.",
      }],
    }));
    expect(est.confidence).not.toBe("high");
    expect(est.confidence).not.toBe("medium");
    expect(est.lacunasAbertas?.map((l) => l.id)).toContain("lancamento");
  });

  it("lacuna JÁ RESPONDIDA não segura mais nada", () => {
    // Lacuna que sobrevive ao próprio conserto vira ruído e para de ser lida.
    const est = computeEstimate(escopoCotavel({
      branding: { requested: true, hasBrandBook: false, wantsRebrand: true },
      lacunasDeEscopo: [{
        id: "marca",
        oQueOClienteDisse: "reposicionamento de marca",
        precisaConfirmar: "Confirmar profundidade.",
        servicoDaCasa: "branding",
      }],
    }));
    expect(est.confidence).toBe("high");
    expect(est.lacunasAbertas).toBeUndefined();
  });

  it("verba declarada uma ordem de grandeza acima da conta acende sinal", () => {
    // O caso Farol 27 pelo lado do dinheiro: R$ 8.000 declarados contra uma
    // conta que começa em R$ 600. O confronto antigo só olhava o excesso — a
    // conta que cabe folgada demais passava calada.
    const est = computeEstimate(escopoCotavel({ budgetRange: "R$ 8.000 por mês" }));
    expect(est.divergenciaDeVerba).toBeDefined();
    expect(est.divergenciaDeVerba?.sentido).toBe("verba_muito_acima");
    expect(est.confidence).not.toBe("high");
  });

  it("diferença NORMAL de negociação continua sem alarme", () => {
    const est = computeEstimate(escopoCotavel({ budgetRange: "R$ 1.500 por mês" }));
    expect(est.divergenciaDeVerba).toBeUndefined();
  });

  it("os dois sentidos da divergência são lidos pelo mesmo módulo", () => {
    expect(divergenciaDeVerba("R$ 8.000 por mês", 600)?.sentido).toBe("verba_muito_acima");
    expect(divergenciaDeVerba("R$ 500 por mês", 6000)?.sentido).toBe("conta_muito_acima");
    expect(divergenciaDeVerba("R$ 500 por mês", 600)).toBeNull();
    expect(divergenciaDeVerba(undefined, 600)).toBeNull();
  });
});

// ── 4. O caso inteiro, ponta a ponta ──────────────────────────────────────────
describe("Farol 27 — a primeira mensagem, ponta a ponta", () => {
  const ABERTURA =
    "Oi, sou a Ana. Meu negócio é a Farol 27, uma padaria premium-acessível com 3 lojas, " +
    "6 anos, faturamento de R$ 420 mil por mês. Quero um reposicionamento de marca e " +
    "lançar um clube de assinatura. Tenho R$ 8.000 de verba de honorários.";

  it("nome inteiro, marca pedida, lançamento registrado, orçamento sem confiança alta", () => {
    const scope: BriefingScope = { ...emptyScope(), ...parseInitialMessage(ABERTURA) };

    expect(scope.businessName).toBe("Farol 27");
    expect(scope.branding?.requested).toBe(true);

    // O clube de assinatura NÃO vira serviço — a casa não tem esse produto e
    // não se inventa capacidade. Ele vira pergunta em aberto, que é a única
    // coisa honesta a fazer com ele.
    const abertas = lacunasAbertas(scope);
    expect(abertas.map((l) => l.id)).toContain("lancamento");

    const est = computeEstimate({ ...scope, budgetRange: "R$ 8.000 de honorários" });
    expect(est.confidence).not.toBe("high");
  });
});
