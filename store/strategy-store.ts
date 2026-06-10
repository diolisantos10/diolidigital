"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { StrategyCanvas, StrategyCanvasStatus } from "@/lib/dioli-brain/strategy-canvas";
import { generateStrategyCanvas, type StrategyEngineInput } from "@/lib/dioli-brain/strategy-engine";

interface StrategyStore {
  canvases: StrategyCanvas[];
  // ids of canvases that already generated a BrainChangeRequest (avoid duplicates)
  changeRequestCanvasIds: string[];

  createCanvas: (input: StrategyEngineInput) => string;
  reviewCanvas: (id: string, status: Exclude<StrategyCanvasStatus, "draft">, note?: string) => void;
  deleteCanvas: (id: string) => void;
  markChangeRequestCreated: (canvasId: string) => void;
  clearSimulationCanvases: () => void;
}

export const useStrategyStore = create<StrategyStore>()(
  persist(
    (set) => ({
      canvases: [],
      changeRequestCanvasIds: [],

      createCanvas: (input) => {
        const canvas = generateStrategyCanvas(input);
        set((s) => ({ canvases: [canvas, ...s.canvases].slice(0, 100) }));
        return canvas.id;
      },

      reviewCanvas: (id, status, note) => {
        set((s) => ({
          canvases: s.canvases.map((c) =>
            c.id === id
              ? { ...c, status, reviewedAt: new Date().toISOString(), reviewNote: note?.trim() || undefined }
              : c
          ),
        }));
      },

      deleteCanvas: (id) => {
        set((s) => ({ canvases: s.canvases.filter((c) => c.id !== id) }));
      },

      markChangeRequestCreated: (canvasId) => {
        set((s) => ({
          changeRequestCanvasIds: s.changeRequestCanvasIds.includes(canvasId)
            ? s.changeRequestCanvasIds
            : [...s.changeRequestCanvasIds, canvasId],
        }));
      },

      // Simulations are synthetic — allow cleanup without touching real pipeline canvases.
      clearSimulationCanvases: () => {
        set((s) => ({ canvases: s.canvases.filter((c) => c.source !== "simulation") }));
      },
    }),
    { name: "dioli-strategy-v1" }
  )
);
