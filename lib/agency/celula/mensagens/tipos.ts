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

export interface ModeloDeMensagem {
  codigo: string; // "M01".."M22"
  nome: string;
  plataforma: string; // "99freelas"
  etapaDoFunil: string; // texto livre por ora — a Onda 1 tipa depois
  finalidade: string;
  textoBase: string; // com {{variaveis}} entre chaves duplas
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
