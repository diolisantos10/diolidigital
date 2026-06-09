"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SimulationRun, AgentImprovementSuggestion, ImprovementStatus } from "@/lib/agency/training/types";
import { SEED_SCENARIOS } from "@/lib/agency/training/scenarios";
import { runSDRSimulation } from "@/lib/agency/training/runner";
import { applyEvaluation } from "@/lib/agency/training/evaluator";
import { generateImprovementSuggestions } from "@/lib/agency/training/suggestions";

interface TrainingStore {
  runs:             SimulationRun[];
  suggestions:      AgentImprovementSuggestion[];
  isRunning:        boolean;
  continuousMode:   boolean;

  runScenarios:             (count: number) => void;
  updateSuggestionStatus:   (id: string, status: ImprovementStatus) => void;
  toggleContinuousMode:     () => void;
  clearRuns:                () => void;
}

export const useTrainingStore = create<TrainingStore>()(
  persist(
    (set, get) => ({
      runs:           [],
      suggestions:    [],
      isRunning:      false,
      continuousMode: false,

      runScenarios: (count) => {
        set({ isRunning: true });
        const { runs: existingRuns, suggestions: existingSuggestions } = get();

        const newRuns: SimulationRun[] = [];
        for (let i = 0; i < count; i++) {
          const scenario = SEED_SCENARIOS[i % SEED_SCENARIOS.length];
          const raw      = runSDRSimulation(scenario);
          const evaluated = applyEvaluation(raw, scenario);
          newRuns.push(evaluated);
        }

        const allRuns        = [...existingRuns, ...newRuns];
        const newSuggestions = generateImprovementSuggestions(allRuns, existingSuggestions);

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
      partialize: (s) => ({ runs: s.runs, suggestions: s.suggestions }),
    },
  ),
);
