import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const clientId  = searchParams.get("clientId");
  const projectId = searchParams.get("projectId");
  const limit     = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);

  const events = await prisma.activityEvent.findMany({
    where: {
      workspaceId: session.workspaceId,
      ...(clientId  ? { clientId }  : {}),
      ...(projectId ? { projectId } : {}),
    },
    orderBy: { timestamp: "desc" },
    take: limit,
  });

  return NextResponse.json(events);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  if (!body.type || !body.message) {
    return NextResponse.json({ error: "type and message required" }, { status: 400 });
  }

  const event = await prisma.activityEvent.create({
    data: {
      workspaceId: session.workspaceId,
      type:        body.type,
      message:     body.message,
      projectId:   body.projectId ?? null,
      clientId:    body.clientId  ?? null,
    },
  });

  return NextResponse.json(event, { status: 201 });
}
