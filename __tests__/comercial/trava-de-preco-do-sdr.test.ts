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
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageBubble } from "@/components/agency/briefing/PublicBriefingRoom";
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
import { FAIXAS } from "@/lib/agency/comercial/negociacao";
import { buildPriceObjectionReply } from "@/lib/agency/sdr-agent";
import { detectNegotiation } from "@/lib/agency/question-engine";
import { initConvState } from "@/lib/agency/question-engine";
import { falaEmDinheiro } from "@/lib/agency/comercial/leitor-de-valor";
import { resumoDoCorte } from "@/lib/agency/comercial/resposta-de-preco";
import { ACOES_DE_ESCOPO } from "@/lib/agency/comercial/acoes-do-escopo";

// ⚠️ A TRAVA DEIXOU DE SER UM REGEX COPIADO (16/08/2026, terceira passada).
//
// Antes, este arquivo mantinha uma CÓPIA do regex da rota e um teste provando
// que as duas grafias eram iguais. A cópia era fiel — e as duas eram CEGAS do
// mesmo jeito: "Fica em 1.200 por mês." e "Fica em torno de 1.850 mensais."
// atravessavam o servidor inteiro. Prova textual de igualdade não diz nada sobre
// o que a régua enxerga.
//
// Agora o teste chama a MESMA FUNÇÃO que a rota chama. Não há cópia para
// divergir, e ampliar (ou afrouxar) a régua muda os dois lados de uma vez.
function travaDispara(fala: string): boolean {
  return falaEmDinheiro(fala) && !ehPerguntaDeFaixa(fala);
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
      // ── AS DUAS CEGUEIRAS MEDIDAS POR `qualidade` EM 16/08 ─────────────────
      // As duas ATRAVESSAVAM o servidor. E, por exceção declarada, a fala do
      // modelo não passa por `falaSegura`: elas chegavam ao prospect sem portão
      // nenhum no meio.
      ["preço SEM cifrão",      "Posso ajustar para o plano mais simples, que fica em 1.200 por mês."],
      ["preço por extenso",     "Fica em torno de 1.850 mensais."],
      ["nome de plano fantasma","Plano Starter: R$ 790/mês."],
    ])("recusa: %s", (_caso, fala) => {
      expect(travaDispara(fala)).toBe(true);
    });

    it("a rota chama ESTA função — não há segunda régua para divergir", () => {
      const rota = readFileSync(
        path.join(process.cwd(), "app/api/sdr/chat/route.ts"),
        "utf8",
      );
      expect(rota).toContain("falaEmDinheiro(replyText)");
      // O regex escrito à mão não voltou pela porta dos fundos.
      expect(rota).not.toContain("const PRICE_LEAK");
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

    // ── O CONTRAFACTUAL QUE `qualidade` COBROU, E ELE AGORA EXECUTA ──────────
    //
    // Ampliar a trava para enxergar número SEM cifrão tinha um risco concreto e
    // nomeado: derrubar a PERGUNTA DA FAIXA — a terceira pergunta da conversa,
    // por decisão do CEO (05/08) — quando o modelo a escreve sem "R$".
    //
    // Antes desta rodada essa fala não disparava a trava por acidente (não tinha
    // cifrão) e, se disparasse, `ehPerguntaDeFaixa` NÃO a reconheceria: o leitor
    // dele também só via "R$" e "reais", então contava ZERO limites e reprovava.
    // Ampliar a trava sem ampliar a exceção teria matado a pergunta certa.
    //
    // Resultado medido: as duas grafias passam, porque trava e exceção leem o
    // MESMO `leitor-de-valor`.
    it("a pergunta da faixa SEM cifrão também passa — a exceção acompanhou a trava", () => {
      const fala =
        "Pra eu montar a proposta certa: quanto você pensa em investir por mês — " +
        "até 150, entre 150 e 500, entre 500 e 1.500, entre 1.500 e 5.000, ou acima disso?";
      expect(ehPerguntaDeFaixa(fala), "a exceção deixou de reconhecer a pergunta da faixa").toBe(true);
      expect(travaDispara(fala), "a trava nova derrubou a pergunta da faixa").toBe(false);
    });

    it("mas a COTAÇÃO sem cifrão continua barrada — ampliar não é afrouxar", () => {
      // Um único valor, fora da régua: é cotação, não pergunta.
      expect(travaDispara("Para o seu escopo o investimento fica em 1.200 por mês.")).toBe(true);
      // Régua incompleta (dois limites) continua sendo cotação disfarçada.
      expect(travaDispara("Você investe até 150 ou acima de 500 por mês?")).toBe(true);
    });

    it("conversa de sondagem sem dinheiro nenhum passa", () => {
      expect(travaDispara("Quantos posts por semana você imagina para o Instagram?")).toBe(false);
    });

    // ── A METADE QUE IMPEDE A TRAVA DE VIRAR RUÍDO ──────────────────────────
    // O leitor novo lê número solto. Se ele confundisse quantidade com preço, a
    // conversa inteira do SDR cairia na fala honesta — e portão que dispara onde
    // não há risco é portão que alguém desliga.
    it.each([
      "Fechamos em 100 posts por mês para o seu perfil?",
      "Vamos com 60 stories por mês e 12 reels?",
      "O plano de medição prevê 90 dias de acompanhamento.",
      "Já atendemos 200 negócios com esse formato.",
    ])("quantidade NÃO é dinheiro: %s", (fala) => {
      expect(travaDispara(fala), `a trava confundiu quantidade com preço: "${fala}"`).toBe(false);
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

    // ── ⛔ O TESTE QUE PROTEGIA UM CAMINHO QUE NÃO EXISTE (D6) ──────────────
    //
    // Aqui havia um caso sobre `buildScopeAdjustmentConfirmation`, afirmando no
    // texto: *"Ela chega ao prospect"*. **Não chegava.** A função tinha ZERO
    // chamadas em caminho de execução — só este arquivo a importava. Teste
    // protegendo caminho inexistente consome atenção e produz sensação de
    // cobertura onde não há caminho.
    //
    // A função foi REMOVIDA de `sdr-agent.ts` em 16/08/2026 (ela imprimia os
    // totais do `live-calculator`, a terceira tabela de preço da casa). O que
    // fica no lugar é a prova de que ela não voltou por importação nenhuma.
    it("`buildScopeAdjustmentConfirmation` não existe mais — nem como export órfão", () => {
      const agente = readFileSync(path.join(process.cwd(), "lib/agency/sdr-agent.ts"), "utf8");
      expect(agente).not.toContain("export function buildScopeAdjustmentConfirmation");
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
    expect(ecoDoCliente(ECO_1, ["posso colocar R$ 1.000 por mês em anúncio"])).toBe(true);
    expect(ecoDoCliente(ECO_2, ["tenho uns R$ 800 por mês pra investir"])).toBe(true);
  });

  // ── C3: A FONTE DO "DITO PELO CLIENTE" ERA CONTAMINADA ────────────────────
  //
  // Medido por `qualidade`: a rota alimentava `ecoDoCliente` com
  // `scope.budgetRange`, que **não é fala do cliente** — é o RÓTULO da faixa,
  // escrito por esta casa em `negociacao.ts` ("entre R$ 500 e R$ 1.500"). O
  // cliente diz 300, o rótulo traz 500, e uma fala do SDR com R$ 500 era
  // carimbada como eco. Custo real: quem perguntou o preço ouve a próxima
  // pergunta do roteiro em vez da fala honesta.
  it("🔴 o RÓTULO DA FAIXA não é fala do cliente — e não pode virar eco", () => {
    const rotuloDaCasa = FAIXAS.find((f) => f.faixa === "presenca")!.rotulo; // "entre R$ 500 e R$ 1.500"
    expect(rotuloDaCasa).toContain("500");
    // O cliente disse 300. A fala do SDR diz 500. Isso NÃO é eco.
    expect(
      ecoDoCliente("Fica em R$ 500 por mês.", ["consigo uns R$ 300 por mês"]),
      "o rótulo da casa voltou a contar como fala do cliente",
    ).toBe(false);
  });

  it("a rota alimenta o eco SÓ com o que o cliente falou", () => {
    const rota = readFileSync(path.join(process.cwd(), "app/api/sdr/chat/route.ts"), "utf8");
    const bloco = rota.slice(rota.indexOf("const eco = ecoDoCliente("));
    const chamada = bloco.slice(0, bloco.indexOf("]);"));
    expect(chamada).toContain("body.currentMessage");
    expect(chamada).toContain("body.messages.filter");
    // As duas fontes que NÃO são fala do cliente.
    expect(chamada, "`budgetRange` (rótulo da casa) voltou para a fonte do eco").not.toContain("budgetRange");
    expect(chamada, "`monthlyAdBudget` (preenchido pelo modelo) voltou para a fonte do eco").not.toContain("monthlyAdBudget");
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

  // ── B4 REABERTO E FECHADO NO CAMINHO PRINCIPAL (16/08, terceira passada) ──
  //
  // `escopoEncolheu` tinha UM call site: dentro do ramo `price_leak`, o ramo
  // RARO. No caminho normal (o modelo responde) o front mantinha o escopo já
  // cortado, mostrava a fala do modelo e descartava a única frase que descrevia
  // o corte. O prospect clicava em "Começar menor" e o painel caía de 20 para 8
  // posts/mês **sem uma palavra**.
  it("o AVISO do corte é uma frase determinística, sem preço e sem nome de plano", () => {
    const depois = { social: { postsPerWeek: 2, storiesPerWeek: 2, reelsPerMonth: 0 }, wantsPaidTraffic: false };
    const nota = resumoDoCorte(antes, depois);
    expect(nota, "o corte deixou de produzir aviso").not.toBeNull();
    expect(nota).toContain("20");   // posts/mês antes
    expect(nota).toContain("8");    // posts/mês depois
    expect(nota).toContain("reels");
    expect(nota).toContain("tráfego pago");
    expect(nota).not.toMatch(/R\$/);
    expect(precosForaDoCatalogo(nota!)).toEqual([]);
  });

  it("turno sem corte NÃO produz aviso (o painel não vira alarme falso)", () => {
    expect(resumoDoCorte(antes, antes)).toBeNull();
    expect(resumoDoCorte(antes, { ...antes, social: { ...antes.social, postsPerWeek: 7 } })).toBeNull();
  });

  it("🔴 o aviso entra nos TRÊS caminhos do turno, não só no ramo raro", () => {
    const tela = readFileSync(
      path.join(process.cwd(), "components/agency/briefing/PublicBriefingRoom.tsx"),
      "utf8",
    );
    // Calculado UMA vez, antes de escolher o caminho.
    expect(tela).toContain("const corte = resumoDoCorte(prevState.conv.scope, ruleResult.conv.scope)");
    // E aplicado nos três: trava de preço, resposta do modelo, fallback do motor.
    const usos = [...tela.matchAll(/\.\.\.notaDoCorte/g)].length;
    expect(
      usos,
      "o aviso do corte voltou a existir em menos de três caminhos — B4 reabre por onde faltar",
    ).toBe(3);
  });

  it("🔴 e o aviso RENDERIZA — a nota `system` vira texto na tela, não linha em array", () => {
    // "Prove o caminho de render." Entrar no array de mensagens não é chegar aos
    // olhos do prospect: quem desenha é `MessageBubble`, e uma mensagem de papel
    // `system` cai num ramo próprio dele. Aqui a bolha é montada de verdade.
    const nota = resumoDoCorte(antes, { social: { postsPerWeek: 2, storiesPerWeek: 2, reelsPerMonth: 0 }, wantsPaidTraffic: false })!;
    const html = renderToStaticMarkup(
      createElement(MessageBubble, {
        msg: { id: "corte-1", role: "system" as const, text: nota, createdAt: "2026-08-16T00:00:00.000Z" },
      }),
    );
    expect(html, "a bolha de sistema não desenhou o aviso do corte").toContain("Escopo ajustado");
    expect(html).toContain("8/mês");
    // E a lista de mensagens da tela desenha TODA mensagem, sem filtrar `system`.
    const tela = readFileSync(
      path.join(process.cwd(), "components/agency/briefing/PublicBriefingRoom.tsx"),
      "utf8",
    );
    expect(tela).toContain("conv.messages.map((msg) => (");
    expect(tela).toContain("<MessageBubble key={msg.id} msg={msg} />");
  });

  it("a decisão de QUEM FALA no ramo da trava continua usando o corte", () => {
    const tela = readFileSync(
      path.join(process.cwd(), "components/agency/briefing/PublicBriefingRoom.tsx"),
      "utf8",
    );
    expect(tela).toContain("resultado.eco === true || corte !== null");
  });

  // ── A JUSTIFICATIVA FALSA QUE NÃO PODE SE REPETIR ─────────────────────────
  //
  // A rodada anterior recusou desfazer o corte alegando que `processProspectMessage`
  // "aplica extração e negociação no mesmo passo". **É falso**, e a prova é
  // estrutural: os dois são ramos `if/else`. Quando `detectNegotiation` casa,
  // `currentQ.parse` NÃO roda — não há extração a perder.
  //
  // O registro fica travado aqui para que a próxima decisão sobre B4 (desfazer
  // ou avisar) seja tomada sobre o mecanismo real, não sobre uma lembrança.
  it("negociação e extração são ramos EXCLUSIVOS — não há extração a perder", () => {
    const motor = readFileSync(path.join(process.cwd(), "lib/agency/prospect-engine.ts"), "utf8");
    const bloco = motor.slice(motor.indexOf("const negotiation = detectNegotiation(text, conv);"));
    const ateOElse = bloco.slice(0, bloco.indexOf("currentQ.parse"));
    expect(ateOElse).toContain("} else {");
    expect(ateOElse.indexOf("if (negotiation) {")).toBeLessThan(ateOElse.indexOf("} else {"));
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

  // ══════════════════════════════════════════════════════════════════════════
  // O PORTÃO DOS BOTÕES — reescrito em 16/08/2026, terceira passada
  // ══════════════════════════════════════════════════════════════════════════
  //
  // A versão anterior tinha DUAS fraquezas, as duas nomeadas por `qualidade`:
  //
  //   1. **Lia os textos por regex de aspas duplas** num recorte do `.tsx`,
  //      fatiando até um COMENTÁRIO (`// ── Main component`). Aspas simples,
  //      template literal ou constante ficavam invisíveis, e renomear o
  //      comentário esvaziava a lista em silêncio.
  //   2. **Exigia só `detectNegotiation(t) !== null`, não o RAMO CERTO.** Um
  //      botão `label: "Adicionar reels"` com `text: "sem reels"` passava verde
  //      fazendo exatamente o oposto do que o rótulo promete ao prospect.
  //
  // Agora a lista é um MÓDULO (`lib/agency/comercial/acoes-do-escopo.ts`), o
  // teste importa o mesmo array que a tela renderiza, e cada botão declara o
  // `efeito` que o rótulo promete. A asserção é sobre o ESCOPO RESULTANTE.
  describe("todo botão de ajuste faz o que o rótulo promete", () => {
    /** O escopo em que cada botão é oferecido de verdade (o `show` dele). */
    function estadoOndeApareceu(acao: (typeof ACOES_DE_ESCOPO)[number]) {
      const base = {
        wantsSocialMedia: true,
        wantsPaidTraffic: acao.efeito === "adicionar_trafego" ? false : true,
        social: {
          platforms: ["Instagram"],
          postsPerWeek: 5,
          storiesPerWeek: 5,
          reelsPerMonth: acao.efeito === "adicionar_reels" ? 0 : 2,
        },
      } as never;
      const estado = initConvState();
      estado.scope = base;
      return estado;
    }

    it("a lista NÃO está vazia — o portão não vira fachada por lista sumida", () => {
      expect(ACOES_DE_ESCOPO.length).toBeGreaterThanOrEqual(6);
      // E é a MESMA lista que a tela monta: importada, não lida por regex.
      const tela = readFileSync(
        path.join(process.cwd(), "components/agency/briefing/PublicBriefingRoom.tsx"),
        "utf8",
      );
      expect(tela).toContain('import { ACOES_DE_ESCOPO } from "@/lib/agency/comercial/acoes-do-escopo"');
      expect(tela).toContain("ACOES_DE_ESCOPO.filter((qa) => qa.show(scope))");
    });

    it.each(ACOES_DE_ESCOPO.map((a) => [a.label, a] as const))(
      '"%s" — o motor entende E faz o que o rótulo diz',
      (_label, acao) => {
        const estado = estadoOndeApareceu(acao);
        const antesDoClique = estado.scope.social!;
        const r = detectNegotiation(acao.text, estado);

        // 1. O motor reconhece (o defeito de 16/08: 4 dos 6 não casavam).
        expect(
          r,
          `o botão "${acao.label}" não casa com ramo nenhum — clicar nele não ajusta nada`,
        ).not.toBeNull();

        // 2. E o ramo reconhecido é o QUE O RÓTULO PROMETE.
        const d = r!.scopeDelta;
        const social = (d.social ?? {}) as { postsPerWeek?: number; reelsPerMonth?: number };
        const erro = `o botão "${acao.label}" (efeito ${acao.efeito}) produziu ${JSON.stringify(d)}`;
        switch (acao.efeito) {
          case "encolher_escopo":
            expect(social.postsPerWeek!, erro).toBeLessThan(antesDoClique.postsPerWeek!);
            expect(d.wantsPaidTraffic, erro).toBe(false);
            break;
          case "remover_reels":
            expect(social.reelsPerMonth, erro).toBe(0);
            break;
          case "adicionar_reels":
            expect(social.reelsPerMonth!, erro).toBeGreaterThan(0);
            break;
          case "remover_trafego":
            expect(d.wantsPaidTraffic, erro).toBe(false);
            break;
          case "adicionar_trafego":
            expect(d.wantsPaidTraffic, erro).toBe(true);
            break;
          case "reduzir_posts":
            expect(social.postsPerWeek!, erro).toBeLessThan(antesDoClique.postsPerWeek!);
            break;
        }

        // 3. E a fala que volta não cita preço sem lastro.
        expect(precosForaDoCatalogo(r!.replyText), `"${acao.text}" → "${r!.replyText}"`).toEqual([]);
      },
    );

    // ── A METADE QUE PROVA QUE O PORTÃO MORDE ────────────────────────────────
    // O caso concreto que a auditora descreveu: rótulo prometendo uma coisa,
    // texto fazendo a oposta. O portão antigo passava verde nisto.
    it("PEGA o botão que faz o oposto do que promete", () => {
      const acaoTorta = { label: "Adicionar reels", text: "sem reels", efeito: "adicionar_reels" as const, show: () => true };
      const estado = estadoOndeApareceu(acaoTorta);
      const r = detectNegotiation(acaoTorta.text, estado);
      expect(r, "o motor não entendeu nem o texto torto — o caso não prova nada").not.toBeNull();
      // O ramo que casou REMOVE reels; o rótulo prometia adicionar.
      expect(r!.scopeDelta.social?.reelsPerMonth).toBe(0);
    });
  });

});
