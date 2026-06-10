// Dioli Brain — Strategy Scorecard
// Operational metrics for the Strategy Department.
// Pure function — accepts data as params, no store access.

import type { StrategyCanvas } from "./strategy-canvas";

export interface StrategyScorecard {
  strategiesCreated: number;
  strategiesApproved: number;
  approvalRate: number;
  qualityGatePassRate: number;
  roadmapsGenerated: number;
  territoriesDefined: number;
  evidenceGenerated: number;
  brainChangeRequestsGenerated: number;
}

export function computeStrategyScorecard(
  canvases: StrategyCanvas[],
  brainChangeRequestsGenerated: number,
): StrategyScorecard {
  const strategiesCreated = canvases.length;
  const strategiesApproved = canvases.filter((c) => c.status === "approved").length;
  const reviewed = canvases.filter((c) => c.status !== "draft").length;
  const approvalRate = reviewed > 0
    ? Math.round((strategiesApproved / reviewed) * 100)
    : 0;

  const passQG = canvases.filter((c) => c.qualityGateResult.overall === "PASS").length;
  const qualityGatePassRate = strategiesCreated > 0
    ? Math.round((passQG / strategiesCreated) * 100)
    : 0;

  const roadmapsGenerated = canvases.filter((c) => c.recommendedRoadmap.length > 0).length;
  const territoriesDefined = canvases.reduce((acc, c) => acc + c.contentTerritories.length, 0);

  // Each approved strategy generates evidence (strategy_approved + positioning + territories + roadmap)
  const evidenceGenerated = canvases
    .filter((c) => c.status === "approved")
    .reduce((acc, c) => {
      let n = 1; // strategy_approved
      if (c.positioningStatement) n += 1;       // positioning_created
      if (c.contentTerritories.length > 0) n += 1; // content_territory_defined
      if (c.recommendedRoadmap.length > 0) n += 1; // roadmap_created
      if (c.opportunities.length > 0) n += 1;      // opportunity_identified
      return acc + n;
    }, 0);

  return {
    strategiesCreated,
    strategiesApproved,
    approvalRate,
    qualityGatePassRate,
    roadmapsGenerated,
    territoriesDefined,
    evidenceGenerated,
    brainChangeRequestsGenerated,
  };
}
