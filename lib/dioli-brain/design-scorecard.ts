// Dioli Brain — Design Scorecard
// Operational metrics for the Design Department.
// Pure function — accepts data as params, no store access.

import type { DesignCanvas } from "./design-canvas";

export interface DesignScorecard {
  canvasesCreated: number;
  canvasesApproved: number;
  approvalRate: number;
  briefsGenerated: number;
  promptsGenerated: number;
  assetsRequired: number;
  qualityGatePassRate: number;
  brainChangeRequestsGenerated: number;
}

export function computeDesignScorecard(
  canvases: DesignCanvas[],
  brainChangeRequestsGenerated: number,
): DesignScorecard {
  const canvasesCreated  = canvases.length;
  const canvasesApproved = canvases.filter((c) => c.status === "approved").length;
  const reviewed         = canvases.filter((c) => c.status !== "draft").length;
  const approvalRate     = reviewed > 0
    ? Math.round((canvasesApproved / reviewed) * 100)
    : 0;

  const briefsGenerated = canvases.reduce((acc, c) => acc + c.creativeBriefs.length, 0);
  const promptsGenerated = canvases.reduce((acc, c) => acc + c.imagePromptSpecs.length, 0);
  const assetsRequired   = canvases.reduce((acc, c) => acc + c.totalAssetsRequired, 0);

  const passQG = canvases.filter((c) => c.qualityGateResult.overall === "PASS").length;
  const qualityGatePassRate = canvasesCreated > 0
    ? Math.round((passQG / canvasesCreated) * 100)
    : 0;

  return {
    canvasesCreated,
    canvasesApproved,
    approvalRate,
    briefsGenerated,
    promptsGenerated,
    assetsRequired,
    qualityGatePassRate,
    brainChangeRequestsGenerated,
  };
}
