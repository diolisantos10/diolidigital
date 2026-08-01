// materiais.ts — "o material chegou" volta a ser um evento que MOVE a esteira.
//
// O buraco que isto fecha: um agente travava por falta de logo, o gerente de
// projeto cobrava o cliente, o cliente mandava... e nada acontecia. O pedido
// virava "recebido" numa tabela e a produção continuava parada — para sempre.
// O projeto ficava vivo no papel e morto na prática, e ninguém era avisado,
// porque do lado de dentro parecia que a bola estava com o cliente.
//
// A regra: material recebido **re-enfileira** a produção. Não produz aqui, na
// requisição HTTP — marca `pending` no banco e deixa o motor rodar. Se o
// processo cair no meio, o despertador encontra o projeto e retoma. Produção
// que depende de uma aba de navegador aberta é a falha que esta casa já teve.

import { prisma } from "@/lib/db/client";
import { moverTarefasDoAgente } from "@/lib/agency/esteira/tarefas";

export interface MaterialRecebido {
  ok: boolean;
  /** Ainda falta material? Então a produção continua esperando de propósito. */
  aindaFaltam: number;
  /** A produção foi re-enfileirada nesta chamada? */
  producaoRetomada: boolean;
  erro?: string;
}

/**
 * Marca um pedido de material como atendido e, se não faltar mais nada,
 * devolve a produção para a fila.
 *
 * Idempotente: marcar duas vezes não re-enfileira duas vezes nem duplica nada
 * — o motor pula quem já entregou.
 */
export async function materialRecebido(materialRequestId: string): Promise<MaterialRecebido> {
  const pedido = await prisma.materialRequest.findUnique({
    where: { id: materialRequestId },
    select: { id: true, projectId: true, status: true, requestedByAgentId: true },
  });
  if (!pedido) return { ok: false, aindaFaltam: 0, producaoRetomada: false, erro: "Pedido não encontrado" };

  if (pedido.status !== "received") {
    await prisma.materialRequest.update({
      where: { id: materialRequestId },
      data: { status: "received", resolvedAt: new Date() },
    });
  }

  // O agente que estava travado volta para a fila — a tarefa dele deixa de
  // mentir que está bloqueada.
  if (pedido.requestedByAgentId) {
    await moverTarefasDoAgente(pedido.projectId, pedido.requestedByAgentId, "pending")
      .catch(() => { /* best-effort: o destrave não pode falhar por causa do quadro */ });
  }

  // Falta mais alguma coisa? Então continua esperando — retomar agora produziria
  // metade e cobraria o cliente de novo pelo resto.
  const aindaFaltam = await prisma.materialRequest.count({
    where: { projectId: pedido.projectId, status: "pending" },
  });
  if (aindaFaltam > 0) return { ok: true, aindaFaltam, producaoRetomada: false };

  // Chegou tudo. De volta para a fila — o motor (ou o despertador) segue daqui.
  const projeto = await prisma.project.findUnique({
    where: { id: pedido.projectId },
    select: { directionApprovedAt: true, executionStatus: true },
  });
  // Sem o aval da direção não se produz nada, nem com todo o material do mundo.
  if (!projeto?.directionApprovedAt) return { ok: true, aindaFaltam: 0, producaoRetomada: false };
  // Já está rodando? Deixa rodar.
  if (projeto.executionStatus === "running") return { ok: true, aindaFaltam: 0, producaoRetomada: false };

  await prisma.project.update({
    where: { id: pedido.projectId },
    data: {
      executionStatus: "pending",
      executionRequestedAt: new Date(),
      executionError: null,
      // Zera o contador: as tentativas anteriores falharam por falta de
      // material, não por defeito. Sem isto, um projeto que esperou material
      // chegaria ao teto de tentativas e nunca mais seria retomado.
      executionAttempts: 0,
    },
  });

  return { ok: true, aindaFaltam: 0, producaoRetomada: true };
}
