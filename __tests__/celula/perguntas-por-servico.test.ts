// __tests__/celula/perguntas-por-servico.test.ts
//
// Prova as travas da Ficha E: uma decisão por vez, dependência respeitada,
// nada repetido, placeholder de decisão do CEO nunca sai por proximaPergunta,
// e nenhuma pergunta é barrada pelo Guardião do 99Freelas.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  SERVICOS_COM_PERGUNTAS,
  servicoPorNome,
  proximaPergunta,
  perguntasEmAberto,
  prontaParaEnvio,
  PLACEHOLDER_CEO,
} from "@/lib/agency/celula/mensagens/perguntas-por-servico";
import {
  O_QUE_A_PERGUNTA_DE_IA_COLHE,
  COMO_SE_PERGUNTA_AO_CLIENTE,
  PERGUNTAS_DA_FILA,
} from "@/lib/agency/comercial/pergunta-repetida";
import { blocoDeNegociacaoParaPrompt } from "@/lib/agency/comercial/negociacao";
import { validarTexto } from "@/lib/marketplaces/99freelas/conformidade";

const OS_QUATRO_SERVICOS_DO_CEO = ["social media", "site", "branding", "video"];

const TODAS_AS_PERGUNTAS = SERVICOS_COM_PERGUNTAS.flatMap((s) =>
  s.perguntas.map((p) => ({ servico: s.servico, ...p })),
);

describe("cobertura dos quatro servicos do CEO", () => {
  it("SERVICOS_COM_PERGUNTAS cobre exatamente social media, site, branding e video", () => {
    expect(SERVICOS_COM_PERGUNTAS.map((s) => s.servico).sort()).toEqual(
      [...OS_QUATRO_SERVICOS_DO_CEO].sort(),
    );
  });

  it.each(SERVICOS_COM_PERGUNTAS.map((s) => [s.servico, s.origemNoCatalogo] as [string, string]))(
    "%s: origemNoCatalogo (%s) aponta para arquivo real, ou e PLACEHOLDER_CEO",
    (_servico, origem) => {
      if (origem === PLACEHOLDER_CEO) return;
      const caminho = path.join(process.cwd(), origem);
      expect(fs.existsSync(caminho)).toBe(true);
    },
  );

  it("nenhum servico vem com lista de perguntas vazia", () => {
    for (const s of SERVICOS_COM_PERGUNTAS) {
      expect(s.perguntas.length).toBeGreaterThan(0);
    }
  });
});

describe("cada servico: ordem e dependeDe sao consistentes", () => {
  it.each(SERVICOS_COM_PERGUNTAS.map((s) => s.servico))(
    "%s: ordens sao unicas e dependeDe aponta para id existente no mesmo servico",
    (servico) => {
      const s = servicoPorNome(servico)!;
      const ordens = s.perguntas.map((p) => p.ordem);
      expect(new Set(ordens).size).toBe(ordens.length);
      const ids = new Set(s.perguntas.map((p) => p.id));
      for (const p of s.perguntas) {
        if (p.dependeDe !== null) expect(ids.has(p.dependeDe)).toBe(true);
      }
    },
  );
});

describe("proximaPergunta -- a trava de uma decisao por vez", () => {
  it.each(SERVICOS_COM_PERGUNTAS.map((s) => s.servico))(
    "%s: uma rodada completa nunca devolve lista, e termina em null",
    (servico) => {
      const jaPerguntadas: string[] = [];
      const jaRespondidas: Record<string, string> = {};
      let seguranca = 0;
      let resultado = proximaPergunta({ servico, jaRespondidas, jaPerguntadas });
      while (resultado !== null && seguranca < 50) {
        expect(Array.isArray(resultado)).toBe(false);
        expect(typeof resultado.id).toBe("string");
        expect(resultado.comoSePergunta).not.toBe(PLACEHOLDER_CEO);
        jaPerguntadas.push(resultado.id);
        jaRespondidas[resultado.id] = "resposta de teste";
        resultado = proximaPergunta({ servico, jaRespondidas, jaPerguntadas });
        seguranca += 1;
      }
      expect(resultado).toBeNull();
      expect(seguranca).toBeLessThan(50);
    },
  );

  it("servico desconhecido devolve null, nunca lanca", () => {
    expect(
      proximaPergunta({ servico: "servico-que-nao-existe", jaRespondidas: {}, jaPerguntadas: [] }),
    ).toBeNull();
  });
});

