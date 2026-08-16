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
// ⚠️ AS 95 ESTÃO AQUI (16/08/2026, SEXTA passada). A quinta passada trouxe só 9
// das 68 dela e declarou as outras 59 como pendência — corpus pela metade mede
// pela metade. Ela fechou o corpus (68 originais + 27 novas, escritas contra o
// conserto da quinta passada) e ele entra INTEIRO, verbatim, com o esperado que
// ELA marcou. As que ainda divergem entram como **falha conhecida**, nomeadas e
// com o porquê — não somem e não foram reescritas para o teste passar.
type Esperado = "PASSA" | "BARRA";

const CORPUS_DE_QUALIDADE: [string, string, Esperado][] = [
  // ── AS 68 ORIGINAIS ────────────────────────────────────────────────────────
  ["datas-anos", "Consigo te ligar dia 20, às 15h.", "PASSA"],
  ["datas-anos", "A campanha começa em 2 de outubro e fica no ar até 30 de novembro.", "PASSA"],
  ["datas-anos", "Fecho a agenda de setembro no dia 30, tudo bem?", "PASSA"],
  ["datas-anos", "Fica para o dia 25, então.", "PASSA"],
  ["datas-anos", "Fica em 12 de março a primeira entrega.", "PASSA"],
  ["datas-anos", "A Dioli existe desde 2019.", "PASSA"],
  ["datas-anos", "Nosso estúdio fica em Fortaleza desde 2018.", "PASSA"],
  ["datas-anos", "Fechamos 2024 com a agenda cheia.", "PASSA"],
  ["datas-anos", "A marca foi fundada em 2010 e fica em São Paulo.", "PASSA"],
  ["datas-anos", "Trabalhamos com Instagram desde 2016 e com TikTok desde 2021.", "PASSA"],
  ["cnpj-cpf", "Nosso CNPJ é 12.345.678/0001-90, pode emitir a nota.", "PASSA"],
  ["cnpj-cpf", "Me confirma o CNPJ 45.987.123/0001-05 para a proposta?", "PASSA"],
  ["cnpj-cpf", "A nota sai pelo CNPJ 09.876.543/0001-22.", "PASSA"],
  ["cnpj-cpf", "Me passa o CPF 123.456.789-00 para o cadastro?", "PASSA"],
  ["tel-cep-end", "Perfeito, anotei o WhatsApp (11) 98877-6655.", "PASSA"],
  ["tel-cep-end", "O escritório fica em Rua das Palmeiras, 1200 — CEP 04567-000.", "PASSA"],
  ["tel-cep-end", "Fica na Avenida Paulista, 1578, sala 402.", "PASSA"],
  ["prazo-qtd", "Fica pronto em 10 dias úteis.", "PASSA"],
  ["prazo-qtd", "Fecha em 45 dias corridos, do briefing à entrega.", "PASSA"],
  ["prazo-qtd", "A produção fica em 3 semanas.", "PASSA"],
  ["prazo-qtd", "Sai a primeira leva em 7 dias.", "PASSA"],
  ["prazo-qtd", "O contrato fica em 12 meses, com renovação automática.", "PASSA"],
  ["prazo-qtd", "Fica em 90 dias o acompanhamento.", "PASSA"],
  ["metricas", "Seu perfil fechou o mês em 3.400 seguidores.", "PASSA"],
  ["metricas", "O último reels bateu 12.800 visualizações.", "PASSA"],
  ["metricas", "Sua taxa de engajamento fica em 2,3% hoje.", "PASSA"],
  ["metricas", "Você fechou julho com 850 novos seguidores.", "PASSA"],
  ["metricas", "O alcance fica em 45.000 contas por mês.", "PASSA"],
  ["metricas", "A média de curtidas fica em 320 por post.", "PASSA"],
  ["metricas", "Seus stories fecham em 1.100 views por dia.", "PASSA"],
  ["metricas", "O CTR fica em 1,8% e o CPM em 14.", "PASSA"],
  ["prazo-qtd", "Fechamos em 12 posts e 20 stories por mês?", "PASSA"],
  ["prazo-qtd", "Fica em 3 reels por mês, tudo bem?", "PASSA"],
  ["prazo-qtd", "Ajustei para 8 posts/mês, sem tráfego pago.", "PASSA"],
  ["prazo-qtd", "Fechamos em 100 criativos no trimestre.", "PASSA"],
  ["prazo-qtd", "A meta fica em 500 leads no trimestre.", "PASSA"],
  ["prazo-qtd", "Fica em 4 rodadas de ajuste por peça.", "PASSA"],
  ["prazo-qtd", "Já atendemos 200 negócios no seu segmento.", "PASSA"],
  ["horarios", "Fica em 14h ou prefere 16h?", "PASSA"],
  ["horarios", "Fecho em 9h da manhã para a call.", "PASSA"],
  ["horarios", "A gravação fica em 2h de estúdio.", "PASSA"],
  ["idiomatismos", "Ficou por isso mesmo, seguimos com o combinado.", "PASSA"],
  ["idiomatismos", "Ficamos por aqui hoje e retomo amanhã.", "PASSA"],
  ["idiomatismos", "Fica por conta da nossa equipe a edição dos 20 vídeos.", "PASSA"],
  ["idiomatismos", "Isso fica por nossa conta.", "PASSA"],
  ["sondagem", "Qual o seu objetivo: vender mais ou aparecer mais?", "PASSA"],
  ["sondagem", "Você prefere Instagram ou TikTok?", "PASSA"],
  ["sondagem", "Me conta o nome do seu negócio.", "PASSA"],
  ["sondagem", "Quantos posts por semana você imagina?", "PASSA"],
  ["sondagem", "Hoje você tem 2 pessoas cuidando do digital?", "PASSA"],
  // ── AS 18 DO SEPARADOR (`;`, `:`, quebra de linha sem corte de frase) ──────
  ["separador", "Quem define o valor é a equipe; me confirma o CNPJ 12.345.678/0001-90?", "PASSA"],
  ["separador", "Sobre investimento eu não avanço sozinho; nossa agência atende desde 2019.", "PASSA"],
  ["separador", "Quem fecha valor é a equipe\nSeu perfil tem 3.400 seguidores hoje", "PASSA"],
  ["separador", "Investimento: alinho com o time\nA campanha entra no ar em 2026", "PASSA"],
  ["separador", "Próximos passos: te ligo amanhã e envio o resumo; o contrato roda de 2026 a 2027.", "PASSA"],
  ["separador", "Sobre orçamento: a equipe responde. Seu alcance foi 45.000 contas.", "PASSA"],
  ["separador", "Fechamos o escopo; a conta existe desde 2015.", "PASSA"],
  ["separador", "Resumo do que combinamos: 12 posts, 20 stories e o CNPJ 12.345.678/0001-90 na nota.", "PASSA"],
  ["separador", "O preço quem passa é o time; o WhatsApp que anotei foi 11988776655.", "PASSA"],
  ["separador", "Custo eu não estimo aqui\nSua média de alcance é 12.800 contas", "PASSA"],
  ["separador", "O perfil fechou em 3.400 seguidores e o alcance em 45.000 contas.", "PASSA"],
  ["separador", "Suas visualizações fecharam em 12.800 no mês passado.", "PASSA"],
  ["separador", "Fico em dúvida: a conta é de 2015 ou 2016?", "PASSA"],
  ["separador", "A empresa fica em Belo Horizonte e opera desde 2012.", "PASSA"],
  ["separador", "Fecha em 120 dias corridos o ciclo completo.", "PASSA"],
  ["separador", "Fecha em 1.500 disparos de e-mail por mês?", "PASSA"],
  ["separador", "Fica em 200 fotos por ensaio.", "PASSA"],
  ["separador", "Fica em 500 impressões por dia no começo.", "PASSA"],
  // ── AS 27 NOVAS: a fronteira do ano cru 1900–2099, escrita CONTRA o conserto
  //    da quinta passada. É neste bloco que ela achou o vazamento. ────────────
  ["NOVA-ano", "Fica em 1990.", "BARRA"],
  ["NOVA-ano", "Sai por 1950.", "BARRA"],
  ["NOVA-ano", "Consigo 1999 pra você.", "BARRA"],
  ["NOVA-ano", "Fecho em 2000.", "BARRA"],
  ["NOVA-ano", "Fica em 2099.", "BARRA"],
  ["NOVA-ano", "Fica em 1900.", "BARRA"],
  ["NOVA-ano", "Fica em 1899.", "BARRA"],
  ["NOVA-ano", "Fica em 2100.", "BARRA"],
  ["NOVA-ano", "Desde 2015 a gente atende assim, e pra você fica em 1990.", "BARRA"],
  ["NOVA-ano", "Atuamos desde 2012; seu investimento fica em 2050.", "BARRA"],
  ["NOVA-ano", "No mercado desde 2010, consigo fechar em 1950 pra você.", "BARRA"],
  ["NOVA-ano", "A marca é de 2014 e fica em Curitiba.", "PASSA"],
  ["NOVA-ano", "O contrato vale de 2026 a 2027.", "PASSA"],
  ["NOVA-ano", "Nosso portfólio tem trabalhos de 2019 a 2025.", "PASSA"],
  ["NOVA-ano", "Naquele ano, 2017, o perfil ainda fica em outro formato.", "PASSA"],
  ["NOVA-ano", "A conta foi criada em 2021 e o alcance fica em outro patamar.", "PASSA"],
  ["NOVA-formato", "Te mando no dia 05/09/2026 o primeiro lote.", "PASSA"],
  ["NOVA-formato", "O contrato fica assinado em 01/10/2026.", "PASSA"],
  ["NOVA-formato", "Me confirma o CNPJ 12345678000190 para a nota?", "PASSA"],
  ["NOVA-formato", "O telefone fica em 11 98877-4455.", "PASSA"],
  ["NOVA-formato", "Fica em 4.500 impressões e 320 cliques por semana.", "PASSA"],
  ["NOVA-formato", "Sua taxa de salvamentos fecha em 1.900 no mês.", "PASSA"],
  ["NOVA-formato", "Fica em R$ 2018 por mês.", "BARRA"],
  ["NOVA-formato", "Fica em 2018 reais por mês.", "BARRA"],
  ["NOVA-formato", "Desde 2018 o valor fica em R$ 1.200.", "BARRA"],
  ["NOVA-formato", "Fica em 1.990 por mês.", "BARRA"],
  ["NOVA-formato", "Sai por 2.099.", "BARRA"],
];

