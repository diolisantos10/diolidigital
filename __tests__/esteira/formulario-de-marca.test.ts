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
    const corpo = SRC.slice(i, i + 600);
    // ⚠️ 15/08/2026 (rodada 3): a resolução do dono saiu de
    // `validatePortalAccess` e virou `escopoDoToken` — o ESCOPO CONGELADO, que
    // além de token inválido também recusa `ponteiro_andou` (a solicitação
    // trocou de dono debaixo do token). A garantia que este teste protege é a
    // mesma e ficou MAIOR: sem escopo bom, ninguém vira cliente.
    expect(corpo).toContain("escopoDoToken");
    expect(corpo).toContain("escopo?.ok ? escopo.clientId : null");
  });
});

describe('"não sei" é resposta válida e NÃO vira regra', () => {
  it("resposta vazia ou 'não sei' não grava nada", () => {
    expect(SRC).toContain("resposta === NAO_SEI");
    const i = SRC.indexOf("resposta === NAO_SEI");
    // Só o bloco do "não sei": o `upsert` legítimo vive DEPOIS dele, e uma
    // janela larga demais leria o caminho certo como se fosse o errado.
    const trecho = SRC.slice(i, SRC.indexOf("gravarRespostaDeMarca({", i));
    expect(trecho).toContain("gravado: false");
    // O que NÃO pode acontecer: gravar a string "não sei" como se fosse o valor
    // do campo. A próxima peça obedeceria a ela.
    expect(trecho.includes("gravarRespostaDeMarca"), "gravou 'não sei' como valor do campo").toBe(false);
  });

  it("a metade oposta: resposta de verdade grava", () => {
    expect(SRC).toContain("gravarRespostaDeMarca({");
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
    const i = SRC.indexOf("gravado: r.gravado");
    expect(i, "a resposta do POST mudou de forma — o teste ficou apontando para o vazio").toBeGreaterThan(-1);
    expect(SRC.slice(i, i + 400)).toContain("proximas");
  });
});

describe("a rota não escreve no banco por conta própria", () => {
  it("toda gravação passa pelo escritor único da ficha", () => {
    // O `upsert` saiu daqui em 15/08/2026. Era a CÓPIA do envelope do painel
    // dentro desta rota que gravava `reprovadas: []` fixo — e cópia que
    // diverge é como a metade que permite reprovar nasceu vazia nas duas
    // portas ao mesmo tempo, sem nenhum teste ficar vermelho.
    expect(SRC.includes("prisma.brandBrain"), "a rota voltou a escrever direto no banco").toBe(false);
    expect(SRC).toContain("gravarRespostaDeMarca");
  });
});
