// Redesenhar as telas de um carrossel sem comprar imagem nova.
//
// Cada trava tem AS DUAS METADES: barra o caso ruim E deixa passar o bom.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const BRUTO = fs.readFileSync(path.join(process.cwd(), "lib/agency/execution/recompor-carrossel.ts"), "utf8");

/** O CÓDIGO, sem os comentários. Sem isto, a própria explicação de "aqui não há
 *  generateDesign" reprovaria o teste que a explica — o comentário citaria o
 *  proibido e o teste leria a citação como uso. */
const SRC = BRUTO.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("recompor carrossel NÃO pode virar uma segunda fatura", () => {
  it("metade 1 — não chama o gerador de imagem nem baixa imagem nova", () => {
    for (const pago of ["generateDesign", "baixarImagem", "montarCarrossel("]) {
      expect(SRC.includes(pago), `passou a usar ${pago} — isso custa por tela`).toBe(false);
    }
  });

  it("metade 2 — lê a foto JÁ PAGA de cada tela do armazenamento", () => {
    expect(SRC.includes("nomeDoFundo(post.id, i + 1)")).toBe(true);
    expect(SRC.includes("lerArquivo(")).toBe(true);
  });

  it("sem a foto guardada, declara e NÃO regera — a decisão cara não é desta função", () => {
    expect(SRC.includes("saida.semFundo.push")).toBe(true);
  });
});

describe("tudo ou nada — meia sequência é pior que nenhuma", () => {
  it("lê TODAS as telas antes de gravar QUALQUER uma", () => {
    // Gravar tela por tela e falhar na quinta deixaria o post com metade das
    // telas novas e metade velhas.
    const iLeitura = SRC.indexOf("fundos.push(");
    const iGravacao = SRC.indexOf("guardarArquivo({");
    expect(iLeitura).toBeGreaterThan(-1);
    expect(iGravacao).toBeGreaterThan(-1);
    expect(iLeitura, "grava antes de terminar de ler — tudo-ou-nada quebrado").toBeLessThan(iGravacao);
  });

  it("só amarra as telas ao post quando todas existem", () => {
    expect(SRC.includes("urls.length !== telas.length")).toBe(true);
    const i = SRC.indexOf("urls.length !== telas.length");
    // A amarração (`mediaUrlsJson`) tem que vir DEPOIS dessa conferência.
    expect(SRC.indexOf("mediaUrlsJson: JSON.stringify(urls)")).toBeGreaterThan(i);
  });
});

describe("as travas da casa continuam valendo nesta porta", () => {
  it("pilar bloqueado não é redesenhado", () => {
    expect(SRC.includes("conferirPilar(post.pillar).bloqueado")).toBe(true);
  });

  it("não publica nada — nenhuma chamada de plataforma", () => {
    for (const rede of ["publishPost", "meta/client"]) {
      expect(SRC.includes(rede), `a recomposição passou a publicar (${rede})`).toBe(false);
    }
  });

  it("roteiro reprovado NÃO trava o redesenho — o defeito dele é de conteúdo", () => {
    // Barrar aqui deixaria a peça presa para sempre por um motivo que este
    // conserto não trata: ele troca o formato do arquivo, não o texto.
    expect(SRC.includes("roteiro.ok ? roteiro.telas")).toBe(true);
  });
});
