import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clients = await prisma.client.findMany({
    where: { workspaceId: session.workspaceId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(clients);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["master", "project_manager"].includes(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const client = await prisma.client.create({
    data: {
      workspaceId: session.workspaceId,
      name:        body.name,
      industry:    body.industry ?? null,
      email:       body.email ?? null,
      phone:       body.phone ?? null,
      website:     body.website ?? null,
      // Descrição e status do Novo Cliente (04/10/2026): o formulário sempre
      // pediu os dois e nenhum chegava ao banco.
      descricao:   typeof body.description === "string" && body.description.trim() ? body.description : null,
      status:      typeof body.status === "string" && body.status.trim() ? body.status : null,
    },
  });
  return NextResponse.json(client, { status: 201 });
}
