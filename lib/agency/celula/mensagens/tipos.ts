// ─── O CONTRATO DA BIBLIOTECA DE MENSAGENS ──────────────────────────────────
//
// Este arquivo é o contrato. Outros cinco especialistas da Onda 2 importam
// daqui — mantenha-o pequeno e não acrescente lógica: lógica mora em
// `biblioteca.ts`.
//
// Fonte da ordem: docs/celula-prospeccao/despachos/A-biblioteca.md (§1).

/** O ciclo de vida de um modelo. Só `"aprovado"` pode ser enviado. */
export type EstadoDoModelo = "rascunho" | "aprovado" | "pausado" | "aposentado";

/** Todo estado possível, para validar sem improvisar uma lista solta noutro arquivo. */
export const ESTADOS_DO_MODELO: readonly EstadoDoModelo[] = [
  "rascunho",
  "aprovado",
  "pausado",
  "aposentado",
] as const;

export interface HistoricoDoModelo {
  versao: string; // "1.0.0"
  em: string; // ISO
  autor: string;
  aprovador: string | null;
  oQueMudou: string;
}

// ─── REGRA DE AUSÊNCIA — Ficha B (o motor do colchete) ──────────────────────
// O caso "sem nome, usar só Olá" que o CEO citou ao falar de M01. Uma regra
// diz: se `variavel` não veio preenchida, troca o recorte LITERAL `de` (tirado
// do textoBase) por `para`, ANTES da substituição de variáveis. Nada de
// heurística de saudação — só troca de texto declarada, com fonte.
// Fonte: docs/celula-prospeccao/despachos/ONDA-2B-B-o-motor-do-colchete.md §3.
export interface RegraDeAusencia {
  variavel: string; // "NOME"
  de: string; // recorte literal do textoBase, ex.: "Olá, [NOME]."
  para: string; // substituto, ex.: "Olá."
  fonte: string; // de onde veio a regra
}

export interface ModeloDeMensagem {
  codigo: string; // "M01".."M22"
  nome: string;
  plataforma: string; // "99freelas"
  etapaDoFunil: string; // texto livre por ora — a Onda 1 tipa depois
  finalidade: string;
  textoBase: string; // com {{variaveis}} entre chaves duplas OU [VARIAVEIS] entre colchetes
  variaveisObrigatorias: string[];
  variaveisOpcionais: string[];
  palavrasProibidas: string[];
  condicaoDeEntrada: string;
  condicaoDeSaida: string;
  proximaAcao: string;
  tempoDeEsperaHoras: number | null; // null = sem espera declarada
  maximoDeUsos: number | null; // null = sem teto declarado
  versao: string;
  autor: string;
  aprovador: string | null;
  estado: EstadoDoModelo;
  historico: HistoricoDoModelo[];
  /** Preenchido quando o texto oficial do CEO ainda não chegou. Ver §4 da ficha. */
  pendencia?: string | null;
  /** Regras de "sem esta variável, troca este recorte por aquele". Ausente == []. */
  regrasDeAusencia?: RegraDeAusencia[];
}

/**
 * O resultado de toda leitura de modelo. NUNCA lança e NUNCA devolve `false`
 * mudo — o motivo em português é obrigatório em todo caminho de falha.
 */
export type LeituraDoModelo =
  | { ok: true; modelo: ModeloDeMensagem }
  | { ok: false; motivo: string; codigo: string };

/** O padrão de código exigido: "M" + dois dígitos. */
export const PADRAO_DE_CODIGO = /^M\d{2}$/;
