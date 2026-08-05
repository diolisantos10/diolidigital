// REABRIR UMA APROVAÇÃO JÁ DECIDIDA — quando o que o cliente viu não era tudo.
//
// A história que produziu este arquivo (05/08/2026): o CEO aprovou os 6
// carrosséis do lançamento da Foocci vendo **só a capa de cada um**. As 36
// telas existiam nos Arquivos do cliente, mas nada ligava tela a post
// (`SocialPost.mediaUrlsJson = "[]"`), então o card mostrava uma imagem por
// peça. A decisão foi tomada sobre 1/6 do material.
//
// ── Por que reabrir o MESMO card, e não abrir um card novo ───────────────────
// 1. `sourcePostIdsJson` é a ponte card→peças. Dois cards apontando para os
//    mesmos posts fazem o cliente decidir a mesma peça duas vezes — a própria
//    casa já trata isso como erro (`/api/social-posts/aprovacao` devolve 409:
//    "posts já estão num card de aprovação pendente"). Criar o segundo card
//    seria furar a regra que a casa escreveu contra si mesma.
// 2. O conteúdo completo já chega pelo card existente: `montarPecas` lê
//    `sourcePostIdsJson` → `SocialPost.mediaUrlsJson`. Ligadas as telas, o
//    MESMO card passa a mostrar as 6 por peça, sem escrever nada no card.
// 3. O histórico não se perde: a decisão anterior (status, quem, quando) é
//    gravada como `ApprovalComment` visível ao cliente ANTES de o status voltar
//    a "pending" — e a UI já mostra isso em "Histórico deste card".
//
// ── O que esta função NUNCA faz ──────────────────────────────────────────────
//  • não reabre card com peça já PUBLICADA: pedir decisão sobre o que já foi ao
//    ar é pior do que não pedir. Recusa e diz por quê.
//  • não reabre card em "revision_requested"/"rejected": aí o caminho é a
//    refação (`esteira/refacao.ts`), não a reabertura — sequestrar esse fluxo
//    faria a agência perder o pedido do cliente.
//  • não reescreve `reviewNote`. O corpo textual do card é o que o cliente leu;
//    e, com peças estruturadas, o portal nem o renderiza (ele duplicaria o que
//    agora é visual). A reabertura não inventa texto novo no card.
//  • não inventa prazo. Prazo vencido é REMOVIDO (o relógio antigo media a
//    decisão antiga); prazo futuro é mantido como estava.
//
// ── Limite conhecido: duas instâncias reabrindo ao mesmo tempo ───────────────
// Entre a leitura do card e a transação existe uma janela de milissegundos. Com
// duas réplicas subindo juntas, as duas podem ver o card "approved" e reabrir —
// o ESTADO final é o mesmo (pending, sem aval nas peças), mas o histórico
// ganharia dois registros idênticos. Escolhido conscientemente: histórico
// duplicado é ruído; histórico perdido é a informação que o CEO pediu para não
// perder. Se um dia isto incomodar, o conserto é uma trava por linha, não
// inverter a ordem.

import { prisma } from "@/lib/db/client";

/** Só um card DECIDIDO POR APROVAÇÃO é reaberto — ver o cabeçalho. */
const STATUS_REABRIVEL = "approved";

/** O estado de um post que ainda espera aval. `aprovarPacote` é quem o move
 *  para "scheduled"; devolver a "draft" é retirar o aval, não recusar a peça. */
const STATUS_SEM_AVAL = "draft";

export interface CardReaberto {
  approvalRequestId: string;
  statusAnterior: string;
  decididoEm: Date | null;
  decididoPor: string | null;
  /** Peças que voltaram de "approved" para "draft" (o aval foi retirado). */
  postsDevolvidos: number;
  /** O prazo vencido foi removido? (nunca inventamos um novo). */
  prazoRemovido: boolean;
}

export interface ResultadoDaReabertura {
  reabertos: CardReaberto[];
  /** Cards que já estavam esperando decisão — nada a fazer, e é bom assim. */
  jaPendentes: string[];
  recusados: Array<{ approvalRequestId: string; motivo: string }>;
}

