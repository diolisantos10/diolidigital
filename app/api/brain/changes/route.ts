import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  getGovernanceSummary,
  createChangeRequest,
  type CreateChangeRequestInput,
} from "@/lib/dioli-brain/governance-service";

// GET — full governance summary: requests by status, counts, version history
export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "master")
    return NextResponse.json({ error: "Forbidden — master role required" }, { status: 403 });

  // A listagem também é do inquilino — id global não vira lista global.
  const summary = await getGovernanceSummary(session.workspaceId);
  return NextResponse.json(summary);
}

// POST — create a manual BrainChangeRequest (draft or pending_review)
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "master")
    return NextResponse.json({ error: "Forbidden — master role required" }, { status: 403 });

  let body: CreateChangeRequestInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.title?.trim() || !body.proposedChange?.trim()) {
    return NextResponse.json(
      { error: "title and proposedChange are required" },
      { status: 400 },
    );
  }

  try {
    const created = await createChangeRequest({
      ...body,
      source:      body.source ?? "manual",
      requestedBy: body.requestedBy ?? session.email,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: "Create failed", detail: String(err) }, { status: 500 });
  }
}
