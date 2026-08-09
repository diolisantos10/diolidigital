// O formulário de marca — a porta do CLIENTE.
//
// A trava mais importante deste arquivo não é técnica: é que "não sei" precisa
// ser uma resposta legítima. Forçar alguém a adivinhar produz resposta qualquer,
// e resposta qualquer vira regra falsa que a peça obedece para sempre — o que é
// pior do que campo vazio.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const BRUTO = fs.readFileSync(path.join(process.cwd(), "app/api/portal/marca/route.ts"), "utf8");
const SRC = BRUTO.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("só o dono responde", () => {
  for (const metodo of ["GET", "POST"]) {
    it(`${metodo} exige token de portal válido`, () => {
      const i = SRC.indexOf(`export async function ${metodo}`);
      expect(i).toBeGreaterThan(-1);
      const corpo = SRC.slice(i, i + 300);
      expect(corpo).toContain("clienteDoToken(request)");
      expect(corpo).toContain("401");
    });
  }

  it("token inválido não vira cliente nenhum — nem o primeiro da lista", () => {
    const i = SRC.indexOf("async function clienteDoToken");
    const corpo = SRC.slice(i, i + 400);
    expect(corpo).toContain("if (!acesso?.valid || !acesso.record) return null;");
  });
});

describe('"não sei" é resposta válida e NÃO vira regra', () => {
  it("resposta vazia ou 'não sei' não grava nada", () => {
    expect(SRC).toContain("resposta === NAO_SEI");
    const i = SRC.indexOf("resposta === NAO_SEI");
    // Só o bloco do "não sei": o `upsert` legítimo vive DEPOIS dele, e uma
    // janela larga demais leria o caminho certo como se fosse o errado.
    const trecho = SRC.slice(i, SRC.indexOf("const valor =", i));
    expect(trecho).toContain("gravado: false");
    // O que NÃO pode acontecer: gravar a string "não sei" como se fosse o valor
    // do campo. A próxima peça obedeceria a ela.
    expect(trecho.includes("upsert"), "gravou 'não sei' como valor do campo").toBe(false);
  });

  it("a metade oposta: resposta de verdade grava", () => {
    expect(SRC).toContain("prisma.brandBrain.upsert");
  });

  it("a mensagem de 'não sei' não repreende o cliente", () => {
    expect(SRC).toMatch(/continua em aberto, e tudo bem/);
  });
});

describe("o cliente não recomeça do zero", () => {
  it("cada resposta devolve o progresso", () => {
    expect(SRC).toContain("progresso:");
  });

  it("cada resposta já devolve as próximas — salva a cada passo", () => {
    const i = SRC.indexOf("gravado: true");
    expect(SRC.slice(i, i + 300)).toContain("proximas");
  });
});

describe("as proibições não entram por esta porta", () => {
  it("o mapa de colunas não inclui proibição", () => {
    const i = SRC.indexOf("const COLUNA");
    const mapa = SRC.slice(i, SRC.indexOf("};", i));
    expect(mapa.includes("proibicoes:")).toBe(false);
  });
});
