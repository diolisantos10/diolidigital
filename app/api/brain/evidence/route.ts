import { NextRequest, NextResponse } from "next/server";
import { createEvidenceItem, getEvidenceForRequest } from "@/lib/agency/persistence/evidence-service";
import type { EvidenceType } from "@/lib/agency/persistence/evidence-service";
import { requireSession } from "@/lib/auth/api-guard";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { error } = await requireSession();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const clientRequestId = searchParams.get("clientRequestId");
  if (!clientRequestId) {
    return NextResponse.json({ error: "clientRequestId required" }, { status: 400 });
  }
  try {
    const items = await getEvidenceForRequest(clientRequestId);
    return NextResponse.json(items);
  } catch {
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { error } = await requireSession();
  if (error) return error;

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { department, type, label } = body;
  if (!department || !type || !label) {
    return NextResponse.json({ error: "department, type, label required" }, { status: 400 });
  }

  try {
    const item = await createEvidenceItem({
      clientRequestId: body.clientRequestId as string | undefined,
      artifactId:      body.artifactId as string | undefined,
      department:      department as string,
      type:            type as EvidenceType,
      label:           label as string,
      value:           body.value as Record<string, unknown> | undefined,
      sourceUrl:       body.sourceUrl as string | undefined,
    });
    return NextResponse.json(item, { status: 201 });
  } catch (e) {
    console.error("[brain/evidence] POST error", e);
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}
