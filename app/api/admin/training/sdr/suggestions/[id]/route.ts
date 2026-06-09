import { NextRequest, NextResponse } from "next/server";
import { getSession }              from "@/lib/auth/session";
import { updateSuggestionStatus }  from "@/lib/agency/training/training-store-service";
import type { ImprovementStatus }  from "@/lib/agency/training/types";

const VALID_STATUSES: ImprovementStatus[] = ["approved", "rejected", "applied"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getSession();
  if (!session)                 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "master")
    return NextResponse.json({ error: "Forbidden — master role required" }, { status: 403 });

  const { id } = await params;

  let body: { status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!VALID_STATUSES.includes(body.status as ImprovementStatus)) {
    return NextResponse.json(
      { error: `Invalid status. Valid values: ${VALID_STATUSES.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    await updateSuggestionStatus(id, body.status as ImprovementStatus);
    return NextResponse.json({ ok: true, id, status: body.status });
  } catch (err) {
    return NextResponse.json({ error: "Update failed", detail: String(err) }, { status: 500 });
  }
}
