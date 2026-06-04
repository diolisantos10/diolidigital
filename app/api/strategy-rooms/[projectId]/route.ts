import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";

type Params = { projectId: string };

export async function GET(
  _request: NextRequest,
  context: { params: Promise<Params> }
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await context.params;

  const room = await prisma.strategyRoom.findFirst({
    where: { projectId, project: { workspaceId: session.workspaceId } },
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(room);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<Params> }
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await context.params;

  const existing = await prisma.strategyRoom.findFirst({
    where: { projectId, project: { workspaceId: session.workspaceId } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const room = await prisma.strategyRoom.update({
    where: { projectId },
    data: {
      status:       body.room?.status ?? body.status ?? existing.status,
      analysisJson: body.room ? JSON.stringify(body.room) : existing.analysisJson,
    },
  });
  return NextResponse.json(room);
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<Params> }
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await context.params;

  const existing = await prisma.strategyRoom.findFirst({
    where: { projectId, project: { workspaceId: session.workspaceId } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.strategyRoom.delete({ where: { projectId } });
  return NextResponse.json({ deleted: true });
}
