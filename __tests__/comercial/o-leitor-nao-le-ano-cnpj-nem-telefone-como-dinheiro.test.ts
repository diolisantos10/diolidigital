// O LEITOR NÃO PODE LER ANO, DOCUMENTO, ENDEREÇO, TELEFONE NEM MÉTRICA COMO PREÇO.
//
// ═══════════════════════════════════════════════════════════════════════════
// A REPROVAÇÃO QUE PRODUZIU ESTE ARQUIVO (16/08/2026, quinta passada)
// ═══════════════════════════════════════════════════════════════════════════
//
// A quarta passada mediu o falso positivo da trava em **0 de 84** e considerou o
// assunto fechado. `qualidade` escreveu o corpus que faltava — fala comercial
// real onde número **não** é preço — e mediu **5 em 50** na mesma régua.
//
// A diferença não foi de sorte: **o corpus de 84 não tinha ano, CNPJ, telefone,
// endereço nem métrica de Instagram**, que são justamente as cinco classes onde
// a régua erra. Corpus escrito por quem escreveu o conserto mede o que o autor
// já pensou; é essa a lição do turno, e é por isso que as falas nomeadas abaixo
// são dela, verbatim, e não foram reescritas para caber na régua.
//
// ── AS DUAS AFIRMAÇÕES DO CÓDIGO QUE ELA REFUTOU ────────────────────────────
//
// 1. **A mitigação era falsa por construção.** `leitor-de-valor.ts` justificava
//    a remoção do separador de frase dizendo que "quantidade continua barrada
//    pelo `UNIDADE_DEPOIS` e pelo `PISO_DO_IMPLICITO`". Ano, CNPJ, CEP e
//    telefone **não são quantidade e não estão abaixo de 50** — nenhuma das duas
//    defesas os alcançava. Era a terceira vez nesta frente que um comentário
//    descrevia uma proteção que o código não tinha.
//
// 2. **O custo do falso positivo não era "uma fala nossa por outra fala nossa".**
//    `ecoDoCliente` compara NÚMEROS: em "…fica em Fortaleza desde 2018." o eco dá
//    `false`, o corte dá `null`, e o caminho termina em `respostaHonestaDePreco`.
//    O prospect pergunta onde fica a agência e ouve **"sobre valor: quem fecha
//    número aqui é a nossa equipe, não eu"** — não-sequitur na primeira impressão
//    comercial. É esse o custo real, e é ele que este portão passa a impedir.
//
// ── A RÉGUA DA CASA QUE ESTE ARQUIVO NÃO PODE VIOLAR ────────────────────────
//
// **Se reduzir o falso positivo custar um único falso negativo, a trava ganha.**
// Por isso a metade 2 deste arquivo não é decorativa: ela roda o preço que TEM
// FORMA DE ANO ("Fica em 2000.", "Sai por 2000.") e exige que continue barrado.

import { describe, it, expect } from "vitest";
import { falaEmDinheiro, valoresCitados } from "@/lib/agency/comercial/leitor-de-valor";
import { ehPerguntaDeFaixa } from "@/lib/agency/comercial/negociacao";
import { falaSegura } from "@/lib/agency/comercial/resposta-de-preco";

/** A régua de HOJE — a mesma expressão que `app/api/sdr/chat/route.ts` avalia. */
function travaDispara(fala: string): boolean {
  return falaEmDinheiro(fala) && !ehPerguntaDeFaixa(fala);
}

