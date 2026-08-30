// ─── FICHA D — OBJEÇÕES: classificar, responder, e NUNCA ceder sozinha ──────
//
// Ordem literal do CEO (docs/celula-prospeccao/despachos/D-objecoes.md):
// "A IA não concede desconto, não amplia escopo, não altera prazo, não
// oferece garantia e não aceita condição comercial sem autorização
// registrada." Isto é mecanismo com teste de mutação, não frase no prompt.
//
// ── AS DUAS METADES DESTE ARQUIVO ────────────────────────────────────────────
// 1. CLASSIFICAR (`classificarObjecao`, `classificarSilencio`): determinística,
//    por sinais lidos de `docs/plataformas/99freelas/objecoes.json` — SEM IA.
//    É trava de dinheiro, e trava que depende do modelo acertar não é trava.
//    Não reconheceu ⇒ `null`, e `null` significa ESCALAR, nunca improvisar.
// 2. CONCEDER (`podeConceder`): o portão. Autorização vazia é o caminho
//    normal e é o padrão — fail closed. Autorização de outra concessão não
//    vale. Autorização que a máquina dá a si mesma não é autorização.
//    Desconto, mesmo autorizado, ainda precisa passar pelo piso do MOTOR
//    (`podeFechar` de lib/agency/comercial/negociacao.ts) — o piso é da casa,
//    nunca desta ficha e nunca de constante nova.
//
// ── NENHUM NÚMERO DE PREÇO MORA AQUI ─────────────────────────────────────────
// Nem neste arquivo, nem no JSON. Se o motor não souber responder (item fora
// da tabela), o caminho é EXCEÇÃO com motivo — nunca um número improvisado.

import objecoesData from "@/docs/plataformas/99freelas/objecoes.json";
import { podeFechar, TABELA_DE_PISO, type LinhaDaTabela } from "@/lib/agency/comercial/negociacao";

// ─────────────────────────────────────────────────────────────────────────────
// 1. A DEFINIÇÃO DE CADA OBJEÇÃO — lida do JSON, nunca digitada aqui
// ─────────────────────────────────────────────────────────────────────────────

/** As 11 objeções, exatamente como a casa as nomeia. A lista é do CEO e é o
 *  MÍNIMO — não se remove nenhuma. */
export type ObjecaoId =
  | "preco"
  | "prazo"
  | "confianca"
  | "portfolio"
  | "escopo"
  | "forma_de_pagamento"
  | "pedido_de_contato_externo"
  | "pedido_de_teste"
  | "comparacao_com_concorrente"
  | "silencio"
  | "indecisao";

export interface ObjecaoDefinida {
  id: string;
  /** Os sinais de texto que identificam a objeção. Vazio para `silencio`:
   *  ela não vem de texto, vem de tempo sem resposta. */
  comoOClienteFala: string[];
  /** A resposta APROVADA — a única que sai para o cliente para esta objeção. */
  respostaAprovada: string;
  /** O que falta saber antes de agir sobre esta objeção. */
  dadosNecessarios: string[];
  limiteDeNegociacao: string;
  quandoEscalarAoGerente: string;
  fonte?: string;
}

/**
 * O JSON é DADO EXTERNO — lido com o mesmo cuidado de qualquer entrada não
 * confiável, nunca com um `as` direto para a interface final.
 *
 * ⚠️ Não é só estilo: o campo `comoOClienteFala` da objeção `silencio` é `[]`
 * no JSON (ela não tem sinal de texto, de propósito). Um array vazio dentro
 * de um módulo JSON infere `never[]` — o mesmo defeito de mock sem assinatura
 * já registrado nesta casa. Ler campo a campo, validando o tipo em tempo de
 * execução, evita depender dessa inferência para compilar OU para rodar.
 */
