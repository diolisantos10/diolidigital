// prazo-de-aprovacao.ts — O PRAZO SAI DO DOCUMENTO E VIRA NÚMERO EXECUTÁVEL.
//
// ── O defeito, medido contra o código em 15/08/2026 ─────────────────────────
//
// `docs/precos.md` (linha 110) diz, com todas as letras, o que a agência vendeu:
//
//     "Ajustes: 2 rodadas por peça (3 a partir do Conteúdo). **Aprovação em até
//      2 dias úteis**; passado isso a peça segue para a data agendada."
//
// Esse "2 dias úteis" **não existia em lugar nenhum do código**. Buscando
// `expiresAt` no repositório: `createApprovalRequest` ACEITA o campo, e de dez
// chamadores **nove não o passam** — só `app/api/social-posts/aprovacao` passa,
// e mesmo assim só quando quem chama a rota digita a data no corpo do pedido.
//
// A consequência é o pior tipo de alarme: o que existe e nunca toca.
// `lib/raio-x/dados.ts:150` conta `approvalRequest` com `expiresAt: { lt: agora }`
// — e o card que a própria esteira abre nasce com `expiresAt` NULO. **Esse
// contador é zero por construção**, não por saúde. E `aprovacao-parada.ts`
// segurava um horizonte próprio de 3 dias CORRIDOS, que não é o que foi vendido.
//
// Três réguas para a mesma pergunta, e a que valia comercialmente era a única
// que não estava escrita em código.
//
// ── POR QUE ISTO É DERIVAÇÃO, E NÃO ESCRITA ────────────────────────────────
//
// A correção óbvia seria carimbar `expiresAt` em todo card novo. Ela está
// ERRADA como primeiro passo, por dois motivos:
//
//   1. **Carimbar prazo muda o que o cliente vê hoje.** `AprovacoesDoCliente`
//      anuncia "O prazo venceu em <data>" quando há `expiresAt` — carimbar em
//      massa faria aparecer prazo vencido em card que nunca teve prazo, para
//      cliente que já está no portal. Isso é comunicação com cliente, e
//      comunicação com cliente não sai de um efeito colateral de refatoração.
//   2. **Prazo derivado é reversível; prazo gravado, não.** Enquanto a régua for
//      uma função pura lida na varredura, mudar de 2 para 3 dias é trocar uma
//      constante. Depois de gravado em milhares de linhas, é migration.
//
// Então: a régua mora aqui, **ninguém a grava**, e quem varre a lê. O dia em que
// o CEO mandar carimbar, o carimbo usa esta MESMA função — uma implementação,
// não duas.
//
// ── O QUE ESTE ARQUIVO NÃO FAZ ─────────────────────────────────────────────
//
// Não lê banco, não escreve banco, não conhece feriado. **Feriado é ausência de
// informação**, e a lei da casa manda declarar a ausência em vez de preencher
// por inferência: um calendário de feriados inventado daria ao cliente um dia a
// mais ou a menos com cara de certeza. Sábado e domingo são fato de calendário;
// feriado é dado que a casa não tem.

/** O prazo vendido, em DIAS ÚTEIS. Fonte: `docs/precos.md` — "Aprovação em até
 *  2 dias úteis". Trocar este número é mudar o contrato, não ajustar código. */
export const PRAZO_DE_APROVACAO_EM_DIAS_UTEIS = 2;

/** O documento de onde o número veio. Vai junto no relato para ninguém ter de
 *  perguntar de onde saiu a régua. */
export const FONTE_DO_PRAZO = "docs/precos.md — \"Aprovação em até 2 dias úteis\"";

/** ⚠️ Feriado NÃO entra na conta. Declarado aqui porque uma ausência silenciosa
 *  seria lida como cobertura. Ver o cabeçalho. */
export const FERIADOS_NAO_CONTAM = true;

const UM_DIA_MS = 86_400_000;

