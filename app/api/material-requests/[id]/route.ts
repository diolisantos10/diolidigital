import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";

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
  const updated = await prisma.materialRequest.update({
    where: { id },
    data: {
      status:     body.status     ?? existing.status,
      resolvedAt: body.status === "received" ? new Date() : existing.resolvedAt,
    },
    include: { project: { select: { clientId: true } } },
  });

  return NextResponse.json({ ...updated, clientId: updated.project.clientId });
}
