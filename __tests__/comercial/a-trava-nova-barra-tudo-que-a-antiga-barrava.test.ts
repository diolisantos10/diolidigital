// A TRAVA NOVA BARRA TUDO QUE A ANTIGA BARRAVA — o teste que não existia.
//
// ═══════════════════════════════════════════════════════════════════════════
// A REGRESSÃO QUE PRODUZIU ESTE ARQUIVO (16/08/2026, quarta passada)
// ═══════════════════════════════════════════════════════════════════════════
//
// O commit `977f276` trocou o regex escrito à mão da trava do SDR pelo leitor
// único (`falaEmDinheiro`) e escreveu em `app/api/sdr/chat/route.ts`, com todas
// as letras:
//
//     "A trava NÃO foi afrouxada: tudo que ela barrava antes continua barrado."
//
// **Era falso.** Medido pelo CEO e por `qualidade` no mesmo dia:
//
//     PASSA | "1.200/mês fecha pra você?"      ← a trava antiga BARRAVA
//     PASSA | "Ficaria em 890/mês."            ← a trava antiga BARRAVA
//     PASSA | "Ficamos com 1.500/mês?"         ← a trava antiga BARRAVA
//     PASSA | "Consigo 1.200/mês pra você."    ← a trava antiga BARRAVA
//
// Causa: o regex antigo tinha `\d+\s*\/m[êe]s\b` como **gatilho próprio**, e a
// troca não o repôs em lugar nenhum — `/mês` não é pista de preço, e a passada
// implícita do leitor só lê número solto quando há pista na mesma frase.
//
// `<número>/mês` é a forma canônica de cotar preço mensal em português, e a fala
// do modelo **não passa por `falaSegura`** (exceção declarada): a trava da rota
// era o único portão no caminho.
//
// ═══════════════════════════════════════════════════════════════════════════
// A REGRA QUE O CEO ADOTOU A PARTIR DISTO (docs/decisoes.md, 16/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// **Trocar um regex de proteção por um leitor "melhor" exige teste de
// não-regressão que rode o regex ANTIGO.** Sem ele, "ampliar" e "afrouxar" são
// indistinguíveis — e o commit que apaga o regex apaga a única testemunha do que
// ele cobria. Este arquivo é essa testemunha, preservada literalmente.

import { describe, it, expect } from "vitest";
import { falaEmDinheiro } from "@/lib/agency/comercial/leitor-de-valor";
import { ehPerguntaDeFaixa } from "@/lib/agency/comercial/negociacao";
import { falaSegura, resumoDoCorte } from "@/lib/agency/comercial/resposta-de-preco";
import { detectNegotiation, initConvState } from "@/lib/agency/question-engine";
import { ACOES_DE_ESCOPO } from "@/lib/agency/comercial/acoes-do-escopo";
import { FAIXAS } from "@/lib/agency/comercial/negociacao";

// ─────────────────────────────────────────────────────────────────────────────
// A TESTEMUNHA — o regex da trava até `977f276`, preservado LETRA POR LETRA
// ─────────────────────────────────────────────────────────────────────────────
//
// ⚠️ NÃO "MELHORE" ESTE REGEX. Ele não é a régua da casa: é o registro histórico
// do que a casa já protegia. Corrigi-lo aqui é apagar a testemunha e deixar o
// afrouxamento passar verde — que é exatamente como a regressão de `977f276`
// atravessou três auditorias.
const TRAVA_ANTIGA = /r\$\s*\d|\d+\s*(reais|\/m[êe]s\b)|desconto|\bplano\b.*\bR\$/i;

/** A régua de HOJE — a mesma expressão que `app/api/sdr/chat/route.ts` avalia. */
function travaDispara(fala: string): boolean {
  return falaEmDinheiro(fala) && !ehPerguntaDeFaixa(fala);
}

