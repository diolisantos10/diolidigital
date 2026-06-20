// GET /api/brain/updates — pending BrainUpdate records (learning loop).
// Agency role only. Optional ?clientRequestId= filter.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { listPendingBrainUpdates } from "@/lib/dioli-brain/brain-update";

const AGENCY_ROLES = ["master", "project_manager"] as const;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession([...AGENCY_ROLES]);
  if (error) return error;
  if (session.clientId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const clientRequestId = searchParams.get("clientRequestId") ?? searchParams.get("clientId") ?? undefined;

  try {
    const updates = await listPendingBrainUpdates(clientRequestId);
    return NextResponse.json(updates);
  } catch (e) {
    console.error("[brain/updates] GET error", e);
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}
