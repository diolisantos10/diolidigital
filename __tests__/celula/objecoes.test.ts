// __tests__/celula/objecoes.test.ts
//
// A ficha (docs/celula-prospeccao/despachos/D-objecoes.md) pede sete critérios
// de aceite. Este arquivo cobre os sete, mais a classificação determinística
// que sustenta tudo. Nenhum teste toca banco, rede ou IA — a trava inteira é
// código puro, e é assim que se prova que ela não depende de sorte.

import { describe, it, expect } from "vitest";
import {
  OBJECOES,
  objecaoPorId,
  classificarObjecao,
  classificarSilencio,
  podeConceder,
  type AutorizacaoRegistrada,
} from "@/lib/agency/celula/mensagens/objecoes";
import { validarTexto } from "@/lib/marketplaces/99freelas/conformidade";
import { TABELA_DE_PISO } from "@/lib/agency/comercial/negociacao";

const ONZE_OBJECOES = [
  "preco",
  "prazo",
  "confianca",
  "portfolio",
  "escopo",
  "forma_de_pagamento",
  "pedido_de_contato_externo",
  "pedido_de_teste",
  "comparacao_com_concorrente",
  "silencio",
  "indecisao",
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// CRITÉRIO 1 — as 11 objeções existem no JSON com os 6 campos, .ts lê de lá
// ─────────────────────────────────────────────────────────────────────────────

describe("as 11 objeções do CEO, lidas do JSON", () => {
  it("existem exatamente as 11, uma vez cada — nenhuma a mais, nenhuma a menos", () => {
    expect([...OBJECOES.map((o) => o.id)].sort()).toEqual([...ONZE_OBJECOES].sort());
  });

  it.each(ONZE_OBJECOES)("%s carrega os 6 campos exigidos pela ficha", (id) => {
    const o = objecaoPorId(id);
    expect(o).not.toBeNull();
    expect(Array.isArray(o!.comoOClienteFala)).toBe(true);
    expect(typeof o!.respostaAprovada).toBe("string");
    expect(o!.respostaAprovada.trim().length).toBeGreaterThan(0);
    expect(Array.isArray(o!.dadosNecessarios)).toBe(true);
    expect(o!.limiteDeNegociacao.trim().length).toBeGreaterThan(0);
    expect(o!.quandoEscalarAoGerente.trim().length).toBeGreaterThan(0);
  });

  it("silêncio não tem sinal de texto — ela não vem de texto", () => {
    expect(objecaoPorId("silencio")!.comoOClienteFala).toEqual([]);
  });

  it("nenhuma resposta aprovada escreve número de preço", () => {
    for (const o of OBJECOES) expect(o.respostaAprovada).not.toMatch(/R\$\s*\d/);
  });

  it("objecaoPorId de um id que não existe é null, nunca um objeto inventado", () => {
    expect(objecaoPorId("id-que-nao-existe")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CRITÉRIO 5 — contato externo e teste passam pelo Guardião
// ─────────────────────────────────────────────────────────────────────────────

describe("as respostas obrigatórias passam pelo Guardião (validarTexto)", () => {
  it("pedido_de_contato_externo não é barrada", () => {
    const r = validarTexto(objecaoPorId("pedido_de_contato_externo")!.respostaAprovada);
    expect(r.ok).toBe(true);
    expect(r.achados).toEqual([]);
  });

  it("pedido_de_teste não é barrada", () => {
    const r = validarTexto(objecaoPorId("pedido_de_teste")!.respostaAprovada);
    expect(r.ok).toBe(true);
    expect(r.achados).toEqual([]);
  });

  it("nenhuma das 11 respostas aprovadas é barrada pelo Guardião", () => {
    for (const o of OBJECOES) {
      const r = validarTexto(o.respostaAprovada);
      expect(r.ok, `"${o.id}" foi barrada por: ${JSON.stringify(r.achados)}`).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// classificarObjecao — determinística, sem IA
// ─────────────────────────────────────────────────────────────────────────────

describe("classificarObjecao — por sinal do JSON, sem IA", () => {
  it("reconhece preço, confiança alta para sinal de 2+ palavras", () => {
    const r = classificarObjecao("Poxa, está caro para mim");
    expect(r).not.toBeNull();
    expect(r!.id).toBe("preco");
    expect(r!.confianca).toBe("alta");
    expect(r!.trecho.toLowerCase()).toContain("caro");
  });

  it("confiança baixa para sinal de uma palavra só", () => {
    const r = classificarObjecao("Achei meio caro.");
    expect(r).not.toBeNull();
    expect(r!.id).toBe("preco");
    expect(r!.confianca).toBe("baixa");
    expect(r!.trecho.toLowerCase()).toBe("caro");
  });

  it("reconhece prazo", () => {
    expect(classificarObjecao("Você consegue antecipar isso?")?.id).toBe("prazo");
  });

  it("reconhece confiança", () => {
    expect(classificarObjecao("não conheço vocês ainda")?.id).toBe("confianca");
  });

  it("reconhece portfólio", () => {
    expect(classificarObjecao("posso ver trabalhos anteriores?")?.id).toBe("portfolio");
  });

  it("reconhece escopo", () => {
    expect(classificarObjecao("isso já está incluso no valor?")?.id).toBe("escopo");
  });

  it("reconhece forma de pagamento", () => {
    expect(classificarObjecao("pode parcelar em três vezes?")?.id).toBe("forma_de_pagamento");
  });

  it("reconhece pedido de contato externo", () => {
    expect(classificarObjecao("me passa seu whatsapp")?.id).toBe("pedido_de_contato_externo");
  });

  it("reconhece pedido de teste", () => {
    expect(classificarObjecao("faz um teste grátis pra eu ver?")?.id).toBe("pedido_de_teste");
  });

  it("reconhece comparação com concorrente", () => {
    expect(classificarObjecao("outro freelancer cobra menos que isso")?.id).toBe("comparacao_com_concorrente");
  });

  it("reconhece indecisão", () => {
    expect(classificarObjecao("vou pensar com calma")?.id).toBe("indecisao");
  });

  it("preserva acentuação no trecho extraído (normalização não corrompe o original)", () => {
    const r = classificarObjecao("não sei ainda, preciso ver com calma");
    expect(r?.id).toBe("indecisao");
    expect(r?.trecho).toBe("não sei ainda");
  });

  it("CRITÉRIO 6 — não reconheceu ⇒ null, e null é o sinal para escalar", () => {
    expect(classificarObjecao("o rio de janeiro continua lindo em agosto")).toBeNull();
  });

  it("entrada vazia ou hostil ⇒ null, nunca lança", () => {
    expect(classificarObjecao("")).toBeNull();
    expect(classificarObjecao("   ")).toBeNull();
    // @ts-expect-error entrada hostil deliberada — texto de cliente não é tipo confiável
    expect(classificarObjecao(null)).toBeNull();
  });

  it("silêncio nunca é devolvida por classificarObjecao — não vem de texto", () => {
    expect(classificarObjecao("silêncio total, o cliente sumiu")).toBeNull();
  });
});

describe("classificarSilencio — vem de tempo, nunca de texto", () => {
  it("abaixo do limite ⇒ null", () => {
    expect(
      classificarSilencio({ msDesdeUltimaRespostaDoCliente: 1_000, limiteDeSilencioMs: 3_600_000 }),
    ).toBeNull();
  });

  it("no limite ou acima ⇒ detecta com confiança alta", () => {
    const r = classificarSilencio({ msDesdeUltimaRespostaDoCliente: 3_600_000, limiteDeSilencioMs: 3_600_000 });
    expect(r?.id).toBe("silencio");
    expect(r?.confianca).toBe("alta");
  });

  it("parâmetro inválido ⇒ null, nunca assume um valor", () => {
    expect(
      classificarSilencio({ msDesdeUltimaRespostaDoCliente: Number.NaN, limiteDeSilencioMs: 3_600_000 }),
    ).toBeNull();
    expect(classificarSilencio({ msDesdeUltimaRespostaDoCliente: 1_000, limiteDeSilencioMs: 0 })).toBeNull();
    expect(
      classificarSilencio({ msDesdeUltimaRespostaDoCliente: -1, limiteDeSilencioMs: 3_600_000 }),
    ).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// podeConceder — a trava dura. Critérios 2, 3, 4 e 7 (as metades gêmeas)
// ─────────────────────────────────────────────────────────────────────────────

function autorizacao(overrides: Partial<AutorizacaoRegistrada> = {}): AutorizacaoRegistrada {
  return {
    concessao: "desconto",
    autorizadaPor: "Dioli (CEO)",
    registradaEm: "2026-08-30T12:00:00.000Z",
    referencia: "docs/decisoes.md#2026-08-30-desconto-cliente-x",
    ...overrides,
  };
}

describe("podeConceder — nenhuma concessão sem autorização registrada", () => {
  it("CRITÉRIO 2 — desconto sem autorização registrada ⇒ BLOQUEADO (o padrão)", () => {
    const v = podeConceder({
      concessao: "desconto",
      item: "copy",
      valorProposto: TABELA_DE_PISO.copy.piso,
      autorizacoes: [],
    });
    expect(v.ok).toBe(false);
  });

  it("autorização de OUTRA concessão não vale para esta ⇒ BLOQUEADO", () => {
    const v = podeConceder({
      concessao: "desconto",
      item: "copy",
      valorProposto: TABELA_DE_PISO.copy.piso,
      autorizacoes: [autorizacao({ concessao: "alteracao_de_prazo" })],
    });
    expect(v.ok).toBe(false);
  });

  it.each(["sistema", "ia", "agente", "automatico", "Sistema", " IA "])(
    'CRITÉRIO 3 — autoautorização ("%s") ⇒ BLOQUEADA',
    (quem) => {
      const v = podeConceder({
        concessao: "garantia",
        autorizacoes: [autorizacao({ concessao: "garantia", autorizadaPor: quem })],
      });
      expect(v.ok).toBe(false);
    },
  );

  it("autorização vazia em autorizadaPor ⇒ BLOQUEADA", () => {
    const v = podeConceder({
      concessao: "ampliacao_de_escopo",
      autorizacoes: [autorizacao({ concessao: "ampliacao_de_escopo", autorizadaPor: "" })],
    });
    expect(v.ok).toBe(false);
  });

  it("autorização sem referência ⇒ BLOQUEADA", () => {
    const v = podeConceder({
      concessao: "alteracao_de_prazo",
      autorizacoes: [autorizacao({ concessao: "alteracao_de_prazo", referencia: "" })],
    });
    expect(v.ok).toBe(false);
  });

  it("CRITÉRIO 4 — desconto autorizado mas ABAIXO do piso do motor ⇒ BLOQUEADO", () => {
    const piso = TABELA_DE_PISO.copy.piso;
    const v = podeConceder({
      concessao: "desconto",
      item: "copy",
      valorProposto: piso - 1,
      autorizacoes: [autorizacao()],
    });
    expect(v.ok).toBe(false);
  });

  it("desconto sem item nem valor ⇒ BLOQUEADO, nunca chuta um número", () => {
    const v = podeConceder({ concessao: "desconto", autorizacoes: [autorizacao()] });
    expect(v.ok).toBe(false);
  });

  it("item fora da tabela ⇒ BLOQUEADO — sem piso conhecido não existe autorização", () => {
    const v = podeConceder({
      concessao: "desconto",
      item: "servico-que-nao-existe",
      valorProposto: 999,
      autorizacoes: [autorizacao()],
    });
    expect(v.ok).toBe(false);
  });

  it("desconto passa do teto ESPECÍFICO desta autorização ⇒ BLOQUEADO mesmo dentro do piso do motor", () => {
    const piso = TABELA_DE_PISO.copy.piso; // dentro do piso do motor
    const v = podeConceder({
      concessao: "desconto",
      item: "copy",
      valorProposto: piso,
      // teto zero: esta autorização específica não cobre desconto nenhum
      autorizacoes: [autorizacao({ valorMaximoEmReais: 0 })],
    });
    expect(v.ok).toBe(false);
  });

  // ── CRITÉRIO 7 — AS METADES GÊMEAS ────────────────────────────────────────
  it("desconto com autorização válida, DENTRO do piso do motor, PASSA", () => {
    const piso = TABELA_DE_PISO.copy.piso;
    const v = podeConceder({
      concessao: "desconto",
      item: "copy",
      valorProposto: piso,
      autorizacoes: [autorizacao()],
    });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.autorizacao.autorizadaPor).toBe("Dioli (CEO)");
  });

  it("concessão sem número (garantia) com autorização válida PASSA", () => {
    const v = podeConceder({
      concessao: "garantia",
      autorizacoes: [autorizacao({ concessao: "garantia" })],
    });
    expect(v.ok).toBe(true);
  });

  it("concessão sem número (alteracao_de_prazo) com autorização válida PASSA", () => {
    const v = podeConceder({
      concessao: "alteracao_de_prazo",
      autorizacoes: [autorizacao({ concessao: "alteracao_de_prazo" })],
    });
    expect(v.ok).toBe(true);
  });
});
