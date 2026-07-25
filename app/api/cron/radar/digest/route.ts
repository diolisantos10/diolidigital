// GET /api/cron/radar/digest — resumo do Radar Dioli (leitura, sem efeitos).
//
// Protegido por Authorization: Bearer <CRON_SECRET> (mesmo segredo dos crons).
// Serve pro diário: quantos insights ATIVOS já alimentam os agentes e quantos
// PENDENTES esperam validação humana — por domínio, com amostra dos pendentes.
// Só lê; nunca escreve. Bounded.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

const MAX_WORKSPACES = 10;
const PENDING_SAMPLE = 8;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: "Cron não configurado — defina CRON_SECRET" }, { status: 503 });
  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (token !== cronSecret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workspaces = await prisma.agencyWorkspace.findMany({ take: MAX_WORKSPACES, select: { id: true, name: true } });

  const perWorkspace = [];
  let totalActive = 0;
  let totalPending = 0;

  for (const ws of workspaces) {
    const grouped = await prisma.marketInsight.groupBy({
      by: ["domain", "status"],
      where: { workspaceId: ws.id, status: { in: ["active", "pending"] } },
      _count: { _all: true },
    });

    const activeByDomain: Record<string, number> = {};
    const pendingByDomain: Record<string, number> = {};
    let active = 0;
    let pending = 0;
    for (const g of grouped) {
      const n = g._count._all;
      if (g.status === "active") { activeByDomain[g.domain] = (activeByDomain[g.domain] ?? 0) + n; active += n; }
      else { pendingByDomain[g.domain] = (pendingByDomain[g.domain] ?? 0) + n; pending += n; }
    }

    const pendingSample = await prisma.marketInsight.findMany({
      where: { workspaceId: ws.id, status: "pending" },
      orderBy: { createdAt: "desc" },
      take: PENDING_SAMPLE,
      select: { domain: true, title: true, sourceName: true },
    });

    perWorkspace.push({ workspaceId: ws.id, name: ws.name, active, pending, activeByDomain, pendingByDomain, pendingSample });
    totalActive += active;
    totalPending += pending;
  }

  return NextResponse.json({ ok: true, totalActive, totalPending, workspaces: perWorkspace });
}
