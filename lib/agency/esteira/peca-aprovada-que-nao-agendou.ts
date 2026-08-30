// peca-aprovada-que-nao-agendou.ts — A PARADA MAIS CARA DA CASA, DECLARADA.
//
// ═══════════════════════════════════════════════════════════════════════════
// O DEFEITO (Auditor, 5ª rodada, 25/08/2026) — item F
// ═══════════════════════════════════════════════════════════════════════════
//
// `agendarPecasAprovadas` já devolvia `ignorados` — as peças que o cliente
// aprovou e que a promoção NÃO tocou, com o estado em que ficaram. O campo
// existia justamente para que isso não fosse silêncio.
//
// E o que a rota do portal fazia com ele era **uma linha de log**:
//
//     console.error("[portal/approvals] peças aprovadas NÃO agendadas:", …)
//
// Nada no estado. Nada para o PM. Nada para o cliente. Pior: o log do teste
// VERDE do ajuste imprimia exatamente esse defeito —
// `…=revision_requested, …` — e o teste passava por cima. Régua verde sobre
// o componente errado, dentro da suíte que devia proteger o cliente.
//
// O critério F exige, com estas palavras: *"toda parada mostra motivo, dono e
// próxima ação"*. **`console.error` não é parada declarada** — é a casa
// falando sozinha, num terminal que ninguém abre.
//
// ═══════════════════════════════════════════════════════════════════════════
// O QUE "DECLARADA" QUER DIZER AQUI — TRÊS DESTINATÁRIOS, TRÊS REGISTROS
// ═══════════════════════════════════════════════════════════════════════════
//
//   1. **A PEÇA** — `avisoAoCliente` gravado nela. É o que vira PIXEL na tela
//      de decisão (`montarPecas` → `PecaDoCard`). Sem isto o aviso repetiria a
//      história do "sem árbitro": certo na coluna, invisível para quem paga.
//   2. **O PM** — um `ActivityEvent` do tipo `peca_aprovada_nao_agendada`, com
//      a peça, o estado em que ela travou e a próxima ação. É por onde uma
//      pessoa descobre HOJE, e não no fechamento do mês.
//   3. **O CLIENTE** — uma `PortalMessage`, na língua dele, dizendo que ele
//      aprovou e que a entrega daquela peça ainda não entrou na fila.
//
// Nenhum dos três pode derrubar a resposta ao clique do cliente: ele aprovou, e
// a aprovação vale. Por isso tudo aqui é best-effort DECLARADO — mas o que
// falha em silêncio é o registro, nunca a parada.

import { prisma } from "@/lib/db/client";

import { VOZ_DO_CLIENTE } from "@/lib/agency/gerencia/voz-unica";
/** O estado em que a peça travou → o que isso quer dizer para uma pessoa. */
function oQueEsseEstadoQuerDizer(status: string): string {
  switch (status) {
    case "revision_requested":
      return "ela está marcada como 'em ajuste' — algum pedido de mudança anterior não foi fechado";
    case "rejected":
      return "ela está marcada como RECUSADA — uma recusa anterior não foi retirada";
    case "cancelled":
      return "ela está marcada como CANCELADA";
    case "published":
      return "ela já foi publicada antes";
    case "scheduled":
      return "ela já estava na fila";
    case "failed":
      return "a produção dela terminou em falha";
    default:
      return `ela está no estado '${status}', que a fila de entrega não lê`;
  }
}

export interface ParadaDeclarada {
  /** Quantas peças aprovadas ficaram fora da fila. */
  presas: number;
  /** O texto que foi para o PM — vazio quando não havia parada. */
  aoPm: string;
  /** O aviso gravado em cada peça — vazio quando não havia parada. */
  aoCliente: string;
}

/**
 * O CLIENTE APROVOU E A PEÇA NÃO ENTROU NA FILA — e agora todo mundo sabe.
 *
 * Chamada pela rota do portal com o que `agendarPecasAprovadas` devolveu em
 * `ignorados`. Lista vazia = nada aconteceu e nada é escrito (aviso sem parada
 * é ruído, e ruído ensina o cliente a ignorar o aviso da próxima vez).
 *
 * ⚠️ `scheduled` e `published` NÃO são parada: a peça já está na fila ou já
 * saiu. `agendarPecasAprovadas` os devolve em `ignorados` porque não os
 * PROMOVEU, que é outra coisa. Alarmar aqui seria a casa gritando sobre o
 * trabalho que deu certo — e alarme falso mata o alarme verdadeiro.
 */