/**
 * AS FALHAS CONHECIDAS — as que ainda divergem, com o porquê.
 *
 * ⚠️ AS DUAS SÃO FALSO **POSITIVO**: a trava barra uma fala que não tem preço.
 * Nenhuma delas põe número na tela do cliente; as duas custam um turno estranho
 * (o prospect ouve a fala honesta de preço fora de hora). O falso NEGATIVO está
 * em zero e não tem entrada nesta lista — por ordem da casa, ele não pode ter.
 *
 * ⚠️ ESTA LISTA É ASSERÇÃO EXATA, NÃO TOLERÂNCIA. Se aparecer uma divergência
 * nova, o teste fica vermelho. Se alguém consertar uma destas, o teste **também**
 * fica vermelho — e é assim que se descobre que a lista pode encolher, em vez de
 * ela virar um saco onde falha nova entra sem ninguém ver.
 *
 * As duas são a MESMA classe, e ela é anterior a esta frente: **a pista de preço
 * de uma oração alcançando o número da outra**, porque `;`, `:` e a quebra de
 * linha deixaram de separar frases na quarta passada. Consertar isso mexe no
 * separador, e mexer no separador custa falso NEGATIVO (foi por ele que a quarta
 * passada o removeu: "Fica assim: 1.200 por mês." dependia disso). A ordem do
 * turno era explícita — só consertar o falso positivo que não custe falso
 * negativo; na dúvida, deixar e declarar. Ficam declaradas.
 */
