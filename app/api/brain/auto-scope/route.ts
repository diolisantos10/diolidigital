// POST /api/brain/auto-scope — chains all 6 brain engines for a ClientRequest.
// Agency role only. No BRAIN_PM_AUTOPILOT gate — this replaces the manual pipeline.
// Takes { clientRequestId }, runs strategy→social→design→traffic→analytics→quality
// engines (rule-based, synchronous), saves each as a BrainArtifact with status="draft",
// and advances the request status to "scope_ready".

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { prisma } from "@/lib/db/client";
import { buildClientSnapshot } from "@/lib/dioli-brain/client-snapshot";
import { generateStrategyCanvas } from "@/lib/dioli-brain/strategy-engine";
import { generateSocialCanvas } from "@/lib/dioli-brain/social-engine";
import { generateDesignCanvas } from "@/lib/dioli-brain/design-engine";
import { generateTrafficCanvas } from "@/lib/dioli-brain/traffic-engine";
import { generateAnalyticsCanvas } from "@/lib/dioli-brain/analytics-engine";
import { generateQualityCanvas } from "@/lib/dioli-brain/quality-engine";

const AGENCY_ROLES = ["master", "project_manager"] as const;
const SCOPE_DEPTS = ["strategy", "social", "design", "traffic", "analytics", "quality"] as const;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession([...AGENCY_ROLES]);
  if (error) return error;
  if (session.clientId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
    console.error("[brain/auto-scope] snapshot error", e);
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
  if (!snapshot) {
    return NextResponse.json({ error: "ClientRequest not found" }, { status: 404 });
  }

  // Chain all 6 engines — synchronous, no external calls.
  const strategyCanvas = generateStrategyCanvas({
    businessName: snapshot.businessName,
    segment: snapshot.segment,
    objectives: snapshot.objectives,
    services: snapshot.services,
    rawContext: snapshot.rawContext,
    requestId: clientRequestId,
    source: "request",
  });

  const socialCanvas = generateSocialCanvas({
    strategyCanvas,
    requestId: clientRequestId,
    source: "request",
  });

  const designCanvas = generateDesignCanvas({
    socialCanvas,
    requestId: clientRequestId,
    source: "request",
  });

  const trafficCanvas = generateTrafficCanvas({
    strategyCanvas,
    socialCanvas,
    designCanvas,
    requestId: clientRequestId,
    source: "request",
  });

  const analyticsCanvas = generateAnalyticsCanvas({
    strategyCanvas,
    socialCanvas,
    designCanvas,
    trafficCanvas,
    requestId: clientRequestId,
    source: "request",
  });

  const qualityCanvas = generateQualityCanvas({
    strategyCanvas,
    socialCanvas,
    designCanvas,
    trafficCanvas,
    analyticsCanvas,
    requestId: clientRequestId,
    source: "request",
  });

  const artifacts = [
    { dept: "strategy",  canvas: strategyCanvas,  gate: strategyCanvas.qualityGateResult,  flow: strategyCanvas.cognitiveFlowTrace },
    { dept: "social",    canvas: socialCanvas,    gate: socialCanvas.qualityGateResult,    flow: socialCanvas.cognitiveFlowTrace },
    { dept: "design",    canvas: designCanvas,    gate: designCanvas.qualityGateResult,    flow: designCanvas.cognitiveFlowTrace },
    { dept: "traffic",   canvas: trafficCanvas,   gate: trafficCanvas.qualityGateResult,   flow: trafficCanvas.cognitiveFlowTrace },
    { dept: "analytics", canvas: analyticsCanvas, gate: analyticsCanvas.qualityGateResult, flow: analyticsCanvas.cognitiveFlowTrace },
    { dept: "quality",   canvas: qualityCanvas,   gate: qualityCanvas.gateResult,          flow: qualityCanvas.cognitiveFlowTrace },
  ];

  try {
    // Supersede any previous auto-scope draft/revision artifacts.
    await prisma.brainArtifact.updateMany({
      where: {
        clientRequestId,
        department: { in: [...SCOPE_DEPTS] },
        status: { in: ["draft", "needs_revision"] },
      },
      data: { status: "superseded" },
    });

    await prisma.brainArtifact.createMany({
      data: artifacts.map((a) => ({
        clientRequestId,
        department: a.dept,
        canvasId: (a.canvas as { id: string }).id,
        canvasJson: JSON.stringify(a.canvas),
        qualityGateJson: JSON.stringify(a.gate),
        cognitiveFlowJson: JSON.stringify(a.flow),
        status: "draft",
        approvedBy: session.name,
      })),
    });

    await prisma.clientRequestDb.update({
      where: { id: clientRequestId },
      data: { status: "scope_ready", workspaceId: session.workspaceId },
    });
  } catch (e) {
    console.error("[brain/auto-scope] DB error", e);
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }

  return NextResponse.json({ ok: true, requestId: clientRequestId });
}
