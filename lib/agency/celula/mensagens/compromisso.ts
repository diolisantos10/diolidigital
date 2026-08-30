// compromisso.ts — A TRAVA DE PROMESSA: DATA PROMETIDA EXIGE COMPROMISSO REGISTRADO
//
// ═══════════════════════════════════════════════════════════════════════════
// O DEFEITO (medido em produção, 29/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// Nosso SDR disse **"trago ainda hoje" QUATRO vezes** sem ter o número e sem
// nenhum mecanismo por trás. O CEO viu a conversa e disse que teríamos
// perdido o cliente se fosse de verdade.
//
// Já existia o irmão deste defeito, medido em 27/08/2026 ("eu finalizo o
// orçamento e envio" — e nada disparou): `promessa-que-a-maquina-nao-cumpre.ts`
// barra a PROMESSA VAGA. Este arquivo é o complemento, não o duplicado: ele
// barra a PROMESSA COM DATA — e exige que ela nasça com dono e prazo
// REGISTRADOS no mesmo ato em que o texto sai, porque uma data que ninguém
// registrou é uma dívida que ninguém sabe que tem.
//
// ═══════════════════════════════════════════════════════════════════════════
// A REGRA
// ═══════════════════════════════════════════════════════════════════════════
//
// Mensagem que promete data NÃO SAI sem um `Compromisso` registrado — com
// dono humano e prazo futuro — no mesmo ato. "No mesmo ato" é literal: o
// registro acontece ANTES de o texto ser liberado, e se o registro falhar, o
// texto falha junto. Prompt pediria isso educadamente; aqui é código.
//
// O que NÃO se barra, e a diferença é a alma da régua:
//   • data do CLIENTE ("preciso até sexta") — é pergunta dele, não promessa
//     nossa. Sem verbo de entrega em primeira pessoa, não há promessa;
//   • prazo de ESCOPO já contratado ("o pacote entrega em 5 dias úteis") —
//     verbo na terceira pessoa, ninguém da casa está se comprometendo agora;
//   • passado ("mandei ontem") — relato, não promessa.
//
// Régua larga demais barraria a casa de conversar, e régua que barra conversa
// legítima é desligada na primeira reclamação — aí não protege nada.
//
// ═══════════════════════════════════════════════════════════════════════════
// COMPOSIÇÃO COM O IRMÃO DE 27/08 — NÃO REESCRITA
// ═══════════════════════════════════════════════════════════════════════════
//
// `promessasSoltas` (do arquivo de 27/08) já sabe reconhecer a máquina se
// comprometendo em primeira pessoa com um ato futuro em torno de
// orçamento/proposta. Este arquivo IMPORTA essa detecção e a usa como um dos
// dois gatilhos de "há verbo de compromisso na sentença" — ao lado da lista
// própria de verbos de entrega da ficha (envio/mando/trago/retorno/te
// passo/entrego/finalizo). O que este arquivo faz sozinho é cruzar esse
// gatilho com uma EXPRESSÃO DE DATA — a parte que o irmão de 27/08 não trata.

import {
  promessasSoltas as promessasSoltasDoIrmao,
} from "@/lib/agency/comercial/promessa-que-a-maquina-nao-cumpre";

// ── 1. RECONHECER A PROMESSA DE DATA ────────────────────────────────────────

/** Uma promessa de data encontrada no texto que ia para o cliente. */
export interface PromessaDeData {
  /** O trecho exato da mensagem (a sentença) que carrega a promessa. */
  trecho: string;
  /** A categoria da expressão temporal reconhecida — para log e teste. */
  forma: string;
}

/**
 * Verbos de entrega em primeira pessoa, da ordem do CEO. É a mesma família de
 * distinção que separa promessa de instrução no irmão de 27/08: primeira
 * pessoa é a casa se comprometendo; terceira pessoa é fato ou instrução.
 */
const VERBOS_DE_ENTREGA = /\b(envio|mando|trago|te\s+passo|entrego|finalizo|retorno)\b/i;

