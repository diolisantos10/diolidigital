// POST /api/projects/[id]/execute
//
// O gatilho MANUAL da produção (o botão). Autentica, confere posse do projeto e
// chama o NÚCLEO durável (lib/agency/execution/run-execution). A confiabilidade
// mora no núcleo: o progresso é marcado no banco e um cron recupera o que travar
// — então mesmo que esta chamada caia no meio (aba fechou, timeout), a produção
// não se perde. Idempotente: departamento já produzido é pulado.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";
import { runProjectExecution } from "@/lib/agency/execution/run-execution";

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { session, error } = await requireSession(["master", "project_manager", "executivo_comercial"]);
  if (error) return error;
  const { id: projectId } = await ctx.params;

  // Posse: o projeto é do workspace da sessão? (o núcleo roda sem sessão, então
  // a checagem de posse fica aqui, no gatilho manual.)
  const owned = await prisma.project.findFirst({ where: { id: projectId, workspaceId: session.workspaceId }, select: { id: true } });
  if (!owned) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });

  const result = await runProjectExecution(projectId);
  if (!result.ok && result.status === "failed") {
    return NextResponse.json(result, { status: 500 });
  }
  return NextResponse.json(result);
}
