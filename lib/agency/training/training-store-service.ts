// V3: Prisma-backed persistent storage.
// Replaces V1 in-memory store — history survives deploys and restarts.

import { prisma }    from "@/lib/db/client";
import type {
  SimulationRun,
  AgentImprovementSuggestion,
  ImprovementStatus,
  SimulationIssue,
  DynamicScenarioMetadata,
} from "./types";
import { TRAINING_JOB_CONFIG } from "./config";
import type { TrainingAlertInput } from "./alerts";

// ── Public summary types ──────────────────────────────────────────────────────

export interface BatchSummary {
  totalRuns:    number;
  pass:         number;
  warning:      number;
  fail:         number;
  averageScore: number;
  durationMs:   number;
  triggeredBy:  string;
  mode:         string;
  completedAt:  string;
}

export interface CompactRun {
  id:             string;
  scenarioName:   string;
  score:          number;
  verdict:        string;
  scenarioOrigin: string;
  createdAt:      string;
}

export interface CompactSuggestion {
  id:             string;
  title:          string;
  impact:         string;
  status:         string;
  sourceRunCount: number;
  createdAt:      string;
}

export interface AlertItem {
  id:          string;
  title:       string;
  message:     string;
  severity:    string;
  triggerType: string;
  status:      string;
  createdAt:   string;
}

export interface ServerTrainingSummary {
  totalRuns:           number;
  runsToday:           number;
  runsThisWeek:        number;
  averageScore:        number;
  passCount:           number;
  warnCount:           number;
  failCount:           number;
  pendingSuggestions:  number;
  approvedSuggestions: number;
  rejectedSuggestions: number;
  activeAlerts:        number;
  lastBatchAt:         string | null;
  lastBatchSummary:    BatchSummary | null;
  recentRuns:          CompactRun[];
  activeSuggestions:   CompactSuggestion[];
  alertItems:          AlertItem[];
}

// ── Serialisation helpers ─────────────────────────────────────────────────────

