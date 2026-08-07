// O TÍTULO DO CARTÃO NÃO PODE SER A TRANSCRIÇÃO CRUA DO ÁUDIO.
//
// O que o CEO leu no cartão de orçamento, em produção (07/08/2026):
//
//   "para de óleo digital eu preciso de dois carrosseis por semana uma seg…"
//
// Ditado, com o reconhecedor errando "para a Dioli Digital" → "para de óleo
// digital", sem pontuação, cortado com reticências no meio de uma palavra. É a
// primeira coisa que ele lê, e não diz o que aquilo é.
//
// A REGRA QUE ESTE TESTE FIXA: derivar, nunca inventar. Nada de "resumir com
// IA" — resumo gerado afirma sobre o pedido do cliente algo que ele não
// escreveu, e num piloto sem revisão humana isso é a alucinação que a casa
// proíbe. Quando não dá para cortar com segurança, o título vira um rótulo
// HONESTO (tipo do item + data) e o texto original fica íntegro logo abaixo.

import { describe, it, expect } from "vitest";
import { tituloParaOCliente } from "@/app/api/portal/pedidos/route";

const CRIADO = new Date("2026-08-06T14:00:00.000Z");

// O texto real do CEO, como chegou do ditado.
const DITADO_DO_CEO =
  "para de óleo digital eu preciso de dois carrosseis por semana uma segunda e uma quinta " +
  "com as artes e as legendas prontas pra postar";

describe("METADE QUE BARRA — ditado sem pontuação não vira título", () => {
  it("não devolve a transcrição crua, nem um pedaço dela", () => {
    const titulo = tituloParaOCliente({
      descricao: DITADO_DO_CEO, criadoEm: CRIADO, temOrcamento: true,
    });
    expect(titulo).not.toContain("para de óleo digital");
    expect(titulo).not.toContain("…");
    // Rótulo honesto: diz O QUE É e QUANDO. Dois fatos, nenhuma interpretação.
    expect(titulo).toBe("Orçamento · 06/08");
  });

  it("sem orçamento na mesa, o rótulo honesto diz 'Pedido'", () => {
    expect(
      tituloParaOCliente({ descricao: DITADO_DO_CEO, criadoEm: CRIADO, temOrcamento: false }),
    ).toBe("Pedido · 06/08");
  });

  it("não afirma NADA sobre o conteúdo — o rótulo não cita carrossel, prazo nem quantidade", () => {
    const titulo = tituloParaOCliente({
      descricao: DITADO_DO_CEO, criadoEm: CRIADO, temOrcamento: true,
    });
    for (const palavra of ["carross", "semana", "dois", "legenda", "arte"]) {
      expect(titulo.toLowerCase()).not.toContain(palavra);
    }
  });

  it("frase longa demais para caber num cartão também cai no rótulo honesto", () => {
    const longa = "Preciso que vocês produzam uma campanha completa de lançamento para o novo produto da linha premium.";
    expect(
      tituloParaOCliente({ descricao: longa, criadoEm: CRIADO, temOrcamento: true }),
    ).toBe("Orçamento · 06/08");
  });
});

describe("METADE QUE NÃO ATRAPALHA — texto bem escrito continua virando título", () => {
  it("frase curta e pontuada vira o título, sem atrito", () => {
    expect(
      tituloParaOCliente({
        descricao: "Preciso de dois carrosséis por semana. Segunda e quinta, com legenda.",
        criadoEm: CRIADO,
        temOrcamento: true,
      }),
    ).toBe("Preciso de dois carrosséis por semana");
  });

  it("respeita a quebra de linha como fim de frase", () => {
    expect(
      tituloParaOCliente({
        descricao: "Reels para o lançamento\n\nsão seis no total, um por dia",
        criadoEm: CRIADO,
        temOrcamento: false,
      }),
    ).toBe("Reels para o lançamento");
  });

  it("descrição vazia não explode e não inventa — devolve o rótulo", () => {
    expect(
      tituloParaOCliente({ descricao: "", criadoEm: CRIADO, temOrcamento: false }),
    ).toBe("Pedido · 06/08");
  });
});
