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

  const existing = await prisma.briefing.findFirst({
    where: { id, project: { workspaceId: session.workspaceId } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const briefing = await prisma.briefing.update({
    where: { id },
    data: {
      status:          body.status          ?? existing.status,
      goal:            body.goal            ?? existing.goal,
      audience:        body.audience        ?? existing.audience,
      keyMessage:      body.keyMessage      ?? existing.keyMessage,
      deliverables:    body.deliverables    ?? existing.deliverables,
      deadline:        body.deadline        ?? existing.deadline,
      successCriteria: body.successCriteria ?? existing.successCriteria,
      notes:           body.notes           ?? existing.notes,
    },
  });
  return NextResponse.json(briefing);
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<Params> }
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const existing = await prisma.briefing.findFirst({
    where: { id, project: { workspaceId: session.workspaceId } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.briefing.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