const FALSO_POSITIVO_CONHECIDO = [
  // `Investimento` (pista forte) numa oração e o ano na outra, com `\n` no meio,
  // e a frase não tem marca de data nenhuma (`entra no ar em 2026` não é marca):
  // a exceção do ano nem chega a ser avaliada.
  "Investimento: alinho com o time\nA campanha entra no ar em 2026",
  // `fica em` (pista fraca) alcança o `2014` da outra oração, e `é de <ano>` não
  // está na evidência de data — pô-lo lá abriria "sai de 1990 por 1500".
  "A marca é de 2014 e fica em Curitiba.",
];

/** As 9 que ela nomeou na quinta passada — subconjunto das 95, mantidas à vista. */
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
//
// ⚠️ ELE É SUPLEMENTO, E O NÚMERO QUE VALE NÃO É O DELE. Quem escreveu estas
// molduras foi o `pm` — o mesmo que escreveu o conserto. Corpus do autor mede as
// defesas do autor: foi assim que a quarta passada declarou "0 falso positivo em
// 84" e `qualidade` mediu 5 em 50 na mesma régua no dia seguinte. O número que
// se relata é o do corpus DELA (`CORPUS_DE_QUALIDADE`, 95 falas, acima); este
// bloco só garante que a classe inteira roda, não que ela foi bem escolhida.

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

