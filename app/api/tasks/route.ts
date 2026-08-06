import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { criarTarefas } from "@/lib/agency/tarefas/criar-tarefas";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  const tasks = await prisma.task.findMany({
    where: {
      project: { workspaceId: session.workspaceId },
      ...(projectId ? { projectId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(tasks);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  if (!body.projectId || !body.title) {
    return NextResponse.json({ error: "projectId and title required" }, { status: 400 });
  }

  const project = await prisma.project.findFirst({
    where: { id: body.projectId, workspaceId: session.workspaceId },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // PORTÃO DO PM — `pm_task_owner` e `pm_deadline` (`lib/agency/tarefas/portao-do-pm.ts`).
  // Aqui quem chama é gente da agência, então o portão RESPONDE em vez de só
  // registrar: 422 com o motivo, para o operador corrigir na hora. Criar a
  // tarefa e reclamar depois seria o aviso que a casa proíbe.
  const { criadas, veredicto } = await criarTarefas(body.projectId, [{
    title:       body.title,
    description: body.description ?? null,
    agentId:     body.agentId     ?? null,
    status:      body.status      ?? "pending",
    dueDate:     body.dueDate     ?? null,
  }]);

  if (criadas === 0) {
    return NextResponse.json(
      {
        error: "Tarefa reprovada no portão do PM",
        motivo: veredicto.reprovadas[0]?.parecer ?? "sem dono e/ou sem prazo",
        violacoes: veredicto.reprovadas[0]?.violacoes ?? [],
      },
      { status: 422 },
    );
  }

  const task = await prisma.task.findFirst({
    where: { projectId: body.projectId, title: body.title },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(task, { status: 201 });
}