describe("dependeDe -- pergunta dependente nao sai antes do requisito", () => {
  it("social media: volume_de_posts nao sai enquanto canais_sociais nao estiver respondida, mesmo ja perguntada", () => {
    const resultado = proximaPergunta({
      servico: "social media",
      jaRespondidas: {
        "o-que-comunicar": "x",
        objetivo: "x",
        "chamada-para-acao": "x",
        modalidade: "x",
      },
      jaPerguntadas: ["canais_sociais", "material_pronto"],
    });
    expect(resultado).not.toBeNull();
    expect(resultado!.id).not.toBe("volume_de_posts");
    expect(resultado!.id).toBe("prazo");
  });

  it("branding: escopo-do-logotipo depende de material_pronto no dado, mas nunca sai por proximaPergunta de qualquer forma (e PLACEHOLDER_CEO)", () => {
    const s = servicoPorNome("branding")!;
    const pergunta = s.perguntas.find((p) => p.id === "escopo-do-logotipo")!;
    expect(pergunta.dependeDe).toBe("material_pronto");
    expect(prontaParaEnvio(pergunta)).toBe(false);
  });
});

describe("pergunta ja respondida nao volta", () => {
  it("social media: objetivo respondida nao reaparece", () => {
    const resultado = proximaPergunta({
      servico: "social media",
      jaRespondidas: { objetivo: "vender mais" },
      jaPerguntadas: [],
    });
    expect(resultado).not.toBeNull();
    expect(resultado!.id).not.toBe("objetivo");
  });
});

describe("todas as respondidas: null significa pode avancar", () => {
  it.each(SERVICOS_COM_PERGUNTAS.map((s) => s.servico))(
    "%s: com tudo respondido, proximaPergunta devolve null",
    (servico) => {
      const s = servicoPorNome(servico)!;
      const jaRespondidas = Object.fromEntries(s.perguntas.map((p) => [p.id, "resposta de teste"]));
      expect(proximaPergunta({ servico, jaRespondidas, jaPerguntadas: [] })).toBeNull();
    },
  );
});

describe("placeholder de decisao do CEO -- nunca fala com o cliente, sempre visivel por dentro", () => {
  it("prontaParaEnvio e falso para PLACEHOLDER_CEO e verdadeiro para texto normal", () => {
    expect(prontaParaEnvio({ comoSePergunta: PLACEHOLDER_CEO })).toBe(false);
    expect(prontaParaEnvio({ comoSePergunta: "" })).toBe(false);
    expect(prontaParaEnvio({ comoSePergunta: "Quem e o cliente tipico de voces?" })).toBe(true);
  });

  it("site, branding e video tem ao menos um campo PLACEHOLDER_CEO no dado (a lacuna real do catalogo)", () => {
    for (const servico of ["site", "branding", "video"]) {
      const s = servicoPorNome(servico)!;
      const temPlaceholder = s.perguntas.some((p) => p.comoSePergunta === PLACEHOLDER_CEO);
      expect(temPlaceholder).toBe(true);
    }
  });

  it("nenhuma pergunta PLACEHOLDER_CEO sai de uma rodada completa de proximaPergunta", () => {
    for (const servico of OS_QUATRO_SERVICOS_DO_CEO) {
      const jaPerguntadas: string[] = [];
      const jaRespondidas: Record<string, string> = {};
      let seguranca = 0;
      let resultado = proximaPergunta({ servico, jaRespondidas, jaPerguntadas });
      while (resultado !== null && seguranca < 50) {
        expect(resultado.comoSePergunta).not.toBe(PLACEHOLDER_CEO);
        jaPerguntadas.push(resultado.id);
        jaRespondidas[resultado.id] = "resposta de teste";
        resultado = proximaPergunta({ servico, jaRespondidas, jaPerguntadas });
        seguranca += 1;
      }
    }
  });

  it("perguntasEmAberto DEVOLVE os placeholders -- uso interno, para a equipe ver a lacuna", () => {
    const aberto = perguntasEmAberto({ servico: "branding", jaRespondidas: {} });
    const idsComPlaceholder = aberto.filter((p) => p.comoSePergunta === PLACEHOLDER_CEO).map((p) => p.id);
    expect(idsComPlaceholder).toContain("escopo-do-logotipo");
  });

  it("perguntasEmAberto encolhe conforme jaRespondidas cresce", () => {
    const s = servicoPorNome("social media")!;
    const tudoAberto = perguntasEmAberto({ servico: "social media", jaRespondidas: {} });
    expect(tudoAberto.length).toBe(s.perguntas.length);
    const comUma = perguntasEmAberto({
      servico: "social media",
      jaRespondidas: { objetivo: "vender mais" },
    });
    expect(comUma.length).toBe(s.perguntas.length - 1);
    expect(comUma.find((p) => p.id === "objetivo")).toBeUndefined();
  });
});

