// POST /api/agency/cofre/parear — pede um pareamento NOVO ao cofre. Só master.
//
// Uso raro: o pedido se perdeu, ou o Diego recusou o anterior. Pedido novo
// SUBSTITUI o anterior e exige clique novo no cofre — por isso não é
// automático e não é de qualquer papel.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { deveBloquearMutacaoCrossSite } from "@/lib/security/navegacao-cross-site";
import { resumoDoPareamento, solicitarPareamento } from "@/lib/ai/pareamento-do-cofre";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession(["master"]);
  if (error) return error;
  if (session.clientId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (deveBloquearMutacaoCrossSite(request)) {
    return NextResponse.json({ error: "Origem não confiável para esta ação." }, { status: 403 });
  }
  const r = await solicitarPareamento(`pedido manual de ${session.name || session.email}`);
  return NextResponse.json({ pedido: { ok: r.ok, status: r.status }, ...(await resumoDoPareamento()) }, { status: r.ok ? 202 : 502 });
}
