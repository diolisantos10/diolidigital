// O PONTO ÚNICO DE CRIAÇÃO DE TAREFA — e a trava do portão do PM.
//
// Por que ponto ÚNICO e não uma conferência em cada rota: conferência espalhada
// é aviso, não trava. Basta uma rota nova esquecer de chamar e o furo volta
// inteiro, sem ninguém perceber — foi assim que quatro rotas passaram a criar
// tarefa sem dono e sem prazo (`create-project-from-request.ts:61`,
// `brain/orchestrate/apply`, `brain/auto-scope/[id]/review`, `api/tasks`).
// Aqui a trava é estrutural: quem quiser gravar uma Task passa por esta função,
// e um teste de guarda (`__tests__/agency/portao-do-pm.test.ts`) reprova
// qualquer `prisma.task.create` novo fora daqui.
//
// O QUE ACONTECE COM A TAREFA REPROVADA: ela **não é gravada**. Não vira status
// novo, não vira coluna, não vira fila paralela — a casa já tem 6 estados
// gravados que ninguém lê e não vai ganhar o sétimo. O que fica é um
// `ActivityEvent` do tipo `portao_do_pm_barrou`, que a linha do tempo do
// workspace já renderiza hoje.

import { prisma } from "@/lib/db/client";
import {
  conferirPortaoDoPM,
  type TarefaProposta,
  type VeredictoDoPortaoDoPM,
} from "./portao-do-pm";

export interface ResultadoDaCriacaoDeTarefas {
  criadas: number;
  veredicto: VeredictoDoPortaoDoPM;
}

/**
 * Grava as tarefas que PASSAM no portão do PM. As reprovadas não entram.
 *
 * `projectId` é exigido à parte porque todas as tarefas de uma chamada são do
 * mesmo projeto — é dele que saem o workspace e o cliente do registro.
 */
export async function criarTarefas(
  projectId: string,
  tarefas: Array<Omit<TarefaProposta, "projectId">>,
): Promise<ResultadoDaCriacaoDeTarefas> {
  const propostas: TarefaProposta[] = tarefas.map((t) => ({ ...t, projectId }));
  const veredicto = conferirPortaoDoPM(propostas);

  if (veredicto.aprovadas.length > 0) {
    await prisma.task.createMany({
      data: veredicto.aprovadas.map((t) => ({
        projectId,
        title: t.title,
        description: t.description ?? null,
        agentId: t.agentId ?? null,
        status: t.status ?? "pending",
        dueDate: t.dueDate ?? null,
      })),
    });
  }

  if (veredicto.reprovadas.length > 0) {
    // Best-effort: o registro do bloqueio não pode derrubar a criação do
    // projeto. Mas o bloqueio em si já aconteceu — ele não depende deste await.
    await prisma.project
      .findUnique({ where: { id: projectId }, select: { workspaceId: true, clientId: true } })
      .then((p) => {
        if (!p) return null;
        const detalhe = veredicto.reprovadas
          .map((r) => `"${r.title}" (${r.parecer})`)
          .join(" · ");
        return prisma.activityEvent.create({
          data: {
            workspaceId: p.workspaceId,
            projectId,
            clientId: p.clientId,
            type: "portao_do_pm_barrou",
            message:
              `${veredicto.reprovadas.length} tarefa(s) NÃO foram criadas — o portão do PM reprovou: ${detalhe}`.slice(0, 900),
          },
        });
      })
      .catch(() => {
        /* registro é best-effort; a trava não é */
      });
  }

  return { criadas: veredicto.aprovadas.length, veredicto };
}
