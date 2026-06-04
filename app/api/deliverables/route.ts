import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  // Scope to workspace via project relation
  const deliverables = await prisma.deliverable.findMany({
    where: {
      project: { workspaceId: session.workspaceId },
      ...(projectId ? { projectId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(deliverables);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  // Verify project belongs to workspace
  const project = await prisma.project.findFirst({
    where: { id: body.projectId, workspaceId: session.workspaceId },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const deliverable = await prisma.deliverable.create({
    data: {
      projectId:    body.projectId,
      name:         body.name,
      type:         body.type,
      status:       body.status       ?? "draft",
      content:      body.content      ?? null,
      ownerAgentId: body.ownerAgentId ?? null,
    },
  });
  return NextResponse.json(deliverable, { status: 201 });
}
