// QUANTIDADE TEM UM DONO SÓ — e o dono é a estimativa, nunca a tabela.
//
// ═══ O DEFEITO, MEDIDO NA TELA DO CLIENTE (25/08/2026) ══════════════════════
//
// A sala de briefing pública mostrava `pkg.description` — a cadência da TABELA,
// "5 posts + 7 stories/semana + 4 reels/mês" — três linhas acima de
// `estimate.included`, que desde o conserto do case Farol 27 traz o que a casa
// REALMENTE entrega, derivado do briefing e cortado pelo contrato de
// quantidade.
//
// A mesma tela dizia 5 posts em cima e 3 posts embaixo, uma à vista da outra,
// para o cliente ler. Verdade escrita em dois lugares já está errada em um
// deles — a única pergunta é quando alguém descobre. Aqui quem descobriria era
// o cliente, antes de assinar.
//
// O conserto foi deixar só o NOME do plano. Este teste é o que impede a
// descrição de voltar: ela é um campo que existe (a tabela precisa dele para o
// catálogo interno), e um `pkg.description` a mais numa tela é uma linha de
// código, não um projeto — é exatamente o tipo de regressão que volta sem
// ninguém notar.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const SALA = "components/agency/briefing/PublicBriefingRoom.tsx";

describe("a sala de briefing pública mostra o NOME do plano, nunca a cadência da tabela", () => {
  const bruto = readFileSync(SALA, "utf8");
  // COMENTÁRIO NÃO É CÓDIGO. A régua varre o que EXECUTA — o próprio arquivo
  // explica, em comentário, qual linha foi tirada e por quê, e uma varredura
  // ingênua reprovaria a explicação do conserto como se fosse o defeito. Régua
  // que reprova a documentação do próprio conserto é régua que alguém apaga.
  const fonte = bruto
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");

  it("não lê `description` do plano em lugar nenhum da tela", () => {
    // `getPackageDef(...).description`, `pkg.description`, `plano.description`:
    // qualquer uma delas põe a segunda quantidade de volta na tela.
    const leituras = [...fonte.matchAll(/\b(\w+)\.description\b/g)].map((m) => m[0]);
    expect(
      leituras,
      `A sala voltou a ler a descrição do plano (${leituras.join(", ")}). ` +
      "A quantidade que o cliente lê tem um dono só, e é a estimativa " +
      "(`estimate.included`), que nasce do briefing dele. A descrição da tabela " +
      "é a cadência de um plano genérico e contradiz a estimativa na mesma tela.",
    ).toEqual([]);
  });

  it("o NOME continua sendo mostrado — o conserto não apagou o plano da tela", () => {
    // O oposto também seria um defeito: sem o nome, o cliente não sabe o que
    // está comprando. O que saiu foi a quantidade duplicada, não a identidade.
    expect(bruto).toMatch(/getPackageDef\(detectPackage\([^)]*\)\)\.label/);
  });
});