// ─────────────────────────────────────────────────────────────────────────────
// AS FALAS DE `qualidade` — VERBATIM, NÃO REESCRITAS
// ─────────────────────────────────────────────────────────────────────────────
//
// ⚠️ AUTORIA: `qualidade`. **Não edite estas nove linhas para o teste passar.**
// Elas são a medição de outra pessoa sobre o trabalho de quem escreveu o
// conserto — apagá-las ou "melhorá-las" devolve a régua a medir a si mesma, que
// é exatamente o defeito que produziu esta quinta passada.
//
// ⚠️ E ELAS SÃO 9 DE 68. As outras 59 falas do corpus dela não estão neste
// repositório — o despacho trouxe só as nove que ela nomeou. O bloco gerado
// abaixo é SUPLEMENTO do `pm`, não substituto: enquanto as 59 não forem
// importadas, a cobertura das cinco classes é a que o autor do conserto
// imaginou, e isso está declarado no relato como pendência.
const DE_QUALIDADE: [string, string][] = [
  ["ano · fundação", "Nosso estúdio fica em Fortaleza desde 2018."],
  ["ano · fundação + cidade", "A marca foi fundada em 2010 e fica em São Paulo."],
  ["endereço + CEP", "O escritório fica em Rua das Palmeiras, 1200 — CEP 04567-000."],
  ["métrica · curtidas", "A média de curtidas fica em 320 por post."],
  ["métrica · views", "Seus stories fecham em 1.100 views por dia."],
  ["métrica · visualizações", "Suas visualizações fecharam em 12.800 no mês passado."],
  ["ano · `:` sem corte de frase", "Fico em dúvida: a conta é de 2015 ou 2016?"],
  ["CNPJ · `;` sem corte de frase", "Quem define o valor é a equipe; me confirma o CNPJ 12.345.678/0001-90?"],
  ["telefone · `;` sem corte de frase", "O preço quem passa é o time; o WhatsApp que anotei foi 11988776655."],
];

// ─────────────────────────────────────────────────────────────────────────────
// O SUPLEMENTO — gerado, não escolhido a dedo
// ─────────────────────────────────────────────────────────────────────────────
//
// Mesma disciplina do corpus de não-regressão: produto cartesiano de moldura ×
// valor, para que a CLASSE entre inteira e não os exemplos de que alguém
// lembrou. As cinco classes são as que faltavam na medição de 84.

const ANOS = ["1998", "2010", "2015", "2018", "2021"];
const MOLDURAS_ANO = [
  (a: string) => `Nosso estúdio fica em Fortaleza desde ${a}.`,
  (a: string) => `A marca foi fundada em ${a} e fica em São Paulo.`,
  (a: string) => `Estamos no mercado desde ${a}.`,
  (a: string) => `A conta do Instagram foi criada em ${a}, se não me engano.`,
  (a: string) => `Fico em dúvida: a conta é de ${a} ou ${Number(a) + 1}?`,
];

const CNPJS = ["12.345.678/0001-90", "04.252.011/0001-10", "11.222.333/0001-81"];
const MOLDURAS_CNPJ = [
  (d: string) => `Quem define o valor é a equipe; me confirma o CNPJ ${d}?`,
  (d: string) => `Anotei o CNPJ ${d} para a proposta.`,
  (d: string) => `Preciso do CNPJ ${d} conferido antes de emitir.`,
];

const CPFS = ["123.456.789-09", "987.654.321-00"];
const MOLDURAS_CPF = [
  (d: string) => `Seu CPF é ${d}?`,
  (d: string) => `O contrato sai no CPF ${d}, certo?`,
];

const ENDERECOS = [
  "Rua das Palmeiras, 1200 — CEP 04567-000",
  "Avenida Paulista, 900, CEP 01310-100",
  "Rua Sete de Setembro, 355 — CEP 60060-000",
];
const MOLDURAS_ENDERECO = [
  (e: string) => `O escritório fica em ${e}.`,
  (e: string) => `Nosso endereço é ${e}.`,
  (e: string) => `A loja fica em ${e} e o custo do frete a gente vê depois.`,
];

const TELEFONES = ["11988776655", "(11) 98877-6655", "11 98877-6655", "5511988776655", "(85) 3232-1010"];
const MOLDURAS_TELEFONE = [
  (t: string) => `O preço quem passa é o time; o WhatsApp que anotei foi ${t}.`,
  (t: string) => `Me confirma se o telefone ${t} é o melhor para falar de valores?`,
  (t: string) => `Salvei o contato ${t} aqui.`,
];

