import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const configs = await prisma.dbIntegrationConfig.findMany({
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

  const body = await request.json() as {
    integrationId: string;
    configured?: boolean;
    selectedModel?: string;
    configWorkspace?: string;
    accountId?: string;
    folder?: string;
    webhookUrl?: string;
    lastTestStatus?: string;
    lastTestAt?: string;
    lastTestMessage?: string;
  };

  const config = await prisma.dbIntegrationConfig.upsert({
    where: { workspaceId_integrationId: { workspaceId: session.workspaceId, integrationId: body.integrationId } },
    create: {
      workspaceId:     session.workspaceId,
      integrationId:   body.integrationId,
      configured:      body.configured      ?? false,
      selectedModel:   body.selectedModel   ?? null,
      configWorkspace: body.configWorkspace ?? null,
      accountId:       body.accountId       ?? null,
      folder:          body.folder          ?? null,
      webhookUrl:      body.webhookUrl       ?? null,
      lastTestStatus:  body.lastTestStatus  ?? "not_run",
      lastTestAt:      body.lastTestAt      ? new Date(body.lastTestAt) : null,
      lastTestMessage: body.lastTestMessage ?? null,
      lastConfiguredAt: body.configured ? new Date() : null,
    },
    update: {
      configured:      body.configured      ?? undefined,
      selectedModel:   body.selectedModel   ?? undefined,
      configWorkspace: body.configWorkspace ?? undefined,
      accountId:       body.accountId       ?? undefined,
      folder:          body.folder          ?? undefined,
      webhookUrl:      body.webhookUrl       ?? undefined,
      lastTestStatus:  body.lastTestStatus  ?? undefined,
      lastTestAt:      body.lastTestAt      ? new Date(body.lastTestAt) : undefined,
      lastTestMessage: body.lastTestMessage ?? undefined,
      lastConfiguredAt: body.configured ? new Date() : undefined,
    },
  });
  return NextResponse.json(config);
}
