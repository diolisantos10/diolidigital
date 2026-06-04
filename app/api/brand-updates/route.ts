import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");
  const status   = searchParams.get("status");

  const updates = await prisma.brandUpdate.findMany({
    where: {
      client: { workspaceId: session.workspaceId },
      ...(clientId ? { clientId } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { submittedAt: "desc" },
  });
  return NextResponse.json(updates);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  if (!body.clientId || !body.field) {
    return NextResponse.json({ error: "clientId and field required" }, { status: 400 });
  }

  // Ensure client belongs to workspace
  const client = await prisma.client.findFirst({
    where: { id: body.clientId, workspaceId: session.workspaceId },
  });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const update = await prisma.brandUpdate.create({
    data: {
      clientId:       body.clientId,
      field:          body.field,
      suggestedValue: body.suggestedValue ?? "",
      currentValue:   body.currentValue   ?? null,
      source:         body.source         ?? "manual",
      status:         body.status         ?? "pending",
      note:           body.note           ?? null,
      fileName:       body.fileName        ?? null,
    },
  });
  return NextResponse.json(update, { status: 201 });
}