const METRICAS = ["85", "320", "1.100", "12.800"];
const MOLDURAS_METRICA = [
  (m: string) => `A média de curtidas fica em ${m} por post.`,
  (m: string) => `Seus stories fecham em ${m} views por dia.`,
  (m: string) => `Suas visualizações fecharam em ${m} no mês passado.`,
  (m: string) => `O alcance fica em ${m} pessoas por semana.`,
  (m: string) => `Seu engajamento fica em ${m} interações por mês.`,
];

function cruza(molduras: ((v: string) => string)[], valores: string[]): string[] {
  const saida: string[] = [];
  for (const m of molduras) for (const v of valores) saida.push(m(v));
  return saida;
}

const SUPLEMENTO = [
  ...cruza(MOLDURAS_ANO, ANOS),
  ...cruza(MOLDURAS_CNPJ, CNPJS),
  ...cruza(MOLDURAS_CPF, CPFS),
  ...cruza(MOLDURAS_ENDERECO, ENDERECOS),
  ...cruza(MOLDURAS_TELEFONE, TELEFONES),
  ...cruza(MOLDURAS_METRICA, METRICAS),
];

// ─────────────────────────────────────────────────────────────────────────────
// METADE 1 — A FALA COMERCIAL REAL NÃO É BARRADA
// ─────────────────────────────────────────────────────────────────────────────

describe("o falso positivo que `qualidade` mediu — as nove falas dela", () => {
  it.each(DE_QUALIDADE)("%s: não é lido como preço — %s", (_classe, fala) => {
    expect(
      travaDispara(fala),
      `a trava disparou numa fala sem preço. O prospect ouviria a fala honesta ` +
        `de preço no meio de outro assunto: "${fala}"`,
    ).toBe(false);
  });

  it("🔴 e o custo do falso positivo é o que ela descreveu — não é troca equivalente", () => {
    // A prova de que "troca uma fala nossa por outra fala nossa" era falso: o
    // número da fala não é eco de número nenhum do cliente, então o caminho
    // termina na fala honesta de PREÇO, num turno que não falava de preço.
    const fala = "Nosso estúdio fica em Fortaleza desde 2018.";
    expect(valoresCitados(fala), "2018 continua sendo lido como dinheiro").toEqual([]);
    expect(falaSegura(fala, "Camila").substituida).toBe(false);
  });
});

