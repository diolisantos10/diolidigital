import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";

type Params = { id: string };

// PATCH — update status (review / apply). Applying to the BrandBrain itself is
// handled client-side via the Brand Hub hook; this just persists the status.
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<Params> }
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const existing = await prisma.brandUpdate.findFirst({
    where: { id, client: { workspaceId: session.workspaceId } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const update = await prisma.brandUpdate.update({
    where: { id },
    data: { status: body.status ?? existing.status },
  });
  return NextResponse.json(update);
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<Params> }
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const existing = await prisma.brandUpdate.findFirst({
    where: { id, client: { workspaceId: session.workspaceId } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.brandUpdate.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
