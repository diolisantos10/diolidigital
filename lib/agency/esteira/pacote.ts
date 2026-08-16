// pacote.ts — O CARD DO PACOTE: quando ele pode pedir aprovação, e do quê.
//
// ── POR QUE ESTE ARQUIVO EXISTE (CEO, 08/08/2026) ───────────────────────────
//
// O CEO abriu o portal do CityJobs e o card do topo dizia "O pacote inteiro
// está pronto para você — terminamos e organizamos tudo", com o botão "Aprovar
// tudo". Três dedos abaixo, as TRÊS entregas do mesmo pacote diziam "material
// ainda não subiu" e estavam em "Em produção na Dioli".
//
// As duas coisas não podem ser verdade. Clicando em "Aprovar tudo" ele
// aprovaria NADA, às cegas — e `aprovarPacote` carimbava `approved` em toda
// aprovação pendente, com corpo ou sem, abrindo o ciclo e liberando o
// calendário em cima de um pacote que não existia.
//
// É o MESMO defeito consertado em 07/08 no card individual, um nível acima. Ele
// passou porque a trava de 07/08 nasceu na leitura do card (`semConteudo`, em
// `/api/brain/portal-data`) e o card do PACOTE não a consultava: ele se derivava
// de `presentedAt`, um carimbo que só diz "o PM apresentou", nunca "há o que
// ver".
//
// ── A REGRA, E ELA VALE NOS TRÊS LUGARES ───────────────────────────────────
//
//   Pacote SEM NENHUMA entrega pronta NÃO PEDE APROVAÇÃO.
//   Quando pede, LISTA o que está dentro, item por item.
//
// Os três lugares, e nenhum é redundante:
//
//   1. `lerFase` (a etapa que o cliente lê)  — o topo para de mentir e o botão
//      some junto, porque as duas telas derivam o botão da etapa;
//   2. `aprovarPacote` (o servidor)          — TRAVA, não aviso: botão escondido
//      é aparência, e a rota `POST /api/portal/esteira` aceita a decisão vinda
//      de qualquer lugar. Sem esta metade, um `curl` continuaria aprovando o
//      nada;
//   3. a tela                                 — lista o que está sendo assinado.
//
// ── E POR QUE A REGRA DE "TER CORPO" MORA AQUI, E NÃO EM DUAS CÓPIAS ────────
//
// Ela nasceu em `/api/brain/portal-data` (o campo `semConteudo`). Escrever uma
// segunda versão dela aqui seria repetir exatamente o defeito nº 2 do incidente
// do Drive — duas fontes de verdade adjacentes que divergem na primeira
// mudança. O mapa entrega→departamento já quebrou o portal assim em 07/08,
// divergindo em 11 dos 14 casos.
//
// Então a implementação é UMA e mora aqui: `portal-data` passou a IMPORTAR
// `montarPecas`, `corpoDoCard` e `cardTemCorpo` deste arquivo. Nada foi
// reescrito — o código foi mudado de casa e ganhou um segundo chamador.

import { prisma } from "@/lib/db/client";
import type { RamoDoFilho } from "@/lib/agency/portal/filho-do-dono";
import { cardGenerico } from "@/lib/agency/persistence/approval-service";
import { departamentoDoAgente } from "@/lib/agency/escada/degraus";

/** Parse defensivo de uma lista JSON de strings — JSON quebrado vira []. */
export function lerLista(bruto: string | null | undefined): string[] {
  try {
    const v = JSON.parse(bruto ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Uma peça do card de aprovação, ESTRUTURADA — imagem + legenda, como no
 *  planner da Meta. O reviewNote textual continua como resumo/fallback para
 *  cards antigos; a UI nova renderiza daqui. */
export type PecaDoCard = {
  id: string;
  caption: string;
  format: string;
  pillar: string | null;
  scheduledFor: string | null;
  /** A miniatura (mediaUrl do post — a capa do carrossel). */
  capa: string | null;
  /** TODAS as telas do carrossel (mediaUrlsJson), na ordem de publicação. */
  telas: string[];
};

/** O filtro de aprovação do portal — os DOIS estados (com solicitação e cliente
 *  direto) precisam falar a mesma língua. */
export type FiltroDeAprovacao =
  | { clientId: string; clientVisible: true }
  | { clientVisible: true; OR: Array<{ clientRequestId: string } | { clientId: string }> }
  // ⚠️ 16/08/2026: a cerca do filho do portal. As duas metades numa consulta —
  // carimbo que bate OU órfão de solicitação que o token prova possuir. Ver
  // `lib/agency/portal/filho-do-dono.ts`; exigir só carimbo apagou a lista de
  // aprovações do dono legítimo (o escritor de artefato não carimbava).
  | { clientVisible: true; OR: RamoDoFilho[] };

export function buscarAprovacoes(where: FiltroDeAprovacao) {
  return prisma.approvalRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      comments: {
        where: { isClientVisible: true },
        orderBy: { createdAt: "asc" },
        select: { id: true, authorName: true, authorRole: true, kind: true, body: true, createdAt: true },
      },
      // O vínculo por FK à versão decidida (Fase 2, 2.2) — quando existe, é
      // ELE que dá o corpo do card, nunca casamento por ordem.
      // `mediaAssetIds` entra para o fallback visual das peças (montarPecas).
      // `visibility` da ENTREGA entra no select porque a peça montada a partir
      // de `mediaAssetIds` precisa dele: sem isso o ramo de mídia era
      // fail-open — entrega nascida "interno" (o default do schema) virava
      // arte na tela do cliente só porque alguém marcou a aprovação como
      // clientVisible. Ver montarPecas.
      deliverableVersion: {
        select: {
          number: true, content: true, mediaAssetIds: true,
          deliverable: { select: { name: true, visibility: true } },
        },
      },
    },
  });
}

