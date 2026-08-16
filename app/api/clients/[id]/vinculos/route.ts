// GET /api/clients/[id]/vinculos — o que está pendurado neste cliente.
//
// Existe para a confirmação de apagar/fundir ser ESPECÍFICA. "Tem certeza?" não
// informa nada; "3 projetos, 12 mensagens do portal, 2 aprovações" é uma frase
// sobre a qual dá para decidir. Só conta — não apaga, não move.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { inventarioDoCliente } from "@/lib/agency/persistence/cliente-vinculos";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const cliente = await prisma.client.findFirst({
    where: { id, workspaceId: session.workspaceId },
    select: { id: true, name: true },
  });
  if (!cliente) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const inventario = await inventarioDoCliente(prisma, id);
  return NextResponse.json({ cliente, ...inventario });
}
