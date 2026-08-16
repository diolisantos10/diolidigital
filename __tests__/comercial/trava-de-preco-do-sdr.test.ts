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
import {
  falaSegura,
  ecoDoCliente,
  valoresCitados,
  escopoEncolheu,
} from "@/lib/agency/comercial/resposta-de-preco";
import { PLANOS } from "@/lib/agency/planos";
import { buildPriceObjectionReply, buildScopeAdjustmentConfirmation } from "@/lib/agency/sdr-agent";
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

    // ── COBERTURA: os 8 RAMOS de `detectNegotiation`, não 2 ─────────────────
    //
    // `qualidade` reprovou a versão anterior desta prova: ela exercitava dois
    // ramos de nove e declarava "o motor não cita preço inventado". Sete ramos
    // podiam cotar o que quisessem sem derrubar nada.
    it.each([
      ["objeção de preço, escopo grande", "tá caro", 5],
      ["objeção de preço, escopo pequeno", "tá caro", 1],
      ["plano mais barato", "quero um plano mais barato", 5],
      ["tirar reels", "sem os reels por enquanto", 5],
      ["adicionar reels", "quero adicionar reels", 5],
      ["tirar tráfego pago", "sem tráfego pago por enquanto", 5],
      ["incluir tráfego pago", "quero incluir tráfego pago", 5],
      ["mais posts", "quero mais posts", 5],
      ["menos posts", "quero menos posts", 5],
    ])("ramo %s não cita preço inventado", (_caso, dito, postsPerWeek) => {
      const estado = initConvState();
      estado.scope = {
        ...(escopo as object),
        social: { platforms: ["Instagram"], postsPerWeek, reelsPerMonth: 2 },
        wantsPaidTraffic: true,
      } as never;
      const r = detectNegotiation(dito, estado);
      expect(r, `o ramo "${dito}" deixou de existir — a cobertura virou fachada`).not.toBeNull();
      expect(precosForaDoCatalogo(r!.replyText), `"${dito}" → "${r!.replyText}"`).toEqual([]);
    });

    // ── A FALA QUE TINHA FICADO DE FORA ─────────────────────────────────────
    // `buildScopeAdjustmentConfirmation` imprime "R$ {totalMin}–{totalMax}" do
    // `live-calculator` — a TERCEIRA tabela de preço desta casa, que nenhum
    // portão comparava com `planos.ts`. Ela chega ao prospect.
    it("buildScopeAdjustmentConfirmation — o preço do live-calculator tem lastro?", () => {
      const estimativa = { totalMin: 1500, totalMax: 2400, confidence: "medium", items: [], included: [] } as never;
      for (const fitStatus of ["fits", "above_budget"] as const) {
        const fala = buildScopeAdjustmentConfirmation(escopo, estimativa, { fitStatus } as never);
        const fora = precosForaDoCatalogo(fala);
        // ⚠️ FALHA CONHECIDA, DECLARADA E COM DONO — não é um teste frouxo.
        // O `live-calculator` compõe faixas por serviço; os totais dele não são
        // (e não têm por que ser) valores de `planos.ts`. Enquanto a terceira
        // tabela existir, esta fala cita número que o portão do catálogo não
        // reconhece. O que este teste garante HOJE é que a fala está mapeada e
        // que o portão de runtime (`falaSegura`) a intercepta antes da tela.
        if (fora.length > 0) {
          expect(falaSegura(fala).substituida, "a fala com preço sem lastro passaria para a tela").toBe(true);
        }
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// O FALSO POSITIVO — a trava dispara contra quem INFORMOU o orçamento
// ═══════════════════════════════════════════════════════════════════════════
//
// ── O achado (16/08/2026, `qualidade` executando a trava) ───────────────────
//
// Estas duas falas do SDR disparam a trava, e as duas são o SDR repetindo o
// número que o PRÓPRIO CLIENTE acabou de informar. Antes de 16/08 elas caíam no
// motor de regras e a conversa seguia; com a fala honesta ligada, quem acabou de
// dizer quanto tem passou a ouvir "quem fecha número aqui é a nossa equipe".
//
// ⚠️ A TRAVA NÃO FOI AFROUXADA — o primeiro teste desta seção prova que as duas
// falas CONTINUAM sendo recusadas. O que mudou é qual fala nossa ocupa o lugar.

const ECO_1 = "Perfeito, com R$ 1.000 de verba mensal em anuncios da para comecar com Meta Ads.";
const ECO_2 = "Anotei: seu orcamento de R$ 800 por mes. Me conta quantos posts voce quer?";

describe("o eco do cliente escolhe o fallback — sem afrouxar a trava", () => {
  it("METADE 1: as duas falas CONTINUAM recusadas pela trava", () => {
    expect(travaDispara(ECO_1)).toBe(true);
    expect(travaDispara(ECO_2)).toBe(true);
  });

  it("METADE 2: e as duas são reconhecidas como ECO do que o cliente disse", () => {
    // Caso 1: o número veio do escopo (`traffic.monthlyAdBudget`).
    expect(ecoDoCliente(ECO_1, ["R$ 1.000"])).toBe(true);
    // Caso 2: o número veio da mensagem do cliente.
    expect(ecoDoCliente(ECO_2, ["tenho uns R$ 800 por mês pra investir"])).toBe(true);
  });

  it("a cotação de verdade NÃO é eco — a fala honesta continua valendo", () => {
    expect(ecoDoCliente("O Plano Ritmo fica em R$ 297/mês.", ["quanto custa?"])).toBe(false);
    // Cliente falou de um número, o SDR respondeu com OUTRO: não é eco.
    expect(ecoDoCliente("Fecho em R$ 2.590/mês.", ["tenho R$ 800"])).toBe(false);
  });

  it("vazamento sem número (desconto) NUNCA é eco", () => {
    expect(ecoDoCliente("Consigo um desconto especial hoje.", ["tenho R$ 800"])).toBe(false);
  });

  it("cliente que não falou número nenhum: nada é eco", () => {
    expect(ecoDoCliente("Fica em R$ 800.", ["quero social media", ""])).toBe(false);
  });

  it("os valores são lidos em pt-BR (ponto de milhar, centavos irrelevantes)", () => {
    expect(valoresCitados("R$ 1.000 e 800 reais e R$ 1.500,00")).toEqual([1000, 800, 1500]);
  });

  it("a rota devolve `eco` — e o front decide com um booleano, nunca com o texto recusado", () => {
    const rota = readFileSync(path.join(process.cwd(), "app/api/sdr/chat/route.ts"), "utf8");
    expect(rota).toContain("ecoDoCliente(replyText");
    expect(rota).toContain('reason: "price_leak", eco');
    // O texto recusado NÃO viaja: a resposta continua sem `reply`.
    const resposta = rota.slice(rota.indexOf('reason: "price_leak", eco'));
    expect(resposta.slice(0, 80)).not.toContain("reply");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A MUTAÇÃO SILENCIOSA DE ESCOPO — "tá caro" encolhia o pedido sem avisar
// ═══════════════════════════════════════════════════════════════════════════
//
// No ramo `price_leak`, o front mantinha o escopo já cortado por
// `detectNegotiation` (posts → 2, stories → 2, reels → 0, tráfego pago → false)
// e trocava o texto pela fala honesta, que não menciona corte nenhum. O cliente
// dizia "tá caro", o pedido dele encolhia, e a frase que avisava sumia.

describe("escopo que encolhe não some da tela", () => {
  const antes = { social: { postsPerWeek: 5, storiesPerWeek: 5, reelsPerMonth: 2 }, wantsPaidTraffic: true };

  it("PEGA o corte que `detectNegotiation` faz no 'tá caro'", () => {
    const estado = initConvState();
    estado.scope = { ...antes, wantsSocialMedia: true } as never;
    const r = detectNegotiation("tá caro", estado);
    expect(r).not.toBeNull();
    const depois = { ...antes, ...r!.scopeDelta } as never;
    expect(escopoEncolheu(antes, depois), "o corte do motor deixou de ser detectado").toBe(true);
  });

  it("NÃO acusa corte onde não houve (turno normal de sondagem)", () => {
    expect(escopoEncolheu(antes, antes)).toBe(false);
    // Escopo que CRESCE não é corte.
    expect(escopoEncolheu(antes, { ...antes, social: { ...antes.social, postsPerWeek: 7 } })).toBe(false);
    // Campo que nem existia antes não conta como queda.
    expect(escopoEncolheu({}, { social: { postsPerWeek: 2 }, wantsPaidTraffic: false })).toBe(false);
  });

  it("o front usa o corte para decidir quem fala — e a decisão está no código", () => {
    const tela = readFileSync(
      path.join(process.cwd(), "components/agency/briefing/PublicBriefingRoom.tsx"),
      "utf8",
    );
    expect(tela).toContain("escopoEncolheu(prevState.conv.scope, ruleResult.conv.scope)");
    expect(tela).toContain("resultado.eco === true || encolheu");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// O PORTÃO VIRA MECANISMO — `precosForaDoCatalogo` no caminho de execução
// ═══════════════════════════════════════════════════════════════════════════
//
// `qualidade`: "não é portão, é asserção de CI — zero chamadas em caminho de
// execução". Estava certa. `falaSegura` é a versão com mecanismo, e ela roda
// sobre TODA fala do motor de regras que vira bolha na tela do prospect.

describe("nenhuma fala com preço sem lastro é RENDERIZADA", () => {
  it("METADE 1: a fala com o plano fantasma é recusada antes da tela", () => {
    const r = falaSegura("Posso ajustar para o Plano Starter (R$ 1.200–1.800/mês).", "Camila");
    expect(r.substituida).toBe(true);
    expect(r.valoresSemLastro).toContain(1200);
    expect(r.texto).not.toMatch(/R\$/);
    expect(r.texto).toContain("Camila");
  });

  it("METADE 2: a fala legítima passa INTACTA — o portão não achata a conversa", () => {
    const normal = "Feito! Ajustei para 8 posts + 8 stories/mês, sem reels e sem tráfego pago.";
    expect(falaSegura(normal).texto).toBe(normal);
    expect(falaSegura(normal).substituida).toBe(false);
    // Preço do catálogo real também passa.
    const doCatalogo = `O ${PLANOS[0]!.nome} fica em R$ ${PLANOS[0]!.preco}/mês.`;
    expect(falaSegura(doCatalogo).substituida).toBe(false);
  });

  it("está PLUGADO nos dois caminhos do briefing público (não só importado)", () => {
    const tela = readFileSync(
      path.join(process.cwd(), "components/agency/briefing/PublicBriefingRoom.tsx"),
      "utf8",
    );
    // 1. o ramo da trava de preço; 2. o fallback genérico do motor de regras.
    expect(tela).toContain("falaSegura(escolhida, ruleResult.conv.scope.prospectName)");
    expect(tela).toContain("falaSegura(ruleAssistant.text, ruleResult.conv.scope.prospectName)");
  });

  it("TODO botão de ajuste da tela pública é entendido pelo motor de regras", () => {
    // Medido em 16/08/2026: 4 dos 6 textos não casavam com ramo nenhum de
    // `detectNegotiation`. O prospect clicava em "Tirar reels" e o motor
    // respondia com a próxima pergunta do roteiro, sem tirar reels nenhum.
    const tela = readFileSync(
      path.join(process.cwd(), "components/agency/briefing/PublicBriefingRoom.tsx"),
      "utf8",
    );
    const bloco = tela.slice(tela.indexOf("const QUICK_ACTIONS"), tela.indexOf("// ── Main component"));
    const textos = [...bloco.matchAll(/text: "([^"]+)"/g)].map((m) => m[1]!);
    expect(textos.length, "não achei os textos dos botões — o teste virou fachada").toBeGreaterThanOrEqual(6);

    const estado = initConvState();
    estado.scope = {
      wantsSocialMedia: true,
      wantsPaidTraffic: true,
      social: { platforms: ["Instagram"], postsPerWeek: 5, reelsPerMonth: 2 },
    } as never;
    for (const t of textos) {
      // "Quero incluir tráfego pago" só faz sentido com o tráfego DESLIGADO —
      // o botão só aparece nesse estado. Testa cada um no estado em que ele é
      // oferecido.
      const local = initConvState();
      local.scope = /incluir tr[áa]fego|quero tr[áa]fego/i.test(t)
        ? ({ ...(estado.scope as object), wantsPaidTraffic: false } as never)
        : estado.scope;
      expect(
        detectNegotiation(t, local),
        `o botão "${t}" não casa com nenhum ramo de detectNegotiation — clicar nele não ajusta nada`,
      ).not.toBeNull();
    }
  });

  it("o botão da tela pública não oferece um plano que não existe", () => {
    const tela = readFileSync(
      path.join(process.cwd(), "components/agency/briefing/PublicBriefingRoom.tsx"),
      "utf8",
    );
    // Achado desta passada: `QUICK_ACTIONS` RENDERIZA um botão, e ele se chamava
    // "Plano Starter" — o plano fantasma virando elemento de tela do prospect.
    const acoes = tela.slice(tela.indexOf("const QUICK_ACTIONS"), tela.indexOf("const QUICK_ACTIONS") + 2000);
    expect(acoes).not.toContain('label: "Plano Starter"');
  });
});
