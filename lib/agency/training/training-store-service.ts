// V1: Server-global in-memory store.
// Lives for the duration of the Node.js process — survives requests, resets on deploy.
// Migrate to a Prisma TrainingRun model when DB persistence is added.
// LIMITATION: Resets on every Railway redeploy. Historical data is not durable.

import type { SimulationRun, AgentImprovementSuggestion } from "./types";
import { TRAINING_JOB_CONFIG } from "./config";

export interface BatchSummary {
  totalRuns:          number;
  pass:               number;
  warning:            number;
  fail:               number;
  averageScore:       number;
  suggestionsCreated: number;
  durationMs:         number;
  triggeredBy:        string;
  completedAt:        string;
}

export interface ServerTrainingSummary {
  totalRuns:           number;
  passCount:           number;
  warnCount:           number;
  failCount:           number;
  averageScore:        number;
  pendingSuggestions:  number;
  lastBatchAt:         string | null;
  lastBatchSummary:    BatchSummary | null;
}

interface MemoryStore {
  runs:             SimulationRun[];
  suggestions:      AgentImprovementSuggestion[];
  lastBatchAt:      string | null;
  lastBatchSummary: BatchSummary | null;
}

const g = globalThis as unknown as { _sdrTrainingStore?: MemoryStore };

function getMemStore(): MemoryStore {
  if (!g._sdrTrainingStore) {
    g._sdrTrainingStore = { runs: [], suggestions: [], lastBatchAt: null, lastBatchSummary: null };
  }
  return g._sdrTrainingStore;
}

export function saveRuns(newRuns: SimulationRun[]): void {
  const store = getMemStore();
  store.runs = [...store.runs, ...newRuns].slice(-TRAINING_JOB_CONFIG.maxStoredRuns);
}

export function saveSuggestions(newSuggestions: AgentImprovementSuggestion[]): void {
  const store = getMemStore();
  const existingIds = new Set(store.suggestions.map((s) => s.id));
  const toAdd = newSuggestions.filter((s) => !existingIds.has(s.id));
  store.suggestions = [...store.suggestions, ...toAdd];
}

export function setLastBatch(summary: BatchSummary): void {
  const store = getMemStore();
  store.lastBatchAt      = summary.completedAt;
  store.lastBatchSummary = summary;
}

export function getRuns(): SimulationRun[] {
  return getMemStore().runs;
}

export function getSuggestions(): AgentImprovementSuggestion[] {
  return getMemStore().suggestions;
}

export function getTrainingSummary(): ServerTrainingSummary {
  const store      = getMemStore();
  const runs       = store.runs;
  const totalRuns  = runs.length;
  const passCount  = runs.filter((r) => r.verdict === "pass").length;
  const warnCount  = runs.filter((r) => r.verdict === "warning").length;
  const failCount  = runs.filter((r) => r.verdict === "fail").length;
  const avgScore   = totalRuns > 0
    ? Math.round(runs.reduce((s, r) => s + r.score, 0) / totalRuns)
    : 0;
  const pendingSuggestions = store.suggestions.filter((s) => s.status === "pending").length;

  return {
    totalRuns,
    passCount,
    warnCount,
    failCount,
    averageScore:       avgScore,
    pendingSuggestions,
    lastBatchAt:        store.lastBatchAt,
    lastBatchSummary:   store.lastBatchSummary,
  };
}

export function pruneOldRuns(maxRuns = TRAINING_JOB_CONFIG.maxStoredRuns): number {
  const store  = getMemStore();
  const before = store.runs.length;
  store.runs   = store.runs.slice(-maxRuns);
  return before - store.runs.length;
}
