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
//
// ═══════════════════════════════════════════════════════════════════════════
// ── A SEGUNDA PORTA (05/08/2026): a decisão da direção ──────────────────────
// ═══════════════════════════════════════════════════════════════════════════
//
// O impasse que a produziu, e ele é de ovo e galinha: a passada que acrescentou
// as telas (5 → 6) rodou ANTES de a regra do `ganhoDePecas` existir. Quando a
// regra passou a valer, já não havia ganho para provar — o log de produção diz
// `0 post(s) seriam atualizados · 6 post(s) já com telas (intocados)` e
// "Todos os carrosséis JÁ têm telas ligadas e COMPLETAS". O card ficou em
// `revision_requested` para sempre: a condição que o destravaria só pode ser
// satisfeita por uma passada que não tem mais o que fazer.
//
// ⛔ O QUE **NÃO** FOI FEITO: afrouxar `ganhoDePecas`. Aquela condição continua
//    exatamente como estava, e continua sendo a única que autoriza a reabertura
//    AUTOMÁTICA. Uma trava que se afrouxa no primeiro caso difícil não é trava.
//
// ✅ O que foi feito: abrir uma porta SEPARADA, que se declara pelo que ela é —
//    **decisão humana registrada**. Ela não finge que algo mudou; ela diz, no
//    card e no log, que quem mandou o card voltar foi a direção da agência.
//
// ── A trava desta porta é o ESTADO, não o ganho ──────────────────────────────
// A porta automática pergunta "esta passada entregou alguma coisa?". Esta aqui
// pergunta outra coisa: **"o que está no card hoje está inteiro?"**. Ela só
// reabre se TODA peça do card estiver completa pelo contrato de
// `execution/artes.ts`:
//
//     carrossel  →  `mediaUrlsJson` com ≥ 2 telas  E  `mediaUrl` = tela 1
//     demais     →  a peça tem arte
//     e a peça precisa APARECER no card do portal (mesma fronteira de
//     `montarPecas`: existe, é do dono do card e é "compartilhado")
//
// Peça incompleta → **recusa, nomeando o que falta**. Devolver o card para o
// CEO decidir sobre peça capenga é repetir, com assinatura da direção, o erro
// que gerou o pedido de ajuste. A recusa é a metade que dá valor à porta.
//
// As recusas herdadas continuam todas: `rejected` e `cancelled` não ressuscitam,
// peça `published` barra, e `approved` também recusa — card já aprovado não tem
// o que reabrir, e esta porta existe para destravar ajuste, não para revogar
// decisão do cliente.
//
// Idempotência: card já `pending` é `ja-pendente` e NADA é escrito. E a escrita
// do status é condicional (`updateMany` com `status: "revision_requested"` no
// WHERE) — duas réplicas subindo juntas, só uma escreve o comentário. Aqui deu
// para fazer a trava por linha que a porta automática deixou como dívida.

import { prisma } from "@/lib/db/client";

import { VOZ_DO_CLIENTE } from "@/lib/agency/gerencia/voz-unica";
/** Card DECIDIDO POR APROVAÇÃO: reabre sem precisar provar mudança — o cliente
 *  disse "sim" ao que viu, e o que ele viu não era tudo. */
const STATUS_REABRIVEL = "approved";

/** Card em que o cliente PEDIU AJUSTE: reabre SÓ com ganho comprovado nas peças
 *  (`ganhoDePecas`). Sem ganho, o caminho é a refação. */
const STATUS_COM_AJUSTE = "revision_requested";

/** Decisões que NÃO ressuscitam por conserto de dado. Nunca. */
const STATUS_SEM_VOLTA = new Set(["rejected", "cancelled"]);

/** O estado de um post que ainda espera aval. `publicacao.promoverParaAgendado`
 *  é quem o move para "scheduled"; devolver a "draft" é retirar o aval, não
 *  recusar a peça. */
const STATUS_SEM_AVAL = "draft";