/**
 * As formas de data da ordem do CEO. Cada uma é um jeito diferente de dizer
 * "até quando" em primeira pessoa da casa.
 */
const FORMAS_DE_DATA: ReadonlyArray<{ re: RegExp; forma: string }> = [
  { re: /\bainda\s+esta\s+semana\b/i, forma: "ainda esta semana" },
  { re: /\bainda\s+hoje\b/i, forma: "ainda hoje" },
  { re: /\bamanh[ãa]\s+cedo\b/i, forma: "amanhã cedo" },
  // Fronteira final NÃO pode ser `\b` aqui: `\b` é ASCII, e o `\b` viria logo
  // depois de "ã"/"é" — que o motor de regex não trata como caractere de
  // palavra. "ã"/"é" seguido de espaço ou ponto são DOIS não-palavra, então
  // não existe fronteira e o padrão nunca casava (medido em produção, F2).
  // `(?![\p{L}\p{N}])` com a flag `u` entende acento como letra de verdade.
  { re: /\bat[ée]\s+amanh[ãa](?![\p{L}\p{N}])/iu, forma: "até amanhã" },
  { re: /\bat[ée]\s+o\s+fim\s+do\s+dia\b/i, forma: "até o fim do dia" },
  { re: /\bem\s+24\s*(horas|hrs?)\b/i, forma: "em 24 horas" },
  {
    re: /\bat[ée]\s+(segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)(-feira)?\b/i,
    forma: "até dia da semana",
  },
  {
    re: /\bna\s+(segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)(-feira)?\b/i,
    forma: "no dia da semana",
  },
  { re: /\bat[ée]\s+dia\s+\d{1,2}\b/i, forma: "até dia do mês" },
  { re: /\bem\s+\d+\s+dias?\b/i, forma: "em N dias" },
];

/** Divide o texto em sentenças — a promessa é medida por sentença, não pelo
 *  texto inteiro, para não juntar duas frases que não têm nada a ver. */
