import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");

  const projects = await prisma.project.findMany({
    where: {
      workspaceId: session.workspaceId,
      ...(clientId ? { clientId } : {}),
    },
    include: { client: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(projects);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["master", "project_manager"].includes(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const project = await prisma.project.create({
    data: {
      workspaceId: session.workspaceId,
      clientId:    body.clientId,
      name:        body.name,
      goal:        body.goal ?? null,
      type:        body.type ?? null,
      stage:       body.stage ?? "briefing",
      priority:    body.priority ?? "medium",
      deadline:    body.deadline ?? null,
      agents:      JSON.stringify(body.agents ?? []),
    },
  });
  return NextResponse.json(project, { status: 201 });
}
