// A TRAVA DE PREÇO DO SDR — o que ela recusa, e o que a casa DIZ quando recusa.
//
// ── O incidente (16/08/2026, 01:12, piloto do CEO) ──────────────────────────
//
//   [sdr/chat] price-leak detected, falling back
//
// A trava está CERTA e não se afrouxa: preço nesta casa sai depois do login,
// pela tabela de verdade. Este teste existe para provar duas coisas que não
// estavam provadas — e a segunda é a que doía.
//
//   1. A trava continua barrando cotação e continua deixando passar a pergunta
//      da faixa. (Regressão: se alguém "consertar" o piloto afrouxando o regex,
//      esta metade quebra.)
//   2. O que a casa fala quando a trava dispara **não cita preço nenhum** e
//      **não muda de assunto** — e nenhuma fala do motor de regras cita um
//      preço que o catálogo não tem.
//
// O 2 é o achado: o motor de regras para o qual a trava caía cotava
// "Plano Starter (R$ 1.200–1.800/mês)", um plano que não existe em
// `lib/agency/planos.ts` nem em `docs/precos.md`. A trava calava o modelo e
// passava o microfone para um script que inventava número.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ehPerguntaDeFaixa } from "@/lib/agency/comercial/negociacao";
import {
  respostaHonestaDePreco,
  precosForaDoCatalogo,
  citaPrecoInventado,
  valoresAutorizados,
} from "@/lib/agency/comercial/resposta-de-preco";
import { PLANOS } from "@/lib/agency/planos";
import { buildPriceObjectionReply } from "@/lib/agency/sdr-agent";
import { detectNegotiation } from "@/lib/agency/question-engine";
import { initConvState } from "@/lib/agency/question-engine";

// O MESMO regex da rota. Copiado de propósito, com o teste que prova que é o
// mesmo — assim afrouxar a rota quebra aqui em vez de passar despercebido.
const PRICE_LEAK = /r\$\s*\d|\d+\s*(reais|\/m[êe]s\b)|desconto|\bplano\b.*\bR\$/i;

function travaDispara(fala: string): boolean {
  return PRICE_LEAK.test(fala) && !ehPerguntaDeFaixa(fala);
}

describe("a trava de preço do SDR", () => {
  // ── METADE 1: ELA BARRA O PROBLEMA PLANTADO ─────────────────────────────
  describe("BARRA a cotação (a metade que protege)", () => {
    it.each([
      ["cotação direta",        "O Plano Ritmo fica em R$ 297/mês para o seu caso."],
      ["estimativa",            "Seu escopo deve ficar em torno de 1.500 reais por mês."],
      ["desconto",              "Consigo um desconto especial para você fechar hoje."],
      ["o plano fantasma",      "Posso ajustar para o Plano Starter (R$ 1.200–1.800/mês)."],
      ["dois limites só",       "Você investe até R$ 150 ou acima de R$ 500 por mês?"],
    ])("recusa: %s", (_caso, fala) => {
      expect(travaDispara(fala)).toBe(true);
    });

    it("o regex da rota é ESTE regex — afrouxar lá quebra aqui", () => {
      const rota = readFileSync(
        path.join(process.cwd(), "app/api/sdr/chat/route.ts"),
        "utf8",
      );
      expect(rota).toContain(PRICE_LEAK.source);
      // E a exceção continua sendo a estreita, não um `|| true` novo.
      expect(rota).toContain("ehPerguntaDeFaixa(replyText)");
    });
  });

  // ── METADE 2: ELA NÃO INVENTA PROBLEMA NO CASO LIMPO ────────────────────
  describe("NÃO barra o que é legítimo", () => {
    it("a pergunta da faixa com a régua inteira passa", () => {
      const fala =
        "Pra eu montar a proposta certa: quanto você pensa em investir por mês — " +
        "até R$ 150, entre R$ 150 e R$ 500, entre R$ 500 e R$ 1.500, " +
        "entre R$ 1.500 e R$ 5.000, ou acima disso?";
      expect(travaDispara(fala)).toBe(false);
    });

    it("conversa de sondagem sem dinheiro nenhum passa", () => {
      expect(travaDispara("Quantos posts por semana você imagina para o Instagram?")).toBe(false);
    });
  });
});

