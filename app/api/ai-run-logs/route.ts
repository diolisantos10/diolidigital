import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const departmentId = searchParams.get("departmentId");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100", 10), 500);

  const logs = await prisma.aIRunLog.findMany({
    where: {
      workspaceId: session.workspaceId,
      ...(departmentId ? { departmentId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json(logs);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  if (!body.departmentId) {
    return NextResponse.json({ error: "departmentId required" }, { status: 400 });
  }

  const log = await prisma.aIRunLog.create({
    data: {
      workspaceId:    session.workspaceId,
      departmentId:   body.departmentId,
      projectId:      body.projectId      ?? null,
      provider:       body.provider       ?? "rule_based",
      model:          body.model          ?? "rule_based",
      status:         body.status         ?? "success",
      fallbackUsed:   body.fallbackUsed   ?? false,
      fallbackReason: body.fallbackReason ?? null,
      promptSummary:  body.promptSummary  ?? null,
      outputSummary:  body.outputSummary  ?? null,
      warnings:       JSON.stringify(body.warnings ?? []),
    },
  });

  return NextResponse.json(log, { status: 201 });
}
