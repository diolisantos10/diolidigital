// regras.ts — AS RÉGUAS PURAS DO CITY JOBS. Sem banco, sem rede, sem relógio
// implícito — tudo recebe `agora`/dados já lidos. É o que faz cada regra do
// contrato (docs/integracoes/cityjobs-contrato.md, §6) provável de fora do
// endpoint inteiro.

/** "paga" antes de "selecionada" — contrato §6, ordem da fila do dia. */
export type PrioridadeDoPost = "paga" | "selecionada";
export type RiscoDoPost = "sem_risco" | "com_risco";
export type FormatoDoPost = "story" | "feed_imagem" | "carrossel";

/** Menor valor = mais prioritário. */
export function prioridadeNumerica(p: PrioridadeDoPost): number {
  return p === "paga" ? 0 : 1;
}

/**
 * Ordena "pagas antes de selecionadas" (contrato §6, "ordem: pagas antes de
 * selecionadas"). Estável: dentro da MESMA prioridade, a ordem de chegada é
 * preservada — a régua decide QUEM primeiro, nunca EMBARALHA quem já estava
 * na fila.
 */
export function ordenarPagasAntesDeSelecionadas<T extends { prioridade: PrioridadeDoPost }>(
  itens: readonly T[],
): T[] {
  return itens
    .map((item, indice) => ({ item, indice }))
    .sort((a, b) => {
      const porPrioridade = prioridadeNumerica(a.item.prioridade) - prioridadeNumerica(b.item.prioridade);
      return porPrioridade !== 0 ? porPrioridade : a.indice - b.indice;
    })
    .map((x) => x.item);
}

// ─── A JANELA DE DUPLICADO (contrato §6.3) ──────────────────────────────────

/** Feed/carrossel: 7 dias. Story: 3 dias. Margem da casa — a Meta não pune
 *  "repetição" por data, pune padrão de conta (contrato §6.3, §12). */
export const JANELA_DUPLICADO_FEED_DIAS = 7;
export const JANELA_DUPLICADO_STORY_DIAS = 3;

/** O motivo INTERNO que atravessa a trava de duplicado quando o repost de
 *  vaga paga é quem está publicando de novo — nunca uma exceção sem rótulo
 *  (contrato §6.3). */
export const MOTIVO_REPOST_AUTORIZADO = "repost_vaga_paga_autorizado";

export function janelaDeDuplicadoEmDias(formato: FormatoDoPost): number {
  return formato === "story" ? JANELA_DUPLICADO_STORY_DIAS : JANELA_DUPLICADO_FEED_DIAS;
}

/**
 * A publicação anterior (mesma mídia sha256 + mesma legenda) ainda está
 * dentro da janela de duplicado? `true` = está dentro (bloquearia, salvo
 * exceção etiquetada).
 */
export function dentroDaJanelaDeDuplicado(
  publicadoEm: Date,
  agora: Date,
  formato: FormatoDoPost,
): boolean {
  const janelaMs = janelaDeDuplicadoEmDias(formato) * 24 * 60 * 60_000;
  // Distância nos DOIS sentidos (28/09/2026). A referência pode estar no
  // FUTURO: um post igual já agendado e ainda não publicado (`scheduledFor`
  // posterior a `agora`). Com `decorrido >= 0`, esse gêmeo agendado passava
  // pela trava e a mesma vaga ia ao ar duas vezes.
  const distancia = Math.abs(agora.getTime() - publicadoEm.getTime());
  return distancia < janelaMs;
}

// ─── O REPOST DE VAGA PAGA (contrato §6.4) ──────────────────────────────────

/**
 * Quantos dias o plano cobre — `Math.ceil` porque um plano que termina no
 * meio de um dia ainda cobre aquele dia inteiro (contrato: "validadePlano...
 * data-fim do plano pago"). Mínimo 1: um plano que já venceu no ato da
 * criação ainda cobre o dia em que foi criado.
 */
export function duracaoDoPlanoEmDias(criadoEm: Date, validadePlano: Date): number {
  const dias = Math.ceil((validadePlano.getTime() - criadoEm.getTime()) / (24 * 60 * 60_000));
  return Math.max(1, dias);
}