function textoOuVazio(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function listaDeTextos(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

const bruto = objecoesData as { objecoes?: unknown };
const objecoesBrutas: unknown[] = Array.isArray(bruto?.objecoes) ? bruto.objecoes : [];

/** A fonte única das 11 objeções. Ninguém digita uma resposta de objeção em
 *  código — quem muda a resposta muda o JSON. Item malformado no JSON não
 *  derruba a leitura inteira: os campos que faltarem viram string/lista
 *  vazia, nunca `undefined` propagando para quem consome. */
export const OBJECOES: readonly ObjecaoDefinida[] = objecoesBrutas.map((item) => {
  const o = (item ?? {}) as Record<string, unknown>;
  return {
    id: textoOuVazio(o.id),
    comoOClienteFala: listaDeTextos(o.comoOClienteFala),
    respostaAprovada: textoOuVazio(o.respostaAprovada),
    dadosNecessarios: listaDeTextos(o.dadosNecessarios),
    limiteDeNegociacao: textoOuVazio(o.limiteDeNegociacao),
    quandoEscalarAoGerente: textoOuVazio(o.quandoEscalarAoGerente),
    fonte: typeof o.fonte === "string" ? o.fonte : undefined,
  };
});

/** A definição de uma objeção pelo id, ou `null` — nunca um objeto inventado. */
export function objecaoPorId(id: string): ObjecaoDefinida | null {
  return OBJECOES.find((o) => o.id === id) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. A CLASSIFICAÇÃO — determinística, sem IA
// ─────────────────────────────────────────────────────────────────────────────

export interface DeteccaoDeObjecao {
  id: string;
  confianca: "alta" | "baixa";
  trecho: string;
}

/** Remove acento e caixa, PRESERVANDO O COMPRIMENTO em caractere-a-caractere:
 *  cada vogal acentuada do português decompõe (NFD) em base + UMA marca de
 *  combinação, e a marca é o que se remove — por isso `normalizar(x).length`
 *  é sempre igual a `x.length`. Essa igualdade é o que permite usar o índice
 *  encontrado no texto normalizado direto no texto ORIGINAL para extrair o
 *  `trecho` de verdade, sem mapa de posições. */
function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Classifica a objeção pelo TEXTO do cliente, batendo contra os sinais do
 * JSON. Determinística — nenhum modelo é consultado.
 *
 * Devolve o PRIMEIRO sinal que casar, na ordem do JSON (mais específica
 * primeiro por convenção de quem escreve o arquivo). Não reconheceu ⇒ `null`,
 * e `null` é o sinal para ESCALAR, nunca para o SDR inventar uma resposta.
 *
 * `silencio` nunca é devolvida por esta função: ela não tem sinal de texto —
 * ver `classificarSilencio`.
 */
export function classificarObjecao(texto: string): DeteccaoDeObjecao | null {
  if (typeof texto !== "string" || !texto.trim()) return null;
  const alvo = normalizar(texto);

  for (const objecao of OBJECOES) {
    if (objecao.id === "silencio") continue; // não vem de texto, por definição
    for (const sinal of objecao.comoOClienteFala) {
      if (typeof sinal !== "string" || !sinal.trim()) continue;
      const sinalNormalizado = normalizar(sinal);
      const idx = alvo.indexOf(sinalNormalizado);
      if (idx === -1) continue;

      const palavras = sinalNormalizado.trim().split(/\s+/).filter(Boolean).length;
      return {
        id: objecao.id,
        // Sinal de uma palavra só é fraco (bate em qualquer canto da frase);
        // sinal de duas ou mais palavras é a frase inteira reconhecida.
        confianca: palavras >= 2 ? "alta" : "baixa",
        trecho: texto.slice(idx, idx + sinal.length),
      };
    }
  }

  return null;
}

export interface ParametrosDeSilencio {
  /** Quanto tempo se passou desde a última resposta do CLIENTE, em ms. */
  msDesdeUltimaRespostaDoCliente: number;
  /** A partir de quantos ms sem resposta isto vira a objeção `silencio`. */
  limiteDeSilencioMs: number;
}

/**
 * A objeção `silencio` — a única que não nasce de texto. Nasce de TEMPO sem
 * resposta, medido pelo chamador e passado por parâmetro. Nunca deduzida de
 * uma ausência de mensagem "sentida" pelo modelo.
 *
 * Valor inválido (não numérico, negativo, limite zero ou negativo) devolve
 * `null` — ausência de informação não é informação, e não vira silêncio por
 * omissão.
 */
export function classificarSilencio(p: ParametrosDeSilencio): DeteccaoDeObjecao | null {
  if (
    !p ||
    typeof p.msDesdeUltimaRespostaDoCliente !== "number" ||
    !Number.isFinite(p.msDesdeUltimaRespostaDoCliente) ||
    p.msDesdeUltimaRespostaDoCliente < 0
  ) {
    return null;
  }
  if (
    typeof p.limiteDeSilencioMs !== "number" ||
    !Number.isFinite(p.limiteDeSilencioMs) ||
    p.limiteDeSilencioMs <= 0
  ) {
    return null;
  }
  if (p.msDesdeUltimaRespostaDoCliente < p.limiteDeSilencioMs) return null;

  const horas = Math.round(p.msDesdeUltimaRespostaDoCliente / 3_600_000);
  return {
    id: "silencio",
    confianca: "alta",
    trecho: `${horas}h sem resposta do cliente`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. A TRAVA DURA — nenhuma concessão sem autorização registrada
// ─────────────────────────────────────────────────────────────────────────────

export type Concessao =
  | "desconto"
  | "ampliacao_de_escopo"
  | "alteracao_de_prazo"
  | "garantia"
  | "condicao_comercial";

export interface AutorizacaoRegistrada {
  concessao: Concessao;
  /** Quem autorizou — nunca "sistema", nunca vazio. A máquina não se aprova. */
  autorizadaPor: string;
  /** ISO. */
  registradaEm: string;
  /** O registro que sustenta a autorização (id/link interno). */
  referencia: string;
  /** Só para desconto: o valor teto de DESCONTO autorizado, em reais — quanto
   *  a casa aceita descer a partir do preço cheio nesta autorização
   *  específica. `null`/ausente = sem teto adicional além do piso do motor. */
  valorMaximoEmReais?: number | null;
}

export type VereditoDeConcessao =
  | { ok: true; autorizacao: AutorizacaoRegistrada }
  | { ok: false; motivo: string };

/** Quem se autoriza a si mesmo não é autorização — é a máquina se aprovando.
 *  Comparação normalizada (trim + minúsculo) para não vazar por caixa alta ou
 *  espaço em volta. */
const AUTOAUTORIZACAO_PROIBIDA = new Set(["sistema", "ia", "agente", "automatico"]);

function autorizacaoValida(a: AutorizacaoRegistrada): boolean {
  if (!a || typeof a !== "object") return false;
  if (typeof a.autorizadaPor !== "string") return false;
  const quem = a.autorizadaPor.trim().toLowerCase();
  if (!quem) return false;
  if (AUTOAUTORIZACAO_PROIBIDA.has(quem)) return false;
  if (typeof a.referencia !== "string" || !a.referencia.trim()) return false;
  return true;
}

/** O `TABELA_DE_PISO` é indexado por `ItemNegociavel`, um union fechado — mas
 *  aqui `item` chega como `string` solto (vindo de fora, texto/campo livre).
 *  `Object.hasOwn` é o mesmo cuidado de `negociacao.ts:linha()`: sem ele,
 *  `TABELA_DE_PISO["constructor"]` devolveria algo truthy e o portão
 *  autorizaria um item que não existe. */
function linhaDaTabela(item: string): LinhaDaTabela | undefined {
  if (typeof item !== "string" || !Object.hasOwn(TABELA_DE_PISO, item)) return undefined;
  return (TABELA_DE_PISO as Record<string, LinhaDaTabela>)[item];
}

/**
 * O PORTÃO. Devolve se esta concessão pode acontecer — e é o único lugar
 * desta ficha onde "sim" é possível.
 *
 * FAIL CLOSED, em camadas, cada uma com motivo legível:
 *   1. lista de autorizações vazia ⇒ BLOQUEIO. Caminho normal, é o padrão.
 *   2. nenhuma autorização é PARA ESTA concessão ⇒ BLOQUEIO. Autorização de
 *      desconto não vale para prazo, e vice-versa.
 *   3. nenhuma das que são para esta concessão é VÁLIDA (autoautorização ou
 *      sem referência) ⇒ BLOQUEIO.
 *   4. só para `desconto`: o valor tem de passar por `podeFechar` do motor de
 *      preços da casa — autorização não fura piso, só permite descer até ele.
 *      E, se a autorização tiver `valorMaximoEmReais`, o desconto proposto não
 *      pode passar dele.
 *
 * Nunca devolve `ok: true` por omissão. Se você está lendo isto pensando em
 * adicionar um atalho "sem autorizações mas o pedido é pequeno", pare: é
 * exatamente o caminho que a ordem do CEO fechou.
 */
export function podeConceder(p: {
  concessao: Concessao;
  item?: string;
  valorProposto?: number;
  autorizacoes: readonly AutorizacaoRegistrada[];
}): VereditoDeConcessao {
  const autorizacoes = Array.isArray(p?.autorizacoes) ? p.autorizacoes : [];

  if (autorizacoes.length === 0) {
    return {
      ok: false,
      motivo:
        `Nenhuma autorização registrada para "${p.concessao}". Fail closed: a IA não concede ${p.concessao} ` +
        "sem autorização registrada por um humano. Preciso escalar antes de responder.",
    };
  }

  const paraEstaConcessao = autorizacoes.filter((a) => a?.concessao === p.concessao);
  if (paraEstaConcessao.length === 0) {
    return {
      ok: false,
      motivo:
        `Há autorização registrada, mas nenhuma é para "${p.concessao}" — autorização de outra concessão ` +
        "não vale para esta. Preciso escalar antes de responder.",
    };
  }

  const validas = paraEstaConcessao.filter(autorizacaoValida);
  if (validas.length === 0) {
    return {
      ok: false,
      motivo:
        `A autorização registrada para "${p.concessao}" não é válida — falta quem autorizou (nunca "sistema", ` +
        '"ia", "agente" ou "automatico") ou falta a referência do registro que a sustenta. A máquina não se aprova.',
    };
  }

  if (p.concessao !== "desconto") {
    // As outras quatro concessões não têm piso numérico na casa: o que as
    // trava é só a autorização em si, e ela já foi conferida acima.
    return { ok: true, autorizacao: validas[0] };
  }

  // ── DESCONTO: a autorização abre a porta, quem decide o valor é o MOTOR ──
  if (typeof p.item !== "string" || !p.item.trim() || typeof p.valorProposto !== "number") {
    return {
      ok: false,
      motivo:
        "Desconto exige item e valor propostos para checar contra o piso do motor — falta pelo menos um dos " +
        "dois. Preciso confirmar antes de falar preço, nunca chuto um valor.",
    };
  }

  const veredicto = podeFechar(p.item, p.valorProposto);
  if (!veredicto.pode) {
    return {
      ok: false,
      motivo: `Autorização existe, mas o valor não passa pelo piso do motor: ${veredicto.motivo}`,
    };
  }

  const linha = linhaDaTabela(p.item);
  const autorizacaoDentroDoTeto = validas.find((a) => {
    if (a.valorMaximoEmReais === undefined || a.valorMaximoEmReais === null) return true;
    const desconto = linha ? linha.cheio - (p.valorProposto as number) : Number.POSITIVE_INFINITY;
    return desconto <= a.valorMaximoEmReais;
  });

  if (!autorizacaoDentroDoTeto) {
    const maiorTeto = Math.max(
      ...validas.map((a) => (typeof a.valorMaximoEmReais === "number" ? a.valorMaximoEmReais : 0)),
    );
    return {
      ok: false,
      motivo: `O desconto proposto passa do teto autorizado (máximo autorizado: R$ ${maiorTeto}).`,
    };
  }

  return { ok: true, autorizacao: autorizacaoDentroDoTeto };
}
