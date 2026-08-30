// O FUNIL DA OPORTUNIDADE DE MARKETPLACE — o conjunto FECHADO de estados, a
// tabela de transições permitidas e a leitura defensiva de estado.
//
// ── ⚠️ DIVERGÊNCIA ABERTA (reportar, não silenciar) ─────────────────────────
// A ordem do CEO fala em "23 estados". A enumeração que ele mesmo escreveu
// tem, contadas duas vezes com script, **22** nomes. Este arquivo implementa
// EXATAMENTE os 22 nomeados na ordem — nenhum 23º foi inventado. A divergência
// fica visível em código, não só em prosa: `TOTAL_DECLARADO_PELO_CEO` (23) e
// `ESTADOS.length` (22) não batem, de propósito, até o CEO dizer qual é o 23º
// estado ou confirmar que são 22.
//
// ── O QUE FOI REAPROVEITADO DE `lib/agency/estados-v2/maquina.ts`, E POR QUÊ ──
// `estados-v2/maquina.ts` é a máquina canônica da esteira de PROJETO
// (`intake → qualified → … → cycle_closed`, 20 estados, 25 pares). Este
// arquivo reaproveita três decisões de desenho de lá, porque são boas
// decisões, não porque os estados servem:
//   1. **Formato de tabela de pares** (`ReadonlyArray<readonly [Estado, Estado]>`
//      + `Set` de `"de→para"` para checagem O(1)) — o mesmo de `TRANSICOES_LEGAIS`
//      / `transicaoLegal`. Transição é DADO, nunca `if` decidindo legalidade.
//   2. **Resultado tipado com união discriminada** — o mesmo espírito de
//      `ResultadoDaTransicao`, adaptado aqui para `VeredictoDaTransicao` com
//      código de rejeição legível.
//   3. **Postura fail-closed na leitura de string crua** — o mesmo princípio de
//      `capacidadeDeclarada()` em `lib/marketplaces/politica.ts`: valor que não
//      é EXATAMENTE um membro do conjunto vira o valor seguro, nunca `as Estado`.
//
// Por que os 20 estados de `estados-v2` NÃO servem para este funil: são dois
// domínios diferentes por natureza, não só por nome.
//   - `estados-v2` começa depois que a oportunidade já é um PROJETO CONTRATADO
//     (`intake`) e termina num ciclo de entrega recorrente (`cycle_closed →
//     direction_pending`). Este funil começa ANTES de existir relação
//     nenhuma — `encontrada` é um anúncio de terceiro, lido por scraping/e-mail,
//     que pode nem ser sobre um cliente real (`duplicada`,
//     `recusada_pela_qualificacao`).
//   - `estados-v2` não tem NENHUM estado para as etapas que só existem em
//     prospecção fria: preparar abordagem, esperar autorização da plataforma
//     para contatar (`aguardando_autorizacao` — a trava de 03/08, ver
//     `lib/marketplaces/politica.ts`), enviar e esperar resposta de um
//     desconhecido, ou reengajar quem esfriou (`retomar`). Esses estados não
//     têm equivalente em `intake`/`qualified` porque naquele ponto o cliente
//     JÁ respondeu, JÁ há relação.
//   - Colapsar os dois num diagrama só faria os 20 estados de projeto
//     ganharem pré-condições de prospecção que nunca se aplicam a um briefing
//     que chegou por indicação — e faria este funil herdar transições
//     (`cycle_closed → direction_pending`) que não existem para uma
//     oportunidade de marketplace, porque marketplace não tem ciclo recorrente
//     automático: cada job é uma negociação nova.
//
// ── O QUE ESTE ARQUIVO NÃO FAZ ──────────────────────────────────────────────
// Não lê `textoBruto` de oportunidade nem de anúncio. `textoBruto` é DADO NÃO
// CONFIÁVEL (ver `prisma/schema.prisma`, model `Oportunidade`) — texto escrito
// por um desconhecido na internet, que descreve um pedido e NÃO dá ordem ao
// sistema. Este módulo julga só os cinco campos estruturados de uma transição
// (`de`, `para`, `autor`, `origem`, `justificativa`); se algum dia sentir
// vontade de importar `textoBruto` aqui, é sinal de que a trava está no
// arquivo errado.

