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

// ─── LIGAÇÃO DE VARIÁVEIS — Ficha B, Onda 4A ────────────────────────────────
// `[NOME]` significa PESSOA em M01/M14 e ARQUIVO em M06/M17/M20 — a mesma
// marcação, dois significados. `ligacaoDeVariaveis` declara, POR MODELO, em
// que campo do estado cada variável liga. Conjunto FECHADO: um alvo fora
// desta lista (typo, valor de migração, `null`) nunca vira default — vira
// bloqueio nomeado. Leitura fail-closed em `alvoDeLigacaoDeclarado()`
// (`biblioteca.ts`), na forma exata de `estadoDeclarado()` em `funil.ts`.
//
// "preciso_confirmar_com_o_ceo" é membro VÁLIDO deste conjunto — declarar
// isto não é erro de forma (não bloqueia a leitura do modelo), mas BLOQUEIA
// o ENVIO (`modeloParaEnvio`/`preencher` recusam, nomeando a variável). É o
// oposto de inventar: declara a ausência de forma que ela pare a mensagem.
//
// O conjunto foi derivado das variáveis que os 22 modelos REALMENTE usam
// (ver docs/plataformas/99freelas/mensagens.json e o relatório da ficha) —
// um alvo por CONCEITO, não um alvo por modelo.
export const ALVO_PENDENTE = "preciso_confirmar_com_o_ceo" as const;

export const ALVOS_DE_LIGACAO = [
  "nomeDoCliente",
  "nomeDoArquivo",
  "entregavel",
  "necessidadeEspecifica",
  "perguntaEspecifica",
  "informacaoPendente",
  "caracteristicas",
  "objetivo",
  "prazo",
  "materiais",
  "motivo",
  "formatoAceito",
  "escopoResumido",
  "valor",
  "orcamentoDoCliente",
  "escopoAjustado",
  "prazoRealista",
  "dataDoCliente",
  "primeiraEtapa",
  "marcoOuEntrega",
  "data",
  "etapaConcluida",
  "proximaEtapa",
  "resumoObjetivo",
  "novaDemanda",
  "motivoDaRecusa",
  ALVO_PENDENTE,
] as const;

export type AlvoDeLigacao = (typeof ALVOS_DE_LIGACAO)[number];

export interface ModeloDeMensagem {
  codigo: string; // "M01".."M22"
  nome: string;
  plataforma: string; // "99freelas"
  /** Texto livre na FORMA (não-vazio) — mas, para ENVIO, validada contra os
   *  22 estados de `lib/agency/celula/funil.ts` (`estadoDeclarado`). Valor
   *  fora do conjunto — inclusive o placeholder "preciso confirmar com o
   *  CEO" — não bloqueia a LEITURA (o modelo continua inspecionável), mas
   *  bloqueia o ENVIO (`modeloParaEnvio`/`preencher`). Ver Ficha B, Onda 4A. */
  etapaDoFunil: string;
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
  /** Para cada variável do modelo, em QUE campo do estado ela se liga.
   *  OPCIONAL na forma (ausente == não usa o recurso — nenhum modelo antigo
   *  quebra), mas quando presente é validada por inteiro: toda variável
   *  citada precisa de ligação, e todo alvo precisa ser do conjunto
   *  fechado. Ver `ALVOS_DE_LIGACAO` acima e `biblioteca.ts`. */
  ligacaoDeVariaveis?: Record<string, AlvoDeLigacao>;
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