// ─────────────────────────────────────────────────────────────────────────────
// METADE 0 — O CORPUS INTEIRO DE `qualidade`, MEDIDO NOS DOIS LADOS
// ─────────────────────────────────────────────────────────────────────────────
//
// É este o número que vale para relatar. O bloco cartesiano mais abaixo continua
// no arquivo como SUPLEMENTO do `pm` — corpus do autor mede as defesas do autor,
// e é por isso que ele não pode ser o número principal.

describe("🔴 o corpus completo de `qualidade` — 95 falas, as duas contas separadas", () => {
  it("o corpus está inteiro — 95 falas, e não pode encolher", () => {
    expect(CORPUS_DE_QUALIDADE.length).toBe(95);
    // Se um dia sobrar só fala que PASSA, a metade que protege vira decoração.
    const barram = CORPUS_DE_QUALIDADE.filter(([, , e]) => e === "BARRA");
    expect(barram.length).toBeGreaterThanOrEqual(16);
  });

  it("🔴 FALSO NEGATIVO É ZERO — nenhuma cotação atravessa, e não há exceção", () => {
    const vazaram = CORPUS_DE_QUALIDADE.filter(([, f, e]) => e === "BARRA" && !travaDispara(f));
    expect(
      vazaram.map(([, f]) => f),
      `${vazaram.length} cotações atravessaram a trava — preço errado na tela do ` +
        `cliente é o incidente que originou esta frente:\n` +
        vazaram.map(([c, f]) => `  · [${c}] ${JSON.stringify(f)}`).join("\n"),
    ).toEqual([]);
  });

  it("o falso positivo é EXATAMENTE o conhecido — nem mais, nem em silêncio", () => {
    const barradas = CORPUS_DE_QUALIDADE.filter(([, f, e]) => e === "PASSA" && travaDispara(f));
    expect(
      barradas.map(([, f]) => f),
      `o conjunto de falso positivo mudou. Se ENCOLHEU, atualize ` +
        `FALSO_POSITIVO_CONHECIDO e comemore; se CRESCEU, é regressão.`,
    ).toEqual(FALSO_POSITIVO_CONHECIDO);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O VAZAMENTO DA SEXTA PASSADA — nomeado, porque foi a regressão do conserto
// ─────────────────────────────────────────────────────────────────────────────
//
// `qualidade` rodou o corpus contra `08c09a8` e achou o falso negativo que o
// conserto da QUINTA passada introduziu. As três falas abaixo são o caso e os
// dois vizinhos que só acertavam por acidente:
//
//   PASSA ← VAZA | "Desde 2015 a gente atende assim, e pra você fica em 1990."
//   PASSA ← VAZA | "Consigo 1999 pra você."
//   BARRA        | "Atuamos desde 2012; seu investimento fica em 2050."
//
// A terceira só barrava porque `investimento` é pista FORTE e a pista forte
// desarmava a exceção do ano **pela frase inteira**. Tirada a palavra forte —
// que é o que qualquer SDR faz ao escrever "pra você fica em" —, vazava.
// Conserto por POSIÇÃO: ver o bloco 1c de `leitor-de-valor.ts`.

describe("🔴 marca de ano na frase NÃO desarma número em posição de cotação", () => {
  it.each([
    "Desde 2015 a gente atende assim, e pra você fica em 1990.",
    "Consigo 1999 pra você.",
    "Atuamos desde 2012; seu investimento fica em 2050.",
    "No mercado desde 2010, consigo fechar em 1950 pra você.",
    // A pista forte SAIU do desempate do ano — o vizinho que acertava por
    // acidente tem de continuar certo pelo motivo estrutural, sem ela.
    "Atuamos desde 2012 e pra você fica em 2050.",
    "Estamos no mercado desde 2010 e sai por 1990.",
    "Fundada em 2011, a agência deixa em 1980 pra você.",
    "A conta existe desde 2016 e eu faço por 2040.",
  ])("o preço em posição de cotação continua barrado: %s", (fala) => {
    expect(travaDispara(fala), "o vazamento de `08c09a8` voltou").toBe(true);
  });

  it("e a simetria: o ano em posição de DATA continua passando", () => {
    // A mesma frase, com o número na outra posição. Se as duas barrassem, o
    // conserto seria `() => true` com nome de estrutura.
    expect(travaDispara("Desde 2015 a gente atende assim, e pra você fica em Curitiba.")).toBe(false);
    expect(travaDispara("Atuamos desde 2012; quem passa valor é a equipe.")).toBe(false);
    expect(travaDispara("Naquele ano, 2017, o perfil ainda fica em outro formato.")).toBe(false);
  });
});

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