export async function declararPecasAprovadasQueNaoEntraramNaFila(entrada: {
  ignorados: Array<{ postId: string; status: string }>;
  clientId: string | null;
  clientRequestId: string | null;
}): Promise<ParadaDeclarada> {
  const nada: ParadaDeclarada = { presas: 0, aoPm: "", aoCliente: "" };

  const presas = entrada.ignorados.filter(
    (i) => i.status !== "scheduled" && i.status !== "published",
  );
  if (presas.length === 0) return nada;

  const alvos = presas.map((p) => p.postId);

  // ── 1. A PEÇA FALA ────────────────────────────────────────────────────
  const aoCliente =
    "⚠️ VOCÊ APROVOU ESTA PEÇA, MAS ELA AINDA NÃO ENTROU NA FILA DE ENTREGA. " +
    "O seu 'sim' está registrado e a peça não foi perdida — o que travou foi o estado dela aqui dentro. " +
    "Quem está com isso: a nossa equipe. " +
    "Próxima ação: a equipe destrava esta peça e ela entra na fila; você não precisa aprovar de novo.";

  await prisma.socialPost.updateMany({
    where: { id: { in: alvos } },
    data: { avisoAoCliente: aoCliente },
  }).catch(() => { /* best-effort declarado: os outros dois registros seguem */ });

  // ── 2. O PM RECEBE MOTIVO, DONO E PRÓXIMA AÇÃO ───────────────────────
  //
  // ── UM AVISO POR WORKSPACE, E NÃO O DA PRIMEIRA PEÇA (6ª auditoria) ──────
  //
  // Isto era `donoDaPeca(alvos[0]!)`: o `ActivityEvent` ia inteiro para o
  // workspace da PRIMEIRA peça da lista, com o texto falando de todas. Quando
  // as peças presas eram de workspaces diferentes, a parada das outras ficava
  // ARQUIVADA NO LUGAR ERRADO — visível para quem não pode agir e invisível
  // para quem pode. E o `ActivityEvent` é o único canal do PM: perdido ali,
  // perdido de vez.
  //
  // Um card misturar workspaces não é o caminho comum (a rota filtra por
  // `clientId` do card), mas "não é comum" não é "não acontece", e o preço do
  // silêncio aqui é trabalho pago que ninguém procura. Cada workspace recebe o
  // aviso das peças DELE, com a contagem DELE.
  const aoPm = textoAoPm(presas);

  const donos = await donosDasPecas(alvos);
  const porWorkspace = new Map<string, typeof presas>();
  const semDestinatario: typeof presas = [];
  for (const p of presas) {
    const ws = donos.get(p.postId)?.workspaceId ?? null;
    if (!ws) { semDestinatario.push(p); continue; }
    const lista = porWorkspace.get(ws) ?? [];
    lista.push(p);
    porWorkspace.set(ws, lista);
  }

  for (const [ws, doWorkspace] of porWorkspace) {
    await prisma.activityEvent.create({
      data: {
        workspaceId: ws,
        // O cliente da PEÇA vem primeiro, e o do card é só o fallback: num
        // card que atravessa workspaces, carimbar o clientId do card no
        // evento do OUTRO workspace planta um id de cliente que não mora lá.
        // No caminho comum os dois são o mesmo valor (a rota filtra as peças
        // pelo clientId do card), então isto não muda nada onde nada precisa
        // mudar.
        clientId: donos.get(doWorkspace[0]!.postId)?.clientId ?? entrada.clientId ?? null,
        type: "peca_aprovada_nao_agendada",
        message: textoAoPm(doWorkspace).slice(0, 900),
      },
    }).catch(() => { /* best-effort declarado */ });
  }

  if (semDestinatario.length > 0) {
    // Sem workspace o `ActivityEvent` nem existe no modelo. O log é o último
    // recurso — e ele GRITA, porque acabou de ficar sem destinatário.
    console.error(
      "[esteira] PEÇA APROVADA PRESA E SEM DESTINATÁRIO (sem workspace):",
      textoAoPm(semDestinatario),
    );
  }

  // ── 3. O CLIENTE É AVISADO NA CONVERSA, ALÉM DA PEÇA ─────────────────
  if (entrada.clientId || entrada.clientRequestId) {
    await prisma.portalMessage.create({
      data: {
        ...(entrada.clientRequestId ? { clientRequestId: entrada.clientRequestId } : {}),
        ...(entrada.clientId ? { clientId: entrada.clientId } : {}),
        authorRole: "team",
        authorName: VOZ_DO_CLIENTE,
        body:
          `Recebi sua aprovação! Só que ${presas.length === 1 ? "uma peça" : `${presas.length} peças`} ` +
          "não entrou na fila de entrega por um travamento do nosso lado. " +
          "Sua aprovação está registrada e nada foi perdido — a equipe já está com isso e eu te aviso " +
          "assim que estiver na fila. Você não precisa aprovar de novo. 💛",
        readByTeam: false,
      },
    }).catch(() => { /* best-effort declarado */ });
  }

  return { presas: presas.length, aoPm, aoCliente };
}

/** O texto do PM para um conjunto de peças presas — motivo, dono e próxima ação.
 *  Uma função só porque o aviso por workspace e o log sem destinatário precisam
 *  dizer a MESMA coisa sobre conjuntos DIFERENTES: duas cópias divergiriam no
 *  primeiro ajuste de frase, e a contagem de uma passaria a mentir sobre a
 *  lista da outra. */
function textoAoPm(presas: Array<{ postId: string; status: string }>): string {
  return (
    `${presas.length} peça(s) APROVADAS pelo cliente não entraram na fila de entrega: ` +
    presas.map((p) => `${p.postId} (${oQueEsseEstadoQuerDizer(p.status)})`).join(" · ") + ". " +
    "Isto é trabalho pago e aprovado que o relógio não lê. " +
    "Dono: a agência (produção). " +
    "Próxima ação: colocar cada peça num estado que a fila aceita (rascunho ou aprovada) e reagendar — " +
    "NÃO pedir ao cliente que aprove de novo, ele já aprovou."
  );
}

/** Onde cada peça mora. UMA consulta para todas: o dono não pode custar uma
 *  ida ao banco por peça num caminho que roda dentro do clique do cliente. */
async function donosDasPecas(
  postIds: string[],
): Promise<Map<string, { workspaceId: string | null; clientId: string | null }>> {
  const linhas = await prisma.socialPost
    .findMany({ where: { id: { in: postIds } }, select: { id: true, workspaceId: true, clientId: true } })
    .catch(() => [] as Array<{ id: string; workspaceId: string | null; clientId: string | null }>);
  return new Map(
    linhas.map((l) => [l.id, { workspaceId: l.workspaceId ?? null, clientId: l.clientId ?? null }]),
  );
}
