// Dioli Brain — Quality Scorecard

import type { QualityCanvas } from "./quality-canvas";

export interface QualityScorecard {
  auditsRun: number;
  auditsApproved: number;
  approvalRate: number;
  blockingFailuresFound: number;
  patternsIdentified: number;
  recommendationsGenerated: number;
  trainingSignalsExtracted: number;
  evidenceCandidatesFound: number;
  qualityGatePassRate: number;
  brainChangeRequestsGenerated: number;
}

export function computeQualityScorecard(
  canvases: QualityCanvas[],
  brainChangeRequestsGenerated: number,
): QualityScorecard {
  const total    = canvases.length;
  const approved = canvases.filter((c) => c.status === "approved").length;

  const passAudits = canvases.filter((c) => c.overallVerdict === "PASS").length;
  const qualityGatePassRate = total > 0 ? Math.round((passAudits / total) * 100) : 0;

  const blockingFailuresFound = canvases.reduce((sum, c) => sum + c.gateResult.blockingFailures, 0);
  const patternsIdentified    = canvases.reduce((sum, c) => sum + c.patternsIdentified.length, 0);
  const recommendationsGenerated = canvases.reduce((sum, c) => sum + c.recommendations.length, 0);
  const trainingSignalsExtracted = canvases.reduce((sum, c) => sum + c.trainingSignals.length, 0);
  const evidenceCandidatesFound  = canvases.reduce((sum, c) => sum + c.evidenceCandidates.length, 0);

  return {
    auditsRun: total,
    auditsApproved: approved,
    approvalRate: total > 0 ? Math.round((approved / total) * 100) : 0,
    blockingFailuresFound,
    patternsIdentified,
    recommendationsGenerated,
    trainingSignalsExtracted,
    evidenceCandidatesFound,
    qualityGatePassRate,
    brainChangeRequestsGenerated,
  };
}
