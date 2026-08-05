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
// ── A extensão de 05/08/2026: o card em "ajustes solicitados" ────────────────
// Rodado o reparo, o log disse: `⛔ card … NÃO reaberto: status
// "revision_requested"`. E estava certo pela regra escrita — só que o CEO havia
// clicado "Solicitar ajustes" EXATAMENTE porque via só a capa, e o reparo tinha
// acabado de atender o pedido dele. A regra prendia o card no estado que o
// próprio conserto já tinha resolvido: trabalho parado sem dono nem prazo, que
// é o que esta casa chama de vazamento.
//
// A regra NÃO foi afrouxada — ela ganhou uma condição verificável:
//
//     card em "revision_requested" reabre  ⟺  a MESMA operação acrescentou
//     tela a pelo menos uma peça DESTE card (`ganhoDePecas`).
//
// Sem ganho comprovado, a recusa continua igual, e por um motivo que não mudou:
// devolver o card sem entregar nada novo é enterrar o pedido do cliente. E o
// dado do "mudou" não é presumido aqui — quem chama PASSA o de-para de telas
// por peça (`mudancas`). Presumir seria transformar a condição em decoração.
//
// ── O que esta função NUNCA faz ──────────────────────────────────────────────
//  • não reabre card com peça já PUBLICADA: pedir decisão sobre o que já foi ao
//    ar é pior do que não pedir. Recusa e diz por quê.
//  • não reabre card "rejected" nem "cancelled": reprovado e cancelado não
//    ressuscitam por conserto de dado, com ou sem tela nova.
//  • não reabre card em "revision_requested" quando NADA mudou nas peças — aí o
//    caminho continua sendo a refação (`esteira/refacao.ts`).
//  • não apaga o pedido do cliente. O texto que ele escreveu vive como
//    `ApprovalComment` (`authorRole: "client"`, visível) e a reabertura só
//    ACRESCENTA linhas ao histórico. O portal ordena por `createdAt` crescente:
//    o pedido dele fica ACIMA da resposta da agência, sempre.
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

/** Card DECIDIDO POR APROVAÇÃO: reabre sem precisar provar mudança — o cliente
 *  disse "sim" ao que viu, e o que ele viu não era tudo. */
const STATUS_REABRIVEL = "approved";

/** Card em que o cliente PEDIU AJUSTE: reabre SÓ com ganho comprovado nas peças
 *  (`ganhoDePecas`). Sem ganho, o caminho é a refação. */
const STATUS_COM_AJUSTE = "revision_requested";

/** Decisões que NÃO ressuscitam por conserto de dado. Nunca. */
const STATUS_SEM_VOLTA = new Set(["rejected", "cancelled"]);

/** O estado de um post que ainda espera aval. `aprovarPacote` é quem o move
 *  para "scheduled"; devolver a "draft" é retirar o aval, não recusar a peça. */
const STATUS_SEM_AVAL = "draft";

/**
 * O de-para de telas de UMA peça, entregue por quem chama.
 *
 * É o único insumo que torna a reabertura de um card em ajuste VERIFICÁVEL.
 * `telasAntes`/`telasDepois` são contagens da mesma operação que acabou de
 * gravar — não uma releitura do banco, que já estaria depois da escrita.
 */
export interface MudancaNaPeca {
  postId: string;
  telasAntes: number;
  telasDepois: number;
}

/** O que a operação acrescentou às peças de UM card. */
export interface GanhoDePecas {
  /** Peças deste card que GANHARAM tela (delta > 0). Zero = nada mudou. */
  pecasCompletadas: number;
  telasAcrescentadas: number;
  /** Quantas telas cada peça completada passou a ter — para a frase do registro. */
  telasDepois: number[];
}

/** O pedido de ajuste do cliente, como ele fica registrado no card. */
export interface PedidoDeAjuste {
  /** Quando ele pediu: a data do comentário dele; sem comentário, a da decisão. */
  registradoEm: Date | null;
  /** Quem pediu, já sem o prefixo técnico `client:`. */
  autor: string;
  /** O TEXTO dele está no histórico como comentário visível? `false` = o status
   *  veio por outro caminho, sem comentário — e aí o registro NÃO promete "com
   *  as suas palavras", porque não haveria palavra nenhuma para mostrar. */
  comentarioNoHistorico: boolean;
}

