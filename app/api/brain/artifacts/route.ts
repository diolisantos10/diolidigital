import { NextRequest, NextResponse } from "next/server";
import { createBrainArtifact, getArtifactsForRequest } from "@/lib/agency/persistence/brain-artifact-service";
import type { Department } from "@/lib/agency/persistence/brain-artifact-service";
import { createEvidenceItem } from "@/lib/agency/persistence/evidence-service";
import { requireSession } from "@/lib/auth/api-guard";
import { prisma } from "@/lib/db/client";

// Evidence auto-created on every approved artifact — one per department.
const APPROVAL_EVIDENCE_LABEL: Record<string, string> = {
  strategy:  "strategy_approved",
  social:    "content_plan_created",
  design:    "creative_brief_created",
  traffic:   "campaign_plan_created",
  analytics: "report_generated",
  quality:   "quality_review_completed",
};

// Pipeline advancement — DB status is authoritative; the Zustand store only
// mirrors it. Saving a department artifact advances the request to the next stage.
const NEXT_STATUS_AFTER: Record<string, string> = {
  strategy:  "waiting_social",
  social:    "waiting_design",
  design:    "waiting_traffic",
  traffic:   "waiting_analytics",
  analytics: "waiting_quality",
  quality:   "in_progress",
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { error } = await requireSession();
  if (error) return error;

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
  const { session, error } = await requireSession();
  if (error) return error;

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

  // Server-side quality gate enforcement — UI checks are not sufficient.
  // A FAIL gate can never produce an approved artifact, regardless of caller.
  const gate = body.qualityGate as { overall?: string } | undefined;
  if (gate?.overall === "FAIL") {
    return NextResponse.json(
      { error: "Quality Gate failed. Artifact cannot be approved." },
      { status: 422 },
    );
  }

  try {
    // Requests created in the legacy Zustand store may not exist in the DB yet.
    // Upsert a stub so the FK holds and the approval is never lost.
    const canvasObj = canvas as { clientName?: string; segment?: string };
    await prisma.clientRequestDb.upsert({
      where:  { id: clientRequestId as string },
      update: {},
      create: {
        id:           clientRequestId as string,
        businessName: canvasObj.clientName ?? "Cliente (origem: store local)",
        segment:      canvasObj.segment ?? "",
        source:       "legacy_store",
        status:       "waiting_strategy",
      },
    });

    const artifact = await createBrainArtifact({
      clientRequestId: clientRequestId as string,
      department:      department as Department,
      canvasId:        canvasId as string,
      canvas:          canvas as object,
      qualityGate:     body.qualityGate  as object | undefined,
      cognitiveFlow:   body.cognitiveFlow as object | undefined,
      version:         typeof body.version === "number" ? body.version : 1,
      approvedBy:      typeof body.approvedBy === "string" ? body.approvedBy : session.email,
    });

    // Advance the DB pipeline status — authoritative for the client portal.
    const nextStatus = NEXT_STATUS_AFTER[department as string];
    if (nextStatus) {
      await prisma.clientRequestDb.update({
        where: { id: clientRequestId as string },
        data:  { status: nextStatus },
      }).catch((e) => console.error("[brain/artifacts] status advance failed", e));
    }

    // Auto-evidence: record the approval as an annotation evidence item.
    // Failure here must not fail the artifact save (evidence is derived data).
    const label = APPROVAL_EVIDENCE_LABEL[department as string];
    if (label) {
      await createEvidenceItem({
        clientRequestId: clientRequestId as string,
        artifactId:      artifact.id,
        department:      department as string,
        type:            "annotation",
        label,
        value: { canvasId, approvedBy: session.email, approvedAt: new Date().toISOString() },
      }).catch((e) => console.error("[brain/artifacts] auto-evidence failed", e));
    }

    return NextResponse.json(artifact, { status: 201 });
  } catch (e) {
    console.error("[brain/artifacts] POST error", e);
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}
