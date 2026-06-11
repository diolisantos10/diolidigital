import { NextRequest, NextResponse } from "next/server";
import { createBrainArtifact, getArtifactsForRequest } from "@/lib/agency/persistence/brain-artifact-service";
import type { Department } from "@/lib/agency/persistence/brain-artifact-service";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const clientRequestId = searchParams.get("clientRequestId");
  if (!clientRequestId) {
    return NextResponse.json({ error: "clientRequestId required" }, { status: 400 });
  }
  try {
    const artifacts = await getArtifactsForRequest(clientRequestId);
    return NextResponse.json(artifacts);
  } catch {
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { clientRequestId, department, canvasId, canvas } = body;
  if (!clientRequestId || !department || !canvasId || !canvas) {
    return NextResponse.json(
      { error: "clientRequestId, department, canvasId, canvas required" },
      { status: 400 },
    );
  }

  try {
    const artifact = await createBrainArtifact({
      clientRequestId: clientRequestId as string,
      department:      department as Department,
      canvasId:        canvasId as string,
      canvas:          canvas as object,
      qualityGate:     body.qualityGate  as object | undefined,
      cognitiveFlow:   body.cognitiveFlow as object | undefined,
      version:         typeof body.version === "number" ? body.version : 1,
      approvedBy:      typeof body.approvedBy === "string" ? body.approvedBy : "internal",
    });
    return NextResponse.json(artifact, { status: 201 });
  } catch (e) {
    console.error("[brain/artifacts] POST error", e);
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}
