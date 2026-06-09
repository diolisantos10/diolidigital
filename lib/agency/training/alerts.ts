import type { SimulationRun } from "./types";

export interface TrainingAlertInput {
  agentId:       string;
  title:         string;
  message:       string;
  severity:      "info" | "warning" | "critical";
  triggerType:   "low_score" | "critical_issue" | "high_fail_rate";
  relatedRunIds: string[];
}

// Deterministic — call after each batch with the last 20 runs from DB.
// existingActiveTitles prevents duplicate alerts across batches.
export function generateAlerts(
  recentRuns:           SimulationRun[],
  existingActiveTitles: Set<string>,
): TrainingAlertInput[] {
  const alerts: TrainingAlertInput[] = [];
  const runs20 = [...recentRuns].slice(-20);
  if (runs20.length < 5) return alerts;

  // 1. Average score < 60
  const avgScore     = Math.round(runs20.reduce((s, r) => s + r.score, 0) / runs20.length);
  const lowScoreKey  = "Score médio abaixo do mínimo";
  if (avgScore < 60 && !existingActiveTitles.has(lowScoreKey)) {
    alerts.push({
      agentId:       "sdr",
      title:         lowScoreKey,
      message:       `Score médio das últimas ${runs20.length} simulações: ${avgScore}/100 (threshold: 60).`,
      severity:      "critical",
      triggerType:   "low_score",
      relatedRunIds: runs20.map((r) => r.id),
    });
  }

  // 2. Same critical criterion in 3+ recent runs
  const criterionMap = new Map<string, string[]>();
  for (const run of runs20) {
    for (const issue of run.issues) {
      if (issue.severity === "error") {
        const ids = criterionMap.get(issue.criterion) ?? [];
        criterionMap.set(issue.criterion, [...ids, run.id]);
      }
    }
  }
  for (const [criterion, runIds] of criterionMap.entries()) {
    if (runIds.length >= 3) {
      const key = `Falha crítica recorrente: ${criterion}`;
      if (!existingActiveTitles.has(key)) {
        alerts.push({
          agentId:       "sdr",
          title:         key,
          message:       `Critério "${criterion}" falhou em ${runIds.length} das últimas ${runs20.length} simulações.`,
          severity:      "critical",
          triggerType:   "critical_issue",
          relatedRunIds: runIds,
        });
      }
    }
  }

  // 3. Fail rate > 40%
  const failRuns    = runs20.filter((r) => r.verdict === "fail");
  const failRate    = failRuns.length / runs20.length;
  const highFailKey = "Taxa de falha elevada";
  if (failRate > 0.4 && !existingActiveTitles.has(highFailKey)) {
    alerts.push({
      agentId:       "sdr",
      title:         highFailKey,
      message:       `${Math.round(failRate * 100)}% das últimas ${runs20.length} simulações falharam (threshold: 40%).`,
      severity:      "warning",
      triggerType:   "high_fail_rate",
      relatedRunIds: failRuns.map((r) => r.id),
    });
  }

  return alerts;
}
