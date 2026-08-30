// A FILA DE EXCEÇÕES DA CÉLULA — os 14 casos, prioridades, donos e a leitura
// fail-closed de tudo isso. Este arquivo só declara CONJUNTOS FECHADOS e
// funções de leitura defensiva — nenhuma regra de negócio mora aqui (isso é
// `fila.ts`) e nenhum acesso a banco (isso é `armazem.ts`).
//
// ── POR QUE ESTA FILA EXISTE, E NÃO É RETÓRICA ──────────────────────────────
// Esta casa matou um vigia noturno em silêncio e só descobriu um mês depois.
// Falha que não aparece não é falha resolvida: é falha que o cliente descobre
// primeiro. Não se vende como 100% automático um sistema que esconde falhas
// (ordem literal do CEO). Exceção aberta é visível e tem dono; exceção
// vencida GRITA (ver `excecoesVencidas`/`gritoDaFila` em `fila.ts`).
//
// ── A MESMA POSTURA DE `funil.ts` ───────────────────────────────────────────
// Todo "conjunto fechado" aqui segue `estadoDeclarado()` de
// `lib/agency/celula/funil.ts`: valor que não é EXATAMENTE um membro do
// conjunto vira `null` — nunca `as Caso`, nunca default silencioso.

// ── 1. Os 14 casos — conjunto FECHADO, nomeado pelo CEO ─────────────────────

/** Exatamente estes 14 slugs, nesta ordem — não reordene: é a ordem da ficha
 *  e dos testes. Faltou um 15º caso? Escreva no relatório, não no código. */
export const CASOS = [
  "sessao_expirada",
  "captcha",
  "confirmacao_de_seguranca",
  "interface_alterada",
  "projeto_removido",
  "mensagem_bloqueada",
  "limite_atingido",
  "arquivo_recusado",
  "arquivo_suspeito",
  "destinatario_divergente",
  "falha_de_download",
  "falha_de_upload",
  "ambiguidade_de_briefing",
  "possivel_violacao_de_politica",
] as const;

export type Caso = (typeof CASOS)[number];

const CONJUNTO_DE_CASOS: ReadonlySet<string> = new Set(CASOS);

/** Leitura fail-closed: qualquer coisa que não seja EXATAMENTE um dos 14
 *  vira `null`. Nunca `as Caso`. */
export function casoDeclarado(valor: unknown): Caso | null {
  return typeof valor === "string" && CONJUNTO_DE_CASOS.has(valor) ? (valor as Caso) : null;
}

/**
 * Os 5 casos que SEMPRE param a automação (trava 2 da ficha C). Os três
 * primeiros são ordem literal do CEO ("CAPTCHA, sessão expirada e bloqueio").
 * Os outros dois entraram por composição, não por invenção:
 *   - `confirmacao_de_seguranca` é a mesma família do CAPTCHA: a plataforma
 *     está duvidando de quem somos, e seguir automatizando sob dúvida de
 *     identidade é o mesmo risco do CAPTCHA em outra roupa.
 *   - `possivel_violacao_de_politica` é a trava de 03/08 do CEO
 *     (`docs/plataformas/`, regra da trava de plataforma): continuar
 *     automatizando sob suspeita de violação é como se ganha ban — a Meta
 *     restringiu a conta de anúncios da agência exatamente por isso.
 */
export const CASOS_QUE_INTERROMPEM_A_AUTOMACAO: ReadonlySet<Caso> = new Set([
  "captcha",
  "sessao_expirada",
  "confirmacao_de_seguranca",
  "mensagem_bloqueada",
  "possivel_violacao_de_politica",
]);

// ── 2. Prioridade — DADO, não `if` ───────────────────────────────────────────

export const PRIORIDADES = ["p0", "p1", "p2"] as const;
export type Prioridade = (typeof PRIORIDADES)[number];
const CONJUNTO_DE_PRIORIDADES: ReadonlySet<string> = new Set(PRIORIDADES);

export function prioridadeDeclarada(valor: unknown): Prioridade | null {
  return typeof valor === "string" && CONJUNTO_DE_PRIORIDADES.has(valor) ? (valor as Prioridade) : null;
}