function sentencas(texto: string): string[] {
  return texto
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Acha as promessas de data no texto. Lista vazia = não há promessa de data.
 *
 * Uma sentença conta como promessa de data quando tem AMBOS:
 *   1. um verbo de compromisso em primeira pessoa — o da ficha OU o do irmão
 *      de 27/08 (composição, não reescrita);
 *   2. uma expressão de data.
 * Uma sentença gera no máximo UMA promessa (a primeira forma de data
 * encontrada) — "uma promessa por trecho", como pede o critério de aceite.
 */
export function promessasDeData(texto: string): PromessaDeData[] {
  const t = (texto ?? "").trim();
  if (!t) return [];

  const achadas: PromessaDeData[] = [];
  for (const sentenca of sentencas(t)) {
    const temVerboDeCompromisso =
      VERBOS_DE_ENTREGA.test(sentenca) || promessasSoltasDoIrmao(sentenca).length > 0;
    if (!temVerboDeCompromisso) continue;

    for (const { re, forma } of FORMAS_DE_DATA) {
      if (re.test(sentenca)) {
        achadas.push({ trecho: sentenca, forma });
        break; // uma promessa por trecho — não uma por forma de data.
      }
    }
  }
  return achadas;
}

export function temPromessaDeData(texto: string): boolean {
  return promessasDeData(texto).length > 0;
}

// ── 2. O COMPROMISSO — interface aqui, persistência por PORTA INJETADA ─────

export interface Compromisso {
  id: string;
  conversaId: string;
  oQueFoiPrometido: string;
  /** Quem responde por cumprir. NUNCA "sistema", "ia", "agente", vazio. */
  dono: string;
  /** O prazo prometido, ISO. Tem de ser FUTURO em relação a `agora`. */
  prazo: string;
  criadoEm: string;
  /** O trecho exato da mensagem que gerou a promessa. */
  trechoDaPromessa: string;
}

export interface PortaDeCompromissos {
  registrar: (
    c: Omit<Compromisso, "id" | "criadoEm">,
  ) => Promise<{ ok: true; id: string } | { ok: false; motivo: string }>;
}

/** Donos que NUNCA são aceitos — a máquina não pode prometer por si mesma. */
const DONOS_PROIBIDOS = new Set(["sistema", "ia", "agente"]);

// ── 3. A TRAVA — "NO MESMO ATO" É LITERAL ───────────────────────────────────

export type VereditoDaPromessa =
  | { ok: true; texto: string; compromissosCriados: string[] }
  | { ok: false; motivo: string };

/**
 * Libera o texto SÓ SE toda promessa de data nele tiver um compromisso
 * registrado com sucesso, no mesmo ato — registrar primeiro, liberar depois.
 * Se não houver promessa de data, não há nada a registrar: passa direto.
 */
export async function liberarTextoComPromessa(p: {
  texto: string;
  conversaId: string;
  dono: string | null;
  prazo: string | null;
  agora?: Date;
  porta: PortaDeCompromissos;
}): Promise<VereditoDaPromessa> {
  const agora = p.agora ?? new Date();
  const promessas = promessasDeData(p.texto);

  if (promessas.length === 0) {
    return { ok: true, texto: p.texto, compromissosCriados: [] };
  }

  const donoNormalizado = (p.dono ?? "").trim().toLowerCase();
  if (!donoNormalizado || DONOS_PROIBIDOS.has(donoNormalizado)) {
    return {
      ok: false,
      motivo: `promessa com data exige um dono humano responsável; "${p.dono ?? ""}" não é aceito (nunca "sistema"/"ia"/"agente"/vazio).`,
    };
  }

  if (!p.prazo) {
    return { ok: false, motivo: "promessa com data exige um prazo (ISO) e nenhum foi informado." };
  }
  const prazoData = new Date(p.prazo);
  if (Number.isNaN(prazoData.getTime())) {
    return { ok: false, motivo: `prazo "${p.prazo}" não é uma data ISO válida.` };
  }
  if (prazoData.getTime() <= agora.getTime()) {
    return {
      ok: false,
      motivo: `prazo "${p.prazo}" não é futuro em relação a agora (${agora.toISOString()}) — promessa vencida antes de nascer.`,
    };
  }

  // Registrar PRIMEIRO, na ordem em que as promessas apareceram no texto. Se
  // qualquer uma falhar, o texto inteiro NÃO sai — este é o ponto da ficha.
  const compromissosCriados: string[] = [];
  for (const promessa of promessas) {
    const resultado = await p.porta.registrar({
      conversaId: p.conversaId,
      oQueFoiPrometido: promessa.trecho,
      dono: p.dono as string,
      prazo: p.prazo,
      trechoDaPromessa: promessa.trecho,
    });
    if (!resultado.ok) {
      return {
        ok: false,
        motivo: `promessa não registrada — o texto NÃO sai: ${resultado.motivo}`,
      };
    }
    compromissosCriados.push(resultado.id);
  }

  // Só libera DEPOIS de todo registro confirmado.
  return { ok: true, texto: p.texto, compromissosCriados };
}

// ── 4. A LIGAÇÃO COM OS MODELOS QUE PROMETEM DATA ───────────────────────────

/** Ordem do CEO, 29/08/2026: estes códigos de modelo SEMPRE prometem data e
 *  por isso exigem compromisso registrado, independente do texto exato que
 *  produzirem. Fonte: docs/celula-prospeccao/despachos/F-trava-de-promessa.md §4. */
export const MODELOS_QUE_PROMETEM_DATA = ["M15", "M16", "M18", "M19"] as const;

/**
 * `true` quando o modelo exige compromisso — porque está na lista da ordem do
 * CEO OU porque o texto que ele produziu carrega uma promessa de data. O
 * TEXTO MANDA: um modelo fora da lista que prometa data também é barrado —
 * a lista é atalho, não é a trava.
 */
export function exigeCompromisso(codigoDoModelo: string, texto: string): boolean {
  if ((MODELOS_QUE_PROMETEM_DATA as readonly string[]).includes(codigoDoModelo)) return true;
  return temPromessaDeData(texto);
}
