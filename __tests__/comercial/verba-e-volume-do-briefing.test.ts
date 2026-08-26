// O CASO CityJobs — 16/08/2026, piloto ao vivo, briefing feito pelo próprio CEO.
//
// ─── O QUE O CLIENTE DISSE ───────────────────────────────────────────────────
//
//   Verba:  *"olha o nosso budget, estamos pensando algo em torno de R$ 500 por mês"*
//   Volume: **2 posts estáticos por dia** no Instagram — e o SDR repetiu de volta
//           que tinha entendido: *"já entendi bem o escopo — 2 posts estáticos
//           por dia no Instagram"*.
//
// ─── O QUE A CASA DEVOLVEU, 48 SEGUNDOS DEPOIS ───────────────────────────────
//
//   "a estimativa fica entre R$ 1.800 e R$ 3.400 por mês. O que entra nessa
//    conta: • Plano Essencial — 3 posts + 5 stories/semana · 2 reels/mês
//           • Identidade Visual"
//
// Três defeitos empilhados, e este arquivo guarda os dois que são de código:
//
//   1. **O volume cotado não é o que ele pediu.** Ele pediu ~60 posts/mês; a
//      conta usou 3 posts/SEMANA — o menor plano da tabela.
//   2. **A verba declarada foi ignorada em silêncio.** 3,6× acima do que ele
//      disse poder pagar, sem uma palavra reconhecendo a diferença.
//
// ─── A CAUSA, QUE ESTAVA NO DIÁRIO E NÃO NA DEDUÇÃO ─────────────────────────
//
// O painel de escopo mostrava **"0 posts/mês"** durante a conversa inteira. O
// CEO viu e avisou na hora — *"aqui o resumo... só tá dizendo que são 0 posts
// por mês, não sei se é algum problema"* — e a conversa seguiu.
//
// Esse zero atravessou o sistema inteiro porque **todo guardião testava
// `postsPerWeek === undefined`, e `0` é definido**. Então `0 * 4 = 0` entrou em
// `detectPackage(0)`, que devolve "essencial" (`0 <= 14`), e a estimativa saiu
// com `missingForEstimate: []` e `confidence: "high"`: confiança máxima sobre um
// campo vazio.
//
// ─── POR QUE ESTE ARQUIVO EXISTE ────────────────────────────────────────────
//
// Porque as duas regras que consertam isso são frases fáceis de escrever num
// prompt e impossíveis de garantir por prompt — e esta casa roda 100% IA, sem
// revisor humano antes do cliente. "Sem gate = reprovado": checagem que não roda
// não protege nada.

import { describe, it, expect } from "vitest";
import { computeEstimate } from "@/lib/agency/live-calculator";
import { textoDoOrcamento } from "@/lib/agency/esteira/orcamento-do-briefing";
import { confrontoDeVerba, textoDaVerbaEstourada } from "@/lib/agency/comercial/verba-declarada";
import { tetoDaFaixa } from "@/lib/agency/comercial/negociacao";
import { PLANOS } from "@/lib/agency/planos";
import type { BriefingScope } from "@/lib/agency/briefing-conversation";

/** O escopo do CityJobs como ele REALMENTE chegou ao cálculo: com o volume
 *  zerado que o painel mostrava, e a faixa de até R$ 500 que ele declarou. */
function escopoDoCityJobs(overrides: Partial<BriefingScope> = {}): BriefingScope {
  return {
    businessName: "CityJobs",
    objectives: [],
    wantsSocialMedia: true,
    social: { platforms: ["Instagram"], postsPerWeek: 0, storiesPerWeek: 0, reelsPerMonth: 0 },
    branding: { requested: true, hasBrandBook: false, wantsRebrand: false },
    budgetRange: "entre R$ 150 e R$ 500",
    ...overrides,
  };
}

