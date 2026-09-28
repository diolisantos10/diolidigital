// GET /api/social/analises?clientId= — as ÚLTIMAS análises semanais (F2-F1).
//
// Sem `clientId`: as últimas de TODAS as marcas deste workspace. Com
// `clientId`: só as daquele cliente. Escopo por workspace via a relação
// `client: { workspaceId }` — nunca lê análise de outro inquilino, mesmo que
// alguém passe um `clientId` de outro workspace (a relação simplesmente não
// bate com nada e a lista sai vazia, nunca 500).
//
// Guarda igual a `/api/agency/clients/[id]/pacote`: sessão obrigatória, nunca
// sessão de portal.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";

export const dynamic = "force-dynamic";

/** Mais que isso é histórico, não "últimas". */
const LIMITE = 50;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;
  if (session.clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");

  const analises = await prisma.analiseSemanal.findMany({
    where: {
      client: { workspaceId: session.workspaceId },
      ...(clientId ? { clientId } : {}),
    },
    orderBy: { semanaDe: "desc" },
    take: LIMITE,
    select: {
      id: true,
      clientId: true,
      semanaDe: true,
      semanaAte: true,
      relatorio: true,
      status: true,
      dnaPropostoVersao: true,
      criadaEm: true,
    },
  });

  return NextResponse.json({ analises });
}
