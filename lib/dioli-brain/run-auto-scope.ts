// Shared auto-scope runner — called both by the manual route and automatically
// on briefing creation. Chains all 6 brain engines synchronously (no external
// API calls) and persists the results as BrainArtifact records.

import { prisma } from "@/lib/db/client";
import { buildClientSnapshot } from "@/lib/dioli-brain/client-snapshot";
import { generateStrategyCanvas } from "@/lib/dioli-brain/strategy-engine";
import { generateSocialCanvas } from "@/lib/dioli-brain/social-engine";
import { generateDesignCanvas } from "@/lib/dioli-brain/design-engine";
import { generateTrafficCanvas } from "@/lib/dioli-brain/traffic-engine";
import { generateAnalyticsCanvas } from "@/lib/dioli-brain/analytics-engine";
import { generateQualityCanvas } from "@/lib/dioli-brain/quality-engine";

const SCOPE_DEPTS = ["strategy", "social", "design", "traffic", "analytics", "quality"] as const;

export async function runAutoScope(
  clientRequestId: string,
  opts: { approvedBy?: string; workspaceId?: string } = {},
): Promise<void> {
  const snapshot = await buildClientSnapshot(clientRequestId);
  if (!snapshot) throw new Error(`ClientRequest not found: ${clientRequestId}`);

  const strategyCanvas = generateStrategyCanvas({
    businessName: snapshot.businessName,
    segment:      snapshot.segment,
    objectives:   snapshot.objectives,
    services:     snapshot.services,
    rawContext:   snapshot.rawContext,
    requestId:    clientRequestId,
    source:       "request",
  });

  const socialCanvas    = generateSocialCanvas({ strategyCanvas, requestId: clientRequestId, source: "request" });
  const designCanvas    = generateDesignCanvas({ socialCanvas, requestId: clientRequestId, source: "request" });
  const trafficCanvas   = generateTrafficCanvas({ strategyCanvas, socialCanvas, designCanvas, requestId: clientRequestId, source: "request" });
  const analyticsCanvas = generateAnalyticsCanvas({ strategyCanvas, socialCanvas, designCanvas, trafficCanvas, requestId: clientRequestId, source: "request" });
  const qualityCanvas   = generateQualityCanvas({ strategyCanvas, socialCanvas, designCanvas, trafficCanvas, analyticsCanvas, requestId: clientRequestId, source: "request" });

  const artifacts = [
    { dept: "strategy",  canvas: strategyCanvas,  gate: strategyCanvas.qualityGateResult,  flow: strategyCanvas.cognitiveFlowTrace },
    { dept: "social",    canvas: socialCanvas,    gate: socialCanvas.qualityGateResult,    flow: socialCanvas.cognitiveFlowTrace },
    { dept: "design",    canvas: designCanvas,    gate: designCanvas.qualityGateResult,    flow: designCanvas.cognitiveFlowTrace },
    { dept: "traffic",   canvas: trafficCanvas,   gate: trafficCanvas.qualityGateResult,   flow: trafficCanvas.cognitiveFlowTrace },
    { dept: "analytics", canvas: analyticsCanvas, gate: analyticsCanvas.qualityGateResult, flow: analyticsCanvas.cognitiveFlowTrace },
    { dept: "quality",   canvas: qualityCanvas,   gate: qualityCanvas.gateResult,          flow: qualityCanvas.cognitiveFlowTrace },
  ];

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
      department:        a.dept,
      canvasId:          (a.canvas as { id: string }).id,
      canvasJson:        JSON.stringify(a.canvas),
      qualityGateJson:   JSON.stringify(a.gate),
      cognitiveFlowJson: JSON.stringify(a.flow),
      status:            "draft",
      approvedBy:        opts.approvedBy ?? "system_auto",
    })),
  });

  await prisma.clientRequestDb.update({
    where: { id: clientRequestId },
    data: {
      status: "scope_ready",
      ...(opts.workspaceId ? { workspaceId: opts.workspaceId } : {}),
    },
  });
}