// ── 1. O conjunto FECHADO ────────────────────────────────────────────────────

/** Grafia canônica. Exatamente estes 22 slugs, nesta ordem — não reordene: a
 *  ordem é a mesma usada nos testes e no relatório para o CEO. */
export const ESTADOS = [
  "encontrada",
  "duplicada",
  "recusada_pela_qualificacao",
  "qualificada",
  "abordagem_preparada",
  "aguardando_autorizacao",
  "abordada",
  "respondeu",
  "briefing_em_coleta",
  "briefing_completo",
  "proposta_preparada",
  "proposta_enviada",
  "negociacao",
  "contratada",
  "em_producao",
  "entrega_enviada",
  "ajuste_solicitado",
  "aprovada",
  "ganha",
  "perdida",
  "retomar",
  "excecao_operacional",
] as const;

export type Estado = (typeof ESTADOS)[number];

/** A ordem do CEO diz 23; a enumeração dele, contada, tem 22. Constante
 *  deixada aqui de propósito para a divergência ficar visível em código —
 *  não apague nem "corrija" sem confirmação explícita do CEO. */
export const TOTAL_DECLARADO_PELO_CEO = 23;

export const ESTADO_INICIAL: Estado = "encontrada";

/**
 * Estados sem transição de saída — a linha termina ali.
 *
 *  - `duplicada`: o mesmo anúncio já existe no workspace (dedup por
 *    `impressaoDigital`). Não há "de novo": é a MESMA oportunidade.
 *  - `recusada_pela_qualificacao`: o motor de qualificação já decidiu que não
 *    vale abordagem. Reabrir exigiria um humano recriar a entrada, não
 *    transicionar a existente.
 *  - `ganha`: a oportunidade virou contrato, entrou em produção, foi
 *    aprovada e o ciclo desta oportunidade FECHOU. O que vem depois
 *    (entregas recorrentes) é o domínio de `estados-v2`, não deste funil.
 *  - `perdida`: encerramento definitivo do lado de fora — cliente recusou,
 *    silêncio permanente, ou desistência. Reengajar não é "reabrir perdida":
 *    é `retomar`, que é o estado correto para isso (ver abaixo). Uma
 *    oportunidade `perdida` que volta a responder entra como `retomar`, não
 *    revive `perdida→algo`.
 *
 * Todos os outros 18 têm ao menos uma saída — inclusive `retomar` e
 * `excecao_operacional`, que são estados de trabalho, não de descarte.
 */
export const ESTADOS_TERMINAIS: readonly Estado[] = ["duplicada", "recusada_pela_qualificacao", "ganha", "perdida"];

const CONJUNTO_DE_ESTADOS: ReadonlySet<string> = new Set(ESTADOS);

/**
 * Lê estado de fonte não confiável (banco, rota HTTP, payload externo).
 * Qualquer coisa que não seja EXATAMENTE um dos 22 — string com espaço,
 * maiúscula, `null`, número, objeto — vira `null`. Nunca `as Estado`: a mesma
 * postura de `capacidadeDeclarada()` em `lib/marketplaces/politica.ts`.
 */
export function estadoDeclarado(valor: unknown): Estado | null {
  return typeof valor === "string" && CONJUNTO_DE_ESTADOS.has(valor) ? (valor as Estado) : null;
}

/**
 * Fail closed: oportunidade sem linha de funil, ou com um valor corrompido,
 * é `'encontrada'` — nunca "pode avançar". Ausência de informação não é
 * informação: um estado que não conseguimos ler não é "avançado", é "não
 * sabemos", e o valor seguro para "não sabemos" é o início da esteira.
 */
export function estadoAtualOuInicial(valor: unknown): Estado {
  return estadoDeclarado(valor) ?? ESTADO_INICIAL;
}

