// PROVEDOR SEM SALDO SAI DA FILA — porta fechada não é soluço.
//
// ═══ O DEFEITO MEDIDO EM PRODUÇÃO (27/08/2026) ══════════════════════════════
//
// Log do Railway, `deployment 271e3e59`, a cada ~5 minutos, das 13:38 às 15:48
// sem uma única falha, 27 batidas idênticas:
//
//   [generate] claude (Claude HTTP 400: {"type":"error","error":{"type":
//   "invalid_request_error","message":"Your credit balance is too low to
//   access the Anthropic API..."}}) falhou — entregue por openai (gpt-4o)
//
// A conta da Anthropic está zerada, e a casa SABE: `classificarFalhaDeProvedor`
// lê essa frase e devolve `sem_saldo` desde 24/08. O alarme do despertador
// grita sobre ela de 5 em 5 minutos. E mesmo assim `preferenceOrder()` continua
// entregando `claude` como PRIMEIRO da fila em toda chamada, para sempre.
//
// O que a casa tinha e o que faltava:
//
//   • `isTransientError` (`generate.ts`) acerta em NÃO repetir o 400 dentro da
//     mesma chamada — falta de saldo não melhora em 600ms.
//   • O que não existia era MEMÓRIA ENTRE CHAMADAS. Cada chamada nova
//     recomeçava do zero, batia na mesma porta fechada, pagava a latência,
//     gravava mais uma linha `error` e só então caía para quem tem saldo.
//
// ═══ AS DUAS CONSEQUÊNCIAS, E A SEGUNDA É PIOR ══════════════════════════════
//
//   1. A fila escorrega na direção errada: cai para quem NÃO tem saldo antes de
//      cair para quem tem. No caminho do árbitro isso é fatal — a fila dele tem
//      3 nomes e um deles está morto, então a chance de ficar sem juiz sobe, e
//      pacote sem juiz FICA RETIDO. A Qualidade não audita.
//   2. O erro repetido a cada 5 min vira ruído. Alarme que grita sobre o normal
//      ensina a ignorar alarme — e este grita sobre o QUEBRADO, que é pior:
//      acostuma a casa a ver `error` no diário e não olhar.
//
// ═══ POR QUE TERMINAL É DIFERENTE DE TRANSITÓRIO ════════════════════════════
//
//   • TRANSITÓRIO (429, corpo vazio, JSON quebrado, timeout, 5xx) → o tempo
//     conserta. Vale outra tentativa, vale outra volta na fila.
//   • TERMINAL (sem saldo, chave inválida, sem permissão) → o tempo NÃO
//     conserta. Só uma pessoa conserta, e insistir é pagar latência para
//     receber a mesma recusa. O provedor sai da fila até alguém agir.
//
// ═══ POR QUE A PORTA REABRE SOZINHA ═════════════════════════════════════════
//
// `TEMPO_FORA_DE_JOGO_MS` existe para o caso bom: o CEO põe crédito na conta e
// a casa volta a usar o provedor preferido SEM precisar de deploy. Banir para
// sempre trocaria um defeito por outro — a casa serviria pela reserva, mais
// cara e pior, muito depois de a conta ter sido recarregada.
//
// ═══ O QUE ISTO **NÃO** AFROUXA ═════════════════════════════════════════════
//
// ⚠️ A independência do árbitro NÃO passa por aqui. Quem garante que o juiz
// nunca é o autor é `filaDeArbitros` (`quality-auditor.ts`), que remove o autor
// ANTES de qualquer coisa. Este módulo só sabe TIRAR nomes de uma fila; ele não
// tem como acrescentar nenhum, e muito menos o autor. Ver a prova em
// `__tests__/ai/provedor-sem-saldo-sai-da-fila.test.ts`.
//
// Memória de PROCESSO, de propósito: o custo de um `sem_saldo` esquecido num
// reinício é uma chamada perdida, e a leitura durável de verdade — a que
// atravessa deploy — já existe em `provedoresCaidos`, que lê o `AIRunLog`.

import { classificarFalhaDeProvedor, ROTULO_DA_FALHA, type MotivoDaFalha } from "./motivo-da-falha";

/**
 * Os motivos que o TEMPO NÃO CONSERTA. Insistir neles é pagar latência para
 * ouvir a mesma recusa — e, no caminho do árbitro, é gastar a fila de juízes.
 */
export type MotivoTerminal = Extract<MotivoDaFalha, "sem_saldo" | "sem_chave">;

/** Quanto tempo um provedor fica fora antes de a casa tentar de novo.
 *  Curto de propósito: recarga de crédito tem de voltar a valer sem deploy. */
export const TEMPO_FORA_DE_JOGO_MS = 20 * 60_000;

/**
 * Esta falha é TERMINAL para este provedor? Devolve o motivo, ou `null`.
 *
 * Lê a MENSAGEM, nunca o status: a doutrina desta casa custou uma investigação
 * inteira para aprender que a Anthropic devolve **HTTP 400** para falta de
 * saldo — o mesmo status de um corpo malformado. Ver `falha-de-provedor.ts`.
 */
