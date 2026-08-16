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
 * As pistas de que a frase está falando de DINHEIRO.
 *
 * Lista deliberadamente curta e concreta: cada entrada é uma forma de dizer
 * preço que já apareceu numa fala desta casa. "por mês" NÃO está aqui — sozinho
 * ele acompanha posts, stories e reels muito mais vezes do que acompanha preço.
 */
const PISTA_DE_PRECO =
  /r\$|reais|pre[çc]o|custa|custo|quanto\s+fica|fica\s+(?:em|por)|sai\s+(?:por|a)|fecha\s+(?:em|por)|valor(?:es)?\b|invest\w*|or[çc]amento|mensalidade|mensa(?:l|is)\b|cobr\w*|pag(?:o|a|ar|am|ando)\b|desconto|verba|gast\w*|a partir de|por apenas|de entrada/i;

/**
 * As unidades que transformam um número em QUANTIDADE, não em dinheiro.
 *
 * Conferida contra o vocabulário real da conversa do SDR. Se a palavra logo
 * depois do número está aqui, o número não é preço — nem numa frase que fala de
 * orçamento ("com esse investimento dá para 300 posts por ano").
 */
const UNIDADE_DEPOIS =
  /^\s*(?:%|posts?|postagens?|stories|storys?|reels?|pe[çc]as?|artes?|v[íi]deos?|criativos?|carross[ée]is?|carrossel|dias?|semanas?|m[êe]s(?:es)?|anos?|horas?|minutos?|rodadas?|seguidores?|clientes?|pessoas?|contas?|canais?|redes?|campanhas?|an[úu]ncios?|leads?|telas?|vezes)\b/i;

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

/** As frases da fala, para o teste da pista rodar por FRASE e não pelo texto
 *  inteiro. Sem isso, uma pista no primeiro parágrafo transformaria todo número
 *  do terceiro em dinheiro. */
function frases(texto: string): string[] {
  // ⚠️ O `(?!\d)` NÃO É DETALHE: sem ele, "R$ 1.000" vira duas frases ("R$ 1." e
  // "000"), o valor é lido como **1** e o portão passa a autorizar mil reais
  // achando que leu um. Foi exatamente o que aconteceu na primeira versão deste
  // arquivo, e o teste `os valores são lidos em pt-BR` pegou.
  return texto.split(/(?<=[.!?;:\n])(?!\d)/);
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
    for (const m of frase.matchAll(QUALQUER_NUMERO)) {
      const inicio = m.index;
      const fim = inicio + m[0].length;
      // Não relê o que a passada explícita já contou (o número dentro de "R$ 1.200").
      if (jaLidos.some(([a, b]) => inicio >= a && fim <= b)) continue;
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
  if (valoresMonetarios(texto).length > 0) return true;
  return nomesDePlanoForaDoCatalogo(texto).length > 0;
}
