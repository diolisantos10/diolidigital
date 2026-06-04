import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const configs = await prisma.dbAgentProviderConfig.findMany({
    where: { workspaceId: session.workspaceId },
  });
  return NextResponse.json(configs);
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["master"].includes(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json() as { agentId: string; selectedProvider: string; selectedModel?: string };

  const config = await prisma.dbAgentProviderConfig.upsert({
    where: { workspaceId_agentId: { workspaceId: session.workspaceId, agentId: body.agentId } },
    create: {
      workspaceId:      session.workspaceId,
      agentId:          body.agentId,
      selectedProvider: body.selectedProvider,
      selectedModel:    body.selectedModel ?? null,
    },
    update: {
      selectedProvider: body.selectedProvider,
      selectedModel:    body.selectedModel ?? null,
    },
  });
  return NextResponse.json(config);
}