export function motivoTerminal(mensagem: string | null | undefined): MotivoTerminal | null {
  const c = classificarFalhaDeProvedor(mensagem);
  return c === "sem_saldo" || c === "sem_chave" ? c : null;
}

/** Açúcar de leitura para os `if` de quem só quer saber "vale insistir?". */
export function eFalhaTerminal(mensagem: string | null | undefined): boolean {
  return motivoTerminal(mensagem) !== null;
}

export type ForaDeJogo = {
  provider: string;
  motivo: MotivoTerminal;
  /** O texto do provedor. É a PROVA; o rótulo é a interpretação. */
  mensagem: string;
  /** Quando este provedor saiu da fila. */
  desde: number;
  /** Quantas vezes a casa bateu na porta fechada desde então. */
  quantas: number;
};

const fora = new Map<string, ForaDeJogo>();

/**
 * Registra uma falha. Se ela for TERMINAL, o provedor sai da fila e o motivo
 * fica guardado — é ele que a fila esgotada vai citar depois.
 *
 * Devolve o motivo quando tirou alguém da fila; `null` quando a falha era
 * passageira e nada mudou. Chamar com qualquer erro é seguro e é o uso
 * pretendido: quem chama não precisa classificar nada.
 */
export function marcarForaDeJogo(
  provider: string,
  mensagem: string | null | undefined,
  agora: number = Date.now(),
): MotivoTerminal | null {
  const motivo = motivoTerminal(mensagem);
  if (!motivo) return null;
  const anterior = fora.get(provider);
  // `desde` do primeiro: é o que responde "está quebrado há quanto tempo?",
  // e essa é justamente a pergunta que separa soluço de porta fechada.
  fora.set(provider, {
    provider,
    motivo,
    mensagem: (mensagem ?? "").slice(0, 300),
    desde: anterior && anterior.motivo === motivo ? anterior.desde : agora,
    quantas: anterior && anterior.motivo === motivo ? anterior.quantas + 1 : 1,
  });
  return motivo;
}

/**
 * Este provedor está fora da fila AGORA? `null` = está de pé, ou já cumpriu o
 * tempo e merece nova chance.
 */
export function provedorForaDeJogo(provider: string, agora: number = Date.now()): ForaDeJogo | null {
  const r = fora.get(provider);
  if (!r) return null;
  if (agora - r.desde >= TEMPO_FORA_DE_JOGO_MS) {
    fora.delete(provider);
    return null;
  }
  return r;
}

/**
 * O provedor respondeu — está vivo. Apaga o registro na hora.
 *
 * Isto é o que faz a recarga de crédito valer no ato: bastou UMA chamada boa
 * para o provedor voltar ao topo da fila, sem esperar `TEMPO_FORA_DE_JOGO_MS`.
 */
export function limparForaDeJogo(provider: string): void {
  fora.delete(provider);
}

/** Só para teste: a memória é de processo e não pode vazar de um caso a outro. */
export function esquecerProvedoresForaDeJogo(): void {
  fora.clear();
}

/** Quem está fora da fila agora — para painel e alarme, não para decisão. */
export function provedoresForaDeJogo(agora: number = Date.now()): ForaDeJogo[] {
  return [...fora.keys()]
    .map((p) => provedorForaDeJogo(p, agora))
    .filter((x): x is ForaDeJogo => x !== null);
}

/**
 * Tira da fila quem está fora de jogo, PRESERVANDO A ORDEM do que sobra.
 *
 * ⚠️ Esta função só REMOVE. Ela nunca acrescenta um nome, o que é a razão de a
 * independência do árbitro continuar de pé: se o autor não estava na fila que
 * entrou, ele não pode estar na que sai.
 *
 * E ela NÃO tem cláusula de escape "se esvaziou, devolve tudo". Fila vazia é
 * uma resposta legítima e é a resposta CERTA: bater numa porta que a casa
 * acabou de ver fechada não produz entrega nenhuma, só custo e mais uma linha
 * de erro no diário. Quem chama para com o motivo real — que vem em `barrados`.
 */
export function filtrarForaDeJogo<T extends string>(
  ordem: readonly T[],
  agora: number = Date.now(),
): { fila: T[]; barrados: ForaDeJogo[] } {
  const fila: T[] = [];
  const barrados: ForaDeJogo[] = [];
  for (const p of ordem) {
    const r = provedorForaDeJogo(p, agora);
    if (r) barrados.push(r);
    else fila.push(p);
  }
  return { fila, barrados };
}

/**
 * O MOTIVO REAL, em uma frase, para a fila que esgotou.
 *
 * *Status de erro não é motivo; o motivo está na mensagem.* `provider_error` e
 * `IA indisponível` mandam o dono investigar um provedor que está de pé e
 * apenas não foi pago — foi exatamente o que custou a volta de 26/08.
 */
export function porQueEstaFora(r: ForaDeJogo): string {
  return `${r.provider}: ${ROTULO_DA_FALHA[r.motivo]}`;
}