// ── 2. A tabela de transições — DADO, não `if` ──────────────────────────────
//
// `excecao_operacional` é a fila de exceção: alcançável de QUALQUER estado
// não-terminal (inclusive do próprio `encontrada`), porque uma oportunidade
// pode precisar de intervenção humana em qualquer ponto da linha — dado
// ambíguo, plataforma fora do ar, resposta que o Guardião de Conteúdo não
// sabe classificar. Sair dela é possível só para estados de TRABALHO, um por
// etapa macro do funil (qualificação, abordagem, briefing, negociação,
// produção, reengajamento) — nunca direto para um estado terminal: sair da
// exceção sem decisão humana virando `ganha`/`perdida` transformaria a fila
// de exceção num atalho para fechar oportunidade sem julgamento.
//
// `retomar` é o estado de reengajamento de oportunidade fria: entra-se nele
// a partir de qualquer ponto de contato que esfriou (`abordada`,
// `briefing_em_coleta`, `proposta_enviada`, `negociacao`) — não de
// `encontrada`/`qualificada`, porque não há contato ainda para esfriar. Dele
// só se sai para `abordagem_preparada` (nova tentativa de contato),
// `qualificada` (a oportunidade pode ter mudado e merece nova checagem) ou
// `perdida` (reengajamento tentado e recusado — aí sim é definitivo).

const PARES_POR_ORIGEM: Record<Exclude<Estado, "duplicada" | "recusada_pela_qualificacao" | "ganha" | "perdida">, readonly Estado[]> = {
  encontrada: ["duplicada", "recusada_pela_qualificacao", "qualificada", "excecao_operacional"],
  qualificada: ["abordagem_preparada", "excecao_operacional"],
  abordagem_preparada: ["aguardando_autorizacao", "abordada", "excecao_operacional"],
  aguardando_autorizacao: ["abordada", "excecao_operacional"],
  abordada: ["respondeu", "retomar", "perdida", "excecao_operacional"],
  respondeu: ["briefing_em_coleta", "perdida", "excecao_operacional"],
  briefing_em_coleta: ["briefing_completo", "retomar", "perdida", "excecao_operacional"],
  briefing_completo: ["proposta_preparada", "excecao_operacional"],
  proposta_preparada: ["proposta_enviada", "excecao_operacional"],
  proposta_enviada: ["negociacao", "contratada", "retomar", "perdida", "excecao_operacional"],
  negociacao: ["proposta_enviada", "contratada", "retomar", "perdida", "excecao_operacional"],
  contratada: ["em_producao", "excecao_operacional"],
  em_producao: ["entrega_enviada", "excecao_operacional"],
  entrega_enviada: ["ajuste_solicitado", "aprovada", "excecao_operacional"],
  ajuste_solicitado: ["em_producao", "excecao_operacional"],
  aprovada: ["ganha", "excecao_operacional"],
  retomar: ["abordagem_preparada", "qualificada", "perdida", "excecao_operacional"],
  excecao_operacional: ["qualificada", "abordagem_preparada", "briefing_em_coleta", "negociacao", "em_producao", "retomar"],
};

/** A tabela achatada em pares — a forma que o restante da casa consome
 *  (mesmo formato de `TRANSICOES_LEGAIS` em `estados-v2/maquina.ts`). */
export const TRANSICOES_PERMITIDAS: ReadonlyArray<readonly [Estado, Estado]> = (
  Object.entries(PARES_POR_ORIGEM) as Array<[Estado, readonly Estado[]]>
).flatMap(([de, destinos]) => destinos.map((para) => [de, para] as const));

const CONJUNTO_DE_PARES: ReadonlySet<string> = new Set(TRANSICOES_PERMITIDAS.map(([de, para]) => `${de}→${para}`));

/** Par não listado = REJEITADO. Nenhum `if` decidindo legalidade — só
 *  pertencimento ao conjunto. */
export function transicaoPermitida(de: Estado, para: Estado): boolean {
  return CONJUNTO_DE_PARES.has(`${de}→${para}`);
}

// ── 3. Origem da transição ───────────────────────────────────────────────────

