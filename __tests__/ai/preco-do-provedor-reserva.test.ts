// O PROVEDOR RESERVA DE IMAGEM TEM PREÇO DE TABELA.
//
// Ele estava fora do livro-caixa: toda imagem do Gemini — a reserva que segura
// a operação quando a conta da OpenAI zera — voltava `null` de
// `estimarCustoDeImagem`, e o teto diário contava o palpite de US$ 0,05 no
// lugar do preço real (US$ 0,039). A casa cobrava de si mesma um preço
// inventado 28% acima do de tabela, no provedor que ela usa quando o outro cai.
//
// PROVA POR MUTAÇÃO (onde): apagar a entrada "gemini-2.5-flash-image" de
// `PRECOS_DE_IMAGEM` (`lib/ai/precos.ts`) reprova este arquivo.

import { describe, it, expect } from "vitest";
import { estimarCustoDeImagem, PRECOS_DE_IMAGEM } from "@/lib/ai/precos";
import { CUSTO_DE_CHAMADA_SEM_PRECO_USD } from "@/lib/ai/teto-de-custo";

/** O nome exato que `design-engine.ts` envia (`GEMINI_IMAGE_MODEL` ou este). */
const RESERVA = "gemini-2.5-flash-image";

describe("o provedor reserva entra na conta", () => {
  it("tem preço nos três recortes e nas duas qualidades que a casa envia", () => {
    for (const tamanho of ["quadrada", "retrato", "paisagem"] as const) {
      for (const qualidade of ["standard", "high"]) {
        const c = estimarCustoDeImagem(RESERVA, tamanho, qualidade);
        expect(c.usd, `${tamanho}/${qualidade}`).toBe(0.039);
      }
    }
  });

  it("o preço NÃO é mais o palpite do teto — que era 28% mais caro", () => {
    const real = estimarCustoDeImagem(RESERVA, "quadrada", "high").usd!;
    expect(real).toBeLessThan(CUSTO_DE_CHAMADA_SEM_PRECO_USD);
    expect(Math.round((CUSTO_DE_CHAMADA_SEM_PRECO_USD / real - 1) * 100)).toBe(28);
  });

  it("dez imagens contam dez vezes", () => {
    expect(estimarCustoDeImagem(RESERVA, "retrato", "high", 10).usd).toBeCloseTo(0.39, 6);
  });

  it("a versão da tabela sobe junto com o preço novo", () => {
    expect(estimarCustoDeImagem(RESERVA, "quadrada", "high").versao).toBe("2026-08-27.1");
  });
});

describe("o que continua fora da tabela continua devolvendo `null`", () => {
  it("modelo desconhecido nunca vira zero — 'não sei medir' não é economia", () => {
    expect(estimarCustoDeImagem("modelo-de-imagem-que-ainda-nao-existe", "quadrada", "high").usd).toBe(null);
    expect(estimarCustoDeImagem(RESERVA, "quadrada", "qualidade-inventada").usd).toBe(null);
  });

  it("os dois provedores antigos não foram tocados", () => {
    expect(PRECOS_DE_IMAGEM["gpt-image-1"]!.quadrada.high).toBe(0.167);
    expect(PRECOS_DE_IMAGEM["dall-e-3"]!.quadrada.standard).toBe(0.04);
  });
});
