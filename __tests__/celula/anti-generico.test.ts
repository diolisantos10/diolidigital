// ─── A TRAVA ANTI-GENÉRICO — as duas metades, sempre ────────────────────────
//
// Prova, com código executável, os quatro bloqueios exigidos pelo CEO e a
// metade gêmea de cada um: o caso limpo, correspondente, PASSA — porque uma
// trava que barra tudo é desligada na primeira sexta-feira apertada.

import { describe, it, expect } from "vitest";
import { avaliarAntiGenerico, FRASES_GENERICAS } from "@/lib/agency/celula/mensagens/anti-generico";
import frasesGenericasBruto from "@/docs/plataformas/99freelas/frases-genericas.json";

describe("anti-generico · avaliarAntiGenerico", () => {
  // ── 1. Texto idêntico a um já enviado ⇒ BLOQUEADO (impressão digital) ─────
  it("bloqueia texto IDÊNTICO a um já enviado, por impressão digital", () => {
    const jaEnviado =
      "Olá! Fazemos 12 posts mensais para o seu Instagram, com paleta e cronograma editorial fechados em 5 dias úteis.";
    const r = avaliarAntiGenerico({
      textoFinal: jaEnviado,
      variaveis: { nomeDoCliente: "Clínica Sorriso Aberto" },
      variaveisObrigatorias: ["nomeDoCliente"],
      textosJaEnviados: [jaEnviado],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.causa).toBe("texto_repetido");
      expect(r.motivo.length).toBeGreaterThan(10);
    }
  });

  it("bloqueia mesmo com diferença só de acento, caixa e espaço (a impressão normaliza)", () => {
    const jaEnviado = "Olá! Fazemos 12 posts   para o Instagram.";
    const quaseIgual = "olá  fazemos 12 posts para o instagram";
    const r = avaliarAntiGenerico({
      textoFinal: quaseIgual,
      variaveis: { nomeDoCliente: "Clínica Sorriso Aberto" },
      variaveisObrigatorias: ["nomeDoCliente"],
      textosJaEnviados: [jaEnviado],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.causa).toBe("texto_repetido");
  });

  // ── 2. Texto só com o nome trocado ⇒ BLOQUEADO (similaridade) ─────────────
  it("bloqueia texto QUASE idêntico — só o nome do cliente foi trocado", () => {
    const original =
      "Olá Clínica Sorriso Aberto! Fazemos 12 posts mensais para o seu Instagram, com paleta azul-petróleo definida e cronograma editorial fechado em 5 dias úteis.";
    const comOutroNome = original.replace("Clínica Sorriso Aberto", "Studio Beleza Plena");
    const r = avaliarAntiGenerico({
      textoFinal: comOutroNome,
      variaveis: { nomeDoCliente: "Studio Beleza Plena" },
      variaveisObrigatorias: ["nomeDoCliente"],
      textosJaEnviados: [original],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.causa).toBe("texto_parecido");
      expect(r.motivo).toMatch(/parecid[ao]/i);
    }
  });

  // ── 3. Variável obrigatória vazia ⇒ BLOQUEADO, com o nome da variável ─────
  it("bloqueia variável obrigatória vazia, nomeando a variável no motivo", () => {
    const r = avaliarAntiGenerico({
      textoFinal: "Olá! Podemos ajudar com o seu projeto.",
      variaveis: { nomeDoCliente: "   " },
      variaveisObrigatorias: ["nomeDoCliente"],
      textosJaEnviados: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.causa).toBe("variavel_vazia");
      expect(r.motivo).toContain("nomeDoCliente");
    }
  });

  it("bloqueia variável obrigatória AUSENTE do objeto (não só vazia)", () => {
    const r = avaliarAntiGenerico({
      textoFinal: "Olá! Podemos ajudar.",
      variaveis: {},
      variaveisObrigatorias: ["nomeDoCliente"],
      textosJaEnviados: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.causa).toBe("variavel_vazia");
      expect(r.motivo).toContain("nomeDoCliente");
    }
  });

  // ── 4. Variável genérica ⇒ BLOQUEADO, com a frase nomeada ─────────────────
  it("bloqueia variável preenchida com frase genérica de catálogo, nomeando a frase", () => {
    const r = avaliarAntiGenerico({
      textoFinal: "Olá! Oferecemos um serviço de qualidade para você.",
      variaveis: { descricaoDoServico: "um serviço de qualidade" },
      variaveisObrigatorias: ["descricaoDoServico"],
      textosJaEnviados: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.causa).toBe("variavel_generica");
      expect(r.motivo).toContain("um serviço de qualidade");
    }
  });

  it("bloqueia a frase genérica mesmo com acento/caixa diferentes ou embutida em frase maior", () => {
    const r = avaliarAntiGenerico({
      textoFinal: "x",
      variaveis: { descricaoDoServico: "Prestamos um serviço com ALTA QUALIDADE para todos." },
      variaveisObrigatorias: ["descricaoDoServico"],
      textosJaEnviados: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.causa).toBe("variavel_generica");
  });

  it("bloqueia as irmãs da mesma família genérica ('seu projeto', 'sua empresa'...)", () => {
    for (const generica of ["seu projeto", "sua empresa", "seu negócio", "resultados incríveis"]) {
      const r = avaliarAntiGenerico({
        textoFinal: "x",
        variaveis: { descricaoDoServico: generica },
        variaveisObrigatorias: ["descricaoDoServico"],
        textosJaEnviados: [],
      });
      expect(r.ok, `esperava bloqueio para "${generica}"`).toBe(false);
      if (!r.ok) expect(r.causa).toBe("variavel_generica");
    }
  });

  // ── 6. As duas metades: o caso limpo passa em TODOS os quatro acima ───────
  it("as duas metades: o caso limpo, específico e novo, PASSA", () => {
    const r = avaliarAntiGenerico({
      textoFinal:
        "Olá Clínica Sorriso Aberto! Fazemos 12 posts mensais para o seu Instagram, com paleta azul-petróleo definida e cronograma fechado em 5 dias úteis.",
      variaveis: {
        nomeDoCliente: "Clínica Sorriso Aberto",
        descricaoDoServico: "12 posts mensais com paleta azul-petróleo definida",
      },
      variaveisObrigatorias: ["nomeDoCliente", "descricaoDoServico"],
      textosJaEnviados: [
        "Bom dia! Fazemos landing page com checkout integrado para lojas de roupa, com 3 rodadas de ajuste.",
      ],
    });
    expect(r.ok, r.ok ? "" : r.motivo).toBe(true);
  });

  // ── 7. A lista de frases genéricas está no JSON, e o .ts a lê de lá ───────
  it("a lista de frases genéricas vem do JSON — o .ts não duplica a lista", () => {
    const bruto = frasesGenericasBruto as unknown as { frases: Array<{ frase: string }> };
    expect(FRASES_GENERICAS.length).toBe(bruto.frases.length);
    expect(FRASES_GENERICAS.length).toBeGreaterThanOrEqual(10);

    const frases = FRASES_GENERICAS.map((f) => f.frase);
    // As três que o CEO citou nominalmente em M01.
    expect(frases).toContain("um serviço de qualidade");
    expect(frases).toContain("alta qualidade");
    expect(frases).toContain("seu projeto");

    for (const entrada of FRASES_GENERICAS) {
      expect(entrada.porqueEGenerica.length, `"${entrada.frase}" sem porquê`).toBeGreaterThan(5);
      expect(entrada.exemploDoQueSeEsperaNoLugar.length, `"${entrada.frase}" sem exemplo`).toBeGreaterThan(3);
    }
  });
});
