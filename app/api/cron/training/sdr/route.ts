import { NextRequest, NextResponse } from "next/server";
import { executeBatch }        from "@/lib/agency/training/batch-runner";
import { TRAINING_JOB_CONFIG } from "@/lib/agency/training/config";

// Protected cron endpoint — Authorization: Bearer <CRON_SECRET>
// Returns 503 when CRON_SECRET is not set — never runs unsecured.
// Set TRAINING_ENABLED=true in Railway Variables to activate the worker.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: "Cron endpoint not configured — set CRON_SECRET in Railway Variables" },
      { status: 503 },
    );
  }

  const authHeader = request.headers.get("authorization");
  const token      = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized — invalid CRON_SECRET" }, { status: 401 });
  }

  if (!TRAINING_JOB_CONFIG.enabled) {
    return NextResponse.json({
      message: "Worker disabled — set TRAINING_ENABLED=true in Railway Variables to activate",
      ran: false,
    });
  }

  try {
    const [dynamicResult, mixedResult] = await Promise.all([
      executeBatch({ mode: "dynamic", count: 10, triggeredBy: "cron" }),
      executeBatch({ mode: "mixed",   count: 5,  triggeredBy: "cron" }),
    ]);

    return NextResponse.json({
      batches:     [dynamicResult, mixedResult],
      totalRuns:   dynamicResult.totalRuns + mixedResult.totalRuns,
      completedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ error: "Cron batch failed", detail: String(err) }, { status: 500 });
  }
}
