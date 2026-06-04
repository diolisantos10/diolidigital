import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";

type Params = { id: string };

export async function PUT(
  request: NextRequest,
  context: { params: Promise<Params> }
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const existing = await prisma.deliverable.findFirst({
    where: { id, project: { workspaceId: session.workspaceId } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const deliverable = await prisma.deliverable.update({
    where: { id },
    data: {
      status:         body.status         ?? existing.status,
      revisionStatus: body.revisionStatus ?? existing.revisionStatus,
      content:        body.content        ?? existing.content,
      clientFeedback: body.clientFeedback ?? existing.clientFeedback,
      lastFeedback:   body.lastFeedback   ?? existing.lastFeedback,
      version:        body.version        ?? existing.version,
      revisionHistory: body.revisionHistory
        ? JSON.stringify(body.revisionHistory)
        : existing.revisionHistory,
    },
  });
  return NextResponse.json(deliverable);
}