describe("volume zerado não vira orçamento", () => {
  it("trava a estimativa quando o volume de posts chega 0 — o caso CityJobs", () => {
    const e = computeEstimate(escopoDoCityJobs());

    // A trava é o mecanismo. Sem ela, este mesmo escopo produzia R$ 1.800–3.400.
    expect(e.travadaPor).toBeTruthy();
    expect(e.travadaPor).toMatch(/volume de posts/i);
  });

  it("não cota Plano Essencial para quem pediu 2 posts por dia", () => {
    const e = computeEstimate(escopoDoCityJobs());

    // O defeito exato: um plano de 3 posts/semana cotado para quem pediu 14.
    expect(e.items.map((i) => i.label)).not.toContain("Plano Essencial");
    expect(e.missingForEstimate).toContain("Frequência de posts por semana");
  });

  it("não declara confiança alta sobre um campo vazio", () => {
    const e = computeEstimate(escopoDoCityJobs());

    // O que mais assusta no incidente não é o número errado — é que ele saiu
    // com `confidence: "high"` e `missingForEstimate: []`. Confiança calculada
    // só sobre o que alguém LEMBROU de contar como faltante mente exatamente
    // quando mais custa.
    expect(e.confidence).toBe("none");
  });

  it("trata 0, negativo, NaN e não-número como o MESMO estado: o dado não chegou", () => {
    // Zero passou porque o guardião testava `=== undefined`. A lição não é sobre
    // o zero: é que falso-por-omissão passa em teste de `undefined`.
    const entradasQueNaoSaoVolume = [0, -3, Number.NaN, Number.POSITIVE_INFINITY, undefined];

    for (const v of entradasQueNaoSaoVolume) {
      const e = computeEstimate(
        escopoDoCityJobs({ social: { platforms: ["Instagram"], postsPerWeek: v as number } }),
      );
      expect(e.travadaPor, `postsPerWeek=${String(v)} deveria travar`).toBeTruthy();
    }
  });

  it("volume de verdade destrava e escolhe o plano pelo que foi pedido", () => {
    // 2 posts/dia = 14/semana = 56/mês → o topo da tabela, não o piso dela.
    const e = computeEstimate(
      escopoDoCityJobs({ social: { platforms: ["Instagram"], postsPerWeek: 14 } }),
    );

    expect(e.travadaPor).toBeUndefined();
    // O topo da tabela — pelo nome que ela tem hoje, lido dela mesma.
    const maior = PLANOS.filter((x) => x.pecasPorMes > 0).at(-1)!;
    expect(e.items.map((i) => i.label)).toContain(`Plano ${maior.nome}`);
    expect(e.totalMin).toBeGreaterThan(0);
  });

  // A outra metade desta regra — que a estimativa travada NÃO vira mensagem
  // para o cliente e entra na contagem de `semOrcamento` — é guardada em
  // `__tests__/esteira/orcamento-do-briefing.test.ts`, junto do resto do
  // comportamento da entrega, onde o banco já está simulado.
});

