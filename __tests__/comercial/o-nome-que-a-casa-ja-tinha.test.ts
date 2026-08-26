// "PRECISO CONFIRMAR: NOME DO NEGÓCIO" — com o nome no escopo desde o 1º turno.
//
// 8ª volta, 26/08/2026: uma entrega de Estratégia nasceu com essa frase no
// TÍTULO — o primeiro campo que o cliente lê. Honestidade é boa: "PRECISO
// CONFIRMAR" é o especialista admitindo que não sabe, e é o que impede a casa
// de inventar. Perguntar o que já se sabe não é honestidade — é a casa não ter
// lido a própria memória.
//
// A causa é a de sempre: a mesma verdade em dois lugares. O nome mora na coluna
// `ClientRequestDb.businessName` (que é String NÃO-NULO e grava "" quando a
// porta não soube) e também em `briefingJson.scope.businessName`. A produção só
// olhava a coluna.

import { describe, it, expect } from "vitest";
import { nomeDoNegocio, tituloSemConfissao, lerNegocio } from "@/lib/agency/comercial/negocio-do-lead";

const ESCOPO_COM_NOME = JSON.stringify({ scope: { businessName: "GRAO DO BECO NOME TESTE" } });

describe("o nome olha as três memórias", () => {
  it("A COLUNA VAZIA NÃO APAGA O NOME QUE ESTÁ NO ESCOPO — o caso medido", () => {
    expect(nomeDoNegocio({ businessName: "", briefingJson: ESCOPO_COM_NOME })).toBe("GRAO DO BECO NOME TESTE");
  });

  it("a ordem é a da FORÇA: coluna, escopo, cadastro", () => {
    expect(nomeDoNegocio({ businessName: "Da Porta", briefingJson: ESCOPO_COM_NOME, clientName: "Do Cadastro" }))
      .toBe("Da Porta");
    expect(nomeDoNegocio({ businessName: "  ", briefingJson: ESCOPO_COM_NOME, clientName: "Do Cadastro" }))
      .toBe("GRAO DO BECO NOME TESTE");
    expect(nomeDoNegocio({ businessName: "", briefingJson: null, clientName: "Do Cadastro" })).toBe("Do Cadastro");
  });

  it("NÃO SABER continua sendo a resposta honesta", () => {
    expect(nomeDoNegocio({})).toBeNull();
    expect(nomeDoNegocio({ businessName: "", briefingJson: "{}", clientName: "   " })).toBeNull();
  });

  it("JSON quebrado não derruba a produção — vira ausência", () => {
    expect(nomeDoNegocio({ businessName: "", briefingJson: "{isto não é json" })).toBeNull();
    expect(nomeDoNegocio({ businessName: "", briefingJson: JSON.stringify({ scope: { businessName: 42 } }) })).toBeNull();
  });

  it("continua usando o mesmo leitor de ausência da casa", () => {
    expect(lerNegocio("")).toBeNull();
  });
});

describe("o título não pergunta o que a casa já sabe", () => {
  const PADRAO = "Estratégia — GRAO DO BECO NOME TESTE";

  it("com o nome conhecido, a confissão sai do RÓTULO", () => {
    expect(tituloSemConfissao("PRECISO CONFIRMAR: nome do negócio — Plano de conteúdo", PADRAO, "GRAO DO BECO NOME TESTE"))
      .toBe(PADRAO);
  });

  it("SEM o nome, a confissão FICA — esconder a dúvida é pior que mostrá-la", () => {
    const cru = "PRECISO CONFIRMAR: nome do negócio";
    expect(tituloSemConfissao(cru, PADRAO, null)).toBe(cru);
  });

  it("título honesto passa intacto", () => {
    expect(tituloSemConfissao("Plano de conteúdo do mês", PADRAO, "GRAO DO BECO NOME TESTE"))
      .toBe("Plano de conteúdo do mês");
  });
});
