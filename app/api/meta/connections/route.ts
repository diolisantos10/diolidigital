// GET    /api/meta/connections        — list connected Meta accounts (no tokens)
// DELETE /api/meta/connections         — disconnect one (body: { connectionId })

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { listConnections, deleteConnection } from "@/lib/integrations/meta/connections";

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const connections = await listConnections(session.workspaceId);
  return NextResponse.json({ connections });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "master") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as { connectionId?: string };
  if (!body.connectionId) return NextResponse.json({ error: "connectionId obrigatório" }, { status: 400 });

  const ok = await deleteConnection(session.workspaceId, body.connectionId);
  if (!ok) return NextResponse.json({ error: "Conexão não encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
