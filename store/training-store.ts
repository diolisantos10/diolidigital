"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SimulationRun, AgentImprovementSuggestion, ImprovementStatus } from "@/lib/agency/training/types";
import { SEED_SCENARIOS } from "@/lib/agency/training/scenarios";
import { generateDynamicScenario } from "@/lib/agency/training/dynamic-scenario-generator";
import { runSDRSimulation } from "@/lib/agency/training/runner";
import { applyEvaluation } from "@/lib/agency/training/evaluator";
import { generateImprovementSuggestions } from "@/lib/agency/training/suggestions";

export type TrainingMode = "seed" | "dynamic" | "mixed";

interface TrainingStore {
  runs:           SimulationRun[];
  suggestions:    AgentImprovementSuggestion[];
  isRunning:      boolean;
  continuousMode: boolean;
  trainingMode:   TrainingMode;

  setTrainingMode:          (mode: TrainingMode) => void;
  runSeedScenarios:         (count: number) => void;
  runDynamicScenarios:      (count: number) => void;
  runMixedScenarios:        (count: number) => void;
  updateSuggestionStatus:   (id: string, status: ImprovementStatus) => void;
  toggleContinuousMode:     () => void;
  clearRuns:                () => void;
}

function executeRuns(
  count:  number,
  mode:   TrainingMode,
  existing: SimulationRun[],
  existingSuggestions: AgentImprovementSuggestion[],
): { newRuns: SimulationRun[]; newSuggestions: AgentImprovementSuggestion[] } {
  const newRuns: SimulationRun[] = [];

  for (let i = 0; i < count; i++) {
    if (mode === "seed") {
      const scenario  = SEED_SCENARIOS[i % SEED_SCENARIOS.length];
      const raw       = runSDRSimulation(scenario, { origin: "seed" });
      newRuns.push(applyEvaluation(raw, scenario));

    } else if (mode === "dynamic") {
      const dynScenario = generateDynamicScenario();
      const raw         = runSDRSimulation(dynScenario, {
        origin:   "dynamic",
        seed:     dynScenario.scenarioSeed,
        metadata: dynScenario.scenarioMetadata,
      });
      newRuns.push(applyEvaluation(raw, dynScenario));

    } else {
      // mixed: ~30% seed, ~70% dynamic
      const useSeed = (i % 10) < 3;
      if (useSeed) {
        const scenario = SEED_SCENARIOS[i % SEED_SCENARIOS.length];
        const raw      = runSDRSimulation(scenario, { origin: "seed" });
        newRuns.push(applyEvaluation(raw, scenario));
      } else {
        const dynScenario = generateDynamicScenario();
        const raw         = runSDRSimulation(dynScenario, {
          origin:   "dynamic",
          seed:     dynScenario.scenarioSeed,
          metadata: dynScenario.scenarioMetadata,
        });
        newRuns.push(applyEvaluation(raw, dynScenario));
      }
    }
  }

  const allRuns        = [...existing, ...newRuns];
  const newSuggestions = generateImprovementSuggestions(allRuns, existingSuggestions);
  return { newRuns, newSuggestions };
}

export const useTrainingStore = create<TrainingStore>()(
  persist(
    (set, get) => ({
      runs:           [],
      suggestions:    [],
      isRunning:      false,
      continuousMode: false,
      trainingMode:   "dynamic",

      setTrainingMode: (mode) => set({ trainingMode: mode }),

      runSeedScenarios: (count) => {
        set({ isRunning: true });
        const { runs: existing, suggestions: existingSuggestions } = get();
        const { newRuns, newSuggestions } = executeRuns(count, "seed", existing, existingSuggestions);
        set((s) => ({
          isRunning:   false,
          runs:        [...s.runs, ...newRuns].slice(-200),
          suggestions: [...s.suggestions, ...newSuggestions],
        }));
      },

      runDynamicScenarios: (count) => {
        set({ isRunning: true });
        const { runs: existing, suggestions: existingSuggestions } = get();
        const { newRuns, newSuggestions } = executeRuns(count, "dynamic", existing, existingSuggestions);
        set((s) => ({
          isRunning:   false,
          runs:        [...s.runs, ...newRuns].slice(-200),
          suggestions: [...s.suggestions, ...newSuggestions],
        }));
      },

      runMixedScenarios: (count) => {
        set({ isRunning: true });
        const { runs: existing, suggestions: existingSuggestions } = get();
        const { newRuns, newSuggestions } = executeRuns(count, "mixed", existing, existingSuggestions);
        set((s) => ({
          isRunning:   false,
          runs:        [...s.runs, ...newRuns].slice(-200),
          suggestions: [...s.suggestions, ...newSuggestions],
        }));
      },

      updateSuggestionStatus: (id, status) =>
        set((s) => ({
          suggestions: s.suggestions.map((sg) =>
            sg.id === id ? { ...sg, status, decidedAt: new Date().toISOString() } : sg,
          ),
        })),

      toggleContinuousMode: () => set((s) => ({ continuousMode: !s.continuousMode })),

      clearRuns: () => set({ runs: [], suggestions: [] }),
    }),
    {
      name: "dioli-training-store",
      partialize: (s) => ({ runs: s.runs, suggestions: s.suggestions, trainingMode: s.trainingMode }),
    },
  ),
);
