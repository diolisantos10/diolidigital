// GET    /api/meta/connections        — list connected Meta accounts (no tokens)
// DELETE /api/meta/connections         — disconnect one (body: { connectionId })
// PATCH  /api/meta/connections         — atribuir uma conexão a um CLIENTE
//                                        (body: { connectionId, clientId|null })
//
// O PATCH existe pelo modelo de parceria decidido pelo CEO em 03/08/2026: o
// Business da agência recebe os parceiros, e cada ativo conectado (página,
// Instagram) pertence a um cliente. Uma conexão sem dono aparece no lugar
// errado: no painel da agência em vez do portal do parceiro.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
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

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "master") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { connectionId?: string; clientId?: string | null };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  if (!body.connectionId) return NextResponse.json({ error: "connectionId obrigatório" }, { status: 400 });

  // A conexão precisa ser DESTE workspace — id de fora não acha nada.
  const conexao = await prisma.metaConnection.findFirst({
    where: { id: body.connectionId, workspaceId: session.workspaceId },
    select: { id: true },
  });
  if (!conexao) return NextResponse.json({ error: "Conexão não encontrada" }, { status: 404 });

  // clientId null desfaz o vínculo; preenchido, o cliente precisa existir aqui.
  const clientId = body.clientId?.trim() || null;
  if (clientId) {
    const cliente = await prisma.client.findFirst({
      where: { id: clientId, workspaceId: session.workspaceId },
      select: { id: true, name: true },
    });
    if (!cliente) return NextResponse.json({ error: "Cliente não encontrado neste workspace" }, { status: 404 });
  }

  await prisma.metaConnection.update({
    where: { id: conexao.id },
    data: { clientId },
  });
  return NextResponse.json({ ok: true, clientId });
}
