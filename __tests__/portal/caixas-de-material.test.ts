// As caixas pré-classificadas do portal.
//
// A trava que mais importa aqui não é técnica: **a caixa "não sei" tem de
// existir**. Cliente leigo diante de seis caixas ou escolhe errado ou desiste —
// e escolha errada vira regra falsa que a peça obedece. É o guardrail 1 aplicado
// à tela: nunca forçar alguém a adivinhar.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { CAIXAS, NAO_SEI, rotuloDoDestino } from "@/components/portal/CaixasDeMaterial";
import { PAPEIS_VALIDOS } from "@/lib/integrations/google/escolha-de-material";

const BRUTO = fs.readFileSync(path.join(process.cwd(), "components/portal/CaixasDeMaterial.tsx"), "utf8");
const SRC = BRUTO.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe('a saída para quem não sabe existe, e é diferente das outras', () => {
  it('a caixa "não sei o que é" está lá', () => {
    const triagem = CAIXAS.find((c) => c.destino === NAO_SEI);
    expect(triagem, "a saída para quem não sabe sumiu — o cliente volta a ter de adivinhar").toBeTruthy();
  });

  it("ela promete organizar, em vez de repreender", () => {
    const triagem = CAIXAS.find((c) => c.destino === NAO_SEI)!;
    expect(triagem.ajuda).toMatch(/a gente organiza/i);
  });

  it("ela é a ÚLTIMA — não compete com as categorias de verdade", () => {
    expect(CAIXAS[CAIXAS.length - 1]!.destino).toBe(NAO_SEI);
  });

  it("o rótulo dela NÃO é um papel — é a ausência declarada de um", () => {
    // Se um dia ela virar um papel gravável, a triagem some e o chute volta.
    expect(PAPEIS_VALIDOS).not.toContain(NAO_SEI as unknown as string);
    expect(rotuloDoDestino(NAO_SEI)).toMatch(/organizar/i);
  });
});

describe("cada caixa aponta para um papel que o sistema conhece", () => {
  it("nenhuma caixa manda o arquivo para um papel inventado", () => {
    for (const c of CAIXAS) {
      if (c.destino === NAO_SEI) continue;
      expect(
        PAPEIS_VALIDOS.includes(c.destino),
        `a caixa "${c.titulo}" aponta para um papel que não existe: ${c.destino}`,
      ).toBe(true);
    }
  });

  it("toda caixa fala em português de gente, não em nome de campo", () => {
    for (const c of CAIXAS) {
      expect(c.ajuda.length, `a caixa "${c.titulo}" não explica nada`).toBeGreaterThan(15);
      expect(c.ajuda).not.toMatch(/papel|campo|upload|JSON/i);
    }
  });
});

describe("a caixa é a declaração — o cliente não escolhe duas vezes", () => {
  it("soltar já entrega o destino decidido", () => {
    expect(SRC).toContain("onSoltar(Array.from(lista).map((arquivo) => ({ arquivo, destino })))");
  });

  it("não existe campo de escolha dentro das caixas", () => {
    // Um <select> aqui traria de volta o passo que este desenho veio remover.
    expect(SRC.includes("<select"), "voltou o campo de escolha — a caixa deixou de ser a declaração").toBe(false);
  });
});

describe("dá para usar sem mouse", () => {
  it("a caixa é alcançável pelo teclado e diz o que é para quem não enxerga", () => {
    expect(SRC).toContain("tabIndex={0}");
    expect(SRC).toContain("onKeyDown");
    expect(SRC).toContain("aria-label");
  });
});

// ── AS DUAS METADES LIGADAS ─────────────────────────────────────────────────
//
// A caixa da triagem só vale se o servidor souber o que fazer com ela. Uma
// caixa que dá erro ao soltar o arquivo é pior do que não ter a caixa.

const ENVIO = fs.readFileSync(path.join(process.cwd(), "components/portal/EnvioDeMaterial.tsx"), "utf8");
const ROTA = fs.readFileSync(path.join(process.cwd(), "app/api/media/route.ts"), "utf8");

describe("as caixas estão ligadas no envio", () => {
  it("o portal mostra as caixas", () => {
    expect(ENVIO).toContain("<CaixasDeMaterial onSoltar={soltarNasCaixas} />");
  });

  it('"disse que não sabe" é diferente de "ainda não disse"', () => {
    // Sem essa distinção, a triagem cairia na trava de "falta dizer o que é" e
    // o cliente não conseguiria enviar — a caixa viraria um beco.
    expect(ENVIO).toContain("fila.filter((f) => !f.papel && !f.triagem)");
  });

  it("a triagem vai ao servidor como campo próprio", () => {
    expect(ENVIO).toContain('form.append("triagem", "1")');
  });

  it("a triagem NÃO inventa papel", () => {
    // Inventar um papel aqui faria a peça obedecer a um chute do sistema.
    const i = ENVIO.indexOf("function soltarNasCaixas");
    const corpo = ENVIO.slice(i, i + 700);
    expect(corpo).toContain('i.destino === NAO_SEI ? ""');
  });
});

describe("o servidor sabe o que fazer com a triagem", () => {
  it("reconhece o campo", () => {
    expect(ROTA).toContain('form.get("triagem") === "1"');
  });

  it("NÃO grava papel para o arquivo em triagem", () => {
    const i = ROTA.indexOf("pediuTriagem");
    const bloco = ROTA.slice(i, ROTA.indexOf("if (typeof papelBruto", i));
    expect(bloco.includes("registrarMaterialEnviado"), "a triagem passou a inventar papel").toBe(false);
  });

  it("o arquivo em triagem NÃO some em silêncio — vira evento visível", () => {
    const i = ROTA.indexOf("pediuTriagem");
    const bloco = ROTA.slice(i, ROTA.indexOf("if (typeof papelBruto", i));
    expect(bloco).toContain("material_para_triagem");
  });

  it("a resposta ao cliente não o repreende por não saber", () => {
    const i = ROTA.indexOf("pediuTriagem");
    const bloco = ROTA.slice(i, ROTA.indexOf("if (typeof papelBruto", i));
    expect(bloco).toMatch(/nossa equipe vai classificar/);
  });
});
