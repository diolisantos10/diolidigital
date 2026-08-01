import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { materialRecebido } from "@/lib/agency/esteira/materiais";

type Params = { id: string };

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<Params> }
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const existing = await prisma.materialRequest.findFirst({
    where: { id, project: { workspaceId: session.workspaceId } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();

  // "Recebido" não é só uma mudança de status — é o evento que DESTRAVA a
  // produção. Antes disto, o material chegava e o projeto continuava parado
  // para sempre, porque nada ligava uma coisa à outra.
  let retomada: Awaited<ReturnType<typeof materialRecebido>> | undefined;
  if (body.status === "received") {
    retomada = await materialRecebido(id);
  } else {
    await prisma.materialRequest.update({
      where: { id },
      data: { status: body.status ?? existing.status },
    });
  }

  const updated = await prisma.materialRequest.findUniqueOrThrow({
    where: { id },
    include: { project: { select: { clientId: true } } },
  });

  return NextResponse.json({
    ...updated,
    clientId: updated.project.clientId,
    ...(retomada ? { aindaFaltam: retomada.aindaFaltam, producaoRetomada: retomada.producaoRetomada } : {}),
  });
}
