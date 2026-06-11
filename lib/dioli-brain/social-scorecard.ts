// Dioli Brain — Social Scorecard
// Operational metrics for the Social Media Department.
// Pure function — accepts data as params, no store access.

import type { SocialCanvas } from "./social-canvas";

export interface SocialScorecard {
  plansCreated: number;
  plansApproved: number;
  approvalRate: number;
  calendarsGenerated: number;
  qualityGatePassRate: number;
  evidenceGenerated: number;
  publishedContent: number;
  brainChangeRequestsGenerated: number;
}

export function computeSocialScorecard(
  canvases: SocialCanvas[],
  brainChangeRequestsGenerated: number,
): SocialScorecard {
  const plansCreated  = canvases.length;
  const plansApproved = canvases.filter((c) => c.status === "approved").length;
  const reviewed      = canvases.filter((c) => c.status !== "draft").length;
  const approvalRate  = reviewed > 0
    ? Math.round((plansApproved / reviewed) * 100)
    : 0;

  const passQG = canvases.filter((c) => c.qualityGateResult.overall === "PASS").length;
  const qualityGatePassRate = plansCreated > 0
    ? Math.round((passQG / plansCreated) * 100)
    : 0;

  const calendarsGenerated = canvases.filter(
    (c) => c.editorialCalendar.entries.length > 0
  ).length;

  const publishedContent = canvases.reduce(
    (acc, c) => acc + c.editorialCalendar.entries.filter((e) => e.status === "published").length,
    0
  );

  // Each approved social plan generates evidence artifacts
  // (content_plan_created + calendar_generated + territory_executed + social_strategy_executed)
  const evidenceGenerated = canvases
    .filter((c) => c.status === "approved")
    .reduce((acc, c) => {
      let n = 1; // content_plan_created
      if (c.editorialCalendar.entries.length > 0) n += 1; // calendar_generated
      if (c.contentTerritories.length > 0) n += 1;        // territory_executed
      if (c.strategyCanvasId) n += 1;                     // social_strategy_executed
      return acc + n;
    }, 0);

  return {
    plansCreated,
    plansApproved,
    approvalRate,
    calendarsGenerated,
    qualityGatePassRate,
    evidenceGenerated,
    publishedContent,
    brainChangeRequestsGenerated,
  };
}
