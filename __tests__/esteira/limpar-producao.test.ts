// Apagar o que foi FABRICADO sem levar junto o que foi PEDIDO ou SABIDO.
//
// Este é o teste de uma rota DESTRUTIVA e irreversível. Cada trava tem as duas
// metades: prova que o que tem de sair sai, E que o que tem de ficar fica.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const BRUTO = fs.readFileSync(path.join(process.cwd(), "app/api/admin/limpar-producao/route.ts"), "utf8");
/** O código sem comentários: a explicação cita o que NÃO se apaga, e o teste
 *  leria a citação como uso. */
const SRC = BRUTO.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Só o corpo da transação — é lá que o dano acontece. */
function corpoDaTransacao(): string {
  const i = SRC.indexOf("prisma.$transaction");
  expect(i, "a limpeza deixou de ser transacional").toBeGreaterThan(-1);
  return SRC.slice(i, SRC.indexOf("});", SRC.indexOf("mediaAsset.deleteMany", i)));
}

describe("o que foi FABRICADO sai", () => {
  const tx = corpoDaTransacao();
  for (const tabela of ["approvalComment", "approvalRequest", "socialPost", "deliverable"]) {
    it(`apaga ${tabela}`, () => {
      expect(tx.includes(`${tabela}.deleteMany`)).toBe(true);
    });
  }
});

describe("o que foi PEDIDO fica — apagar isso seria apagar o trabalho do cliente", () => {
  const tx = corpoDaTransacao();
  for (const intocavel of ["briefing", "project", "client.", "clientRequestDb"]) {
    it(`NÃO apaga ${intocavel}`, () => {
      expect(
        tx.includes(`${intocavel}deleteMany`) || tx.includes(`${intocavel}.deleteMany`),
        `a limpeza passou a apagar ${intocavel} — o briefing é justamente o que o CEO mandou preservar`,
      ).toBe(false);
    });
  }
});

describe("o que a casa SABE sobre a marca fica — é régua, não produção", () => {
  const tx = corpoDaTransacao();

  it("NÃO apaga o cérebro de marca", () => {
    expect(tx.includes("brandBrain")).toBe(false);
  });

  it("NÃO apaga as proibições do cliente", () => {
    // Elas moram em BrainArtifact. Apagá-las devolveria toda marca ao dia zero,
    // e o cliente teria de dizer de novo o que já disse uma vez.
    expect(tx.includes("brainArtifact")).toBe(false);
  });
});

describe("a mídia: só o que a CASA gerou", () => {
  const tx = corpoDaTransacao();

  it("apaga a arte gerada", () => {
    expect(tx).toContain("mediaAsset.deleteMany");
    expect(tx).toContain('"generated"');
  });

  it("NÃO apaga o que o cliente enviou — os logos que ele acabou de subir", () => {
    // O filtro é por `kind`. Um deleteMany({}) sem filtro levaria o material do
    // cliente junto, e é o erro mais caro possível nesta rota.
    const i = tx.indexOf("mediaAsset.deleteMany");
    const chamada = tx.slice(i, i + 160);
    expect(chamada.includes("where"), "mídia apagada SEM filtro — leva o material do cliente junto").toBe(true);
    expect(chamada.includes("inbound"), "o filtro não pode incluir inbound").toBe(false);
  });
});

describe("apagar exige mais de um gesto", () => {
  it("exige o segredo", () => {
    expect(SRC.includes("autorizado(request)")).toBe(true);
  });

  it("exige a frase de confirmação", () => {
    expect(SRC.includes("corpo.confirm !== FRASE")).toBe(true);
  });

  it("exige a variável de ambiente, e vem DESLIGADA por padrão", () => {
    expect(SRC.includes('process.env.ALLOW_PRODUCTION_RESET !== "true"')).toBe(true);
  });

  it("GET não apaga nada — é a conferência de olhar antes", () => {
    const i = SRC.indexOf("export async function GET");
    const corpo = SRC.slice(i, SRC.indexOf("export async function POST"));
    expect(corpo.includes("deleteMany"), "o GET passou a apagar — a conferência virou execução").toBe(false);
  });

  it("é transacional — apagar metade e falhar é pior que não apagar", () => {
    expect(SRC.includes("prisma.$transaction")).toBe(true);
  });
});
