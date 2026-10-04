// GET /api/agency/equipe — quem é da equipe (para escolher o responsável da
// conta). Só id, nome e papel; nada de e-mail ou senha. Usuário de PORTAL
// (com clientId) não é equipe e não aparece.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;
  if (session.clientId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const equipe = await prisma.user.findMany({
    where: { workspaceId: session.workspaceId, clientId: null },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ equipe });
}