/**
 * O repost do dia `diaAtual` (1-based: o dia 1 é a publicação inicial) ainda
 * é elegível? Teto de repetições = duração do plano — NUNCA indefinido
 * (contrato §6.4, item 2).
 */
export function repostAindaElegivel(diaAtual: number, duracaoDoPlanoDias: number): boolean {
  return diaAtual >= 1 && diaAtual <= duracaoDoPlanoDias;
}

/**
 * A LEGENDA DO REPOST — NUNCA byte-idêntica à do dia anterior (contrato §6.4,
 * item 1: "variar algo visível, ex.: contador 'dia N de M'"). Determinística
 * por `diaAtual`/`totalDias`: o mesmo par sempre produz a MESMA legenda, para
 * uma reentrega/retomada não gerar um texto diferente do que já foi publicado.
 *
 * O contador entra SEMPRE, inclusive no dia 1 — é o que garante que o dia 1 e
 * o dia 2 nunca coincidem por acidente (a legenda base pode ser igual; o
 * contador nunca é).
 */
export function legendaDoRepost(legendaBase: string, diaAtual: number, totalDias: number): string {
  const base = legendaBase.trimEnd();
  return `${base}\n\nVaga aberta — dia ${diaAtual} de ${totalDias}.`;
}

/**
 * O horário do repost dentro da janela do dia, variando por dia — nunca no
 * mesmo minuto todo dia (contrato §6.4, item 3). Determinístico: hash de
 * `idExterno + diaAtual`, para o mesmo repost recalculado numa retomada cair
 * sempre no mesmo minuto (mesma técnica de `variacaoDeMinutos` em
 * `esteira/publicacao.ts` — reproduzível, nunca `Math.random`).
 *
 * Devolve minutos DESDE `inicioMin` (inclusive) até `fimMin` (inclusive).
 */
export function minutoDoRepostNaJanela(
  idExterno: string,
  diaAtual: number,
  inicioMin: number,
  fimMin: number,
): number {
  const chave = `${idExterno}#${diaAtual}`;
  let h = 0;
  for (let i = 0; i < chave.length; i++) h = (h * 31 + chave.charCodeAt(i)) >>> 0;
  const amplitude = Math.max(0, fimMin - inicioMin);
  return inicioMin + (amplitude === 0 ? 0 : h % (amplitude + 1));
}

/**
 * A legenda quando o City Jobs NÃO consegue variá-la automaticamente
 * (contrato §6.4, último parágrafo): a régua vira "1x a cada 2 dias" em vez
 * de diária, até existir variação. `legendaIdentica` compara BYTE A BYTE
 * (nunca ignora espaço/acento — é exatamente o tipo de diferença "invisível"
 * que separa uma legenda variada de uma repetida).
 */
export function legendaIdentica(a: string, b: string): boolean {
  return a === b;
}

/** O espaçamento mínimo entre reposts quando a legenda NÃO varia (contrato
 *  §6.4, último parágrafo) — 2 dias em vez de 1. */
export const ESPACAMENTO_SEM_VARIACAO_DIAS = 2;

// ─── O FEED: 2x/dia, 10h e 16h Brasília (contrato §6.2) ─────────────────────

export const HORARIOS_DE_FEED_BRASILIA = ["10:00", "16:00"] as const;
export const TETO_DE_FEED_POR_DIA = HORARIOS_DE_FEED_BRASILIA.length;

// ─── O TETO PLENO DO PLANO E A RAMPA (contrato §6.2) ────────────────────────

/** 15 stories + 2 feed = 17/dia — ~34% do teto de 50/24h da Meta (parecer
 *  `meta`, M4). Números de trabalho da MARCA City Jobs — outro cliente
 *  declara os seus próprios no pacote. */
export const TETO_PLENO_STORIES_CITYJOBS = 15;
export const TETO_PLENO_FEED_CITYJOBS = TETO_DE_FEED_POR_DIA;