// ─────────────────────────────────────────────────────────────────────────────
// O CORPUS — gerado, não escolhido a dedo
// ─────────────────────────────────────────────────────────────────────────────
//
// Escolher as falas à mão é escolher o resultado: a rodada anterior tinha oito
// casos de cotação no `trava-de-preco-do-sdr.test.ts` e **nenhum** deles na forma
// `<número>/mês`. O corpus abaixo é o produto cartesiano de como esta casa
// realmente escreve preço — moldura × grafia × valor —, então a classe inteira
// entra, não os exemplos de que alguém lembrou.

/** As molduras de frase em que um preço aparece numa conversa de SDR. */
const MOLDURAS = [
  (v: string) => `Fica em ${v}.`,
  (v: string) => `Ficaria em ${v}.`,
  (v: string) => `Ficamos com ${v}, combinado?`,
  (v: string) => `Fico em ${v} pra você.`,
  (v: string) => `Sai por ${v}.`,
  (v: string) => `Fecho em ${v}.`,
  (v: string) => `Fechamos em ${v}?`,
  (v: string) => `O valor é ${v}.`,
  (v: string) => `${v} fecha pra você?`,
  (v: string) => `Consigo ${v} pra você.`,
  (v: string) => `Seu investimento seria ${v}.`,
  (v: string) => `Fica assim: ${v}.`,
  (v: string) => `Investimento estimado:\n${v}.`,
  (v: string) => `Para o seu escopo o investimento fica em ${v}.`,
  (v: string) => `Posso ajustar para o plano mais simples, que fica em ${v}.`,
  (v: string) => `Olha, pensando no seu momento eu consigo deixar em ${v}.`,
];

/** Como o número é escrito. As seis grafias que aparecem nas falas reais. */
const GRAFIAS = [
  (n: string) => `R$ ${n}`,
  (n: string) => `R$ ${n}/mês`,
  (n: string) => `${n} reais`,
  (n: string) => `${n}/mês`,
  (n: string) => `${n}/mes`,
  (n: string) => `${n} por mês`,
];

const NUMEROS = ["890", "990", "1.200", "1.500", "1.850", "2.590"];

const COTACOES: string[] = [];
for (const moldura of MOLDURAS)
  for (const grafia of GRAFIAS)
    for (const n of NUMEROS) COTACOES.push(moldura(grafia(n)));

// E as classes que não são "número numa moldura": desconto e nome de plano.
const OUTRAS_COTACOES = [
  "Consigo um desconto especial para você fechar hoje.",
  "Tenho um desconto de 20% se fecharmos hoje.",
  "Posso ajustar para o Plano Starter (R$ 1.200–1.800/mês).",
  "Plano Starter: R$ 790/mês.",
  "Para o plano da Pizzaria do Joao Silva, o valor fica em R$ 500.",
  "Fica em torno de 1.850 mensais.",
  "Você investe até R$ 150 ou acima de R$ 500 por mês?",
  "Posso ajustar para o Plano Turbo.",
];

const CORPUS = [...COTACOES, ...OUTRAS_COTACOES];

// ─────────────────────────────────────────────────────────────────────────────
// METADE 1 — NENHUMA REGRESSÃO: o que a antiga barrava, a nova barra
// ─────────────────────────────────────────────────────────────────────────────

