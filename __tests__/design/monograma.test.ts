// O monograma que assina a peça do cliente sem logo.
//
// ── DE ONDE VEIO (11/08/2026) ───────────────────────────────────────────────
//
// Achado rasterizando uma peça de verdade e OLHANDO para ela: "Padaria do João"
// saía assinada **PD**. Nenhum teste pegou, porque nenhum teste olha o pixel —
// e o monograma é pequeno o bastante para atravessar uma suíte inteira.
//
// Não é defeito grave. É defeito de TODA entrega: é a marca do cliente saindo
// errada em cada peça que a casa assina sem logo.

import { describe, it, expect } from "vitest";
import { monogramaDe } from "@/lib/agency/design/molde";

describe("nome brasileiro não vira inicial de palavrinha de ligação", () => {
  const casos: Array<[string, string]> = [
    ["Padaria do João", "PJ"],
    // A regra é "as duas primeiras palavras QUE VALEM", não "a primeira e a
    // última": quem lê "Casa de Carnes Silva" abrevia Casa Carnes, não Casa
    // Silva.
    ["Casa de Carnes Silva", "CC"],
    ["Clínica da Mulher", "CM"],
    ["Bar e Bistrô Lua", "BB"],
    ["Estúdio de Beleza Ana", "EB"],
    ["Doces da Vovó", "DV"],
  ];
  for (const [nome, esperado] of casos) {
    it(`"${nome}" → ${esperado}`, () => {
      expect(monogramaDe(nome)).toBe(esperado);
    });
  }
});

describe("o que já funcionava continua funcionando", () => {
  it("dois nomes de verdade seguem sendo os dois primeiros", () => {
    expect(monogramaDe("Dioli Digital")).toBe("DD");
    expect(monogramaDe("Sushi Cazza")).toBe("SC");
  });

  it("nome de uma palavra usa as duas primeiras letras", () => {
    expect(monogramaDe("Foocci")).toBe("FO");
  });

  it("emenda camelo continua virando duas palavras", () => {
    expect(monogramaDe("CityJobs")).toBe("CJ");
  });

  it("vazio é nulo — não é uma assinatura em branco", () => {
    expect(monogramaDe("")).toBeNull();
    expect(monogramaDe(null)).toBeNull();
    expect(monogramaDe("   ")).toBeNull();
  });
});

describe("o filtro só pode MELHORAR — nunca deixar a peça sem assinatura", () => {
  it("nome que é quase só ligação ainda assina", () => {
    // Se o filtro esvaziasse, a peça sairia sem monograma nenhum — pior do que
    // sair com um monograma imperfeito.
    expect(monogramaDe("E o Bar")).toBeTruthy();
    expect(monogramaDe("Casa da")).toBeTruthy();
  });

  it("artigo que faz parte do nome NÃO é tratado como ligação", () => {
    // Em "O Boticário" o "O" é o nome, não uma emenda.
    expect(monogramaDe("O Boticário")).toBe("OB");
  });
});
