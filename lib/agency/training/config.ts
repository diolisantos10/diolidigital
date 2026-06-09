export type TrainingMode = "seed" | "dynamic" | "mixed";

export interface TrainingJobConfig {
  enabled:             boolean;
  defaultMode:         TrainingMode;
  batchSize:           number;
  maxRunsPerTrigger:   number;
  maxStoredRuns:       number;
  suggestionThreshold: number;
  minScoreAlert:       number;
  cooldownMinutes:     number;
  dailyCap:            number;
}

// Reads from env vars at module load — Railway Variables override defaults.
// TRAINING_ENABLED=true/false (default: false — safe)
// TRAINING_BATCH_SIZE=N        (default: 10)
// TRAINING_DAILY_CAP=N         (default: 200)
export const TRAINING_JOB_CONFIG: TrainingJobConfig = {
  enabled:             process.env.TRAINING_ENABLED === "true",
  defaultMode:         "dynamic",
  batchSize:           Number(process.env.TRAINING_BATCH_SIZE)  || 10,
  maxRunsPerTrigger:   100,
  maxStoredRuns:       500,
  suggestionThreshold: 2,
  minScoreAlert:       40,
  cooldownMinutes:     60,
  dailyCap:            Number(process.env.TRAINING_DAILY_CAP)   || 200,
};

// Hard cap enforced in all code paths — never exceeded regardless of payload
export const MAX_COUNT_HARD_CAP = 100;