/** Prioridade → prazo, em minutos, contados de `abertaEm`. Tabela como DADO:
 *  `p0` = 15 min, `p1` = 2 h, `p2` = 24 h. Todo caso de
 *  `CASOS_QUE_INTERROMPEM_A_AUTOMACAO` é `p0` por construção — ver a rejeição
 *  em `fila.ts` para quem tenta abrir um desses casos com outra prioridade. */
export const PRAZO_EM_MINUTOS_POR_PRIORIDADE: Record<Prioridade, number> = {
  p0: 15,
  p1: 2 * 60,
  p2: 24 * 60,
};

// ── 3. Responsável — conjunto FECHADO, e o CEO NÃO está nele ─────────────────

/** O CEO não opera esta fila (trava 1 da ficha C). Só estes dois. */
export const RESPONSAVEIS = ["gerente_de_atendimento", "sdr"] as const;
export type Responsavel = (typeof RESPONSAVEIS)[number];
const CONJUNTO_DE_RESPONSAVEIS: ReadonlySet<string> = new Set(RESPONSAVEIS);

/** Valores que, mesmo fora do conjunto, merecem um motivo ESPECÍFICO — porque
 *  são exatamente o erro que a trava 1 existe para barrar, não um typo
 *  qualquer. Comparação sempre em minúsculas: "CEO", "Ceo" etc. são a mesma
 *  tentativa disfarçada, não uma grafia nova a validar. */
const VALORES_DE_CEO_DISFARCADOS: ReadonlySet<string> = new Set([
  "ceo",
  "dono",
  "diolisantos10@gmail.com",
]);

/** `true` quando o valor é reconhecível como "o CEO" (em qualquer grafia de
 *  caixa) — usado só para dar um motivo de rejeição mais claro, nunca para
 *  aceitar nada. */
export function ehTentativaDeAtribuirAoCeo(valor: unknown): boolean {
  return typeof valor === "string" && VALORES_DE_CEO_DISFARCADOS.has(valor.trim().toLowerCase());
}

/** Leitura fail-closed do responsável: fora dos 2 valores exatos → `null`.
 *  `ceo`/`dono`/o e-mail do CEO nunca são um dos 2 — sempre `null` aqui
 *  também; `ehTentativaDeAtribuirAoCeo` é só quem escolhe a mensagem. */
export function responsavelDeclarado(valor: unknown): Responsavel | null {
  return typeof valor === "string" && CONJUNTO_DE_RESPONSAVEIS.has(valor) ? (valor as Responsavel) : null;
}

// ── 4. Estado da exceção ─────────────────────────────────────────────────────

export const ESTADOS_DA_EXCECAO = ["aberta", "em_tratamento", "resolvida", "descartada"] as const;
export type EstadoDaExcecao = (typeof ESTADOS_DA_EXCECAO)[number];
const CONJUNTO_DE_ESTADOS_DA_EXCECAO: ReadonlySet<string> = new Set(ESTADOS_DA_EXCECAO);

export function estadoDaExcecaoDeclarado(valor: unknown): EstadoDaExcecao | null {
  return typeof valor === "string" && CONJUNTO_DE_ESTADOS_DA_EXCECAO.has(valor) ? (valor as EstadoDaExcecao) : null;
}

/** Estados em que a exceção ainda está "viva" — conta para a trava 2
 *  (interrompe automação) e para a trava 3 (pode vencer). */
export const ESTADOS_ABERTOS: ReadonlySet<EstadoDaExcecao> = new Set(["aberta", "em_tratamento"]);

// ── 5. Tipo de evento da trilha da exceção (append-only) ────────────────────

export const TIPOS_DE_EVENTO_DA_EXCECAO = [
  "aberta",
  "assumida",
  "resolvida",
  "descartada",
  "prazo_vencido",
  "reaberta",
] as const;
export type TipoDeEventoDaExcecao = (typeof TIPOS_DE_EVENTO_DA_EXCECAO)[number];
const CONJUNTO_DE_TIPOS_DE_EVENTO: ReadonlySet<string> = new Set(TIPOS_DE_EVENTO_DA_EXCECAO);

export function tipoDeEventoDeclarado(valor: unknown): TipoDeEventoDaExcecao | null {
  return typeof valor === "string" && CONJUNTO_DE_TIPOS_DE_EVENTO.has(valor) ? (valor as TipoDeEventoDaExcecao) : null;
}
