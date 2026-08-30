// AS QUATRO DECISÕES DO CLIENTE — o contrato da V2, num lugar só.
//
// Marco 5. `03-ESTEIRA-E-HANDOFFS`: "Toda entrega admite quatro decisões:
// aprovar · pedir ajustes · recusar/refazer · cancelar. Recusar e cancelar
// nunca apagam versões anteriores." A rota e a tela importam DAQUI — duas
// cópias da mesma tabela é como uma decisão passa a existir só de um lado.

import type { ApprovalStatus } from "@/lib/agency/persistence/approval-service";

/** Ação do portal → status gravado. */
export const DECISAO_PARA_STATUS: Record<string, ApprovalStatus> = {
  approve:          "approved",
  request_revision: "revision_requested",
  reject:           "rejected",
  cancel:           "cancelled",
};

/** "Tenho uma dúvida" NÃO é decisão: status permanece pending, prazo pausa. */
export const ACAO_DUVIDA = "question";

/**
 * Sem as palavras do cliente, a refação refaz no escuro e o cancelamento fica
 * sem ressalva — e ressalva com auditoria é a letra da V2 para o cancelar.
 */
export const DECISOES_QUE_EXIGEM_COMENTARIO: ReadonlySet<string> = new Set([
  "request_revision",
  "reject",
  "cancel",
  ACAO_DUVIDA,
]);

/** O estado canônico em que cada decisão põe a entrega (mapa do Marco 1). */
export const DECISAO_PARA_ESTADO_CANONICO: Record<string, string> = {
  approve:          "implementation",
  request_revision: "revision",
  reject:           "revision",
  cancel:           "cancelled",
};

/**
 * O estado da PEÇA quando o cliente RECUSA.
 *
 * Mora aqui, e não em `refacao.ts`, por dois motivos: é parte do contrato das
 * quatro decisões (é o efeito de uma delas), e este módulo é PURO — a rota do
 * portal pode lê-lo sem arrastar o motor de refação, com IA e Prisma dentro,
 * para o pacote de uma requisição que só grava um status.
 *
 * ── Por que um estado próprio (25/08/2026) ─────────────────────────────────
 * Até esta data a peça recusada virava "revision_requested" — "em ajuste", que
 * quer dizer "alguém está refazendo isto". Era mentira: ninguém estava, e o
 * cliente tinha dito NÃO. Estado que mente é pior que estado ausente, porque
 * ninguém vai conferir.
 *
 * `rejected` é TERMINAL para a máquina: `publicarAgendados` só lê "scheduled" e
 * `ESTADOS_EXAMINAVEIS` (cards-de-aprovacao) não o inclui — a peça não vai ao
 * ar e não volta a ser oferecida para decisão sozinha. Quem a ressuscita é
 * gente, depois de falar com o cliente.
 */
export const STATUS_DA_PECA_RECUSADA = "rejected";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE A TELA PODE PROMETER SOBRE A RECUSA — e por que ela mentia
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── O DEFEITO, MEDIDO NO PILOTO (26/08/2026) ──────────────────────────────
 *
 * A recusa é TERMINAL por desenho, e está certo assim: `STATUS_DA_PECA_RECUSADA
 * = "rejected"` sai do caminho do relógio, `recusarPorPedidoDoCliente` NÃO
 * chama IA nenhuma, e a próxima ação registrada é *"falar com o cliente e
 * decidir se refaz com direção nova, se muda o escopo ou se devolve"*. Nada
 * refaz sozinho — de propósito.
 *
 * E a tela dizia, em três lugares, o contrário:
 *
 *   • o botão:        "Recusar e pedir refação"
 *   • o campo:        "A equipe refaz do zero a partir da sua justificativa."
 *   • o aviso vazio:  "Conte o que desalinhou — a equipe refaz a partir da sua
 *                      justificativa."
 *
 * O cliente clicava esperando uma peça nova e recebia uma conversa. **Prompt é
 * aviso; código é trava — e o aviso não pode prometer o que a trava não faz.**
 * A trava aqui está certa: quem estava errado era o aviso.
 *
 * ── POR QUE O CONSERTO É NA MENSAGEM, E NÃO NA MÁQUINA ────────────────────
 *
 * Fazer a recusa refazer automaticamente é exatamente o defeito que a casa
 * consertou em 25/08/2026: *"o cliente apertava 'recusar' e a máquina respondia
 * então faça de novo"*, devolvendo para ele decidir outra vez sobre uma peça
 * que ele já tinha dito que não servia, sem ninguém da equipe saber do não.
 * Quem quer outra versão da mesma peça tem o botão de AJUSTE, que refaz de
 * verdade. Recusar é dizer "isto não serve" — e a resposta honesta a isso é
 * gente.
 *
 * ── AS FRASES MORAM AQUI, E NÃO NA TELA ───────────────────────────────────
 *
 * Pelo mesmo motivo que `STATUS_DA_PECA_RECUSADA`: elas são o efeito de uma das
 * quatro decisões. Na tela, elas seriam três literais soltos que ninguém
 * consegue medir — e foi assim que as três divergiram do código ao mesmo tempo.
 * Aqui, um teste lê a mesma constante que o cliente lê.
 */
export const TEXTOS_DA_RECUSA = {
  /** O que o botão discreto do card diz. */
  botao: "Recusar esta entrega",
  /** O título do campo de justificativa. */
  titulo: "Por que esta entrega não serve?",
  /** O texto de exemplo dentro do campo. */
  exemplo:
    "O que saiu do combinado? Nada é publicado e nada é refeito automaticamente — " +
    "alguém da equipe fala com você antes de qualquer peça nova.",
  /** O que aparece quando ele tenta recusar sem escrever nada. */
  avisoSemTexto:
    "Escreva o que não serviu — é com isso que a equipe vai falar com você. Recusa muda não é recusa.",
  /** A nota abaixo do campo. Motivo, dono e próxima ação, como toda parada. */
  nota:
    "Recusar PARA esta entrega: ela não vai ao ar e a máquina não tenta de novo sozinha. " +
    "Quem assume: a equipe de atendimento. Próxima ação: falar com você para acertar a direção " +
    "antes de qualquer peça nova. Nenhuma versão é apagada. " +
    "Se o que você quer é a MESMA peça corrigida, use “Pedir ajuste” — esse sim refaz na hora.",
} as const;