function serializeRun(run: SimulationRun, batchId?: string) {
  return {
    id:               run.id,
    batchId:          batchId ?? null,
    agentId:          run.agentId,
    scenarioOrigin:   run.scenarioOrigin,
    scenarioSeed:     run.scenarioSeed ?? null,
    scenarioName:     run.scenarioName,
    scenarioMetadata: JSON.stringify(run.scenarioMetadata ?? {}),
    score:            run.score,
    verdict:          run.verdict,
    transcript:       JSON.stringify(run.transcript),
    finalScope:       run.finalScope     ? JSON.stringify(run.finalScope)    : null,
    finalEstimate:    run.finalEstimate  ? JSON.stringify(run.finalEstimate) : null,
    sdrHandoff:       run.sdrHandoff     ? JSON.stringify(run.sdrHandoff)    : null,
    issues:           JSON.stringify(run.issues),
    recommendations:  JSON.stringify(run.recommendations),
    engineVersion:    run.engineVersion,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deserializeRun(row: any): SimulationRun {
  return {
    id:               row.id,
    agentId:          "sdr",
    scenarioId:       row.id,
    scenarioName:     row.scenarioName,
    startedAt:        row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    completedAt:      row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    transcript:       JSON.parse(row.transcript      || "[]"),
    finalScope:       row.finalScope    ? JSON.parse(row.finalScope)    : null,
    finalEstimate:    row.finalEstimate ? JSON.parse(row.finalEstimate) : null,
    finalSdrState:    null,
    sdrHandoff:       row.sdrHandoff    ? JSON.parse(row.sdrHandoff)    : null,
    score:            row.score,
    verdict:          row.verdict  as SimulationRun["verdict"],
    issues:           JSON.parse(row.issues          || "[]") as SimulationIssue[],
    recommendations:  JSON.parse(row.recommendations || "[]") as string[],
    engineVersion:    row.engineVersion,
    status:           "completed",
    scenarioOrigin:   row.scenarioOrigin as "seed" | "dynamic",
    scenarioSeed:     row.scenarioSeed   ?? undefined,
    scenarioMetadata: row.scenarioMetadata
      ? JSON.parse(row.scenarioMetadata) as DynamicScenarioMetadata
      : undefined,
  };
}

function serializeSuggestion(s: AgentImprovementSuggestion) {
  return {
    id:              s.id,
    agentId:         s.agentId,
    title:           s.title,
    problem:         s.problem,
    evidence:        s.evidence,
    suggestedChange: s.suggestedChange,
    impact:          s.impact,
    status:          s.status,
    sourceRunIds:    JSON.stringify(s.sourceRunIds),
    createdAt:       new Date(s.createdAt),
    decidedAt:       s.decidedAt ? new Date(s.decidedAt) : null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deserializeSuggestion(row: any): AgentImprovementSuggestion {
  return {
    id:              row.id,
    agentId:         "sdr",
    title:           row.title,
    problem:         row.problem,
    evidence:        row.evidence,
    suggestedChange: row.suggestedChange,
    impact:          row.impact as AgentImprovementSuggestion["impact"],
    status:          row.status as ImprovementStatus,
    sourceRunIds:    JSON.parse(row.sourceRunIds || "[]") as string[],
    createdAt:       row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    decidedAt:       row.decidedAt
      ? (row.decidedAt instanceof Date ? row.decidedAt.toISOString() : String(row.decidedAt))
      : undefined,
  };
}

// ── Write operations ──────────────────────────────────────────────────────────

export interface BatchInput {
  mode:        string;
  triggeredBy: string;
  totalRuns:   number;
  pass:        number;
  warning:     number;
  fail:        number;
  averageScore: number;
  durationMs:  number;
}

export async function saveBatch(input: BatchInput): Promise<string> {
  const batch = await prisma.trainingBatch.create({
    data: {
      mode:         input.mode,
      triggeredBy:  input.triggeredBy,
      totalRuns:    input.totalRuns,
      passCount:    input.pass,
      warningCount: input.warning,
      failCount:    input.fail,
      averageScore: input.averageScore,
      durationMs:   input.durationMs,
    },
  });
  return batch.id;
}

export async function saveRuns(runs: SimulationRun[], batchId?: string): Promise<void> {
  if (runs.length === 0) return;
  await Promise.all(
    runs.map((r) =>
      prisma.dbSimulationRun.upsert({
        where:  { id: r.id },
        create: serializeRun(r, batchId),
        update: {},
      }),
    ),
  );
}

export async function saveSuggestions(suggestions: AgentImprovementSuggestion[]): Promise<void> {
  if (suggestions.length === 0) return;
  await Promise.all(
    suggestions.map((s) =>
      prisma.dbAgentSuggestion.upsert({
        where:  { id: s.id },
        create: serializeSuggestion(s),
        update: {},
      }),
    ),
  );
}

export async function saveAlerts(inputs: TrainingAlertInput[]): Promise<void> {
  if (inputs.length === 0) return;
  await prisma.trainingAlert.createMany({
    data: inputs.map((a) => ({
      agentId:       a.agentId,
      title:         a.title,
      message:       a.message,
      severity:      a.severity,
      triggerType:   a.triggerType,
      relatedRunIds: JSON.stringify(a.relatedRunIds),
      status:        "active",
    })),
  });
}

// ── Read operations ───────────────────────────────────────────────────────────

// Lightweight count used for daily-cap enforcement before each batch.
export async function countRunsToday(): Promise<number> {
  const now          = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return prisma.dbSimulationRun.count({ where: { createdAt: { gte: startOfToday } } });
}

export async function getRuns(limit = 200): Promise<SimulationRun[]> {
  const rows = await prisma.dbSimulationRun.findMany({
    orderBy: { createdAt: "asc" },
    take:    limit,
  });
  return rows.map(deserializeRun);
}

export async function getSuggestions(status?: string): Promise<AgentImprovementSuggestion[]> {
  const rows = await prisma.dbAgentSuggestion.findMany({
    where:   status ? { status } : undefined,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(deserializeSuggestion);
}

export async function getActiveAlertTitles(): Promise<Set<string>> {
  const rows = await prisma.trainingAlert.findMany({
    where:  { status: "active" },
    select: { title: true },
  });
  return new Set(rows.map((r) => r.title));
}

// ── Mutation ──────────────────────────────────────────────────────────────────

export async function updateSuggestionStatus(
  id:     string,
  status: ImprovementStatus,
): Promise<void> {
  await prisma.dbAgentSuggestion.update({
    where: { id },
    data:  { status, decidedAt: new Date() },
  });

  // When approved — create a pending BrainChangeRequest (never auto-applies to SDR brain)
  if (status === "approved") {
    const suggestion = await prisma.dbAgentSuggestion.findUnique({ where: { id } });
    if (suggestion) {
      await prisma.brainChangeRequest.create({
        data: {
          agentId:             suggestion.agentId,
          title:               suggestion.title,
          sourceSuggestionIds: JSON.stringify([id]),
          proposedChange:      suggestion.suggestedChange,
          status:              "pending",
        },
      });
    }
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

export async function getTrainingSummary(): Promise<ServerTrainingSummary> {
  const now          = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek  = new Date(startOfToday);
  startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay());

  const [
    totalRuns,
    runsToday,
    runsThisWeek,
    scoreAgg,
    passCount,
    warnCount,
    failCount,
    pendingSuggestions,
    approvedSuggestions,
    rejectedSuggestions,
    activeAlerts,
    lastBatch,
    recentRunRows,
    activeSuggRows,
    alertRows,
  ] = await Promise.all([
    prisma.dbSimulationRun.count(),
    prisma.dbSimulationRun.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.dbSimulationRun.count({ where: { createdAt: { gte: startOfWeek  } } }),
    prisma.dbSimulationRun.aggregate({ _avg: { score: true } }),
    prisma.dbSimulationRun.count({ where: { verdict: "pass"    } }),
    prisma.dbSimulationRun.count({ where: { verdict: "warning" } }),
    prisma.dbSimulationRun.count({ where: { verdict: "fail"    } }),
    prisma.dbAgentSuggestion.count({ where: { status: "pending"  } }),
    prisma.dbAgentSuggestion.count({ where: { status: "approved" } }),
    prisma.dbAgentSuggestion.count({ where: { status: "rejected" } }),
    prisma.trainingAlert.count({ where: { status: "active" } }),
    prisma.trainingBatch.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma.dbSimulationRun.findMany({
      orderBy: { createdAt: "desc" },
      take:    20,
      select:  { id: true, scenarioName: true, score: true, verdict: true, scenarioOrigin: true, createdAt: true },
    }),
    prisma.dbAgentSuggestion.findMany({
      where:   { status: "pending" },
      orderBy: { createdAt: "desc" },
      take:    10,
      select:  { id: true, title: true, impact: true, status: true, sourceRunIds: true, createdAt: true },
    }),
    prisma.trainingAlert.findMany({
      where:   { status: "active" },
      orderBy: { createdAt: "desc" },
      take:    10,
      select:  { id: true, title: true, message: true, severity: true, triggerType: true, status: true, createdAt: true },
    }),
  ]);

  const lastBatchSummary: BatchSummary | null = lastBatch ? {
    totalRuns:    lastBatch.totalRuns,
    pass:         lastBatch.passCount,
    warning:      lastBatch.warningCount,
    fail:         lastBatch.failCount,
    averageScore: lastBatch.averageScore,
    durationMs:   lastBatch.durationMs,
    triggeredBy:  lastBatch.triggeredBy,
    mode:         lastBatch.mode,
    completedAt:  lastBatch.createdAt.toISOString(),
  } : null;

  const recentRuns: CompactRun[] = recentRunRows.map((r) => ({
    id:             r.id,
    scenarioName:   r.scenarioName,
    score:          r.score,
    verdict:        r.verdict,
    scenarioOrigin: r.scenarioOrigin,
    createdAt:      r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  }));

  const activeSuggestions: CompactSuggestion[] = activeSuggRows.map((s) => ({
    id:             s.id,
    title:          s.title,
    impact:         s.impact,
    status:         s.status,
    sourceRunCount: (() => { try { return (JSON.parse(s.sourceRunIds) as string[]).length; } catch { return 0; } })(),
    createdAt:      s.createdAt instanceof Date ? s.createdAt.toISOString() : String(s.createdAt),
  }));

  const alertItems: AlertItem[] = alertRows.map((a) => ({
    id:          a.id,
    title:       a.title,
    message:     a.message,
    severity:    a.severity,
    triggerType: a.triggerType,
    status:      a.status,
    createdAt:   a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
  }));

  return {
    totalRuns,
    runsToday,
    runsThisWeek,
    averageScore:        Math.round(scoreAgg._avg.score ?? 0),
    passCount,
    warnCount,
    failCount,
    pendingSuggestions,
    approvedSuggestions,
    rejectedSuggestions,
    activeAlerts,
    lastBatchAt:         lastBatch?.createdAt.toISOString() ?? null,
    lastBatchSummary,
    recentRuns,
    activeSuggestions,
    alertItems,
  };
}

// ── Maintenance ───────────────────────────────────────────────────────────────

export async function pruneOldData(): Promise<number> {
  const total  = await prisma.dbSimulationRun.count();
  const excess = total - TRAINING_JOB_CONFIG.maxStoredRuns;
  if (excess <= 0) return 0;

  const oldest = await prisma.dbSimulationRun.findMany({
    orderBy: { createdAt: "asc" },
    take:    excess,
    select:  { id: true },
  });
  await prisma.dbSimulationRun.deleteMany({
    where: { id: { in: oldest.map((r) => r.id) } },
  });
  return excess;
}
