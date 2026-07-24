// POST /api/cron/execute — a REDE DE SEGURANÇA da produção.
//
// Protegido por Authorization: Bearer <CRON_SECRET> (mesmo padrão do cron de
// treino). Recupera projetos cuja produção travou, SEM depender do navegador:
//   • executionStatus = "running" há mais de 10 min → caiu no meio (aba/timeout);
//   • executionStatus = "failed" e ainda com tentativas disponíveis → re-tenta.
// Roda o MESMO núcleo idempotente (nunca duplica). Bounded: no máx N por passada.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { runProjectExecution } from "@/lib/agency/execution/run-execution";

const MAX_PER_TICK = 5;
const MAX_ATTEMPTS = 5;
const STALE_RUNNING_MS = 10 * 60_000;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Cron endpoint not configured — set CRON_SECRET in Railway Variables" }, { status: 503 });
  }
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized — invalid CRON_SECRET" }, { status: 401 });
  }

  const staleBefore = new Date(Date.now() - STALE_RUNNING_MS);
  // Candidatos: travados em "running" (caíram no meio) OU "failed" com tentativas
  // sobrando. Ordena pelos mais antigos primeiro.
  const candidates = await prisma.project.findMany({
    where: {
      clientRequestId: { not: null },
      executionAttempts: { lt: MAX_ATTEMPTS },
      OR: [
        { executionStatus: "running", executionStartedAt: { lt: staleBefore } },
        { executionStatus: "failed" },
      ],
    },
    orderBy: { executionRequestedAt: "asc" },
    take: MAX_PER_TICK,
    select: { id: true },
  });

  const results: Array<{ projectId: string; status: string; produced: number }> = [];
  for (const p of candidates) {
    const r = await runProjectExecution(p.id);
    results.push({ projectId: p.id, status: r.status, produced: r.produced.length });
  }

  return NextResponse.json({ ok: true, recovered: results.length, results });
}
