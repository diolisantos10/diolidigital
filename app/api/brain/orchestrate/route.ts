// POST /api/brain/orchestrate — PM Orchestrator (DRAFT proposal only).
//
// Agency role only. Reads { clientRequestId }, builds a ClientKnowledgeSnapshot
// from DB truth, and returns a ProjectProposal. The proposal is a DRAFT — it is
// stored nowhere and mutates no state (Law 2). Human approval + the /apply route
// are required to create anything.
//
// Gated behind BRAIN_PM_AUTOPILOT — when off, returns { enabled: false }.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { buildClientSnapshot } from "@/lib/dioli-brain/client-snapshot";
import { orchestratePMReasoning } from "@/lib/dioli-brain/pm-orchestrator";

const AGENCY_ROLES = ["master", "project_manager"] as const;

function isAutopilotEnabled(): boolean {
  return (process.env.BRAIN_PM_AUTOPILOT ?? "").trim().toLowerCase() === "true";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession([...AGENCY_ROLES]);
  if (error) return error;
  if (session.clientId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!isAutopilotEnabled()) {
    return NextResponse.json({ enabled: false });
  }

  let body: { clientRequestId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const clientRequestId = body.clientRequestId;
  if (!clientRequestId || typeof clientRequestId !== "string") {
    return NextResponse.json({ error: "clientRequestId required" }, { status: 400 });
  }

  let snapshot;
  try {
    snapshot = await buildClientSnapshot(clientRequestId);
  } catch (e) {
    console.error("[brain/orchestrate] snapshot error", e);
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
  if (!snapshot) {
    return NextResponse.json({ error: "ClientRequest not found" }, { status: 404 });
  }

  const proposal = await orchestratePMReasoning(snapshot);
  return NextResponse.json({ ok: true, enabled: true, proposal });
}