export interface CardReaberto {
  approvalRequestId: string;
  statusAnterior: string;
  decididoEm: Date | null;
  decididoPor: string | null;
  /** Peças que voltaram para "draft": o aval foi retirado e, no caminho do
   *  ajuste, a marca "em ajuste" saiu de peça cujo ajuste já foi atendido —
   *  senão o calendário diria "Em ajuste" com o card pedindo decisão. */
  postsDevolvidos: number;
  /** O prazo vencido foi removido? (nunca inventamos um novo). */
  prazoRemovido: boolean;
  /** O ganho que AUTORIZOU esta reabertura. Zeros no caminho do card aprovado,
   *  que não depende de mudança material. */
  pecasCompletadas: number;
  telasAcrescentadas: number;
  /** Preenchido só quando o card estava em ajuste — e é a prova, no retorno, de
   *  que o pedido do cliente foi lido antes de responder, não passado por cima. */
  pedidoDeAjuste: PedidoDeAjuste | null;
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
 * MUDOU MATERIALMENTE? — a condição, e só ela, que autoriza reabrir um card em
 * "ajustes solicitados".
 *
 * Conta quantas peças DESTE card ganharam tela na operação que está chamando.
 * Peça citada por `mudancas` que não é do card não conta (id de post não abre
 * porta para o card alheio); delta zero ou negativo não conta (reparo é
 * aditivo — encolher não é "completar"); id repetido conta uma vez só.
 *
 * Pura de propósito: é a linha que decide se o pedido do cliente é respondido
 * ou enterrado, e ela tem que ser testável sem banco.
 */
export function ganhoDePecas(
  postsDoCard: string[],
  mudancas: MudancaNaPeca[] | undefined,
): GanhoDePecas {
  const doCard = new Set(postsDoCard);
  const jaContado = new Set<string>();
  const ganho: GanhoDePecas = { pecasCompletadas: 0, telasAcrescentadas: 0, telasDepois: [] };
  for (const m of mudancas ?? []) {
    if (!m || typeof m.postId !== "string") continue;
    if (!doCard.has(m.postId) || jaContado.has(m.postId)) continue;
    jaContado.add(m.postId);
    const antes = Number.isFinite(m.telasAntes) ? m.telasAntes : 0;
    const depois = Number.isFinite(m.telasDepois) ? m.telasDepois : 0;
    if (depois - antes <= 0) continue;
    ganho.pecasCompletadas += 1;
    ganho.telasAcrescentadas += depois - antes;
    ganho.telasDepois.push(depois);
  }
  return ganho;
}

/**
 * A frase que o CEO lê no histórico do card, montada a partir do que REALMENTE
 * mudou — nunca de um texto fixo. "Cada carrossel agora traz as 6 telas" só sai
 * quando todas as peças terminaram com o mesmo número; se terminaram com
 * números diferentes, a frase diz o intervalo em vez de generalizar.
 */
export function fraseDaCompletude(ganho: GanhoDePecas, pecasDoCard: number): string {
  const min = Math.min(...ganho.telasDepois);
  const max = Math.max(...ganho.telasDepois);
  const todas = ganho.pecasCompletadas >= pecasDoCard;
  const sujeito = todas
    ? pecasDoCard === 1
      ? "a peça deste card"
      : `cada uma das ${pecasDoCard} peças deste card`
    : `${ganho.pecasCompletadas} das ${pecasDoCard} peças deste card`;
  const verbo = todas ? "traz" : "trazem";
  const quantas = min === max ? `as ${max} telas` : `entre ${min} e ${max} telas`;
  return (
    `As peças foram completadas: ${sujeito} agora ${verbo} ${quantas} ` +
    `(${ganho.telasAcrescentadas} tela(s) acrescentada(s) nesta rodada).`
  );
}

/**
 * O texto do registro que fica no card. É histórico, não conteúdo: nunca
 * repete legenda, tela ou qualquer coisa que a peça já mostra em imagem.
 *
 * Dois textos, porque são duas conversas diferentes. Card **aprovado**: a
 * agência avisa que a decisão foi tomada sobre menos do que existia. Card em
 * **ajuste**: a agência RESPONDE a um pedido — e um texto que fingisse não ter
 * havido pedido seria pior do que não escrever nada.
 */
export function textoDoRegistro(entrada: {
  decididoEm: Date | null;
  decididoPor: string | null;
  motivo: string;
  pecas: number;
  /** Presente só no caminho do card em ajuste. */
  ajuste?: { ganho: GanhoDePecas; pedido: PedidoDeAjuste | null };
}): string {
  const quem = entrada.decididoPor?.replace(/^client:/, "") || "não registrado";
  const naoFoiAoAr =
    `Nenhuma das ${entrada.pecas} peça(s) deste card foi publicada nesse intervalo — ` +
    `nada disso chegou a ir ao ar.`;

  if (entrada.ajuste) {
    const { ganho, pedido } = entrada.ajuste;
    // O pedido dele é citado pela data em que ele o fez, e a linha diz onde o
    // texto original está. Sem comentário no histórico, a frase não promete
    // "com as suas palavras" — não existiria palavra para mostrar.
    const onde = pedido?.comentarioNoHistorico
      ? `O seu pedido de ajuste continua aqui no histórico, com as suas palavras ` +
        `(registrado em ${dataLegivel(pedido.registradoEm)} por ${pedido.autor}) — nada foi apagado.`
      : `O seu pedido de ajuste continua registrado neste card ` +
        `(${dataLegivel(pedido?.registradoEm ?? entrada.decididoEm)}) — nada foi apagado.`;
    return [
      `Você pediu ajustes neste card, e as peças MUDARAM desde então — por isso ` +
        `ele volta para a sua decisão.`,
      ``,
      fraseDaCompletude(ganho, entrada.pecas),
      ``,
      `O que foi feito: ${entrada.motivo}`,
      ``,
      onde +
        ` Se o que você pediu foi outra coisa, é só dizer de novo: o card está aberto.`,
      ``,
      naoFoiAoAr,
    ].join("\n");
  }

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
 * mesma coisa. No caminho do card em ajuste isso deixa de ser confiança e vira
 * trava: sem `mudancas` provando ganho de tela, o card não volta.
 */
export async function reabrirAprovacoesDosPosts(entrada: {
  clientId: string;
  postIds: string[];
  /** Frase de negócio: o que mudou no card que justifica decidir de novo. */
  motivo: string;
  /** O de-para de telas por peça. SEM ele, card em "revision_requested" é
   *  recusado — a condição da reabertura tem que ser verificável, não presumida. */
  mudancas?: MudancaNaPeca[];
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
    // ── Quem pode voltar, e sob que prova ────────────────────────────────────
    const emAjuste = card.status === STATUS_COM_AJUSTE;
    const ganho = ganhoDePecas(postsDoCard, entrada.mudancas);

    if (STATUS_SEM_VOLTA.has(card.status)) {
      saida.recusados.push({
        approvalRequestId: card.id,
        motivo: `status "${card.status}" — reprovado e cancelado NÃO ressuscitam por ` +
          `conserto de dado, com ou sem peça nova`,
      });
      continue;
    }
    if (!emAjuste && card.status !== STATUS_REABRIVEL) {
      saida.recusados.push({
        approvalRequestId: card.id,
        motivo: `status "${card.status}" — não é um estado que a reabertura saiba tratar; ` +
          `ela vale para card APROVADO, ou para card em ajuste cujas peças mudaram`,
      });
      continue;
    }
    if (emAjuste && ganho.pecasCompletadas === 0) {
      // A metade que NÃO afrouxou: o ajuste só volta se veio com entrega junto.
      saida.recusados.push({
        approvalRequestId: card.id,
        motivo: `status "${card.status}" e NADA mudou nas peças deste card — o pedido de ` +
          `ajuste do cliente segue pela refação; reabrir sem entregar nada novo ` +
          `enterraria o pedido dele`,
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

    // O pedido do cliente é LIDO antes de responder. Ele não é movido nem
    // reescrito — só localizado, para que o registro novo cite a data certa e
    // só prometa "com as suas palavras" quando as palavras existirem.
    let pedidoDeAjuste: PedidoDeAjuste | null = null;
    if (emAjuste) {
      const comentario = await prisma.approvalComment.findFirst({
        where: { approvalRequestId: card.id, authorRole: "client", isClientVisible: true },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, authorName: true },
      });
      pedidoDeAjuste = {
        registradoEm: comentario?.createdAt ?? card.reviewedAt,
        autor: (comentario?.authorName || card.reviewedBy || "").replace(/^client:/, "") || "você",
        comentarioNoHistorico: comentario != null,
      };
    }

    // No caminho do ajuste, a peça também sai de "revision_requested": o card
    // volta a pedir decisão, e peça marcada "Em ajuste" faria o calendário do
    // portal contradizer o card na mesma tela (`CalendarioDoMes`).
    const statusQuePerdemAMarca = emAjuste ? ["approved", STATUS_COM_AJUSTE] : ["approved"];

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
            ...(emAjuste ? { ajuste: { ganho, pedido: pedidoDeAjuste } } : {}),
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
        where: { id: { in: postsDoCard }, OR: posse, status: { in: statusQuePerdemAMarca } },
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
      pecasCompletadas: ganho.pecasCompletadas,
      telasAcrescentadas: ganho.telasAcrescentadas,
      pedidoDeAjuste,
    });
  }

  return saida;
}
