import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const clientId  = searchParams.get("clientId");

  const briefings = await prisma.briefing.findMany({
    where: {
      project: { workspaceId: session.workspaceId },
      ...(projectId ? { projectId } : {}),
      ...(clientId ? { clientId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(briefings);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  if (!body.projectId || !body.goal) {
    return NextResponse.json({ error: "projectId and goal required" }, { status: 400 });
  }

  const project = await prisma.project.findFirst({
    where: { id: body.projectId, workspaceId: session.workspaceId },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const briefing = await prisma.briefing.create({
    data: {
      projectId:       body.projectId,
      clientId:        body.clientId ?? project.clientId,
      goal:            body.goal,
      audience:        body.audience        ?? "",
      keyMessage:      body.keyMessage      ?? "",
      deliverables:    body.deliverables    ?? "",
      deadline:        body.deadline        ?? "",
      successCriteria: body.successCriteria ?? "",
      notes:           body.notes           ?? null,
      status:          body.status          ?? "pending_analysis",
    },
  });
  return NextResponse.json(briefing, { status: 201 });
}
