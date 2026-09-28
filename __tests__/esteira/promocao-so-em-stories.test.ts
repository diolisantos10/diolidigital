// promocao-so-em-stories.test.ts — PROMOÇÃO SÓ EM STORIES (CEO, 27/09/2026).
//
// As DUAS metades que este arquivo trava:
//   • cada marcador, sozinho, BARRA um formato de feed;
//   • o MESMO texto, no formato "story", PASSA sempre.
// E a régua de falso positivo: texto limpo de branding passa em feed.

import { describe, it, expect } from "vitest";
import { marcadoresDePromocao, conferirPromocaoNoFormato } from "@/lib/agency/esteira/promocao-so-em-stories";

describe("marcadoresDePromocao — acha cada marcador, sozinho", () => {
  it.each([
    ["preço riscado (~~R$~~)", "confira: ~~R$ 100~~ hoje é diferente", "preço riscado"],
    ["de R$ X por R$ Y", "de R$ 100 por R$ 50 só hoje", "preço riscado"],
    ["de X por Y com R$", "de 100 por R$ 50 só hoje", "preço riscado"],
    ["% com número", "20% de vantagem em tudo", "%"],
    ["% com espaço", "20 % em tudo", "%"],
    ["off maiúsculo", "corre que é só hoje, OFF", "off"],
    ["off grudado no número", "50off só hoje", "off"],
    ["promoção com cedilha", "PROMOÇÃO imperdível", "promoção"],
    ["promocao sem acento", "promocao imperdivel", "promoção"],
    ["promo abreviado", "não perca a promo de hoje", "promoção"],
    ["desconto", "desconto especial pra você", "desconto"],
    ["descontos no plural", "descontos em toda a loja", "desconto"],
    ["queima de estoque", "queima de estoque total", "queima"],
    ["liquidação", "liquidação de fim de ano", "liquidação"],
    ["liquida sem acento", "liquida tudo até domingo", "liquidação"],
  ] as const)("%s", (_rotulo, texto, esperado) => {
    expect(marcadoresDePromocao(texto)).toContain(esperado);
  });
});

describe("marcadoresDePromocao — sem falso positivo óbvio", () => {
  it.each([
    ["office", "nosso office fica na avenida principal"],
    ["offline", "atendimento também offline, na loja física"],
    ["offerta (não é a grafia certa mas não é 'off' fronteiriço)", "temos uma offerta especial de atendimento"],
    ["% sozinho, sem número do lado", "aumento de % de satisfação dos clientes"],
    ["o melhor combo da casa, sem cara de promoção", "o melhor combo da casa, feito na hora"],
    ["20 anos de casa — número sem % nem off", "20 anos de casa, obrigado por confiar na gente"],
  ] as const)("%s não é marcador de promoção", (_rotulo, texto) => {
    expect(marcadoresDePromocao(texto)).toEqual([]);
  });
});

describe("conferirPromocaoNoFormato — a régua: story sempre passa, feed/carousel/reel barram", () => {
  const TEXTO_COM_PROMOCAO = "corre que é só hoje: 20% OFF em tudo, promoção de queima de estoque";

  it.each(["feed", "carousel", "reel", "carrossel", "video"] as const)(
    'formato "%s" com marcador de promoção é BARRADO',
    (formato) => {
      const r = conferirPromocaoNoFormato({ formato, texto: TEXTO_COM_PROMOCAO });
      expect(r.passa).toBe(false);
      if (r.passa) return;
      expect(r.motivo).toContain("promoção só em stories");
      expect(r.motivo).toContain("%");
      expect(r.motivo).toContain("off");
      expect(r.motivo).toContain("promoção");
      expect(r.motivo).toContain("queima");
    },
  );

  it('o MESMO texto, formato "story", PASSA', () => {
    const r = conferirPromocaoNoFormato({ formato: "story", texto: TEXTO_COM_PROMOCAO });
    expect(r).toEqual({ passa: true });
  });

  it("texto limpo de branding passa em feed também", () => {
    const limpos = [
      "o melhor combo da casa, feito na hora",
      "nosso office fica na avenida principal",
      "20 anos de casa, obrigado por confiar na gente",
    ];
    for (const texto of limpos) {
      expect(conferirPromocaoNoFormato({ formato: "feed", texto })).toEqual({ passa: true });
    }
  });
});
