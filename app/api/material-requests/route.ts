import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const clientId  = searchParams.get("clientId");

  let projectIds: string[] | undefined;
  if (clientId) {
    const projects = await prisma.project.findMany({
      where: { workspaceId: session.workspaceId, clientId },
      select: { id: true },
    });
    projectIds = projects.map((p) => p.id);
  }

  const requests = await prisma.materialRequest.findMany({
    where: {
      project: { workspaceId: session.workspaceId },
      ...(projectId ? { projectId } : {}),
      ...(projectIds ? { projectId: { in: projectIds } } : {}),
    },
    include: { project: { select: { clientId: true } } },
    orderBy: { requestedAt: "desc" },
  });

  return NextResponse.json(requests.map((r) => ({ ...r, clientId: r.project.clientId })));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  if (!body.projectId || !body.title) {
    return NextResponse.json({ error: "projectId and title required" }, { status: 400 });
  }

  const project = await prisma.project.findFirst({
    where: { id: body.projectId, workspaceId: session.workspaceId },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const req = await prisma.materialRequest.create({
    data: {
      projectId:   body.projectId,
      type:        body.title,
      description: body.description ?? "",
      status:      body.status ?? "pending",
    },
    include: { project: { select: { clientId: true } } },
  });

  return NextResponse.json({ ...req, clientId: req.project.clientId }, { status: 201 });
}
