import { NextRequest, NextResponse } from "next/server";
import { executeBatch }      from "@/lib/agency/training/batch-runner";
import { TRAINING_JOB_CONFIG } from "@/lib/agency/training/config";

// Protected cron endpoint — requires CRON_SECRET in Authorization: Bearer header.
// Configure this URL in Railway Cron or any external scheduler.
// If CRON_SECRET env var is missing, returns 503 — never runs unsecured.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: "Cron endpoint not configured — set CRON_SECRET in Railway Variables to enable" },
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
      message: "Training worker disabled — set enabled: true in TRAINING_JOB_CONFIG to activate",
      ran: false,
    });
  }

  try {
    const dynamicResult = executeBatch({ mode: "dynamic", count: 10, triggeredBy: "cron" });
    const mixedResult   = executeBatch({ mode: "mixed",   count: 5,  triggeredBy: "cron" });

    return NextResponse.json({
      batches:     [dynamicResult, mixedResult],
      totalRuns:   dynamicResult.totalRuns + mixedResult.totalRuns,
      completedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ error: "Cron batch failed", detail: String(err) }, { status: 500 });
  }
}
