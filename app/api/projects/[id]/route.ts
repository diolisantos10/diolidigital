import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";

type Params = { id: string };

export async function GET(
  _request: NextRequest,
  context: { params: Promise<Params> }
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const project = await prisma.project.findFirst({
    where: { id, workspaceId: session.workspaceId },
    include: {
      client:      { select: { id: true, name: true } },
      deliverables: true,
      materialRequests: true,
      strategyRooms: true,
    },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(project);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<Params> }
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["master", "project_manager"].includes(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await context.params;

  const existing = await prisma.project.findFirst({ where: { id, workspaceId: session.workspaceId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const project = await prisma.project.update({
    where: { id },
    data: {
      name:            body.name            ?? existing.name,
      goal:            body.goal            ?? existing.goal,
      stage:           body.stage           ?? existing.stage,
      priority:        body.priority        ?? existing.priority,
      deadline:        body.deadline        ?? existing.deadline,
      proposalStatus:  body.proposalStatus  ?? existing.proposalStatus,
      proposalPricing: body.proposalPricing ?? existing.proposalPricing,
      proposalScope:   body.proposalScope   ?? existing.proposalScope,
      proposalSentAt:  body.proposalSentAt  ?? existing.proposalSentAt,
      agents:          body.agents ? JSON.stringify(body.agents) : existing.agents,
    },
  });
  return NextResponse.json(project);
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<Params> }
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "master") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await context.params;

  const existing = await prisma.project.findFirst({ where: { id, workspaceId: session.workspaceId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    // Non-cascading optional refs must be detached first; cascading children
    // (tasks, deliverables, strategy rooms, etc.) go with the project.
    await prisma.$transaction([
      prisma.activityEvent.updateMany({ where: { projectId: id }, data: { projectId: null } }),
      prisma.aIRunLog.updateMany({ where: { projectId: id }, data: { projectId: null } }),
      prisma.project.delete({ where: { id } }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[projects] DELETE error", e);
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}
