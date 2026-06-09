import { runSDRSimulation }       from "./runner";
import { applyEvaluation }         from "./evaluator";
import { generateDynamicScenario } from "./dynamic-scenario-generator";
import { SEED_SCENARIOS }          from "./scenarios";
import { generateImprovementSuggestions } from "./suggestions";
import {
  saveBatch, saveRuns, saveSuggestions, saveAlerts,
  getRuns, getSuggestions, getActiveAlertTitles,
} from "./training-store-service";
import { generateAlerts }  from "./alerts";
import { MAX_COUNT_HARD_CAP } from "./config";
import type { SimulationRun } from "./types";

export type { TrainingMode } from "./config";

export interface BatchRunOptions {
  mode:        "seed" | "dynamic" | "mixed";
  count:       number;
  triggeredBy: "manual" | "cron";
}

export interface BatchRunResult {
  totalRuns:          number;
  pass:               number;
  warning:            number;
  fail:               number;
  averageScore:       number;
  suggestionsCreated: number;
  durationMs:         number;
  triggeredBy:        string;
  mode:               string;
  completedAt:        string;
}

function runBatch(count: number, mode: "seed" | "dynamic" | "mixed"): SimulationRun[] {
  const safeCount = Math.min(count, MAX_COUNT_HARD_CAP);
  const newRuns: SimulationRun[] = [];

  for (let i = 0; i < safeCount; i++) {
    if (mode === "seed") {
      const scenario = SEED_SCENARIOS[i % SEED_SCENARIOS.length];
      const raw      = runSDRSimulation(scenario, { origin: "seed" });
      newRuns.push(applyEvaluation(raw, scenario));

    } else if (mode === "dynamic") {
      const dyn = generateDynamicScenario();
      const raw = runSDRSimulation(dyn, {
        origin:   "dynamic",
        seed:     dyn.scenarioSeed,
        metadata: dyn.scenarioMetadata,
      });
      newRuns.push(applyEvaluation(raw, dyn));

    } else {
      // mixed: ~30% seed, ~70% dynamic
      if (i % 10 < 3) {
        const scenario = SEED_SCENARIOS[i % SEED_SCENARIOS.length];
        const raw      = runSDRSimulation(scenario, { origin: "seed" });
        newRuns.push(applyEvaluation(raw, scenario));
      } else {
        const dyn = generateDynamicScenario();
        const raw = runSDRSimulation(dyn, {
          origin:   "dynamic",
          seed:     dyn.scenarioSeed,
          metadata: dyn.scenarioMetadata,
        });
        newRuns.push(applyEvaluation(raw, dyn));
      }
    }
  }

  return newRuns;
}

export async function executeBatch(options: BatchRunOptions): Promise<BatchRunResult> {
  const { mode, triggeredBy } = options;
  const count                 = Math.min(options.count, MAX_COUNT_HARD_CAP);
  const startedAt             = Date.now();

  // Fetch context for suggestion dedup and alert generation
  const [existingRuns, existingSuggestions] = await Promise.all([
    getRuns(200),
    getSuggestions(),
  ]);

  // CPU-bound simulation — synchronous
  const newRuns        = runBatch(count, mode);
  const allRuns        = [...existingRuns, ...newRuns];
  const newSuggestions = generateImprovementSuggestions(allRuns, existingSuggestions);

  const pass    = newRuns.filter((r) => r.verdict === "pass").length;
  const warning = newRuns.filter((r) => r.verdict === "warning").length;
  const fail    = newRuns.filter((r) => r.verdict === "fail").length;
  const avgScore = newRuns.length > 0
    ? Math.round(newRuns.reduce((s, r) => s + r.score, 0) / newRuns.length)
    : 0;
  const durationMs  = Date.now() - startedAt;
  const completedAt = new Date().toISOString();

  // Persist batch → get batchId → persist runs and suggestions in parallel
  const batchId = await saveBatch({
    mode, triggeredBy, totalRuns: newRuns.length,
    pass, warning, fail, averageScore: avgScore, durationMs,
  });

  await Promise.all([
    saveRuns(newRuns, batchId),
    saveSuggestions(newSuggestions),
  ]);

  // Alert generation — uses in-memory allRuns (no extra DB round-trip)
  const activeTitles = await getActiveAlertTitles();
  const alerts       = generateAlerts(allRuns, activeTitles);
  if (alerts.length > 0) await saveAlerts(alerts);

  return {
    totalRuns:          newRuns.length,
    pass,
    warning,
    fail,
    averageScore:       avgScore,
    suggestionsCreated: newSuggestions.length,
    durationMs,
    triggeredBy,
    mode,
    completedAt,
  };
}
