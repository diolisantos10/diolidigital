import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  const rooms = await prisma.strategyRoom.findMany({
    where: {
      project: { workspaceId: session.workspaceId },
      ...(projectId ? { projectId } : {}),
    },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(rooms);
}

// Upsert a strategy room for a project. The full StrategyRoom object is passed
// in `room` and stored as JSON. The recommender runs client-side; this only
// persists the result.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  if (!body.projectId || !body.room) {
    return NextResponse.json({ error: "projectId and room required" }, { status: 400 });
  }

  const project = await prisma.project.findFirst({
    where: { id: body.projectId, workspaceId: session.workspaceId },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const analysisJson = JSON.stringify(body.room);
  const status       = body.room.status ?? "ready";
  const clientId     = body.room.clientId ?? project.clientId;

  const room = await prisma.strategyRoom.upsert({
    where:  { projectId: body.projectId },
    create: { projectId: body.projectId, clientId, status, analysisJson },
    update: { clientId, status, analysisJson },
  });
  return NextResponse.json(room, { status: 201 });
}
