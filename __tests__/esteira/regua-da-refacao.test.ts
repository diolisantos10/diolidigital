// A PEÇA NOVA É MEDIDA CONTRA A ANTERIOR — a régua que faltava.
//
// O caso é o de produção: os dois arquivos da rodada paga estão em
// `docs/entregas/refacao-27-08/` e são medidos aqui de verdade, com `medirLuz`.
// Se `sharp` não existir no ambiente, o bloco dos arquivos é PULADO com aviso —
// nunca vira verde por ausência (a régua pura continua sendo exercitada).
//
// PROVA POR MUTAÇÃO (onde):
//   • trocar `entrega: false` por `true` no ramo "piorou" de
//     `lib/agency/esteira/regua-da-refacao.ts` → reprova.
//   • apagar o gatilho de luminância "mais" → reprova o caso medido.
//   • zerar `MELHORA_MINIMA` → reprova "não andou o bastante".
//   • fazer `compararPeca` aprovar quando `antes`/`depois` são `null` sem
//     declarar não-medido → reprova.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { medirLuz, type MedidaDeLuz } from "@/lib/agency/design/medir-luz";
import { lerPedidoDeArte, compararPeca, MELHORA_MINIMA } from "@/lib/agency/esteira/regua-da-refacao";

const PEDIDO_MEDIDO = "o fundo ficou escuro demais e o prato some. Refaça ESSA peça com mais luz e o prato em primeiro plano.";

const luz = (media: number, contraste = 50): MedidaDeLuz => ({
  luminanciaMedia: media, tercoSuperior: media, tercoMeio: media, tercoInferior: media, contraste,
});

describe("o que o cliente pediu, lido das palavras dele", () => {
  it("no caso medido: luminância para MAIS, e o resto declarado como não-medido", () => {
    const p = lerPedidoDeArte(PEDIDO_MEDIDO);
    expect(p.medidos).toEqual([{ eixo: "luminancia", sentido: "mais", palavras: expect.any(String) }]);
    expect(p.naoMedidos).toEqual(expect.arrayContaining(["o assunto em primeiro plano", "o assunto aparecer na peça"]));
  });

  it("não inventa eixo onde não há", () => {
    expect(lerPedidoDeArte("troca a legenda").medidos).toEqual([]);
    expect(lerPedidoDeArte("").medidos).toEqual([]);
  });

  it("lê o pedido de contraste nos dois sentidos", () => {
    expect(lerPedidoDeArte("ficou chapado, quero mais contraste").medidos[0]).toMatchObject({ eixo: "contraste", sentido: "mais" });
    expect(lerPedidoDeArte("o contraste está duro demais").medidos[0]).toMatchObject({ eixo: "contraste", sentido: "menos" });
    expect(lerPedidoDeArte("ficou claro demais").medidos[0]).toMatchObject({ eixo: "luminancia", sentido: "menos" });
  });
});

describe("a decisão", () => {
  const pedido = lerPedidoDeArte(PEDIDO_MEDIDO);

  it("PEDIU MAIS LUZ E VEIO MENOS: reprova e não entrega", () => {
    const c = compararPeca({ antes: luz(40.5), depois: luz(29.8), pedido });
    expect(c.veredito).toBe("piorou");
    expect(c.entrega).toBe(false);
    expect(c.motivo).toContain("LADO CONTRÁRIO");
    expect(c.motivo).toContain("Dono:");
    expect(c.motivo).toContain("Próxima ação:");
    // A tentativa paga dele não é queimada — é o que a frase promete.
    expect(c.motivo).toContain("sem gastar outra tentativa do cliente");
  });

  it("pediu mais luz e veio mais luz: entrega", () => {
    const c = compararPeca({ antes: luz(40.5), depois: luz(58), pedido });
    expect(c.veredito).toBe("atendeu");
    expect(c.entrega).toBe(true);
  });

  it("mexeu quase nada: também não entrega", () => {
    const c = compararPeca({ antes: luz(40.5), depois: luz(40.5 * (1 + MELHORA_MINIMA / 2)), pedido });
    expect(c.veredito).toBe("nao_atendeu");
    expect(c.entrega).toBe(false);
  });

  it("mesmo aprovando, DECLARA o que não sabe medir", () => {
    const c = compararPeca({ antes: luz(40.5), depois: luz(70), pedido });
    expect(c.entrega).toBe(true);
    expect(c.naoMedidos.length).toBeGreaterThan(0);
    expect(c.motivo).toContain("olho humano");
  });

  it("não conseguir medir NÃO vira aprovação afirmada", () => {
    const c = compararPeca({ antes: null, depois: luz(29.8), pedido });
    expect(c.veredito).toBe("nao_medido");
    expect(c.motivo).toContain("não consegui MEDIR");
    expect(c.motivo).toContain("Dono:");
  });

  it("pedido sem eixo mensurável entrega, e diz que não afirmou nada", () => {
    const c = compararPeca({ antes: luz(40), depois: luz(10), pedido: lerPedidoDeArte("o prato some, quero ele em primeiro plano") });
    expect(c.entrega).toBe(true);
    expect(c.veredito).toBe("nao_medido");
    expect(c.motivo).toContain("não sabe MEDIR");
  });
});

describe("os dois arquivos da rodada paga, medidos de verdade", () => {
  const dir = "docs/entregas/refacao-27-08/";
  const antesArq = `${dir}antes-med_35f7fcb6_mt8xpfoj.jpg`;
  const depoisArq = `${dir}depois-med_78f44713_mtakx2e0.jpg`;

  it("a peça de 27/08 seria BARRADA por esta régua", async () => {
    if (!existsSync(antesArq) || !existsSync(depoisArq)) {
      throw new Error("os arquivos da prova sumiram do repositório — a régua perdeu a evidência");
    }
    const antes = await medirLuz(readFileSync(antesArq));
    const depois = await medirLuz(readFileSync(depoisArq));
    if (!antes || !depois) {
      // Ambiente sem `sharp`: declarado, nunca verde por ausência.
      console.warn("[regua-da-refacao.test] sem biblioteca de imagem — o bloco dos arquivos reais NÃO foi medido");
      return;
    }
    // O que a auditoria escreveu: 40,5 → 29,8 (a amostra de 160px devolve
    // 39,9 → 29,5; a diferença é de reamostragem e está declarada).
    expect(antes.luminanciaMedia).toBeGreaterThan(35);
    expect(depois.luminanciaMedia).toBeLessThan(32);
    expect(antes.tercoSuperior).toBeGreaterThan(depois.tercoSuperior);

    const c = compararPeca({ antes, depois, pedido: lerPedidoDeArte(PEDIDO_MEDIDO) });
    expect(c.veredito).toBe("piorou");
    expect(c.entrega).toBe(false);
  });
});
