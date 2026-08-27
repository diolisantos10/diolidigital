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

// ⚠️⚠️ NENHUM `import` DE BANCO NESTE ARQUIVO — NEM ESTÁTICO, NEM DINÂMICO.
//
// ── E ISTO FOI MEDIDO, NÃO SUPOSTO (27/08/2026) ────────────────────────────
//
// A primeira versão deste módulo fazia a leitura do banco aqui, com um
// `await import("@/lib/db/client")` dentro da função — dinâmico, justamente
// para "não arrastar o Prisma". **Não bastou, e o BUILD DE PRODUÇÃO reprovou:**
//
//   #5 [Client Component Browser]:
//     ./lib/db/client.ts
//     ./lib/agency/comercial/parceria-declarada.ts
//     ./lib/agency/question-engine.ts
//     ./lib/agency/sdr-agent.ts
//     ./components/agency/briefing/PublicBriefingRoom.tsx
//     ./app/briefing/page.tsx
//
// `question-engine` é o coração do briefing e roda **no NAVEGADOR** — a sala
// pública é um client component. O empacotador segue o import dinâmico do mesmo
// jeito, e o cliente Prisma inteiro ia junto para o browser.
//
// `tsc --noEmit` passou. Os 7.290 testes passaram. **Quem pegou foi o `npm run
// build` do CI** — que é exatamente o que o comentário do workflow diz que ele
// existe para pegar: *"CI que não roda o build não protege o deploy — protege o
// editor."*
//
// Por isso a régua PURA mora aqui e a LEITURA mora em `parceria-do-cliente.ts`,
// que só o servidor importa. É a mesma separação de `motivo-da-falha.ts` x
// `falha-de-provedor.ts`, feita hoje de manhã — e aqui ela não é higiene, é
// condição de o site compilar.

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