describe("a régua nova não afrouxou a antiga — provado, não afirmado", () => {
  it("a testemunha não foi 'melhorada' — o regex antigo está literal", () => {
    // Se alguém editar `TRAVA_ANTIGA`, o teste inteiro passa a comparar a régua
    // nova contra ela mesma e deixa de provar coisa alguma.
    expect(TRAVA_ANTIGA.source).toBe(
      "r\\$\\s*\\d|\\d+\\s*(reais|\\/m[êe]s\\b)|desconto|\\bplano\\b.*\\bR\\$",
    );
    expect(TRAVA_ANTIGA.flags).toBe("i");
  });

  it("o corpus EXERCITA a régua antiga — o teste não pode ser vácuo", () => {
    const barradasPelaAntiga = CORPUS.filter((f) => TRAVA_ANTIGA.test(f));
    // Se um dia o corpus encolher a ponto de a antiga não barrar quase nada, a
    // asserção principal vira "nada implica nada" e passa verde sempre.
    expect(CORPUS.length).toBeGreaterThanOrEqual(500);
    expect(barradasPelaAntiga.length).toBeGreaterThanOrEqual(300);
  });

  it("🔴 TUDO que a régua ANTIGA barrava, a régua NOVA barra", () => {
    const regressoes = CORPUS.filter((f) => TRAVA_ANTIGA.test(f) && !travaDispara(f));
    expect(
      regressoes,
      `${regressoes.length} falas que a trava antiga BARRAVA passaram pela nova:\n` +
        regressoes.slice(0, 12).map((f) => `  · ${JSON.stringify(f)}`).join("\n"),
    ).toEqual([]);
  });

  // A CLASSE que produziu a regressão, nomeada, para não se esconder na massa.
  it.each([
    "1.200/mês fecha pra você?",
    "Ficaria em 890/mês.",
    "Ficamos com 1.500/mês, combinado?",
    "Consigo 1.200/mês pra você.",
    "Fica em 1.200/mês.",
    "890/mes.",
  ])("`<número>/mês` é gatilho próprio, como era antes: %s", (fala) => {
    expect(TRAVA_ANTIGA.test(fala), "o caso não exercita a régua antiga").toBe(true);
    expect(travaDispara(fala), "a regressão de `977f276` voltou").toBe(true);
  });

  // O SEPARADOR — a cobertura menor da mesma família (`:`, `;`, quebra de linha).
  it.each([
    "Fica assim: 1.200 por mês.",
    "Investimento estimado:\n1.200 a 1.800 por mês.",
    "Fecho em 1.200.",
    "Sai por 1.200.",
  ])("o separador não corta mais a pista da frase: %s", (fala) => {
    expect(travaDispara(fala)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// METADE 2 — E ELA NÃO INVENTA PROBLEMA NO CASO LIMPO
// ─────────────────────────────────────────────────────────────────────────────
//
// A metade obrigatória. "Barra tudo" se consegue com `() => true`; o que
// distingue proteção de ruído é o caso limpo continuar passando.

/** Falas sem preço nenhum — sondagem, quantidade, a pergunta da faixa. */
const LIMPAS = [
  "Pra eu montar a proposta certa: quanto você pensa em investir por mês — " +
    "até R$ 150, entre R$ 150 e R$ 500, entre R$ 500 e R$ 1.500, " +
    "entre R$ 1.500 e R$ 5.000, ou acima disso?",
  "Pra eu montar a proposta certa: quanto você pensa em investir por mês — " +
    "até 150, entre 150 e 500, entre 500 e 1.500, entre 1.500 e 5.000, ou acima disso?",
  "Quantos posts por semana você imagina para o Instagram?",
  "Fechamos em 100 posts por mês para o seu perfil?",
  "Vamos com 60 stories por mês e 12 reels?",
  "O plano de medição prevê 90 dias de acompanhamento.",
  "Já atendemos 200 negócios com esse formato.",
  "Feito! Ajustei para 8 posts + 8 stories/mês, sem reels e sem tráfego pago.",
  "Você prefere Instagram ou TikTok?",
  "Me conta: qual o nome do seu negócio?",
  "Nosso time entrega em 5 dias úteis.",
  "A campanha roda por 30 dias.",
  "Legal! Então são 2 reels e 8 posts.",
  "Perfeito, anotei o WhatsApp (11) 99999-0001.",
  "Qual o seu objetivo principal: vender mais ou aparecer mais?",
];

describe("e a régua nova não vira ruído — a metade que a impede de ser `() => true`", () => {
  it.each(LIMPAS)("não dispara em fala limpa: %s", (fala) => {
    expect(travaDispara(fala), `falso positivo: "${fala}"`).toBe(false);
  });

  it("a pergunta da faixa continua sendo a exceção — nas duas grafias", () => {
    expect(ehPerguntaDeFaixa(LIMPAS[0]!)).toBe(true);
    expect(ehPerguntaDeFaixa(LIMPAS[1]!)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// METADE 3 — O OUTRO LEITOR NÃO FOI CONTAMINADO
// ─────────────────────────────────────────────────────────────────────────────
//
// `valoresMonetarios` alimenta DOIS portões: a trava da rota (fala do modelo) e
// `falaSegura` (fala do motor de regras, que vira bolha na tela). O gatilho
// `<número>/mês` foi reposto em `falaEmDinheiro` e **não** no leitor, e a razão é
// medida: o motor escreve "Ajustei para 2 posts por semana (8/mês)" e
// `resumoDoCorte` escreve "posts de 20 para 8/mês". Com o gatilho dentro do
// leitor, as duas viram "o preço de R$ 8" e `falaSegura` **substitui a fala
// legítima** pela fala honesta de preço.

describe("o portão do catálogo não ganhou falso positivo com a repescagem", () => {
  /** Toda fala que o motor de regras realmente devolve, nos ramos e cadências. */
  function falasDoMotor(): string[] {
    const saida: string[] = [];
    const ditos = [
      "tá caro", "quero um plano mais barato", "sem os reels por enquanto",
      "quero adicionar reels", "sem tráfego pago por enquanto", "quero incluir tráfego pago",
      "quero mais posts", "quero menos posts", ...ACOES_DE_ESCOPO.map((a) => a.text),
    ];
    for (const dito of ditos) {
      for (const ppw of [1, 3, 5, 15]) {
        const estado = initConvState();
        estado.scope = {
          businessName: "Beauty Clinic", wantsSocialMedia: true, wantsPaidTraffic: true,
          social: { platforms: ["Instagram"], postsPerWeek: ppw, storiesPerWeek: 5, reelsPerMonth: 2 },
        } as never;
        const r = detectNegotiation(dito, estado);
        if (r) saida.push(r.replyText);
      }
    }
    const antes = { social: { postsPerWeek: 5, storiesPerWeek: 5, reelsPerMonth: 2 }, wantsPaidTraffic: true };
    for (const depois of [
      { social: { postsPerWeek: 2, storiesPerWeek: 2, reelsPerMonth: 0 }, wantsPaidTraffic: false },
      { social: { postsPerWeek: 3, storiesPerWeek: 5, reelsPerMonth: 2 }, wantsPaidTraffic: true },
    ]) {
      const nota = resumoDoCorte(antes, depois);
      if (nota) saida.push(nota);
    }
    for (const f of FAIXAS) saida.push(f.rotulo);
    return saida;
  }

  it("🔴 NENHUMA fala real do motor é substituída por `falaSegura`", () => {
    const falas = falasDoMotor();
    expect(falas.length, "não colhi fala nenhuma — o portão virou fachada").toBeGreaterThan(20);
    const substituidas = falas.filter((f) => falaSegura(f, "Camila").substituida);
    expect(
      substituidas,
      `o leitor passou a ler quantidade como preço em ${substituidas.length} falas:\n` +
        substituidas.slice(0, 8).map((f) => `  · ${JSON.stringify(f)}`).join("\n"),
    ).toEqual([]);
  });

  it("o caso concreto: '(8/mês)' do motor NÃO é o preço de R$ 8", () => {
    const fala = "Feito! Ajustei para 2 posts por semana (8/mês).";
    expect(falaSegura(fala, "Camila").substituida).toBe(false);
    // E a trava da rota, que roda sobre a fala do MODELO, continua vendo `/mês`.
    expect(travaDispara(fala), "o gatilho `/mês` da trava sumiu").toBe(true);
  });
});