/**
 * OS 4 DEGRAUS DA RAMPA DO CITY JOBS (parecer `meta`, M4 — margem da casa, a
 * Meta não publica número oficial de rampa de aquecimento). Formato pronto
 * para `Client.pacoteJson.stories.rampaDegraus`
 * (ver `lib/agency/esteira/pacote-da-marca.ts`):
 *
 *   dias 1–7 → 3/dia · dias 8–14 → 6/dia · dias 15–21 → 10/dia · 22+ → pleno
 *   (o "22+" é o `stories.porDiaMax` do próprio pacote — não entra na lista
 *   de degraus, é o fallback natural de `tetoDeStoriesDoDia` depois deles).
 */
export const RAMPA_DE_STORIES_CITYJOBS: ReadonlyArray<{ ateDias: number; teto: number }> = [
  { ateDias: 7, teto: 3 },
  { ateDias: 14, teto: 6 },
  { ateDias: 21, teto: 10 },
];

// ─── A FILA DO DIA: "PAGAS ANTES DE SELECIONADAS" (contrato §6.2/§6) ────────
//
// O contrato lista a ordem como regra, sem dar o algoritmo. A leitura desta
// ficha: quando o dia está cheio (`tetoPorDia` ocupado), uma peça PAGA que
// chega depois pode tomar o lugar da peça SELECIONADA mais antiga daquele
// dia — que é EMPURRADA (nunca descartada) para o próximo dia com vaga. Uma
// peça SELECIONADA nova nunca empurra ninguém: ela só ocupa vaga livre.
//
// Função PURA — opera sobre um mapa já montado (dia → ocupantes), nunca toca
// banco. Isso é o que a torna provável sem simular calendário nenhum.

export interface OcupanteDoDia {
  /** Chave estável do ocupante (ex.: `SocialPost.id`) — o que a orquestração
   *  usa para saber QUEM empurrar. */
  id: string;
  prioridade: PrioridadeDoPost;
  /** Quando este ocupante entrou na fila — desempate entre vários do mesmo
   *  dia e prioridade: o mais ANTIGO é o candidato a ser empurrado primeiro. */
  criadoEm: Date;
}

export interface DecisaoDeSlot {
  /** Índice do dia (0 = o dia inicial da busca, 1 = o seguinte, ...). */
  diaIndice: number;
  /** O ocupante que precisou ser empurrado para abrir vaga — `undefined`
   *  quando a vaga já estava livre. */
  empurrado?: OcupanteDoDia;
}

/**
 * Encontra o PRIMEIRO dia (a partir de `diaIndiceInicial`) com vaga para um
 * post de `prioridade`, dado o mapa de ocupação (`diaIndice → ocupantes`) e o
 * teto por dia. `horizonteDeDias` é o teto de busca — nunca varre para
 * sempre; esgotado, devolve o próprio horizonte (o chamador decide o que
 * fazer com um dia "fora do calendário pesquisado").
 */
export function proximoSlotDoDia(a: {
  ocupacaoPorDia: ReadonlyMap<number, readonly OcupanteDoDia[]>;
  prioridade: PrioridadeDoPost;
  tetoPorDia: number;
  diaIndiceInicial: number;
  horizonteDeDias?: number;
}): DecisaoDeSlot {
  const horizonte = a.horizonteDeDias ?? 60;
  for (let dia = a.diaIndiceInicial; dia < a.diaIndiceInicial + horizonte; dia++) {
    const ocupantes = a.ocupacaoPorDia.get(dia) ?? [];
    if (ocupantes.length < a.tetoPorDia) {
      return { diaIndice: dia };
    }
    if (a.prioridade === "paga") {
      // Só uma peça PAGA empurra — e só a SELECIONADA mais antiga do dia.
      const selecionadas = ocupantes
        .filter((o) => o.prioridade === "selecionada")
        .sort((x, y) => x.criadoEm.getTime() - y.criadoEm.getTime());
      if (selecionadas.length > 0) {
        return { diaIndice: dia, empurrado: selecionadas[0] };
      }
    }
  }
  // Horizonte esgotado: devolve o dia seguinte ao horizonte pesquisado, sem
  // empurrar ninguém — o chamador decide (na prática, hoje, isto não
  // deveria acontecer com um teto de 2/dia e um horizonte de 60 dias).
  return { diaIndice: a.diaIndiceInicial + horizonte };
}
