// POST /api/cron/radar — o Radar Dioli roda sozinho (diário).
//
// Protegido por Authorization: Bearer <CRON_SECRET>. Varre os domínios e PROPÕE
// tendências (tudo entra PENDENTE — nunca ativa sem validação humana). Bounded.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { runRadarScan } from "@/lib/agency/radar/radar-agent";

const MAX_WORKSPACES = 10;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: "Cron não configurado — defina CRON_SECRET" }, { status: 503 });
  const token = request.headers.get("authorization")?.startsWith("Bearer ")
    ? request.headers.get("authorization")!.slice(7) : null;
  if (token !== cronSecret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workspaces = await prisma.agencyWorkspace.findMany({ take: MAX_WORKSPACES, select: { id: true } });
  const results: Array<{ workspaceId: string; proposed: number }> = [];
  for (const ws of workspaces) {
    const r = await runRadarScan(ws.id).catch(() => ({ proposed: 0, perDomain: {} }));
    results.push({ workspaceId: ws.id, proposed: r.proposed });
  }
  const total = results.reduce((s, r) => s + r.proposed, 0);
  return NextResponse.json({ ok: true, proposed: total, results });
}