describe("reaproveitamento -- mesmo id, mesmo texto de origem, sem segunda copia divergente", () => {
  const IDS_COM_TABELA_DE_ORIGEM = [
    "objetivo",
    "publico_alvo",
    "canais_sociais",
    "material_pronto",
    "volume_de_posts",
    "prazo",
    "budget_range",
    "modalidade",
    "concorrentes",
  ];

  it.each(TODAS_AS_PERGUNTAS.filter((p) => IDS_COM_TABELA_DE_ORIGEM.includes(p.id)))(
    "$servico / $id: oQueColhe e identico a O_QUE_A_PERGUNTA_DE_IA_COLHE quando o id existe la",
    (p) => {
      const esperado = O_QUE_A_PERGUNTA_DE_IA_COLHE[p.id];
      if (esperado) expect(p.oQueColhe).toBe(esperado);
    },
  );

  it("objetivo, publico_alvo e prazo reaproveitam a fala EXATA da fila de descoberta do SDR (PERGUNTAS_DA_FILA)", () => {
    for (const p of TODAS_AS_PERGUNTAS) {
      if (p.id === "objetivo" || p.id === "publico_alvo" || p.id === "prazo") {
        expect(PERGUNTAS_DA_FILA).toContain(p.comoSePergunta);
      }
    }
  });

  it("budget_range reaproveita o texto do exemplo em blocoDeNegociacaoParaPrompt", () => {
    const prompt = blocoDeNegociacaoParaPrompt();
    const p = TODAS_AS_PERGUNTAS.find((x) => x.id === "budget_range")!;
    expect(prompt).toContain(p.comoSePergunta);
  });

  it("material_pronto de video NAO reaproveita a fala generica da fila -- capacidade real e so edicao do bruto", () => {
    const s = servicoPorNome("video")!;
    const p = s.perguntas.find((x) => x.id === "material_pronto")!;
    expect(PERGUNTAS_DA_FILA).not.toContain(p.comoSePergunta);
    expect(p.comoSePergunta.toLowerCase()).toContain("bruto");
  });

  it("COMO_SE_PERGUNTA_AO_CLIENTE.canal_de_contato nao e usado em nenhuma pergunta -- o texto original cita WhatsApp/e-mail e violaria o Guardiao", () => {
    expect(COMO_SE_PERGUNTA_AO_CLIENTE.canal_de_contato).toMatch(/e-?mail|whats/i);
    for (const p of TODAS_AS_PERGUNTAS) expect(p.id).not.toBe("canal_de_contato");
  });
});

describe("Guardiao do 99Freelas -- nenhuma pergunta do JSON e barrada", () => {
  it.each(TODAS_AS_PERGUNTAS.map((p) => [`${p.servico} / ${p.id}`, p.comoSePergunta] as [string, string]))(
    "%s passa limpo por validarTexto",
    (_rotulo, comoSePergunta) => {
      const resultado = validarTexto(comoSePergunta);
      expect(resultado.ok).toBe(true);
      expect(resultado.achados).toEqual([]);
    },
  );

  it("caso plantado -- a metade que prova que o Guardiao ainda barra o que deve barrar", () => {
    const sujo = validarTexto("me chama no WhatsApp: fulano@exemplo.com");
    expect(sujo.ok).toBe(false);
    expect(sujo.achados.length).toBeGreaterThan(0);
  });
});
