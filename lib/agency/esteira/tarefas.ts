// tarefas.ts — a tarefa segue a produção.
//
// O buraco que este arquivo fecha: o gerente de projeto criava as tarefas quando
// o projeto nascia, o motor produzia por departamento, e as duas coisas nunca se
// falavam. Resultado: o quadro do projeto congelava em "pendente" para sempre.
// Alguém olhava o sistema e não sabia quem estava trabalhando, quem entregou e
// quem travou — mesmo com a produção rodando normalmente por baixo.
//
// Aqui a tarefa passa a ser o REFLEXO da produção, não um registro paralelo que
// alguém precisa lembrar de atualizar. Quem move a tarefa é o motor, no mesmo
// instante em que o trabalho acontece.
//
// O vocabulário é o que a interface já usa (pending / in_progress / review /
// done / blocked) — inventar nomes novos quebraria todas as telas existentes por
// nenhum ganho real.

import { prisma } from "@/lib/db/client";

export type EstadoDaTarefa = "pending" | "in_progress" | "review" | "done" | "blocked";

export const ESTADO_LEGIVEL: Record<EstadoDaTarefa, string> = {
  pending:     "Na fila",
  in_progress: "Produzindo",
  review:      "Em revisão",
  done:        "Entregue",
  blocked:     "Parado esperando o cliente",
};

/** Estados que ainda contam como trabalho em aberto. */
const ABERTOS: EstadoDaTarefa[] = ["pending", "in_progress", "review", "blocked"];

/**
 * Move as tarefas de um agente dentro de um projeto.
 *
 * Best-effort de propósito: mover a tarefa é VISIBILIDADE, e visibilidade nunca
 * pode derrubar a produção. Se a escrita falhar, o trabalho continua e o quadro
 * fica desatualizado — o contrário (perder a entrega para manter o quadro em dia)
 * seria uma péssima troca.
 *
 * `apenasSeAberta` protege o caso de re-execução: uma tarefa já entregue não
 * volta para "produzindo" só porque o cron passou de novo.
 */
export async function moverTarefasDoAgente(
  projectId: string,
  agentId: string,
  estado: EstadoDaTarefa,
  opts: { apenasSeAberta?: boolean } = {},
): Promise<number> {
  try {
    const where = {
      projectId,
      agentId,
      ...(opts.apenasSeAberta === false ? {} : { status: { in: ABERTOS } }),
    };
    const r = await prisma.task.updateMany({ where, data: { status: estado } });
    return r.count;
  } catch (e) {
    console.warn("[esteira] não consegui mover a tarefa (a produção segue):", e instanceof Error ? e.message : e);
    return 0;
  }
}

/** Liga a tarefa entregue ao entregável que a cumpriu, para o quadro linkar. */
export async function marcarEntregue(projectId: string, agentId: string, deliverableId: string): Promise<number> {
  try {
    const r = await prisma.task.updateMany({
      where: { projectId, agentId, status: { in: ABERTOS } },
      data: { status: "done", deliverableId },
    });
    return r.count;
  } catch (e) {
    console.warn("[esteira] não consegui marcar a tarefa como entregue:", e instanceof Error ? e.message : e);
    return 0;
  }
}

export interface ContagemDeTarefas {
  total: number;
  entregues: number;
  produzindo: number;
  bloqueadas: number;
}

/** O retrato do quadro — alimenta a leitura de fase e a faixa de status. */
export async function contarTarefas(projectId: string): Promise<ContagemDeTarefas> {
  try {
    const linhas = await prisma.task.groupBy({
      by: ["status"],
      where: { projectId },
      _count: { _all: true },
    });
    const por = new Map(linhas.map((l) => [l.status, l._count._all]));
    const n = (s: string) => por.get(s) ?? 0;
    return {
      total: [...por.values()].reduce((a, b) => a + b, 0),
      entregues: n("done") + n("completed"),
      produzindo: n("in_progress") + n("review"),
      bloqueadas: n("blocked"),
    };
  } catch {
    return { total: 0, entregues: 0, produzindo: 0, bloqueadas: 0 };
  }
}
