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

  const client = await prisma.client.findFirst({
    where: { id, workspaceId: session.workspaceId },
    include: { brandBrain: true },
  });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(client);
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

  // Ensure client belongs to workspace
  const existing = await prisma.client.findFirst({ where: { id, workspaceId: session.workspaceId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const client = await prisma.client.update({
    where: { id },
    data: {
      name:     body.name     ?? existing.name,
      industry: body.industry ?? existing.industry,
      email:    body.email    ?? existing.email,
      phone:    body.phone    ?? existing.phone,
      website:  body.website  ?? existing.website,
    },
  });
  return NextResponse.json(client);
}
