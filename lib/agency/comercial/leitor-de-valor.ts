// O LEITOR ÚNICO DE DINHEIRO E DE NOME DE PLANO NUMA FALA.
//
// ── A reprovação que produziu este arquivo (16/08/2026, `qualidade`) ─────────
//
// Havia DOIS leitores de valor nesta casa, e os dois enxergavam a mesma coisa:
// `R$ <número>` e `<número> reais`. Medido pela auditora, com a trava ligada:
//
//   falaSegura("Posso ajustar para o Plano Starter, que fica em 1.200 por mês.")
//     → { substituida: false }   ← passa INTACTA para a tela do prospect
//
//   "Fica em 1.200 por mês."       → a trava do servidor NÃO dispara
//   "Fica em torno de 1.850 mensais." → a trava do servidor NÃO dispara
//
// Preço fora do catálogo chegando ao prospect **sem portão nenhum no meio**, só
// porque quem escreveu a frase omitiu o cifrão. E o segundo furo é pior, porque
// não é de grafia: `falaSegura("Plano Starter: R$ 790/mês.")` passava — 790 é do
// catálogo, e **o NOME do plano ninguém olhava**.
//
// ── AS DUAS PERGUNTAS QUE ESTE ARQUIVO RESPONDE ─────────────────────────────
//
//   1. Que VALORES em dinheiro esta fala cita? (`valoresMonetarios`)
//   2. Que NOMES DE PLANO esta fala cita? (`nomesDePlanoCitados`)
//
// Elas moram juntas e são usadas por TODOS os portões (o de runtime do front, a
// trava do servidor, a exceção da pergunta de faixa). Dois leitores divergem no
// dia em que alguém conserta um: foi exatamente esse o defeito.
//
// ── POR QUE NÃO BASTA "TODO NÚMERO É DINHEIRO" ──────────────────────────────
//
// A conversa do SDR é cheia de número que não é preço: "20 posts/mês",
// "5 stories por semana", "2 reels". Tratar todos como dinheiro derrubaria a
// conversa inteira — e portão que dispara onde não há risco é portão que alguém
// desliga. A regra é: **dinheiro explícito sempre; número solto só com pista de
// preço na mesma frase, e nunca quando o que vem depois dele é uma unidade.**

import { PLANOS } from "../planos";

// ─────────────────────────────────────────────────────────────────────────────
// 1. O VALOR
// ─────────────────────────────────────────────────────────────────────────────

/** Como o valor foi escrito. `implicito` = sem cifrão e sem "reais". */
export type GrafiaDoValor = "explicito" | "implicito" | "ilegivel";

export interface ValorNaFala {
  /** `NaN` quando a grafia é `ilegivel` — fail-closed, ver abaixo. */
  valor: number;
  grafia: GrafiaDoValor;
}

/** "R$ 1.200" · "1.200,00" · "1200 reais" → 1200. Em pt-BR o ponto é separador
 *  de milhar, e centavos não mudam a identidade de um preço. */
