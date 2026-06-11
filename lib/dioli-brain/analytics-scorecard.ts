// Dioli Brain — Analytics Scorecard

import type { AnalyticsCanvas } from "./analytics-canvas";

export interface AnalyticsScorecard {
  canvasesCreated: number;
  canvasesApproved: number;
  approvalRate: number;
  kpisFramed: number;
  recommendationsGenerated: number;
  touchpointsMapped: number;
  qualityGatePassRate: number;
  evidenceGenerated: number;
  brainChangeRequestsGenerated: number;
}

export function computeAnalyticsScorecard(
  canvases: AnalyticsCanvas[],
  brainChangeRequestsGenerated: number,
): AnalyticsScorecard {
  const created  = canvases.length;
  const approved = canvases.filter((c) => c.status === "approved").length;

  const kpisFramed = canvases.reduce((sum, c) => sum + c.kpis.length, 0);
  const recommendationsGenerated = canvases.reduce((sum, c) => sum + c.recommendations.length, 0);
  const touchpointsMapped = canvases.reduce((sum, c) => sum + c.attributionLayer.touchpoints.length, 0);

  const passCanvases = canvases.filter((c) => c.qualityGateResult.overall === "PASS").length;
  const qualityGatePassRate = created > 0 ? Math.round((passCanvases / created) * 100) : 0;

  return {
    canvasesCreated: created,
    canvasesApproved: approved,
    approvalRate: created > 0 ? Math.round((approved / created) * 100) : 0,
    kpisFramed,
    recommendationsGenerated,
    touchpointsMapped,
    qualityGatePassRate,
    evidenceGenerated: approved,
    brainChangeRequestsGenerated,
  };
}
