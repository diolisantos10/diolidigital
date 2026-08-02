// retrato.ts — junta o dado real e entrega a leitura pronta da esteira.
//
// A regra é: EXISTE UM SÓ LUGAR que responde "como está o projeto". A tela da
// agência e o portal do cliente chamam este mesmo arquivo e recebem a mesma
// verdade, cada um na sua linguagem. Se cada tela montasse a própria leitura,
// elas divergiriam na primeira mudança — e a pior versão disso é o cliente
// enxergando um estado e a equipe outro.

import { prisma } from "@/lib/db/client";
import { lerFase, trilhaMarcada, nomeDoResponsavel, type LeituraDaFase, type RetratoDoProjeto } from "./fases";
import { contarTarefas } from "./tarefas";
import { pedidosAbertos, type PedidoAberto } from "./pedidos";
import { cicloAberto, type CicloResumido } from "./ciclos";

export interface StatusDoProjeto {
  projectId: string;
  nome: string;
  cliente: string | null;
  leitura: LeituraDaFase;
  responsavelLegivel: string;
  trilha: ReturnType<typeof trilhaMarcada>;
  /** O que está travando agora, para a equipe agir e o cliente entender. */
  pendencias: PedidoAberto[];
  ciclo: CicloResumido | null;
  /** Contagens cruas, para quem quiser detalhar. */
  numeros: RetratoDoProjeto;
}

const STATUS_ACEITE = ["accepted", "won", "closed_won", "aceito", "in_production"];

/**
 * Monta o status completo de um projeto.
 *
 * Tolerante a falha por construção: se uma consulta cair, o pedaço dela vem
 * zerado e a leitura ainda sai. Uma tela de status que não abre porque uma
 * contagem falhou é pior do que uma tela com um número faltando.
 */
export async function statusDoProjeto(projectId: string): Promise<StatusDoProjeto | null> {
  const projeto = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true, name: true, clientRequestId: true, stage: true,
      executionStatus: true, directionApprovedAt: true, presentedAt: true, clientApprovedAt: true,
      workspaceId: true, clientId: true,
      client: { select: { name: true } },
    },
  }).catch(() => null);
  if (!projeto) return null;

  const [tarefas, pendencias, ciclo, entregaveis, solicitacao, posts, conexoes] = await Promise.all([
    contarTarefas(projectId),
    pedidosAbertos(projectId),
    cicloAberto(projectId),
    prisma.deliverable.groupBy({
      by: ["status", "revisionStatus"],
      where: { projectId },
      _count: { _all: true },
    }).catch(() => [] as Array<{ status: string; revisionStatus: string | null; _count: { _all: number } }>),
    projeto.clientRequestId
      ? prisma.clientRequestDb.findUnique({ where: { id: projeto.clientRequestId }, select: { status: true } }).catch(() => null)
      : Promise.resolve(null),
    // O que já foi ao ar de verdade. É isto que autoriza a esteira a dizer
    // "publicando" — contagem, não suposição.
    projeto.clientRequestId
      ? prisma.socialPost.groupBy({
          by: ["status"],
          where: { clientRequestId: projeto.clientRequestId },
          _count: { _all: true },
        }).catch(() => [] as Array<{ status: string; _count: { _all: number } }>)
      : Promise.resolve([] as Array<{ status: string; _count: { _all: number } }>),
    prisma.metaConnection.count({
      where: { workspaceId: projeto.workspaceId, clientId: projeto.clientId, status: "connected" },
    }).catch(() => 0),
  ]);

  const contarPosts = (status: string) =>
    posts.find((p) => p.status === status)?._count._all ?? 0;

  let total = 0, emRevisao = 0, comRessalva = 0, aprovados = 0;
  for (const linha of entregaveis) {
    const n = linha._count._all;
    total += n;
    if (linha.status === "in_review") emRevisao += n;
    if (linha.status === "approved") aprovados += n;
    if (linha.revisionStatus === "quality_flag") comRessalva += n;
  }

  const statusSolicitacao = solicitacao?.status ?? null;
  const numeros: RetratoDoProjeto = {
    statusDaSolicitacao: statusSolicitacao,
    // Aceite comprovado por qualquer sinal forte: o carimbo de direção já
    // pressupõe aceite, e projetos antigos não têm o status novo.
    propostaAceita:
      Boolean(projeto.directionApprovedAt) ||
      Boolean(projeto.presentedAt) ||
      STATUS_ACEITE.includes((statusSolicitacao ?? "").toLowerCase()) ||
      (projeto.stage ?? "") !== "briefing",
    direcaoAprovadaEm: projeto.directionApprovedAt,
    apresentadoEm: projeto.presentedAt,
    aprovadoPeloClienteEm: projeto.clientApprovedAt,
    execucao: projeto.executionStatus,
    tarefas,
    entregaveis: { total, emRevisao, comRessalva, aprovados },
    pedidosAbertos: pendencias.length,
    cicloAberto: ciclo !== null,
    redesConectadas: conexoes > 0,
    postsPublicados: contarPosts("published"),
    postsAgendados: contarPosts("scheduled"),
  };

  const leitura = lerFase(numeros);

  return {
    projectId: projeto.id,
    nome: projeto.name,
    cliente: projeto.client?.name ?? null,
    leitura,
    responsavelLegivel: nomeDoResponsavel(leitura.responsavel),
    trilha: trilhaMarcada(leitura.fase),
    pendencias,
    ciclo,
    numeros,
  };
}

/**
 * O status pela solicitação do cliente — é assim que o portal chega, já que o
 * cliente não conhece o id do projeto.
 */
export async function statusPelaSolicitacao(clientRequestId: string): Promise<StatusDoProjeto | null> {
  const projeto = await prisma.project.findFirst({
    where: { clientRequestId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  }).catch(() => null);
  if (!projeto) return null;
  return statusDoProjeto(projeto.id);
}