describe("verba declarada não pode ser ignorada em silêncio", () => {
  it("reconhece a faixa que o cliente declarou e nomeia a diferença", () => {
    // O cliente disse ~R$ 500/mês. A estimativa real do que ele pediu (14
    // posts/semana + identidade) passa MUITO disso — e tem que dizer isso.
    const e = computeEstimate(
      escopoDoCityJobs({ social: { platforms: ["Instagram"], postsPerWeek: 14 } }),
    );

    expect(e.confrontoDeVerba).toBeTruthy();
    expect(e.confrontoDeVerba!.teto).toBe(500);
    expect(e.confrontoDeVerba!.diferenca).toBe(e.totalMin - 500);

    const texto = textoDoOrcamento("CityJobs", e);
    // A diferença é NOMEADA, no texto que o cliente lê.
    expect(texto).toMatch(/passa disso/i);
    expect(texto).toMatch(/R\$\s*500/);
  });

  it("oferece o que cabe na verba — Pulso e Ritmo, os pacotes de entrada", () => {
    const c = confrontoDeVerba("entre R$ 150 e R$ 500", 4000);
    expect(c).toBeTruthy();

    const nomes = c!.cabemNaVerba.map((p) => p.nome);
    // Decisão do CEO: *"são dois pacotes que a gente criou pra quem não tem
    // tanto dinheiro"*. Cliente com pouca verba nunca ouve "não temos nada
    // para você" — toda faixa tem produto nesta casa.
    expect(nomes).toContain("Pulso");
    expect(nomes).toContain("Ritmo");
    // ⚠️ A REGRA É DE NÚMERO, NÃO DE NOME (26/08/2026). Ela dizia "não pode
    // conter Presença" porque o Presença custava R$ 790; hoje custa R$ 490 e
    // CABE — travar o nome faria o teste acusar a casa de oferecer, certo, um
    // degrau que o cliente pode pagar.
    for (const p of c!.cabemNaVerba) expect(p.preco, p.nome).toBeLessThanOrEqual(500);
    for (const acima of PLANOS.filter((p) => p.preco > 500)) {
      expect(nomes, `${acima.nome} custa ${acima.preco}`).not.toContain(acima.nome);
    }
  });

  it("NUNCA inventa preço — todo valor ofertado vem da tabela do conselho", () => {
    // A regra mais cara desta casa. A fonte oficial é `lib/agency/planos.ts`; se
    // um preço aparecer no texto sem estar lá, alguém inventou número para o
    // cliente — e não há revisor humano depois disto.
    const c = confrontoDeVerba("entre R$ 150 e R$ 500", 4000)!;
    const precosOficiais = new Set(PLANOS.map((p) => p.preco));

    for (const p of c.cabemNaVerba) {
      expect(precosOficiais.has(p.preco), `${p.nome} cota ${p.preco}, fora da tabela`).toBe(true);
      expect(PLANOS.find((o) => o.nome === p.nome)?.preco).toBe(p.preco);
    }
  });

  it("cala quando a conta CABE — aviso que aparece sempre vira ruído", () => {
    // Cliente que pode pagar não precisa ouvir sobre dinheiro que sobra.
    expect(confrontoDeVerba("entre R$ 1.500 e R$ 5.000", 1800)).toBeNull();
    expect(confrontoDeVerba("entre R$ 500 e R$ 1.500", 1500)).toBeNull(); // limite é inclusivo
  });

  it("cala quando a verba NÃO foi declarada — não se constrange com limite inventado", () => {
    // Ausência de informação não é informação. Deduzir um teto para depois
    // avisar que a conta estourou é atribuir ao cliente um limite que ele nunca
    // disse — e o mesmo princípio que rege `FAIXA_INDEFINIDA`.
    expect(confrontoDeVerba(undefined, 4000)).toBeNull();
    expect(confrontoDeVerba("", 4000)).toBeNull();
    expect(confrontoDeVerba("uns quinhentos reais", 4000)).toBeNull(); // texto livre não é faixa
    expect(tetoDaFaixa("acima de R$ 5.000")).toBe(Number.POSITIVE_INFINITY);
    expect(confrontoDeVerba("acima de R$ 5.000", 40000)).toBeNull();
  });

  it("compara contra o valor que o cliente REALMENTE pagaria, com desconto aplicado", () => {
    // Se o SDR já concedeu desconto, é o preço com desconto que precisa caber na
    // verba dele. Confrontar o preço cheio faria a casa avisar de um estouro que
    // não existe mais.
    const e = computeEstimate(
      escopoDoCityJobs({
        social: { platforms: ["Instagram"], postsPerWeek: 3 },
        branding: undefined,
        budgetRange: "entre R$ 500 e R$ 1.500",
        negotiation: { discountPct: 40, discountReason: "compromisso anual" },
      }),
    );

    // O que importa é a conta usar o DESCONTADO, não o cheio.
    expect(e.discountedMin).toBeLessThan(e.totalMin);
    // ⚠️ Os limites são derivados do próprio total (26/08/2026): com a tabela
    // nova o preço cheio já cabe em R$ 500, e uma faixa digitada faria o teste
    // medir a tabela em vez de medir a REGRA. A régua é: existe um teto em que
    // o cheio estoura e o descontado não — e o confronto tem de ver os dois.
    const teto = `entre R$ 150 e R$ ${Math.floor((e.discountedMin! + e.totalMin) / 2)}`;
    expect(confrontoDeVerba(teto, e.discountedMin!)).toBeNull();
    expect(confrontoDeVerba(teto, e.totalMin)).toBeTruthy();
  });

  it("o texto da verba não constrange e nunca deixa o cliente sem próximo passo", () => {
    const linhas = textoDaVerbaEstourada(confrontoDeVerba("entre R$ 150 e R$ 500", 4000)!);
    const texto = linhas.join("\n");

    // Tom é decisão de casa, e por isso mora em código e não no humor do modelo.
    expect(texto).not.toMatch(/desculpa|infelizmente|não temos|fora do seu alcance/i);
    expect(texto).toMatch(/Pulso/);
    expect(texto).toMatch(/prioridade|remonto o escopo/i); // sempre há um próximo passo
  });
});