function ehFimDeSemana(d: Date): boolean {
  const dia = d.getUTCDay();
  return dia === 0 || dia === 6;
}

/**
 * A data-limite de um card aberto em `abertoEm`, contando apenas dias úteis.
 *
 * A contagem avança o relógio **dia a dia** e só decrementa em dia útil, o que
 * mantém a hora de abertura: card aberto sexta às 14h vence terça às 14h, e não
 * "terça de madrugada". Zerar a hora daria ao cliente até 14 horas a menos do
 * que foi vendido, sempre contra ele.
 */
export function prazoDeAprovacao(
  abertoEm: Date,
  diasUteis: number = PRAZO_DE_APROVACAO_EM_DIAS_UTEIS,
): Date {
  // Prazo de zero (ou negativo) dia útil venceria no instante da abertura — o
  // cliente estaria atrasado antes de ver a peça. Recusar é melhor que produzir
  // uma cobrança injusta em silêncio.
  const passos = Math.max(1, Math.floor(diasUteis));
  const d = new Date(abertoEm.getTime());
  let restantes = passos;
  // Teto de segurança: sem ele, uma data inválida rodaria para sempre dentro do
  // relógio da casa.
  let voltas = 0;
  while (restantes > 0 && voltas < passos * 10 + 14) {
    d.setTime(d.getTime() + UM_DIA_MS);
    voltas++;
    if (!ehFimDeSemana(d)) restantes--;
  }
  return d;
}

export interface LeituraDoPrazo {
  /** A data-limite que vale para este card. */
  vence: Date;
  /** `true` quando `agora` já passou de `vence`. */
  venceu: boolean;
  /** De onde saiu a data: o card tinha prazo próprio, ou a régua do contrato
   *  foi aplicada. Nunca se apresenta prazo derivado como se fosse acordado. */
  origem: "prazo_do_card" | "regra_do_contrato";
  /** A frase que a tela e o relato usam. Em português, sempre. */
  explicacao: string;
}

/**
 * O prazo que vale para UM card — com a procedência declarada.
 *
 * `expiresAt` do próprio card vence a régua: se alguém acordou uma data com o
 * cliente, é ela que manda. Só na ausência dela a régua do contrato entra, e
 * quando entra ela **diz que entrou** (`origem: "regra_do_contrato"`).
 *
 * ⚠️ **Dúvida aberta pausa o relógio e isto NÃO é tratado aqui de propósito.**
 * Quem sabe disso é `aprovacao-parada.ts` (`bolaConosco`), e é ele que decide
 * não cobrar. Duplicar a regra aqui criaria a segunda verdade que esta casa já
 * pagou caro — e a versão errada cobraria o cliente pelo atraso da agência.
 */
export function lerPrazoDoCard(
  card: { abertoEm: Date; expiresAt?: Date | null },
  agora: Date,
): LeituraDoPrazo {
  if (card.expiresAt) {
    const venceu = card.expiresAt.getTime() < agora.getTime();
    return {
      vence: card.expiresAt,
      venceu,
      origem: "prazo_do_card",
      explicacao: venceu
        ? "o prazo combinado neste card já passou"
        : "o prazo combinado neste card ainda está correndo",
    };
  }
  const vence = prazoDeAprovacao(card.abertoEm);
  const venceu = vence.getTime() < agora.getTime();
  return {
    vence,
    venceu,
    origem: "regra_do_contrato",
    explicacao: venceu
      ? `este card não tem prazo próprio; pela régua da casa (${PRAZO_DE_APROVACAO_EM_DIAS_UTEIS} dias úteis, ${FONTE_DO_PRAZO}) ele já venceu`
      : `este card não tem prazo próprio; pela régua da casa (${PRAZO_DE_APROVACAO_EM_DIAS_UTEIS} dias úteis, ${FONTE_DO_PRAZO}) ele ainda está no prazo`,
  };
}