describe("o que a casa DIZ quando a trava dispara", () => {
  const fala = respostaHonestaDePreco("Camila").texto;

  it("não cita preço — ela mesma não seria barrada pela trava", () => {
    expect(travaDispara(fala)).toBe(false);
    expect(fala).not.toMatch(/R\$/i);
  });

  it("reconhece que a pergunta era sobre VALOR — não muda de assunto", () => {
    expect(fala.toLowerCase()).toContain("valor");
  });

  it("diz QUEM fecha e QUANDO sai — não é 'em breve'", () => {
    expect(fala.toLowerCase()).toContain("equipe");
    expect(fala.toLowerCase()).toMatch(/login|or[çc]amento/);
  });

  it("usa o nome quando existe, e NÃO inventa nome quando não existe", () => {
    expect(respostaHonestaDePreco("Camila").texto).toContain("Camila");
    const semNome = respostaHonestaDePreco(undefined).texto;
    expect(semNome).not.toMatch(/undefined|null|\bcliente\b,/i);
    expect(travaDispara(semNome)).toBe(false);
  });
});

describe("nenhuma fala ao cliente cita preço fora do catálogo", () => {
  // ── METADE 1: O PORTÃO PEGA O NÚMERO INVENTADO ──────────────────────────
  describe("PEGA o preço sem lastro", () => {
    it("R$ 1.200 (o Plano Starter fantasma) é acusado", () => {
      expect(precosForaDoCatalogo("Plano Starter (R$ 1.200–1.800/mês)")).toContain(1200);
      expect(citaPrecoInventado("Nosso plano de entrada começa em R$ 1.200/mês")).toBe(true);
    });

    it("o catálogo NÃO tem Starter nem 1.200 — é isto que torna aquilo invenção", () => {
      expect(PLANOS.some((p) => /starter/i.test(p.nome))).toBe(false);
      expect(valoresAutorizados().has(1200)).toBe(false);
    });

    it("valor ilegível NÃO passa por omissão do parser (fail-closed)", () => {
      const fora = precosForaDoCatalogo("fica em R$ ..,.. por mês");
      expect(fora.length).toBeGreaterThan(0);
    });
  });

  // ── METADE 2: NÃO ACUSA ONDE NÃO HÁ ─────────────────────────────────────
  describe("NÃO acusa o preço verdadeiro", () => {
    it("os 5 planos do catálogo passam pelo portão", () => {
      for (const p of PLANOS) {
        expect(
          precosForaDoCatalogo(`O ${p.nome} fica em R$ ${p.preco}/mês.`),
          `${p.nome} (R$ ${p.preco}) foi acusado de ser preço inventado`,
        ).toEqual([]);
      }
    });

    it("os limites da régua de faixas passam", () => {
      expect(precosForaDoCatalogo("até R$ 150, entre R$ 500 e R$ 1.500, acima de R$ 5.000")).toEqual([]);
    });

    it("fala sem número nenhum passa", () => {
      expect(precosForaDoCatalogo("Quantos posts por semana você quer?")).toEqual([]);
    });
  });

  // ── AS FALAS REAIS DO MOTOR DE REGRAS, que é onde a trava desemboca ──────
  describe("as falas que o prospect realmente recebe", () => {
    const escopo = {
      businessName: "Beauty Clinic",
      wantsSocialMedia: true,
      social: { platforms: ["Instagram"], postsPerWeek: 5 },
    } as never;
    const estimativa = { totalMin: 1500, totalMax: 2400, confidence: "medium", items: [] } as never;

    it("buildPriceObjectionReply não cita preço inventado — nos 3 caminhos", () => {
      for (const orcamento of [undefined, 800, 3000]) {
        const r = buildPriceObjectionReply(escopo, estimativa, orcamento);
        expect(precosForaDoCatalogo(r), `orçamento=${orcamento}: "${r}"`).toEqual([]);
      }
    });

    it("detectNegotiation não cita preço inventado ao enxugar o escopo", () => {
      const estado = initConvState();
      estado.scope = escopo;
      for (const dito of ["tá caro", "quero um plano mais barato"]) {
        const r = detectNegotiation(dito, estado);
        if (!r) continue;
        expect(precosForaDoCatalogo(r.replyText), `"${dito}" → "${r.replyText}"`).toEqual([]);
      }
    });
  });
});
