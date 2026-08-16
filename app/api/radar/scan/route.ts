// POST /api/radar/scan — dispara o Radar Dioli sob demanda (o botão "buscar agora").
// Time-only. Tudo que ele acha entra PENDENTE, pra validação humana.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { runRadarScan } from "@/lib/agency/radar/radar-agent";
import { deveBloquearMutacaoCrossSite } from "@/lib/security/navegacao-cross-site";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession(["master", "project_manager"]);
  if (error) return error;
  if (deveBloquearMutacaoCrossSite(request)) {
    return NextResponse.json({ error: "Origem não confiável para esta ação." }, { status: 403 });
  }
  const r = await runRadarScan(session.workspaceId);
  return NextResponse.json({ ok: true, ...r, note: "Tendências propostas entram como PENDENTES — valide na fila." });
}