export function aNumero(bruto: string): number | null {
  const limpo = bruto.replace(/,\d{1,2}$/, "").replace(/[.,\s]/g, "");
  if (!/^\d+$/.test(limpo)) return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/** Dinheiro escrito com todas as letras. Nunca precisa de contexto. */
const EXPLICITO = /r\$\s*([\d.,]+)|(\d[\d.,]*)\s*reais\b/gi;

/** Qualquer número, para a passada do implícito. */
const QUALQUER_NUMERO = /\d[\d.,]*/g;

/**
 * `<número>/mês` COLADO — dinheiro por construção, sem precisar de pista.
 *
 * ── A REGRESSÃO QUE ESTE REGEX REPÕE (16/08/2026, quarta passada) ────────────
 *
 * A trava antiga tinha `\d+\s*\/m[êe]s\b` como **gatilho próprio**. Ao trocá-la
 * pelo leitor, `/mês` não foi reposto em lugar nenhum: ele não é pista de preço
 * (`PISTA_DE_PRECO` não o tem) e a passada implícita só lê número solto quando
 * há pista na mesma frase. Resultado medido, com o commit `977f276`:
 *
 *   "1.200/mês fecha pra você?"      → a trava antiga BARRAVA · a nova PASSAVA
 *   "Ficaria em 890/mês."            → a trava antiga BARRAVA · a nova PASSAVA
 *   "Ficamos com 1.500/mês?"         → a trava antiga BARRAVA · a nova PASSAVA
 *   "Consigo 1.200/mês pra você."    → a trava antiga BARRAVA · a nova PASSAVA
 *
 * `<número>/mês` é **a forma canônica de cotar preço mensal em português**, e a
 * fala do modelo não passa por `falaSegura` (exceção declarada em
 * `PublicBriefingRoom.tsx`): a trava da rota era o único portão ali.
 *
 * Por que ele NÃO confunde quantidade: exige o `/` colado no número, com no
 * máximo espaço no meio. "20 posts/mês", "8 stories/mês" e "2 reels/mês" têm o
 * substantivo entre o número e a barra — nenhum deles casa aqui.
 *
 * Por que ele NÃO respeita `PISO_DO_IMPLICITO`: a trava antiga também não
 * respeitava. Repor com piso deixaria "40/mês" passando onde antes barrava, e
 * "não afrouxei" voltaria a ser meia verdade.
 *
 * ⚠️ POR QUE ELE VIVE EM `falaEmDinheiro` E **NÃO** EM `valoresMonetarios`.
 * Medido ao repô-lo no leitor compartilhado: o motor de regras escreve
 * "Feito! Ajustei para 2 posts por semana (8/mês)." e `resumoDoCorte` escreve
 * "posts de 20 para 8/mês" — as duas passariam a ser lidas como o preço de
 * R$ 8, e `falaSegura` **substituiria a fala legítima** pela fala honesta de
 * preço. O regex antigo nunca esteve ali: ele era a trava da ROTA, sobre a fala
 * do MODELO, e é aí que ele volta. O leitor de valor — que alimenta o portão do
 * catálogo e a exceção da pergunta de faixa — continua exigindo pista.
 */
const NUMERO_POR_MES = /\d[\d.,]*\s*\/\s*m[êe]s\b/i;

/**
 * As pistas de que a frase está falando de DINHEIRO.
 *
 * Lista deliberadamente curta e concreta: cada entrada é uma forma de dizer
 * preço que já apareceu numa fala desta casa. "por mês" sozinho NÃO está aqui —
 * ele acompanha posts, stories e reels muito mais vezes do que acompanha preço.
 * O que entrou é `<número> por mês` **colado** (ver `NUMERO_POR_MES_POR_EXTENSO`).
 *
 * ⚠️ AS CONJUGAÇÕES SÃO ABERTAS DE PROPÓSITO (16/08/2026, quarta passada).
 * A lista trazia `fica\s+(?:em|por)` e `fecha\s+(?:em|por)` — só a 3ª pessoa do
 * presente. Medido: "Fecho em 1.200." e "Fica assim: 1.200 por mês." passavam.
 * `fic\w*` / `fech\w*` cobrem a classe inteira (fico, ficaria, ficamos, fechei,
 * fecharia).
 *
 * ⚠️ E O CUSTO DELAS NÃO É O QUE ESTE COMENTÁRIO DIZIA (16/08/2026, 5ª passada).
 * Ele afirmava que o falso positivo aqui "troca uma fala nossa por outra fala
 * nossa". **É falso**, e `qualidade` traçou o caminho: `ecoDoCliente` compara
 * NÚMEROS, então numa fala como "Nosso estúdio fica em Fortaleza desde 2018."
 * o eco dá `false`, o corte dá `null` e o prospect ouve **"sobre valor: quem
 * fecha número aqui é a nossa equipe, não eu"** — um não-sequitur na primeira
 * impressão comercial, não uma troca equivalente. As conjugações continuam
 * abertas; o que mudou é que os FORMATOS que não são dinheiro (ano, CNPJ, CPF,
 * CEP, telefone, métrica de rede social) passaram a ser reconhecidos pela
 * ESTRUTURA — ver `FORMATOS_NAO_MONETARIOS` logo abaixo.
 */
const PISTA_DE_PRECO =
  /r\$|reais|pre[çc]o|custa|custo|quanto\s+fica|fic\w*\s+(?:em|por|assim)|sa(?:i|ir)\w*\s+(?:por|a)\b|fech\w*\s+(?:em|por)|valor(?:es)?\b|invest\w*|or[çc]amento|mensalidade|mensa(?:l|is)\b|cobr\w*|pag(?:o|a|ar|am|ando)\b|desconto|verba|gast\w*|a partir de|por apenas|de entrada|\d[\d.,]*\s*(?:por|ao)\s+m[êe]s\b/i;

/**
 * As pistas FORTES — as que nomeiam dinheiro, não apenas posicionam um valor.
 *
 * A distinção existe porque `fic\w*\s+em` e `fech\w*\s+em` são **posicionais**:
 * "fica em Fortaleza", "fica em 2018", "fecham em 1.100 views" usam a mesma
 * moldura de "fica em R$ 1.200". Quando a única pista da frase é posicional, o
 * reconhecimento de formato abaixo pode desempatar; quando a frase diz "preço",
 * "valor" ou "investimento" com todas as letras, **o dinheiro ganha o desempate**
 * — a trava é o que impede a agência de prometer preço errado, e na dúvida ela
 * fecha.
 */
const PISTA_FORTE_DE_PRECO =
  /r\$|reais|pre[çc]o|custa|custo|quanto\s+fica|valor(?:es)?\b|invest\w*|or[çc]amento|mensalidade|mensa(?:l|is)\b|cobr\w*|desconto|verba|por apenas|de entrada|\d[\d.,]*\s*(?:por|ao)\s+m[êe]s\b/i;

/**
 * As unidades que transformam um número em QUANTIDADE, não em dinheiro.
 *
 * Conferida contra o vocabulário real da conversa do SDR. Se a palavra logo
 * depois do número está aqui, o número não é preço — nem numa frase que fala de
 * orçamento ("com esse investimento dá para 300 posts por ano").
 */
const UNIDADE_DEPOIS =
  /^\s*(?:%|posts?|postagens?|stories|storys?|reels?|pe[çc]as?|artes?|v[íi]deos?|criativos?|carross[ée]is?|carrossel|dias?|semanas?|m[êe]s(?:es)?|anos?|horas?|minutos?|rodadas?|seguidores?|clientes?|pessoas?|contas?|canais?|redes?|campanhas?|an[úu]ncios?|leads?|telas?|vezes|views?|visualiza[çc][õo]es|curtidas?|likes?|coment[áa]rios?|compartilhamentos?|salvamentos?|impress[õo]es|cliques?|inscritos?|assinantes?|acessos?|visitas?|intera[çc][õo]es)\b/i;

/**
 * Piso do valor implícito. Abaixo disto um número solto quase nunca é preço
 * ("2 reels", "3 posts", "1 rodada") e o custo do falso positivo é alto.
 *
 * O menor preço do catálogo é R$ 49 — ele nunca precisa da passada implícita,
 * porque preço de catálogo é AUTORIZADO de qualquer forma. Quem este piso pode
 * deixar passar é um preço INVENTADO abaixo de 50, e não existe produto nesta
 * casa nessa faixa: o dano de perder esse caso é menor que o de acusar "20
 * posts" de ser dinheiro.
 */
const PISO_DO_IMPLICITO = 50;

// ─────────────────────────────────────────────────────────────────────────────
// 1b. OS FORMATOS QUE CARREGAM NÚMERO E **NÃO SÃO DINHEIRO**
// ─────────────────────────────────────────────────────────────────────────────
//
// ── A REPROVAÇÃO QUE PRODUZIU ESTE BLOCO (16/08/2026, quinta passada) ─────────
//
// `qualidade` escreveu o corpus de fala comercial REAL que faltava e mediu
// **5 em 50** falsos positivos na régua da quarta passada. A medição anterior —
// "0 em 84" — não os viu porque o corpus dela **não tinha** ano, CNPJ, CEP,
// telefone nem métrica de rede social: eram exatamente as classes onde a régua
// erra. Falas medidas, todas plausíveis na boca do SDR:
//
//   "Nosso estúdio fica em Fortaleza desde 2018."                    → BARRAVA
//   "O escritório fica em Rua das Palmeiras, 1200 — CEP 04567-000."  → BARRAVA
//   "A média de curtidas fica em 320 por post."                      → BARRAVA
//   "Suas visualizações fecharam em 12.800 no mês passado."          → BARRAVA
//   "Fico em dúvida: a conta é de 2015 ou 2016?"                     → BARRAVA
//   "…me confirma o CNPJ 12.345.678/0001-90?"                        → BARRAVA
//   "…o WhatsApp que anotei foi 11988776655."                        → BARRAVA
//
// ⚠️ A MITIGAÇÃO ESCRITA NO ARQUIVO ERA FALSA POR CONSTRUÇÃO. O comentário de
// `frases()` justificava a saída do separador dizendo que "quantidade continua
// barrada pelo `UNIDADE_DEPOIS` e pelo `PISO_DO_IMPLICITO`". **Ano, CNPJ, CEP e
// telefone não são quantidade e não estão abaixo de 50** — nenhuma das duas
// defesas os alcança. Este bloco é a defesa que faltava.
//
// ── A RÉGUA: FORMATO TEM ESTRUTURA — USA-SE A ESTRUTURA ──────────────────────
//
// Não há lista de números proibidos aqui, e não pode haver: lista de número é a
// atenção de alguém com nome de mecanismo. O que se reconhece é a FORMA —
// quantos dígitos, com que pontuação, em que posição. Um preço em pt-BR nunca
// tem 10 dígitos corridos, nunca tem `/0001-90` no fim e nunca é `04567-000`.
//
// ⚠️ E O ESCOPO É ESTREITO DE PROPÓSITO: isto só desliga a **passada implícita**.
// `R$ 2018` e `2018 reais` continuam sendo dinheiro pela passada explícita, que
// este bloco não toca. Ninguém escreve o CNPJ com cifrão na frente.

/** O que, colado ANTES do número, prova que ele é dinheiro apesar da forma. */
const PREFIXO_MONETARIO = /(?:r\$|por\s+apenas|a\s+partir\s+de|de\s+entrada)\s*$/i;

/** O que, colado DEPOIS do número, prova o mesmo. */
const SUFIXO_MONETARIO =
  /^\s*(?:reais?\b|\/\s*m[êe]s\b|por\s+m[êe]s\b|ao\s+m[êe]s\b|mensa(?:l|is)\b|,\d{2}\b)/i;

/**
 * Formatos cuja PONTUAÇÃO já os separa de dinheiro. Reconhecidos sem contexto:
 * não existe preço com esta forma, em nenhuma frase.
 *
 * `\d{10,}` cobre a corrida crua — telefone sem máscara (11 dígitos), CPF (11) e
 * CNPJ (14). O maior preço plausível desta casa tem 5 dígitos; 10 dígitos
 * corridos sem separador não é um número que alguém cota.
 */
const FORMATOS_NAO_MONETARIOS: RegExp[] = [
  /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, // CNPJ com máscara
  /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, // CPF com máscara
  /\b\d{5}-\d{3}\b/g, // CEP
  /\(\d{2}\)\s*9?\d{4}[-.\s]?\d{4}\b/g, // telefone com DDD entre parênteses
  /\b\d{2}[-.\s]9?\d{4}[-.\s]\d{4}\b/g, // telefone com DDD solto
  /\b\d{10,}\b/g, // corrida crua: telefone, CPF, CNPJ sem máscara
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, // data
];

/**
 * O NÚMERO DE ENDEREÇO — o que vem depois do logradouro.
 *
 * "Rua das Palmeiras, 1200" é a forma; o grupo 1 é o que se protege. A parte do
 * meio não pode atravessar `,` `;` `.` `!` `?`, então a pista não vaza de um
 * logradouro no começo da frase para um preço no fim dela.
 */
const NUMERO_DE_ENDERECO =
  /\b(?:rua|avenida|av\.?|alameda|al\.?|travessa|pra[çc]a|rodovia|estrada|largo|quadra|lote|bloco|apto\.?|apartamento|sala|andar|n[º°]|n\.[º°]?)\b[^,;.!?]*?,?\s*(\d[\d.]*)/gi;

/**
 * ANO — e as QUATRO condições são todas necessárias, porque um ano e um preço de
 * quatro dígitos são o mesmo símbolo.
 *
 * Um número só deixa de ser dinheiro por ser ano quando:
 *   1. tem **exatamente 4 dígitos crus** (sem `.` e sem `,`) entre 1900 e 2099 —
 *      preço de quatro dígitos em pt-BR se escreve "1.200", com separador;
 *   2. não tem prefixo nem sufixo monetário colado;
 *   3. a frase carrega **evidência de data** (`desde`, `fundada`, `no mercado`,
 *      ou dois anos ligados por "ou"/"a"/"até"/"e");
 *   4. a frase **não** tem pista FORTE de preço.
 *
 * ⚠️ POR QUE A CONDIÇÃO 3 NÃO PODE SER `em <ano>` NEM `de <ano>`: "Fica em 2000."
 * e "Sai por 2000." são cotações, e as duas casariam. Medido ao escrever a
 * regra — foi por isso que a evidência de data ficou nas palavras que só um
 * calendário usa. Com as quatro condições, as duas continuam BARRADAS.
 */
// ⚠️ O `(?!\.\d)` NO LUGAR DE `(?![\d.,])` NÃO É DETALHE: o ponto final da frase
// é um `.`, e a versão ingênua fazia `"…desde 2018."` deixar de casar — o ano
// mais óbvio do corpus escapava da regra escrita para ele. O que precisa ser
// barrado é o ponto de MILHAR (`2.018`), que é `\.` seguido de dígito.
const ANO_CRU = /(?<![\d.,])(?:19|20)\d{2}(?![\d,])(?!\.\d)/g;
const EVIDENCIA_DE_DATA =
  /\b(?:desde|fundad\w*|criad\w*|nascid\w*|inaugurad\w*|abrimos|abriu|abriram|atuamos|atuando|operamos|no\s+mercado|ano\s+de|na\s+[ée]poca|naquele\s+ano)\b|\b(?:19|20)\d{2}\s*(?:ou|a|at[ée]|e)\s*(?:19|20)\d{2}\b/i;

/**
 * MÉTRICA DE REDE SOCIAL. Número de desempenho não é preço — e a lista tem só
 * palavras de DESEMPENHO.
 *
 * ⚠️ `posts`, `stories` e `reels` ficaram DE FORA de propósito: são o vocabulário
 * de escopo desta casa, e "Para 20 stories, fica em 1.200 por mês." é cotação.
 * Pôr entregável nesta lista trocaria um falso positivo por um falso negativo —
 * e o falso negativo põe preço errado na tela do cliente.
 */
const PISTA_DE_METRICA =
  /\b(?:views?|visualiza[çc][õo]es|curtidas?|likes?|coment[áa]rios?|compartilhamentos?|salvamentos?|impress[õo]es|alcance|cliques?|inscritos?|assinantes?|acessos?|engajamento|intera[çc][õo]es)\b/i;

/** Os trechos de uma frase que a passada implícita não pode ler como dinheiro. */
function trechosQueNaoSaoDinheiro(frase: string): [number, number][] {
  const faixas: [number, number][] = [];

  for (const re of FORMATOS_NAO_MONETARIOS)
    for (const m of frase.matchAll(re)) faixas.push([m.index, m.index + m[0].length]);

  for (const m of frase.matchAll(NUMERO_DE_ENDERECO)) {
    const numero = m[1]!;
    const inicio = m.index + m[0].length - numero.length;
    faixas.push([inicio, inicio + numero.length]);
  }

  const temPistaForte = PISTA_FORTE_DE_PRECO.test(frase);

  if (!temPistaForte && EVIDENCIA_DE_DATA.test(frase))
    for (const m of frase.matchAll(ANO_CRU)) {
      const inicio = m.index;
      const fim = inicio + m[0].length;
      if (PREFIXO_MONETARIO.test(frase.slice(0, inicio))) continue;
      if (SUFIXO_MONETARIO.test(frase.slice(fim))) continue;
      faixas.push([inicio, fim]);
    }

  // A frase inteira é leitura de métrica: nenhum número dela é preço.
  if (!temPistaForte && PISTA_DE_METRICA.test(frase)) faixas.push([0, frase.length]);

  return faixas;
}

/**
 * As frases da fala, para o teste da pista rodar por FRASE e não pelo texto
 * inteiro. Sem isso, uma pista no primeiro parágrafo transformaria todo número
 * do terceiro em dinheiro.
 *
 * ⚠️ O `(?!\d)` NÃO É DETALHE: sem ele, "R$ 1.000" vira duas frases ("R$ 1." e
 * "000"), o valor é lido como **1** e o portão passa a autorizar mil reais
 * achando que leu um. Foi exatamente o que aconteceu na primeira versão deste
 * arquivo, e o teste `os valores são lidos em pt-BR` pegou.
 *
 * ⚠️ `:` `;` e a QUEBRA DE LINHA SAÍRAM DA LISTA (16/08/2026, quarta passada).
 * Eles cortavam a pista do número que ela anunciava — que é justamente o que
 * dois-pontos faz em português: ele APRESENTA o valor. Medido:
 *
 *   "Fica assim: 1.200 por mês."            → pista em "Fica assim", número na
 *   "Investimento estimado:\n1.200 a 1.800"   frase seguinte → passava
 *
 * Só ponto final, exclamação e interrogação separam frases aqui.
 *
 * ⚠️ A MITIGAÇÃO QUE ESTAVA ESCRITA AQUI ERA FALSA (16/08/2026, 5ª passada).
 * Este comentário dizia que o risco de a pista vazar por cima de um `;` era
 * aceitável porque "quantidade continua barrada pelo `UNIDADE_DEPOIS` e pelo
 * `PISO_DO_IMPLICITO`". **Ano, CNPJ, CEP e telefone não são quantidade e não
 * estão abaixo de 50** — as duas defesas citadas não os alcançam, e `qualidade`
 * mediu o resultado: `"…; me confirma o CNPJ 12.345.678/0001-90?"` era barrado.
 * Comentário que descreve uma proteção que o código não tem foi o defeito de
 * três rodadas seguidas desta frente.
 *
 * O risco continua existindo e continua aceito — mas agora quem o cobre está
 * escrito e roda: `trechosQueNaoSaoDinheiro()`, reconhecimento por FORMATO.
 */
function frases(texto: string): string[] {
  return texto.split(/(?<=[.!?])(?!\d)/);
}

/**
 * Todo valor em dinheiro citado num texto.
 *
 * FAIL-CLOSED de propósito em dois pontos:
 *   • `R$` seguido de algo que não é número legível ("R$ ..,..") entra como
 *     `ilegivel` com valor `NaN` — número ilegível numa fala comercial é
 *     exatamente o caso que ninguém quer deixar passar por omissão do parser;
 *   • na dúvida entre quantidade e preço, a pista de preço decide — e a pista é
 *     por frase, não por texto.
 */
export function valoresMonetarios(texto: string): ValorNaFala[] {
  if (typeof texto !== "string" || !texto) return [];
  const achados: ValorNaFala[] = [];

  for (const frase of frases(texto)) {
    const jaLidos: [number, number][] = [];

    // ── Passada 1: dinheiro explícito ────────────────────────────────────────
    for (const m of frase.matchAll(EXPLICITO)) {
      jaLidos.push([m.index, m.index + m[0].length]);
      const n = aNumero(m[1] ?? m[2] ?? "");
      if (n === null) achados.push({ valor: Number.NaN, grafia: "ilegivel" });
      else achados.push({ valor: n, grafia: "explicito" });
    }

    // ── Passada 2: número solto, só com pista de preço na MESMA frase ────────
    if (!PISTA_DE_PRECO.test(frase)) continue;
    // O que tem FORMA de ano, CNPJ, CPF, CEP, telefone, endereço ou métrica de
    // rede social não é dinheiro, por mais pista de preço que a frase tenha.
    const naoEhDinheiro = trechosQueNaoSaoDinheiro(frase);
    for (const m of frase.matchAll(QUALQUER_NUMERO)) {
      const inicio = m.index;
      const fim = inicio + m[0].length;
      // Não relê o que a passada explícita já contou (o número dentro de "R$ 1.200").
      if (jaLidos.some(([a, b]) => inicio >= a && fim <= b)) continue;
      if (naoEhDinheiro.some(([a, b]) => inicio < b && fim > a)) continue;
      // O que vem DEPOIS decide: unidade = quantidade, não preço.
      if (UNIDADE_DEPOIS.test(frase.slice(fim))) continue;
      const n = aNumero(m[0]);
      if (n === null || n < PISO_DO_IMPLICITO) continue;
      achados.push({ valor: n, grafia: "implicito" });
    }
  }

  return achados;
}

/** Só os números, na ordem em que aparecem. Ilegível vira `NaN`. */
export function valoresCitados(texto: string): number[] {
  return valoresMonetarios(texto).map((v) => v.valor);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. O NOME DO PLANO
// ─────────────────────────────────────────────────────────────────────────────
//
// `falaSegura("Plano Starter: R$ 790/mês.")` passava: 790 é do catálogo e o nome
// ninguém olhava. Um portão de preço que não olha nome deixa o incidente
// original — o PLANO FANTASMA — entrar de novo, agora com um número legítimo
// colado nele, que é a forma mais convincente possível de mentir.

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Os nomes que a casa PODE dizer. Sai de `PLANOS` — fonte única. */
export function nomesDePlanoAutorizados(): Set<string> {
  return new Set(PLANOS.map((p) => semAcento(p.nome)));
}

/**
 * Os nomes de plano já usados por esta casa e que **não existem no catálogo**.
 *
 * Lista fechada e curta: são os cinco rótulos da tabela do `live-calculator`,
 * que por anos se apresentaram como "plano" na tela do prospect. Ela existe para
 * pegar a citação SEM a palavra "plano" na frente ("volto para o Starter") — que
 * a varredura genérica abaixo não alcança.
 *
 * `Pro` ficou de fora de propósito: é palavra curta demais e aparece dentro de
 * "produção", "produto", "proposta". Régua que dispara onde não há risco é régua
 * que alguém desliga.
 */
const FANTASMAS_CONHECIDOS = ["starter", "essencial", "growth", "premium"];

/**
 * Os nomes de plano citados num texto que a casa NÃO tem.
 *
 * Duas passadas:
 *   1. `plano <Palavra Capitalizada>` — pega qualquer invenção nova, inclusive a
 *      que ninguém previu. Exige capital para não acusar "plano mais simples",
 *      "plano de medição" nem "plano de investimento".
 *   2. os fantasmas conhecidos, capitalizados, mesmo sem a palavra "plano".
 */
export function nomesDePlanoForaDoCatalogo(texto: string): string[] {
  if (typeof texto !== "string" || !texto) return [];
  const autorizados = nomesDePlanoAutorizados();
  const fora = new Set<string>();

  // ⚠️ Sem a flag `i` DE PROPÓSITO, e a palavra "plano" aceita as duas caixas à
  // mão: ligar `i` tornaria o `[A-Z…]` do nome insensível também, e aí
  // "plano mais simples" acusaria "mais" como nome de plano. A exigência de
  // MAIÚSCULA no nome é o que separa produto ("Plano Turbo") de frase comum
  // ("plano de medição", "plano mais barato").
  for (const m of texto.matchAll(/\b[Pp]lanos?\s+([A-ZÁÂÃÀÉÊÍÓÔÕÚÇ][\wÁÂÃÀÉÊÍÓÔÕÚÇáâãàéêíóôõúç]*)/g)) {
    const nome = m[1]!;
    if (!autorizados.has(semAcento(nome))) fora.add(nome);
  }

  for (const nome of FANTASMAS_CONHECIDOS) {
    const re = new RegExp(`\\b${nome[0]!.toUpperCase()}${nome.slice(1)}\\b`);
    const achado = texto.match(re);
    if (achado && !autorizados.has(semAcento(achado[0]))) fora.add(achado[0]);
  }

  return [...fora];
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. A PERGUNTA QUE A TRAVA DO SERVIDOR FAZ
// ─────────────────────────────────────────────────────────────────────────────
//
// A trava da rota era um regex escrito à mão que só via `R$`, `reais`, `/mês` e
// `desconto`. Ela passa a fazer a pergunta pelo LEITOR — assim "1.200 por mês"
// e "1.850 mensais", que atravessavam o servidor inteiro, param aqui.

/** A fala cita dinheiro, nome de plano fora do catálogo, ou fala de desconto? */
export function falaEmDinheiro(texto: string): boolean {
  if (typeof texto !== "string" || !texto) return false;
  if (/desconto/i.test(texto)) return true;
  // ⚠️ `<número>/mês` COLADO é gatilho próprio — repõe o `\d+\s*\/m[êe]s\b` que a
  // trava antiga tinha e que a troca pelo leitor não repôs. Ver `NUMERO_POR_MES`.
  // O teste de não-regressão que prova isto é
  // `__tests__/comercial/a-trava-nova-barra-tudo-que-a-antiga-barrava.test.ts`.
  if (NUMERO_POR_MES.test(texto)) return true;
  if (valoresMonetarios(texto).length > 0) return true;
  return nomesDePlanoForaDoCatalogo(texto).length > 0;
}
