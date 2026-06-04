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

  return NextResponse.json(client.brandBrain ?? null);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<Params> }
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const client = await prisma.client.findFirst({
    where: { id, workspaceId: session.workspaceId },
  });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();

  // Map UI BrandBrain fields → DB BrandBrain fields
  const valuesArr: string[] = [];
  if (body.brandRules) {
    valuesArr.push(...(body.brandRules as string).split("\n").filter(Boolean));
  }

  // Extract primary/secondary from combined colors string (e.g. "#abc · #def")
  const colorParts = (body.colors as string | undefined)?.split("·").map((s: string) => s.trim()) ?? [];

  const brain = await prisma.brandBrain.upsert({
    where: { clientId: id },
    create: {
      clientId:      id,
      tone:          body.toneOfVoice    ?? null,
      positioning:   body.positioning    ?? null,
      targetAudience: body.targetAudience ?? null,
      primaryColor:  colorParts[0]       ?? null,
      secondaryColor: colorParts[1]      ?? null,
      typography:    body.fonts          ?? null,
      values:        JSON.stringify(valuesArr),
    },
    update: {
      tone:          body.toneOfVoice    ?? undefined,
      positioning:   body.positioning    ?? undefined,
      targetAudience: body.targetAudience ?? undefined,
      primaryColor:  colorParts[0]       ?? undefined,
      secondaryColor: colorParts[1]      ?? undefined,
      typography:    body.fonts          ?? undefined,
      values:        JSON.stringify(valuesArr),
    },
  });

  return NextResponse.json(brain);
}