export type AprovacaoDb = Awaited<ReturnType<typeof buscarAprovacoes>>[number];

/**
 * ── UMA DECISÃO, UM CARD (CEO, 07/08/2026) ────────────────────────────────
 * O motor cria uma aprovação por ESPECIALISTA, todas com o mesmo
 * `department`. Quando o card não tem nada que o distinga — sem nota própria,
 * sem versão vinculada, sem posts — os irmãos ficavam idênticos na tela:
 * "Pauta do Mês — <negócio>" três vezes, "Estratégia" duas.
 *
 * A trava de escrita (`createApprovalRequest`) impede novos. Esta função
 * conserta o que JÁ está no banco: dos genéricos de um mesmo departamento e
 * status, sobra o mais recente. Card com conteúdo próprio nunca é agrupado.
 */
export function semDuplicatas(aprovacoes: AprovacaoDb[]): AprovacaoDb[] {
  const vistos = new Set<string>();
  const saida: AprovacaoDb[] = [];
  // `buscarAprovacoes` já ordena por createdAt desc — o primeiro de cada grupo
  // é o mais recente, que é o que o cliente deve decidir.
  for (const ap of aprovacoes) {
    if (!cardGenerico(ap)) { saida.push(ap); continue; }
    const chave = `${ap.department}::${ap.status}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(ap);
  }
  return saida;
}

/**
 * Monta as peças estruturadas de cada card a partir de `sourcePostIdsJson`
 * (a única ponte Approval→SocialPost — antes só usada na escrita).
 *
 * Fronteira do portal, fail-closed:
 *   • só post com visibility "compartilhado" entra (a consulta já filtra);
 *   • só post do MESMO dono do card entra (clientId, ou clientRequestId quando
 *     o card não tem clientId) — id de post de outro cliente num card não
 *     abre porta para o conteúdo dele.
 *
 * Fallback: card sem posts mas com versão vinculada por FK e mídias
 * (`DeliverableVersion.mediaAssetIds`) vira UMA peça com `/api/media/<id>`.
 */
export async function montarPecas(aprovacoes: AprovacaoDb[]): Promise<Map<string, PecaDoCard[]>> {
  const resultado = new Map<string, PecaDoCard[]>();
  const todosIds = [...new Set(aprovacoes.flatMap((ap) => lerLista(ap.sourcePostIdsJson)))];
  const posts = todosIds.length
    ? await prisma.socialPost.findMany({
        where: { id: { in: todosIds }, visibility: "compartilhado" },
        select: {
          id: true, clientId: true, clientRequestId: true, caption: true, format: true,
          pillar: true, scheduledFor: true, mediaUrl: true, mediaUrlsJson: true,
        },
      })
    : [];
  const porId = new Map(posts.map((p) => [p.id, p]));

  for (const ap of aprovacoes) {
    const pecas: PecaDoCard[] = [];
    // A ordem do card é a ordem gravada em sourcePostIdsJson (data proposta).
    for (const postId of lerLista(ap.sourcePostIdsJson)) {
      const p = porId.get(postId);
      if (!p) continue;
      // Posse por QUALQUER uma das duas chaves do card — fail-closed no fim.
      const porCliente     = !!ap.clientId        && p.clientId        === ap.clientId;
      const porSolicitacao = !!ap.clientRequestId && p.clientRequestId === ap.clientRequestId;
      if (!porCliente && !porSolicitacao) {
        console.warn(
          `[pacote] peça descartada: post ${p.id} não pertence ao card ${ap.id} ` +
          `(post: clientId=${p.clientId ?? "—"} clientRequestId=${p.clientRequestId ?? "—"} · ` +
          `card: clientId=${ap.clientId ?? "—"} clientRequestId=${ap.clientRequestId ?? "—"})`,
        );
        continue;
      }
      pecas.push({
        id: p.id,
        caption: p.caption,
        format: p.format,
        pillar: p.pillar,
        scheduledFor: p.scheduledFor ? p.scheduledFor.toISOString() : null,
        capa: p.mediaUrl,
        telas: lerLista(p.mediaUrlsJson),
      });
    }

    // Fallback por FK: só de entrega EXPLICITAMENTE compartilhada.
    const entregaCompartilhada =
      ap.deliverableVersion?.deliverable.visibility === "compartilhado";
    if (pecas.length === 0 && ap.deliverableVersion && entregaCompartilhada) {
      const midias = lerLista(ap.deliverableVersion.mediaAssetIds).map((id) => `/api/media/${id}`);
      if (midias.length > 0) {
        pecas.push({
          id: `${ap.id}-versao`,
          caption: ap.deliverableVersion.content ?? "",
          format: "arquivo",
          pillar: null,
          scheduledFor: null,
          capa: midias[0] ?? null,
          telas: midias,
        });
      }
    }

    resultado.set(ap.id, pecas);
  }
  return resultado;
}

/** O que o card mostra como corpo. 1º a versão vinculada por FK (a fonte de
 *  verdade); 2º a nota própria; 3º o casamento determinístico por
 *  departamento. Nunca sobra. */
export function corpoDoCard(
  ap: Pick<AprovacaoDb, "deliverableVersion" | "reviewNote" | "department">,
  conteudoDoDepartamento: (dept: string) => string | null,
): string | null {
  return (
    (ap.deliverableVersion
      ? `${ap.deliverableVersion.deliverable.name}\n\n${ap.deliverableVersion.content ?? ""}`.trim()
      : null)
    || ap.reviewNote
    // "proposal" nunca herda texto de entrega: a proposta é o próprio card.
    || (ap.department !== "proposal" ? conteudoDoDepartamento(ap.department) : null)
  );
}

/**
 * O card tem o que mostrar? É a MESMA pergunta que `semConteudo` responde no
 * portal, invertida — e é literalmente a mesma conta, porque é esta função que
 * `/api/brain/portal-data` chama.
 */
export function cardTemCorpo(
  ap: Pick<AprovacaoDb, "deliverableVersion" | "reviewNote" | "department">,
  conteudoDoDepartamento: (dept: string) => string | null,
  pecas: PecaDoCard[],
): boolean {
  return Boolean(corpoDoCard(ap, conteudoDoDepartamento)?.trim()) || pecas.length > 0;
}

/**
 * O casamento entrega→departamento, pela forma CANÔNICA desta casa
 * (`departamentoDoAgente`). Um mapa escrito à mão aqui foi metade da causa dos
 * cards vazios de 07/08.
 *
 * Só entrega EXPLICITAMENTE compartilhada abastece card de portal — o default
 * do schema é "interno", e fail-open aqui vaza rascunho para o cliente.
 */
export async function conteudoPorDepartamento(projectId: string): Promise<(dept: string) => string | null> {
  const deliverables = await prisma.deliverable.findMany({
    where: { projectId, visibility: "compartilhado" },
    orderBy: { createdAt: "asc" },
    select: { name: true, content: true, ownerAgentId: true },
  }).catch(() => [] as Array<{ name: string; content: string | null; ownerAgentId: string | null }>);

  const porDept = new Map<string, string>();
  for (const d of deliverables) {
    const dept = d.ownerAgentId ? departamentoDoAgente(d.ownerAgentId) : null;
    const corpo = `${d.name}\n\n${d.content ?? ""}`.trim();
    if (dept && corpo && !porDept.has(dept)) porDept.set(dept, corpo);
  }
  return (dept: string) => porDept.get(dept) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// O RETRATO DO PACOTE
// ─────────────────────────────────────────────────────────────────────────────

export interface ItemDoPacote {
  /** O id da aprovação — é ele que `aprovarPacote` carimba. */
  id: string;
  /** O nome que o CLIENTE lê. Nunca id de agente, nunca jargão do motor. */
  titulo: string;
}

export interface RetratoDoPacote {
  /**
   * ── ZERO E "NÃO SEI" NUNCA DIVIDEM O MESMO PIXEL ─────────────────────────
   *
   * `false` = a leitura falhou (banco fora do ar, projeto inexistente, mock
   * parcial em teste). NÃO significa "não há entrega pronta".
   *
   * Os dois lados usam isso de forma DIFERENTE, e a diferença é deliberada:
   *
   *   • a LEITURA (`lerFase`) trata não-medido como não-medido e mantém a
   *     etapa antiga — inventar "zero" aqui esconderia o pacote legítimo de
   *     um cliente só porque uma consulta caiu;
   *   • a ESCRITA (`aprovarPacote`) trata não-medido como RECUSA — carimbar
   *     aprovação sobre o que não se conseguiu ler é a assinatura às cegas
   *     com outro nome.
   *
   * É a mesma lição dos três `.catch(() => null)` de 07/08: um `if` que
   * confunde "não sei" com "não há" é o defeito nº 1 do incidente do Drive.
   */
  medido: boolean;
  /**
   * O pacote pode pedir a decisão do cliente?
   *
   * `true` só quando existe PELO MENOS UMA entrega pendente com corpo. Não é
   * "o PM apresentou" (isso é `presentedAt`, e foi exatamente o carimbo que
   * mentiu para o CEO): é "há o que assinar".
   */
  pedeAprovacao: boolean;
  /** O que está dentro do pacote — item por item, para ele saber o que assina. */
  prontas: ItemDoPacote[];
  /** O que ainda não tem material. Aparece na tela como "em produção", nunca
   *  como pendência do cliente, e NUNCA é aprovado junto. */
  emProducao: ItemDoPacote[];
}

/** Não consegui olhar. Não pede aprovação, e não afirma que não há nada. */
const NAO_MEDIDO: RetratoDoPacote = { medido: false, pedeAprovacao: false, prontas: [], emProducao: [] };
/** Olhei, e não há aprovação pendente nenhuma. Isso é uma AFIRMAÇÃO. */
const PACOTE_VAZIO: RetratoDoPacote = { medido: true, pedeAprovacao: false, prontas: [], emProducao: [] };

/** O nome que o CLIENTE vê. Duplicado do portal-data de propósito? Não: é
 *  importado de lá. Ver `NOME_PARA_O_CLIENTE` abaixo. */
export const NOME_PARA_O_CLIENTE: Record<string, string> = {
  proposal:        "Proposta do projeto",
  strategy:        "Estratégia",
  social:          "Social Media",
  "social-media":  "Social Media",
  design:          "Design",
  traffic:         "Tráfego Pago",
  "paid-traffic":  "Tráfego Pago",
  analytics:       "Analytics",
  financeiro:      "Financeiro",
  quality:         "Revisão de Qualidade",
};

/**
 * O retrato do pacote de um projeto.
 *
 * ⚠️ FALHA DE LEITURA NÃO VIRA "PACOTE PRONTO". Qualquer tropeço devolve
 * `PACOTE_VAZIO` — e pacote vazio não pede aprovação. É a direção segura: o
 * pior que acontece é o cliente não ver um botão que ele veria; o contrário é
 * ele assinar às cegas, que é o defeito que estamos consertando.
 */
export async function retratoDoPacote(projectId: string): Promise<RetratoDoPacote> {
  try {
    const projeto = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, clientId: true, clientRequestId: true },
    });
    if (!projeto) return NAO_MEDIDO;

    const alvos: Array<{ clientRequestId: string } | { clientId: string }> = [];
    if (projeto.clientRequestId) alvos.push({ clientRequestId: projeto.clientRequestId });
    if (projeto.clientId)        alvos.push({ clientId: projeto.clientId });
    // Projeto sem cliente e sem solicitação não tem card de portal para ler.
    // Isso é ausência de ALVO, não leitura falha — mas também não autoriza
    // afirmar "não há nada pronto", então continua não-medido.
    if (alvos.length === 0) return NAO_MEDIDO;

    const [aprovacoes, conteudoDoDepartamento] = await Promise.all([
      buscarAprovacoes({ clientVisible: true, OR: alvos }),
      conteudoPorDepartamento(projeto.id),
    ]);

    const pendentes = semDuplicatas(aprovacoes).filter((a) => a.status === "pending");
    if (pendentes.length === 0) return PACOTE_VAZIO;

    const pecasPorCard = await montarPecas(pendentes);

    const prontas: ItemDoPacote[] = [];
    const emProducao: ItemDoPacote[] = [];
    for (const ap of pendentes) {
      const item: ItemDoPacote = {
        id: ap.id,
        titulo: NOME_PARA_O_CLIENTE[ap.department] ?? ap.department,
      };
      if (cardTemCorpo(ap, conteudoDoDepartamento, pecasPorCard.get(ap.id) ?? [])) prontas.push(item);
      else emProducao.push(item);
    }

    return { medido: true, pedeAprovacao: prontas.length > 0, prontas, emProducao };
  } catch (e) {
    // NUNCA lança: `statusDoProjeto` alimenta a tela do cliente, e uma tela de
    // status que não abre porque uma contagem falhou é pior do que uma tela
    // com um número faltando. E nunca devolve "pronto" por engano.
    console.error("[pacote] não consegui ler o pacote do projeto", projectId, e);
    return NAO_MEDIDO;
  }
}
