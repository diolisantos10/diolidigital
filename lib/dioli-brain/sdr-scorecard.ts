// Dioli Brain — SDR Scorecard
// Computes operational metrics for the SDR department pilot.
// Pure function — accepts data as params, no store access.

import type { ClientRequest } from "@/lib/agency/client-requests";
import type { SimulationRun, AgentImprovementSuggestion } from "@/lib/agency/training/types";

export interface SDRScorecard {
  briefingsStarted: number;
  briefingsCompleted: number;
  completionRate: number;
  qualifiedRate: number;
  qualityGatePassRate: number;
  objectionResolutionRate: number;
  averageConfidence: number;
  trainingSuggestionsGenerated: number;
  brainChangeRequestsGenerated: number;
}

const confidenceScore: Record<string, number> = { none: 0, low: 25, medium: 60, high: 100 };

export function computeSDRScorecard(
  clientRequests: ClientRequest[],
  trainingRuns: SimulationRun[],
  suggestions: AgentImprovementSuggestion[],
  brainChangeRequestCount: number,
): SDRScorecard {
  const publicBriefings = clientRequests.filter((r) => r.source === "public_briefing");
  const briefingsStarted = publicBriefings.length;

  const completed = publicBriefings.filter((r) =>
    r.sdrHandoff?.cognitiveFlowSummary != null || r.v2Scope != null
  );
  const briefingsCompleted = completed.length;
  const completionRate = briefingsStarted > 0
    ? Math.round((briefingsCompleted / briefingsStarted) * 100)
    : 0;

  const qualified = publicBriefings.filter((r) => {
    const qg = r.sdrHandoff?.qualityGateResult;
    if (qg) return qg.overall !== "FAIL";
    // Fallback: has email + phone + at least one service
    const scope = r.v2Scope;
    return scope && !!scope.prospectEmail && !!scope.prospectPhone &&
      (scope.wantsSocialMedia || !!scope.wantsPaidTraffic || scope.branding?.requested);
  });
  const qualifiedRate = briefingsStarted > 0
    ? Math.round((qualified.length / briefingsStarted) * 100)
    : 0;

  const withQG = publicBriefings.filter((r) => r.sdrHandoff?.qualityGateResult != null);
  const passQG = withQG.filter((r) => r.sdrHandoff!.qualityGateResult!.overall === "PASS");
  const qualityGatePassRate = withQG.length > 0
    ? Math.round((passQG.length / withQG.length) * 100)
    : 0;

  const withObjections = publicBriefings.filter((r) => {
    const h = r.sdrHandoff;
    return h && h.objectionsHandled.length > 0;
  });
  const resolvedObjections = withObjections.filter((r) => {
    const qg = r.sdrHandoff?.qualityGateResult;
    // If quality gate passed/warning and there were objections, they're resolved
    return qg && qg.overall !== "FAIL";
  });
  const objectionResolutionRate = withObjections.length > 0
    ? Math.round((resolvedObjections.length / withObjections.length) * 100)
    : 100;

  const confidenceValues = publicBriefings
    .map((r) => r.v2Estimate?.confidence ?? "none")
    .map((c) => confidenceScore[c as keyof typeof confidenceScore] ?? 0);
  const averageConfidence = confidenceValues.length > 0
    ? Math.round(confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length)
    : 0;

  const trainingSuggestionsGenerated = suggestions.length;

  return {
    briefingsStarted,
    briefingsCompleted,
    completionRate,
    qualifiedRate,
    qualityGatePassRate,
    objectionResolutionRate,
    averageConfidence,
    trainingSuggestionsGenerated,
    brainChangeRequestsGenerated: brainChangeRequestCount,
  };
}
