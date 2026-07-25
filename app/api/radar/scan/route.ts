// POST /api/radar/scan — dispara o Radar Dioli sob demanda (o botão "buscar agora").
// Time-only. Tudo que ele acha entra PENDENTE, pra validação humana.

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { runRadarScan } from "@/lib/agency/radar/radar-agent";

export async function POST(): Promise<NextResponse> {
  const { session, error } = await requireSession(["master", "project_manager"]);
  if (error) return error;
  const r = await runRadarScan(session.workspaceId);
  return NextResponse.json({ ok: true, ...r, note: "Tendências propostas entram como PENDENTES — valide na fila." });
}
