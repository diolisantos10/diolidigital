// A FAIXA QUE ELE ESCOLHEU DO CARDÁPIO — e não o número que a casa raspou dela.
//
// ⚠️ MEDIDO EM PRODUÇÃO (cliente oculto, 8ª volta, 26/08/2026, 3º turno). O SDR
// ofereceu a régua inteira e o cliente respondeu, palavra por palavra:
//
//     "Entre R$ 500 e R$ 1.500. E já aviso: NÃO quero anúncio pago agora."
//
// O escopo devolvido pela rota veio com:
//
//     "budgetRange": "entre R$ 150 e R$ 500"      ← o degrau de BAIXO
//
// E a fala do SDR foi *"Anotei sua faixa de investimento"*. A casa confirmou ter
// registrado o que ele disse e registrou outra coisa, num campo de DINHEIRO.
//
// A causa é a regra CERTA da 6ª volta ("quando o cliente disse um número, o
// número manda") aplicada ao caso errado: ele não disse um valor, repetiu um
// RÓTULO. `parseBudgetAmount` pegou o primeiro número do rótulo (500) e
// `ofertaParaFaixa(500)` escolheu o degrau de baixo pela própria régua da casa —
// `500 > 150 && 500 <= 500` — porque 500 é o teto de um degrau e o piso do
// seguinte.

import { describe, it, expect } from "vitest";
import { faixaEscolhidaNaFala, ofertaParaFaixa, FAIXAS } from "@/lib/agency/comercial/negociacao";

describe("a fala real que a casa errou", () => {
  it("🔴 'Entre R$ 500 e R$ 1.500' é o degrau de CIMA — o que ele apontou", () => {
    expect(faixaEscolhidaNaFala("Entre R$ 500 e R$ 1.500. E já aviso: NÃO quero anúncio pago agora, só conteúdo orgânico."))
      .toBe("entre R$ 500 e R$ 1.500");
  });

  it("a aritmética antiga, sozinha, continua devolvendo o degrau ERRADO", () => {
    // Não é acusação retroativa: é a prova de que o conserto precisava existir
    // FORA de `ofertaParaFaixa`. A régua do número está certa para um valor —
    // 500 pertence mesmo ao degrau que termina em 500. O que estava errado era
    // usá-la sobre uma escolha de cardápio.
    expect(ofertaParaFaixa(500).rotulo).toBe("entre R$ 150 e R$ 500");
  });
});

describe("todo degrau do cardápio se reconhece quando é repetido", () => {
  // Sem isto, o conserto acertaria só o caso medido — régua verde sobre um
  // exemplo, que é régua nenhuma.
  for (const f of FAIXAS) {
    it(`"${f.rotulo}" volta como "${f.rotulo}"`, () => {
      expect(faixaEscolhidaNaFala(f.rotulo)).toBe(f.rotulo);
    });
  }

  it("a grafia do cliente não precisa ser a da casa", () => {
    // "1.500" e "1500", com e sem R$, com e sem maiúscula.
    expect(faixaEscolhidaNaFala("entre 500 e 1500")).toBe("entre R$ 500 e R$ 1.500");
    expect(faixaEscolhidaNaFala("ENTRE R$1.500 E R$5.000")).toBe("entre R$ 1.500 e R$ 5.000");
  });

  it("o degrau aberto para cima não cai na borda", () => {
    // `ofertaParaFaixa(5000)` devolveria "entre R$ 1.500 e R$ 5.000" — a mesma
    // aritmética de borda que causou o defeito medido.
    expect(faixaEscolhidaNaFala("acima de R$ 5.000")).toBe("acima de R$ 5.000");
    expect(faixaEscolhidaNaFala("mais de 5000 por mês")).toBe("acima de R$ 5.000");
  });
});

describe("MUTAÇÕES — a regra do número, da 6ª volta, continua intacta", () => {
  it("🔴 'meu teto é R$ 900' NÃO é escolha de cardápio — quem responde é o número", () => {
    // Este é o caso que a 6ª volta consertou. Se esta função o capturasse, ela
    // teria desfeito aquele conserto — e o cliente de R$ 900 voltaria a ser
    // registrado com um degrau que ele não escolheu.
    expect(faixaEscolhidaNaFala("Tá caro. Meu teto é R$ 900 por mês.")).toBeNull();
    expect(ofertaParaFaixa(900).rotulo).toBe("entre R$ 500 e R$ 1.500");
  });

  it("um número solto qualquer não vira degrau", () => {
    expect(faixaEscolhidaNaFala("posso pagar uns 700")).toBeNull();
    expect(faixaEscolhidaNaFala("R$ 300")).toBeNull();
  });

  it("dois números que NÃO são os limites de um degrau não viram degrau", () => {
    // "entre 400 e 900" é uma faixa que o cliente inventou, não um degrau da
    // casa. Inventar um degrau a partir dela seria pior que derivar do número.
    expect(faixaEscolhidaNaFala("entre 400 e 900")).toBeNull();
  });

  it("fala sem número nenhum devolve null — ausência não é escolha", () => {
    for (const f of ["não sei ainda", "o que for necessário", "", "   "]) {
      expect(faixaEscolhidaNaFala(f)).toBeNull();
    }
  });

  it("entrada que não é texto não estoura", () => {
    for (const v of [null, undefined, 500, {}, []]) {
      expect(faixaEscolhidaNaFala(v)).toBeNull();
    }
  });

  it("números de OUTRA natureza na mesma frase não sequestram o degrau", () => {
    // Horário, telefone, quantidade. Só a coincidência com os DOIS limites de
    // um degrau conta.
    expect(faixaEscolhidaNaFala("abro das 8 às 18 e quero 12 posts")).toBeNull();
  });
});
