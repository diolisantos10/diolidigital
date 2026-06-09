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
}

// enabled: false → cron endpoint runs in no-op mode until explicitly turned on
export const TRAINING_JOB_CONFIG: TrainingJobConfig = {
  enabled:             false,
  defaultMode:         "dynamic",
  batchSize:           10,
  maxRunsPerTrigger:   100,
  maxStoredRuns:       500,
  suggestionThreshold: 2,
  minScoreAlert:       40,
  cooldownMinutes:     60,
};

// Absolute hard cap — never exceeded regardless of payload
export const MAX_COUNT_HARD_CAP = 100;