/** Lista de ids num JSON. Campo corrompido vira [] — nunca exceção. */
function lerLista(bruto: string | null | undefined): string[] {
  try {
    const v = JSON.parse(bruto ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Data legível em pt-BR; se o ambiente não tiver a tabela de fusos, ISO. */
export function dataLegivel(d: Date | null): string {
  if (!d) return "data não registrada";
  try {
    return d.toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
    });
  } catch {
    return d.toISOString();
  }
}

/**
 * O texto do registro que fica no card. É histórico, não conteúdo: nunca
 * repete legenda, tela ou qualquer coisa que a peça já mostra em imagem.
 */
export function textoDoRegistro(entrada: {
  decididoEm: Date | null;
  decididoPor: string | null;
  motivo: string;
  pecas: number;
}): string {
  const quem = entrada.decididoPor?.replace(/^client:/, "") || "não registrado";
  return [
    `Esta aprovação foi REABERTA pela agência.`,
    ``,
    `Registro da decisão anterior: **aprovada** em ${dataLegivel(entrada.decididoEm)} por ${quem}. ` +
      `Ela continua valendo como histórico — não foi apagada.`,
    ``,
    `Por que voltou para você: ${entrada.motivo}`,
    ``,
    `Nenhuma das ${entrada.pecas} peça(s) deste card foi publicada nesse intervalo — ` +
      `a decisão anterior não chegou a ir ao ar.`,
  ].join("\n");
}

/**
 * Reabre os cards de aprovação que decidem estes posts.
 *
 * Idempotente por natureza: card já "pending" não é tocado (entra em
 * `jaPendentes`). Quem chama deve passar SOMENTE os posts que acabaram de
 * mudar — reabrir sem mudança nova é fazer o cliente decidir duas vezes a
 * mesma coisa.
 */
export async function reabrirAprovacoesDosPosts(entrada: {
  clientId: string;
  postIds: string[];
  /** Frase de negócio: o que mudou no card que justifica decidir de novo. */
  motivo: string;
}): Promise<ResultadoDaReabertura> {
  const saida: ResultadoDaReabertura = { reabertos: [], jaPendentes: [], recusados: [] };
  const alvo = new Set(entrada.postIds.filter((id) => typeof id === "string" && id));
  if (alvo.size === 0) return saida;

  // Posse pelo CLIENTE do card, pelas DUAS chaves que a casa usa — a mesma
  // fronteira de `montarPecas`. Só `clientId` deixaria de fora o card nascido
  // do fluxo Brain (que guarda `clientRequestId`), e o log diria "nada a
  // reabrir" com o card na tela do cliente mostrando conteúdo velho. Card de
  // OUTRO cliente que cite estes ids continua inalcançável.
  const pedidos = await prisma.clientRequestDb.findMany({
    where: { clientId: entrada.clientId },
    select: { id: true },
  });
  const idsDePedido = pedidos.map((p) => p.id);
  const posse = [
    { clientId: entrada.clientId },
    ...(idsDePedido.length ? [{ clientRequestId: { in: idsDePedido } }] : []),
  ];

  const candidatos = await prisma.approvalRequest.findMany({
    where: { OR: posse, sourcePostIdsJson: { not: "[]" } },
    select: {
      id: true, status: true, reviewedAt: true, reviewedBy: true,
      expiresAt: true, sourcePostIdsJson: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const agora = new Date();

  for (const card of candidatos) {
    const postsDoCard = lerLista(card.sourcePostIdsJson);
    if (!postsDoCard.some((id) => alvo.has(id))) continue;

    if (card.status === "pending") {
      // O melhor caso: o card ainda espera decisão e as telas novas já aparecem
      // nele sozinhas (o portal lê a peça do post, não uma cópia no card).
      saida.jaPendentes.push(card.id);
      continue;
    }
    if (card.status !== STATUS_REABRIVEL) {
      saida.recusados.push({
        approvalRequestId: card.id,
        motivo: `status "${card.status}" — reabertura só vale para card APROVADO; ` +
          `ajuste e recusa seguem pela refação, e card cancelado não ressuscita por dado`,
      });
      continue;
    }

    // Peça no ar não volta atrás. Pedir decisão sobre o que já foi publicado
    // seria oferecer ao cliente um botão que não desfaz nada.
    const publicados = await prisma.socialPost.count({
      where: { id: { in: postsDoCard }, OR: posse, status: "published" },
    });
    if (publicados > 0) {
      saida.recusados.push({
        approvalRequestId: card.id,
        motivo: `${publicados} peça(s) deste card já foram PUBLICADAS — ` +
          `não se reabre decisão sobre o que já está no ar`,
      });
      continue;
    }

    const prazoRemovido = card.expiresAt != null && card.expiresAt < agora;

    // Tudo ou nada: um card que voltasse a "pending" sem o registro do histórico
    // (ou com as peças ainda carimbadas "approved") seria pior que o estado de
    // antes — decisão apagada, aval sobrando.
    const [, , posts] = await prisma.$transaction([
      prisma.approvalComment.create({
        data: {
          approvalRequestId: card.id,
          authorName: "Equipe Dioli",
          authorRole: "internal",
          kind: "comment",
          body: textoDoRegistro({
            decididoEm: card.reviewedAt,
            decididoPor: card.reviewedBy,
            motivo: entrada.motivo,
            pecas: postsDoCard.length,
          }),
          isClientVisible: true,
        },
      }),
      prisma.approvalRequest.update({
        where: { id: card.id },
        data: {
          status: "pending",
          reviewedAt: null,
          reviewedBy: null,
          // Prazo vencido perde o sentido (media a decisão antiga); prazo no
          // futuro fica como estava. Prazo NOVO não se inventa aqui.
          ...(prazoRemovido ? { expiresAt: null } : {}),
        },
      }),
      // O aval é retirado junto com a decisão: peça "approved" com card
      // pendente é exatamente o estado que deixa a esteira publicar em nome do
      // cliente sem o gatilho previsto.
      prisma.socialPost.updateMany({
        where: { id: { in: postsDoCard }, OR: posse, status: "approved" },
        data: { status: STATUS_SEM_AVAL },
      }),
    ]);

    saida.reabertos.push({
      approvalRequestId: card.id,
      statusAnterior: card.status,
      decididoEm: card.reviewedAt,
      decididoPor: card.reviewedBy ?? null,
      postsDevolvidos: posts.count,
      prazoRemovido,
    });
  }

  return saida;
}