const ORIGENS = ["agente", "gerente", "cliente", "sistema"] as const;
export type OrigemDaTransicao = (typeof ORIGENS)[number];
const CONJUNTO_DE_ORIGENS: ReadonlySet<string> = new Set(ORIGENS);

/** Fora das 4 → `null`. Nunca default silencioso para `'sistema'`: quem
 *  não declara origem não fica automaticamente "o sistema fez". */
export function origemDeclarada(valor: unknown): OrigemDaTransicao | null {
  return typeof valor === "string" && CONJUNTO_DE_ORIGENS.has(valor) ? (valor as OrigemDaTransicao) : null;
}

// ── 4. O juiz puro ───────────────────────────────────────────────────────────

export type VeredictoDaTransicao =
  | { ok: true; de: Estado; para: Estado }
  | {
      ok: false;
      codigo:
        | "estado_de_desconhecido"
        | "estado_para_desconhecido"
        | "par_nao_permitido"
        | "justificativa_ausente"
        | "origem_desconhecida"
        | "autor_ausente";
      motivo: string;
    };

/** `justificativa` vazia, só espaço, ou com menos de 3 caracteres úteis
 *  (depois de tirar espaço nas pontas) é rejeitada. É trava, não campo
 *  opcional: uma transição sem "por quê" escrito é uma transição que
 *  ninguém vai conseguir auditar depois. */
function justificativaUtilValida(valor: unknown): valor is string {
  return typeof valor === "string" && valor.trim().length >= 3;
}

function autorValido(valor: unknown): valor is string {
  return typeof valor === "string" && valor.trim().length > 0;
}

/**
 * O juiz puro, sem banco. Recebe strings CRUAS — podem vir do banco, de rota
 * HTTP, de qualquer lugar. Cada checagem tem seu próprio código de rejeição,
 * e o `motivo` é sempre legível em português, citando os estados pelo nome.
 *
 * Ordem das checagens (importa para o motivo devolvido, não muda o
 * resultado final): primeiro se os dois estados existem, depois se o PAR é
 * legal — a checagem central deste arquivo —, só então os metadados da
 * transição (origem, autor, justificativa).
 */
export function avaliarTransicao(entrada: {
  de: unknown;
  para: unknown;
  autor: unknown;
  origem: unknown;
  justificativa: unknown;
}): VeredictoDaTransicao {
  const de = estadoDeclarado(entrada.de);
  if (de === null) {
    return {
      ok: false,
      codigo: "estado_de_desconhecido",
      motivo: `O estado de origem "${String(entrada.de)}" não é um dos 22 estados do funil.`,
    };
  }

  const para = estadoDeclarado(entrada.para);
  if (para === null) {
    return {
      ok: false,
      codigo: "estado_para_desconhecido",
      motivo: `O estado de destino "${String(entrada.para)}" não é um dos 22 estados do funil.`,
    };
  }

  if (!transicaoPermitida(de, para)) {
    return {
      ok: false,
      codigo: "par_nao_permitido",
      motivo: `A transição de "${de}" para "${para}" não está na tabela de transições permitidas do funil.`,
    };
  }

  const origem = origemDeclarada(entrada.origem);
  if (origem === null) {
    return {
      ok: false,
      codigo: "origem_desconhecida",
      motivo: `A origem "${String(entrada.origem)}" não é uma das 4 permitidas (agente, gerente, cliente, sistema) para a transição de "${de}" para "${para}".`,
    };
  }

  if (!autorValido(entrada.autor)) {
    return {
      ok: false,
      codigo: "autor_ausente",
      motivo: `A transição de "${de}" para "${para}" precisa de um autor identificado, e nenhum foi informado.`,
    };
  }

  if (!justificativaUtilValida(entrada.justificativa)) {
    return {
      ok: false,
      codigo: "justificativa_ausente",
      motivo: `A transição de "${de}" para "${para}" precisa de uma justificativa com pelo menos 3 caracteres úteis, e nenhuma foi informada.`,
    };
  }

  return { ok: true, de, para };
}
