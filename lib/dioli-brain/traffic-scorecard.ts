// Dioli Brain — Traffic Scorecard
// Operational metrics for the Paid Traffic Department.

import type { TrafficCanvas } from "./traffic-canvas";

export interface TrafficScorecard {
  canvasesCreated: number;
  canvasesApproved: number;
  approvalRate: number;
  campaignsPlanned: number;
  totalBudgetAllocated: number;
  qualityGatePassRate: number;
  evidenceGenerated: number;
  brainChangeRequestsGenerated: number;
}

export function computeTrafficScorecard(
  canvases: TrafficCanvas[],
  brainChangeRequestsGenerated: number,
): TrafficScorecard {
  const canvasesCreated  = canvases.length;
  const canvasesApproved = canvases.filter((c) => c.status === "approved").length;
  const reviewed         = canvases.filter((c) => c.status !== "draft").length;
  const approvalRate     = reviewed > 0 ? Math.round((canvasesApproved / reviewed) * 100) : 0;

  const campaignsPlanned     = canvases.reduce((acc, c) => acc + c.campaigns.length, 0);
  const totalBudgetAllocated = canvases
    .filter((c) => c.status === "approved")
    .reduce((acc, c) => acc + c.budgetAllocation.mediaBudgetBRL, 0);

  const passQG = canvases.filter((c) => c.qualityGateResult.overall === "PASS").length;
  const qualityGatePassRate = canvasesCreated > 0
    ? Math.round((passQG / canvasesCreated) * 100)
    : 0;

  const evidenceGenerated = canvases
    .filter((c) => c.status === "approved")
    .reduce((acc, c) => acc + (c.campaigns.length > 0 ? 2 : 1), 0);

  return {
    canvasesCreated,
    canvasesApproved,
    approvalRate,
    campaignsPlanned,
    totalBudgetAllocated,
    qualityGatePassRate,
    evidenceGenerated,
    brainChangeRequestsGenerated,
  };
}