/**
 * Os estados que PERDEM o aval quando o card volta para decisão.
 *
 * "scheduled" entrou aqui em 05/08/2026, junto com o conserto do beco sem saída
 * (ver `esteira/publicacao.ts`): a decisão do cliente passou a promover a peça
 * direto para "scheduled" em vez de parar em "approved". Sem esta linha, reabrir
 * um card aprovado deixaria a peça AGENDADA com o card pendente — exatamente o
 * estado que faz o relógio publicar em nome do cliente sem o gatilho previsto.
 * "approved" continua na lista por causa das peças gravadas antes do conserto.
 */
const STATUS_COM_AVAL = ["approved", "scheduled"];

/** Formatos que a casa grava para carrossel (o legado usa o termo em PT). É o
 *  único formato em que "completo" significa mais de uma imagem. */
const FORMATOS_CARROSSEL = new Set(["carousel", "carrossel"]);

/** O que o portal EXIGE para mostrar a peça dentro do card (`montarPecas`).
 *  Peça fora disto não é vista pelo cliente — conferir o estado dela e dizer
 *  "completa" seria conferir o que ninguém vai olhar. */
const VISIBILIDADE_DO_PORTAL = "compartilhado";

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
    const statusQuePerdemAMarca = emAjuste ? [...STATUS_COM_AVAL, STATUS_COM_AJUSTE] : [...STATUS_COM_AVAL];

    // Tudo ou nada: um card que voltasse a "pending" sem o registro do histórico
    // (ou com as peças ainda carimbadas "approved") seria pior que o estado de
    // antes — decisão apagada, aval sobrando.
    const [, , posts] = await prisma.$transaction([
      prisma.approvalComment.create({
        data: {
          approvalRequestId: card.id,
          authorName: VOZ_DO_CLIENTE,
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

// ═══════════════════════════════════════════════════════════════════════════
// A PORTA DA DIREÇÃO — a trava é o ESTADO das peças (ver o cabeçalho)
// ═══════════════════════════════════════════════════════════════════════════

/** Uma peça do card como esta porta precisa vê-la para julgar o ESTADO dela. */
export interface PecaConferida {
  postId: string;
  /** Por que a peça NÃO aparece no card do portal. `null` = ela aparece.
   *  Ausente é o pior tipo de incompleto: o CEO decidiria sem ver. */
  ausente: string | null;
  formato: string;
  capa: string | null;
  telas: string[];
  /**
   * Quando a peça mudou pela última vez. É o que permite AFIRMAR se algo mudou
   * desde o pedido do cliente em vez de declarar isso por escrito fixo.
   *
   * A cicatriz: em 06/08/2026 o CEO pediu ajuste na ARTE dos 6 carrosséis, a
   * arte foi refeita, e a porta ainda assim mandaria o card de volta dizendo
   * "Nesta passada NADA foi alterado nas peças" — porque a frase era literal no
   * código. **Afirmação que sai para o cliente tem de ser derivada do estado.**
   * String fixa é uma alucinação com data marcada: ela vira mentira no dia em
   * que o mundo mudar, e ninguém percebe porque não há teste que sinta.
   */
  mudouEm: Date | null;
}

/** O que falta numa peça, com todas as letras — é o que sai na recusa. */
export interface FaltaNaPeca {
  postId: string;
  falta: string;
}

/**
 * O id da mídia dentro de `/api/media/<id>`.
 *
 * A comparação "a capa é a tela 1" é feita por ID, não por string crua: um dia
 * uma das duas pontas ganha `?v=2` ou uma barra a mais e a igualdade textual
 * passaria a recusar carrossel perfeito. Sem forma de URL reconhecível, cai
 * para a string — não se inventa equivalência.
 */
export function idDaMidia(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /\/api\/media\/([A-Za-z0-9_-]+)/.exec(url);
  if (m) return m[1] ?? null;
  const cru = String(url).trim();
  return cru || null;
}

/**
 * AS PEÇAS ESTÃO INTEIRAS? — a condição, e só ela, que autoriza esta porta.
 *
 * O contrato conferido é o de `lib/agency/execution/artes.ts`, que é o mesmo
 * que `esteira/publicacao.ts` usa para montar o carrossel do Instagram:
 * `mediaUrlsJson` traz TODAS as telas e `mediaUrl` é a PRIMEIRA delas. Um
 * carrossel que não obedece a isso publica em nome do cliente uma peça
 * diferente da que ele aprovou — e é por isso que "capa = tela 1" está aqui, e
 * não só a contagem.
 *
 * Pura de propósito: é a linha que decide se o CEO recebe material inteiro ou
 * material capenga assinado pela direção, e ela tem que ser testável sem banco.
 */
export function pecasIncompletas(pecas: PecaConferida[]): FaltaNaPeca[] {
  const faltas: FaltaNaPeca[] = [];
  for (const p of pecas) {
    if (p.ausente) {
      faltas.push({ postId: p.postId, falta: p.ausente });
      continue;
    }
    if (!FORMATOS_CARROSSEL.has((p.formato || "").toLowerCase())) {
      // Peça de imagem única: "completa" é ter arte. Sem arte não há o que
      // decidir — o cliente veria um card com um retângulo vazio.
      if (!p.capa && p.telas.length === 0) {
        faltas.push({ postId: p.postId, falta: "a peça não tem arte nenhuma — não há o que decidir" });
      }
      continue;
    }
    if (p.telas.length === 0) {
      faltas.push({
        postId: p.postId,
        falta:
          "carrossel SEM NENHUMA TELA LIGADA — o card mostraria só a capa, que é " +
          "exatamente o que gerou o pedido de ajuste",
      });
      continue;
    }
    if (p.telas.length < 2) {
      faltas.push({
        postId: p.postId,
        falta: "carrossel com 1 tela só — uma imagem sozinha não é carrossel (mínimo 2)",
      });
      continue;
    }
    const capa = idDaMidia(p.capa);
    if (!capa) {
      faltas.push({
        postId: p.postId,
        falta:
          `carrossel com ${p.telas.length} telas mas SEM CAPA — a capa é a tela 1 ` +
          `(contrato de execution/artes.ts)`,
      });
      continue;
    }
    if (capa !== idDaMidia(p.telas[0])) {
      faltas.push({
        postId: p.postId,
        falta:
          `a capa NÃO é a tela 1 (capa: ${p.capa} · tela 1: ${p.telas[0]}) — o card ` +
          `mostraria uma imagem e o carrossel publicado começaria por outra`,
      });
    }
  }
  return faltas;
}

/**
 * A frase de ESTADO que o CEO lê: o que está no card hoje, conferido.
 *
 * Repare no tempo verbal, e ele é o ponto: aqui não se diz "foram completadas
 * agora" (seria mentira — esta porta não altera peça nenhuma), diz-se o que
 * ESTÁ lá. Números diferentes não viram generalização: a frase diz o intervalo.
 */
export function fraseDoEstadoDasPecas(pecas: PecaConferida[]): string {
  const carrosseis = pecas.filter((p) => FORMATOS_CARROSSEL.has((p.formato || "").toLowerCase()));
  if (carrosseis.length === 0) {
    return `as ${pecas.length} peça(s) deste card estão com a arte no lugar.`;
  }
  const nums = carrosseis.map((p) => p.telas.length);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const quantas = min === max ? `as ${max} telas` : `entre ${min} e ${max} telas`;
  const sujeito =
    carrosseis.length === 1
      ? "o carrossel deste card traz"
      : `cada um dos ${carrosseis.length} carrosséis deste card traz`;
  const resto = pecas.length - carrosseis.length;
  const extra = resto > 0 ? ` As outras ${resto} peça(s) estão com a arte no lugar.` : "";
  return (
    `${sujeito} ${quantas}, e a capa é a tela 1 — é o carrossel inteiro que ` +
    `está aí para você decidir.${extra}`
  );
}

/**
 * Quantas peças mudaram DEPOIS do pedido do cliente.
 *
 * É a única coisa que autoriza a porta a dizer "mudou" ou "não mudou". Sem data
 * do pedido não há comparação possível, e **não dá para saber nunca vira
 * afirmação**: o texto cai para a forma que não promete nada nas duas direções.
 */
export function pecasAlteradasDesdeOPedido(
  pecas: PecaConferida[],
  pedido: PedidoDeAjuste | null,
): number | null {
  const marco = pedido?.registradoEm ?? null;
  if (!marco) return null;
  return pecas.filter((p) => !!p.mudouEm && p.mudouEm.getTime() > marco.getTime()).length;
}

/**
 * O texto que fica no card quando a DIREÇÃO manda o card voltar.
 *
 * Três coisas que ele NUNCA faz, e cada uma custou uma discussão:
 *  • não especula por que o cliente pediu ajuste — o que ele escreveu está no
 *    histórico, com as palavras dele; a agência não reinterpreta;
 *  • não se esconde atrás do sistema: quem destravou foi a direção, e está
 *    escrito assim;
 *  • **não afirma que nada mudou sem ter conferido.** Até 06/08/2026 a primeira
 *    linha era literal — *"Nesta passada NADA foi alterado nas peças"* — e o
 *    CEO leria isso no portal dele no mesmo dia em que as 36 telas tinham sido
 *    refeitas por pedido dele. Frase fixa mostrada ao cliente é alucinação com
 *    data marcada: nasce verdadeira e vira mentira sozinha.
 */
export function textoDaDecisaoDaDirecao(entrada: {
  pecas: PecaConferida[];
  pedido: PedidoDeAjuste | null;
}): string {
  const { pedido } = entrada;
  const alteradas = pecasAlteradasDesdeOPedido(entrada.pecas, pedido);
  // Três estados, e o terceiro é o honesto quando falta a data do pedido.
  const oQueMudou =
    alteradas === null
      ? `Este card volta para a sua decisão POR DECISÃO DA DIREÇÃO DA AGÊNCIA. ` +
        `Não temos a data do seu pedido registrada, então não afirmo se as peças ` +
        `mudaram desde então — confira o material antes de decidir.`
      : alteradas === 0
        ? `Este card volta para a sua decisão POR DECISÃO DA DIREÇÃO DA AGÊNCIA — e ` +
          `não porque alguma coisa mudou agora. Nesta passada NADA foi alterado nas peças.`
        : `Este card volta para a sua decisão porque ${alteradas} das ` +
          `${entrada.pecas.length} peça(s) FORAM ALTERADAS depois do seu pedido de ` +
          `ajuste. O que você está vendo agora não é o mesmo material que você recusou.`;
  const onde = pedido?.comentarioNoHistorico
    ? `O seu pedido de ajuste continua aqui no histórico, com as suas palavras ` +
      `(registrado em ${dataLegivel(pedido.registradoEm)} por ${pedido.autor}) — nada foi apagado.`
    : `O seu pedido de ajuste continua registrado neste card ` +
      `(${dataLegivel(pedido?.registradoEm ?? null)}) — nada foi apagado.`;
  return [
    oQueMudou,
    ``,
    `Você pediu ajustes neste card e ele ficou parado em "ajustes solicitados". ` +
      `O material que está nele hoje foi conferido peça por peça antes de devolvê-lo: ` +
      fraseDoEstadoDasPecas(entrada.pecas),
    ``,
    onde + ` Se o que você pediu foi outra coisa, é só dizer de novo: o card está aberto.`,
    ``,
    `Nenhuma das ${entrada.pecas.length} peça(s) deste card foi publicada nesse ` +
      `intervalo — nada disso chegou a ir ao ar.`,
  ].join("\n");
}

export type ResultadoDaPorta = "reaberto" | "ja-pendente" | "recusado";

export interface ReaberturaPorDecisao {
  approvalRequestId: string;
  resultado: ResultadoDaPorta;
  statusAnterior: string | null;
  /** Vazio quando reabre; frase de negócio quando recusa. */
  motivo: string;
  /** O que falta, peça por peça. Só na recusa por peça incompleta. */
  faltas: FaltaNaPeca[];
  /** O estado conferido, como ele foi lido — a prova do que autorizou (ou não). */
  pecasConferidas: PecaConferida[];
  postsDevolvidos: number;
  prazoRemovido: boolean;
  /** O pedido do cliente, localizado ANTES de responder — nunca movido. */
  pedidoDeAjuste: PedidoDeAjuste | null;
}

/**
 * Reabre UM card, nomeado, por decisão registrada da direção.
 *
 * Não é a irmã da `reabrirAprovacoesDosPosts`: aquela varre os cards de um
 * cliente e exige ganho material; esta recebe o id do card na mão de quem
 * decidiu e exige que as peças estejam INTEIRAS. As duas nunca se substituem —
 * a automática existe para não depender de gente, esta existe para que a gente
 * tenha um caminho que não seja mexer no banco à mão.
 */
export async function reabrirCardPorDecisaoDaDirecao(entrada: {
  approvalRequestId: string;
}): Promise<ReaberturaPorDecisao> {
  const id = (entrada.approvalRequestId ?? "").trim();
  const base: ReaberturaPorDecisao = {
    approvalRequestId: id,
    resultado: "recusado",
    statusAnterior: null,
    motivo: "",
    faltas: [],
    pecasConferidas: [],
    postsDevolvidos: 0,
    prazoRemovido: false,
    pedidoDeAjuste: null,
  };
  if (!id) return { ...base, motivo: "nenhum id de card informado" };

  const card = await prisma.approvalRequest.findUnique({
    where: { id },
    select: {
      id: true, status: true, clientId: true, clientRequestId: true,
      reviewedAt: true, reviewedBy: true, expiresAt: true, sourcePostIdsJson: true,
    },
  });
  if (!card) {
    return {
      ...base,
      motivo:
        `não existe card de aprovação com o id "${id}" — confira o id no portal ` +
        `do cliente ou no painel; NADA foi gravado`,
    };
  }
  base.statusAnterior = card.status;

  // ── 1. Os estados, e o que cada um responde ────────────────────────────────
  if (card.status === "pending") {
    // A idempotência desta porta: o segundo boot com a variável ainda ligada
    // encontra o card já pendente e não escreve segundo comentário.
    return { ...base, resultado: "ja-pendente" };
  }
  if (STATUS_SEM_VOLTA.has(card.status)) {
    return {
      ...base,
      motivo:
        `status "${card.status}" — reprovado e cancelado NÃO ressuscitam, nem por ` +
        `conserto de dado nem por decisão da direção. O caminho é um card novo`,
    };
  }
  if (card.status === STATUS_REABRIVEL) {
    return {
      ...base,
      motivo:
        `status "approved" — o card JÁ está aprovado, não há o que reabrir. Esta ` +
        `porta destrava ajuste solicitado; ela não revoga decisão que o cliente tomou`,
    };
  }
  if (card.status !== STATUS_COM_AJUSTE) {
    return {
      ...base,
      motivo: `status "${card.status}" — esta porta só reabre card em "${STATUS_COM_AJUSTE}"`,
    };
  }

  const postsDoCard = lerLista(card.sourcePostIdsJson);
  if (postsDoCard.length === 0) {
    return {
      ...base,
      motivo:
        `o card não aponta para peça nenhuma (sourcePostIdsJson vazio) — não há ` +
        `estado para conferir, e esta porta só reabre contra estado conferido`,
    };
  }

  // ── 2. O ESTADO das peças, lido pela MESMA fronteira do portal ─────────────
  const linhas = await prisma.socialPost.findMany({
    where: { id: { in: postsDoCard } },
    select: {
      id: true, clientId: true, clientRequestId: true, format: true,
      mediaUrl: true, mediaUrlsJson: true, status: true, visibility: true,
      updatedAt: true,
    },
  });
  const porId = new Map(linhas.map((p) => [p.id, p]));

  const pecas: PecaConferida[] = postsDoCard.map((postId): PecaConferida => {
    const vazia = { postId, formato: "", capa: null, telas: [] as string[], mudouEm: null };
    const p = porId.get(postId);
    if (!p) return { ...vazia, ausente: "a peça não existe mais no calendário" };
    // Posse por QUALQUER uma das duas chaves do card — igual a `montarPecas`.
    const porCliente = !!card.clientId && p.clientId === card.clientId;
    const porSolicitacao = !!card.clientRequestId && p.clientRequestId === card.clientRequestId;
    if (!porCliente && !porSolicitacao) {
      return { ...vazia, ausente: "a peça não pertence ao dono deste card — o portal nem a exibe" };
    }
    if (p.visibility !== VISIBILIDADE_DO_PORTAL) {
      return {
        ...vazia,
        ausente:
          `a peça está como "${p.visibility}" e o portal só mostra ` +
          `"${VISIBILIDADE_DO_PORTAL}" — o cliente não a veria no card`,
      };
    }
    return {
      postId,
      ausente: null,
      formato: p.format,
      capa: p.mediaUrl,
      telas: lerLista(p.mediaUrlsJson),
      mudouEm: p.updatedAt ?? null,
    };
  });
  base.pecasConferidas = pecas;

  // ── 3. Peça no ar não volta atrás — a recusa que nenhuma decisão derruba ───
  const publicados = linhas.filter((p) => p.status === "published");
  if (publicados.length > 0) {
    return {
      ...base,
      motivo:
        `${publicados.length} peça(s) deste card já foram PUBLICADAS — não se reabre ` +
        `decisão sobre o que já está no ar, com ou sem aval da direção`,
    };
  }

  // ── 4. A TRAVA DESTA PORTA: as peças estão inteiras? ──────────────────────
  const faltas = pecasIncompletas(pecas);
  if (faltas.length > 0) {
    return {
      ...base,
      faltas,
      motivo:
        `${faltas.length} de ${pecas.length} peça(s) deste card NÃO estão completas — ` +
        `devolver o card para decidir sobre peça capenga repetiria, agora com ` +
        `assinatura da direção, o erro que gerou o pedido de ajuste`,
    };
  }

  // ── 5. O pedido do cliente é LIDO antes de responder ──────────────────────
  const comentario = await prisma.approvalComment.findFirst({
    where: { approvalRequestId: card.id, authorRole: "client", isClientVisible: true },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, authorName: true },
  });
  const pedidoDeAjuste: PedidoDeAjuste = {
    registradoEm: comentario?.createdAt ?? card.reviewedAt,
    autor: (comentario?.authorName || card.reviewedBy || "").replace(/^client:/, "") || "você",
    comentarioNoHistorico: comentario != null,
  };
  const prazoRemovido = card.expiresAt != null && card.expiresAt < new Date();

  // ── 6. A escrita, com a trava por LINHA no WHERE ──────────────────────────
  // `updateMany` com o status de origem no filtro: quem chegar depois encontra
  // `count === 0` e sai sem escrever comentário nenhum. É a trava que a porta
  // automática deixou como dívida — aqui coube, porque o alvo é UM card só.
  const escrito = await prisma.$transaction(async (tx) => {
    const travou = await tx.approvalRequest.updateMany({
      where: { id: card.id, status: STATUS_COM_AJUSTE },
      data: {
        status: "pending",
        reviewedAt: null,
        reviewedBy: null,
        // Prazo vencido media a decisão antiga; prazo novo NÃO se inventa.
        ...(prazoRemovido ? { expiresAt: null } : {}),
      },
    });
    if (travou.count !== 1) return null;

    await tx.approvalComment.create({
      data: {
        approvalRequestId: card.id,
        authorName: VOZ_DO_CLIENTE,
        authorRole: "internal",
        kind: "comment",
        body: textoDaDecisaoDaDirecao({ pecas, pedido: pedidoDeAjuste }),
        isClientVisible: true,
      },
    });
    // A peça sai de "Em ajuste" junto: card pedindo decisão com peça marcada
    // "em ajuste" faz o calendário do portal contradizer o card na mesma tela.
    // Sem filtro de posse aqui de propósito: a posse de CADA peça já foi
    // verificada no passo 2 (peça de outro dono vira `ausente` e recusa o card
    // inteiro no passo 4). Chegar aqui significa que todas são deste card.
    const posts = await tx.socialPost.updateMany({
      where: { id: { in: postsDoCard }, status: { in: [...STATUS_COM_AVAL, STATUS_COM_AJUSTE] } },
      data: { status: STATUS_SEM_AVAL },
    });
    return posts.count;
  });

  if (escrito == null) {
    return {
      ...base,
      resultado: "ja-pendente",
      motivo: "outra instância reabriu este card no mesmo instante — nada foi escrito duas vezes",
      pedidoDeAjuste,
    };
  }

  return {
    ...base,
    resultado: "reaberto",
    motivo: "",
    postsDevolvidos: escrito,
    prazoRemovido,
    pedidoDeAjuste,
  };
}
