// A PARCERIA É UM FATO DECLARADO — nunca uma leitura do que o cliente escreveu.
//
// ═══ O DEFEITO QUE ORIGINOU ESTE ARQUIVO (27/08/2026) ═══════════════════════
//
// Medido em produção às 13:43. O interlocutor do primeiro cliente real escreveu:
//
//   "somos um SaaS de CRM que vende para restaurantes, queremos Instagram"
//
// E o SDR respondeu perguntando **quanto ele pretende investir por mês**. A
// conversa parou ali, com a pergunta em aberto. Nenhum pedido nasceu e nenhum
// orçamento foi enviado — e a pergunta do CEO ("por que o orçamento não chegou
// no e-mail?") tem exatamente essa resposta.
//
// ── O defeito é de DESENHO, não de fala ────────────────────────────────────
//
// `budget_range` é pergunta OBRIGATÓRIA desde 23/08, e por um motivo bom, que
// está escrito em `question-engine.ts`: *sem verba a casa MANDA PREÇO ERRADO*.
// Foi o estrago de R$ 4.500–7.700/mês cotados a quem tinha R$ 500/mês.
//
// Só que esse motivo **evapora para quem entra por parceria**: o parceiro não
// paga nada (D-0B9/D-0C2), nenhum preço vai ser mandado a ele, e não há degrau
// a escolher. A casa estava exigindo de um parceiro exatamente o dado que a
// parceria torna irrelevante — e, por ser obrigatório, esse dado travava o
// nascimento do pedido. Pergunta sem propósito que bloqueia é pior que pergunta
// inútil: ela cobra um preço real por nada.
//
// ═══ POR QUE UM FATO DECLARADO, E NUNCA UMA DEDUÇÃO ═════════════════════════
//
// ⚠️ A tentação óbvia é deixar o modelo perceber a parceria pela conversa. Isso
// seria abrir a maior porta desta casa com a chave mais fraca que ela tem: quem
// escreve "somos parceiros de vocês" deixaria de ser perguntado sobre verba, e
// a régua que existe para não mandar preço errado cairia por uma frase digitada
// por qualquer visitante.
//
// A parceria é o que `IsencaoDeParceria` já diz que ela é: **autorizada por
// alguém, com nome, e com data de validade**. Sem esse registro, a casa NÃO
// SABE que é parceria — e *ausência de informação não é informação*: continua
// perguntando a verba, como sempre perguntou.
//
// ═══ O QUE ISTO NÃO AFROUXA ═════════════════════════════════════════════════
//
// Para cliente PAGANTE nada muda: a verba continua obrigatória e o portão de
// envio continua fechado sem ela. É ela que escolhe o degrau, e mandar preço a
// quem nunca foi perguntado quanto pode gastar continua proibido.

// ⚠️ NENHUM `import` DE BANCO NO TOPO, E ISSO É REQUISITO — a lição de hoje de
// manhã, uma camada adiante. `question-engine.ts` importa a régua daqui
// (`parceriaVale`) e é o coração do briefing: arrastar o cliente Prisma para
// dentro dele pelo topo deste arquivo poria o banco no caminho de toda
// pergunta, e em todo teste de conversa que nunca precisou de banco nenhum.
//
// A régua é pura; só a LEITURA precisa do banco, e ela o carrega quando é
// chamada — o mesmo molde que `despertador.ts` já usa.

/**
 * O fato, como a casa o registrou. Os dois campos existem porque os dois
 * respondem perguntas que alguém vai fazer daqui a seis meses: **quem liberou**
 * e **até quando**. Parceria sem dono é buraco; parceria eterna é esquecimento.
 */
export type ParceriaDeclarada = {
  autorizadaPor: string;
  validaAte: Date;
};

/**
 * A parceria está declarada E ainda vale?
 *
 * Vencida é o MESMO que inexistente — de propósito. Uma isenção que passou da
 * validade e continuasse valendo seria uma parceria eterna com cara de
 * controlada, que é o pior dos dois mundos: o registro dá a sensação de que
 * alguém está olhando, e ninguém está.
 */
export function parceriaVale(
  p: ParceriaDeclarada | null | undefined,
  agora: Date = new Date(),
): boolean {
  if (!p) return false;
  return p.validaAte.getTime() >= agora.getTime();
}

/**
 * A parceria DECLARADA deste cliente, se houver uma válida.
 *
 * Lê `IsencaoDeParceria` — a tabela que já é a verdade da casa sobre quem não
 * paga. Não cria nada, não deduz nada e não aceita nada vindo do corpo da
 * requisição: quem chama passa um `clientId` que o SERVIDOR derivou.
 *
 * ⚠️ `clientId` ausente devolve `null`, e isso é a resposta certa, não uma
 * falha: um visitante anônimo na sala de briefing não tem como ser reconhecido
 * como parceiro, e fingir que tem seria adivinhar. Ver o bloco "o que continua
 * aberto" no topo do teste desta frente.
 */
export async function parceriaDoCliente(
  clientId: string | null | undefined,
  agora: Date = new Date(),
): Promise<ParceriaDeclarada | null> {
  const id = (clientId ?? "").trim();
  if (!id) return null;
  try {
    const { prisma } = await import("@/lib/db/client");
    const linha = await prisma.isencaoDeParceria.findFirst({
      where: { clientId: id, validaAte: { gte: agora } },
      orderBy: { validaAte: "desc" },
      select: { autorizadaPor: true, validaAte: true },
    });
    if (!linha) return null;
    const p = { autorizadaPor: linha.autorizadaPor, validaAte: linha.validaAte };
    // Confere a validade DE NOVO, em código, e não só no `where`. A consulta
    // pode mudar amanhã; a régua de "vencida não vale" é desta camada.
    return parceriaVale(p, agora) ? p : null;
  } catch {
    // ── FAIL-CLOSED, E ESTE `catch` É A METADE QUE IMPORTA ─────────────────
    // Banco fora do ar devolve "não sei se é parceria" — e "não sei" tem de
    // significar **continua perguntando a verba**, nunca "trata como parceiro".
    // Um erro de leitura que dispensasse a pergunta transformaria uma queda de
    // banco em porta aberta para todo visitante.
    return null;
  }
}
