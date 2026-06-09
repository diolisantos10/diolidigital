import { NextRequest, NextResponse } from "next/server";
import { getSession }           from "@/lib/auth/session";
import { executeBatch }         from "@/lib/agency/training/batch-runner";
import { getTrainingSummary }   from "@/lib/agency/training/training-store-service";
import { MAX_COUNT_HARD_CAP, TRAINING_JOB_CONFIG } from "@/lib/agency/training/config";

// GET — persistent training summary from DB
export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session)                 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "master")
    return NextResponse.json({ error: "Forbidden — master role required" }, { status: 403 });

  const summary = await getTrainingSummary();
  return NextResponse.json({
    cronConfigured: !!process.env.CRON_SECRET,
    enabled:        TRAINING_JOB_CONFIG.enabled,
    ...summary,
  });
}

// POST — run a batch manually, persist results to DB
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session)                 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "master")
    return NextResponse.json({ error: "Forbidden — master role required" }, { status: 403 });

  let body: { mode?: string; count?: number; triggeredBy?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validModes = ["seed", "dynamic", "mixed"] as const;
  const mode       = validModes.includes(body.mode as typeof validModes[number])
    ? (body.mode as typeof validModes[number])
    : "dynamic";
  const count       = Math.min(Math.max(1, Number(body.count) || 10), MAX_COUNT_HARD_CAP);
  const triggeredBy = body.triggeredBy === "cron" ? "cron" : "manual";

  try {
    const result = await executeBatch({ mode, count, triggeredBy });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: "Batch execution failed", detail: String(err) }, { status: 500 });
  }
}