describe("as cinco classes inteiras, geradas — não só os exemplos lembrados", () => {
  it("o suplemento é grande o bastante para não ser anedota", () => {
    expect(SUPLEMENTO.length).toBeGreaterThanOrEqual(70);
  });

  it("🔴 NENHUMA fala das cinco classes é lida como preço", () => {
    const falsos = SUPLEMENTO.filter(travaDispara);
    expect(
      falsos,
      `${falsos.length} falas sem preço foram barradas pela trava:\n` +
        falsos.slice(0, 12).map((f) => `  · ${JSON.stringify(f)}`).join("\n"),
    ).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// METADE 2 — E A TRAVA NÃO PERDEU NADA
// ─────────────────────────────────────────────────────────────────────────────
//
// A metade obrigatória, e aqui ela é a que manda: reduzir o falso positivo a
// zero se consegue com `() => false`. O que separa conserto de afrouxamento é o
// preço continuar barrado **inclusive quando ele tem a forma da exceção**.

describe("🔴 o preço com FORMA DE ANO continua barrado — a trava ganha o desempate", () => {
  it.each([
    "Fica em 2000.",
    "Sai por 2000.",
    "Fecho em 1990.",
    "Fica em 1990 por mês.",
    "O valor fica em 2000.",
    "Estamos no mercado desde 2010 e o valor fica em 2000.",
    "R$ 2018",
    "2018 reais",
    "Fica em 2018/mês.",
  ])("cotação de quatro dígitos não vira data: %s", (fala) => {
    expect(travaDispara(fala), "a exceção do ano virou saída para o preço").toBe(true);
  });

  it("as QUATRO condições do ano são todas necessárias — provado uma a uma", () => {
    // 1. forma: com separador de milhar não é ano.
    expect(travaDispara("Estamos no mercado desde 2010, e fica em 2.018.")).toBe(true);
    // 2. adjacência monetária derruba a exceção.
    expect(travaDispara("Estamos no mercado desde 2010 e sai por R$ 2018.")).toBe(true);
    expect(travaDispara("Estamos no mercado desde 2010 e fica em 2018 por mês.")).toBe(true);
    // 3. sem evidência de data, quatro dígitos é preço.
    expect(travaDispara("Fica em 2018.")).toBe(true);
    // 4. pista FORTE de preço na frase vence a evidência de data.
    expect(travaDispara("Estamos no mercado desde 2010 e o investimento fica em 2018.")).toBe(true);
  });
});

describe("🔴 o preço perto de MÉTRICA e de ENDEREÇO continua barrado", () => {
  it.each([
    "Para 20 stories, fica em 1.200 por mês.",
    "Suas curtidas vão subir. Fica em 1.200 por mês.",
    "Seu alcance dobra e o investimento fica em 1.850 mensais.",
    "Fica em Rua das Palmeiras. O valor fica em 1.200.",
    "O escritório fica na Rua das Palmeiras, 1200, e a mensalidade fica em 1.500.",
  ])("a exceção não vazou para o número que é preço: %s", (fala) => {
    expect(travaDispara(fala)).toBe(true);
  });

  it("`stories`, `posts` e `reels` NÃO entraram na lista de métrica — e é por isto", () => {
    // Se o vocabulário de ESCOPO desta casa contasse como métrica, a cotação
    // acima viraria "leitura de desempenho" e o preço passaria.
    expect(valoresCitados("Para 20 stories, fica em 1.200 por mês.")).toContain(1200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// METADE 3 — O FALSO NEGATIVO QUE ESTA PASSADA FECHOU
// ─────────────────────────────────────────────────────────────────────────────
//
// Medido ao instrumentar o corpus de 584 da não-regressão: **24 das 584 falas
// NÃO eram barradas** — as molduras que não têm pista de preço em palavra
// nenhuma ("Ficamos com …", "… fecha pra você?", "Consigo … pra você.")
// combinadas com a grafia `<número> por mês`. A trava ANTIGA também não as
// barrava, então isto não era regressão: era um buraco que ninguém tinha medido,
// e ele estava aberto desde antes desta frente.
//
// `<número> por mês` COLADO entrou em `PISTA_DE_PRECO`. Ele não confunde
// quantidade porque exige o número imediatamente antes de "por mês": em
// "8 posts por mês" e "60 stories por mês" há o substantivo no meio.

describe("🔴 `<número> por mês` colado passa a ser pista de preço", () => {
  it.each([
    "Ficamos com 1.200 por mês, combinado?",
    "1.200 por mês fecha pra você?",
    "Consigo 890 por mês pra você.",
    "2.590 por mês fecha pra você?",
  ])("cotação sem palavra de preço nenhuma: %s", (fala) => {
    expect(travaDispara(fala), "o buraco das 24 de 584 voltou").toBe(true);
  });

  it.each([
    "Fechamos em 100 posts por mês para o seu perfil?",
    "Vamos com 60 stories por mês e 12 reels?",
    "Feito! Ajustei para 8 posts + 8 stories/mês, sem reels e sem tráfego pago.",
  ])("e a quantidade com unidade no meio continua limpa: %s", (fala) => {
    expect(travaDispara(fala), `falso positivo em quantidade: "${fala}"`).toBe(false);
  });

  it("a fala do motor continua não sendo substituída por `falaSegura`", () => {
    for (const fala of [
      "Feito! Ajustei para 2 posts por semana (8/mês).",
      "Escopo ajustado: posts de 20 para 8/mês · reels saíram do escopo.",
      "Feito! Ajustei para 8 posts + 8 stories/mês, sem reels e sem tráfego pago.",
    ]) {
      expect(falaSegura(fala, "Camila").substituida, `fala legítima substituída: "${fala}"`).toBe(false);
    }
  });
});
