"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AnalyticsCanvas, AnalyticsCanvasStatus } from "@/lib/dioli-brain/analytics-canvas";
import { generateAnalyticsCanvas, type AnalyticsEngineInput } from "@/lib/dioli-brain/analytics-engine";

interface AnalyticsStore {
  canvases: AnalyticsCanvas[];
  changeRequestCanvasIds: string[];

  createCanvas: (input: AnalyticsEngineInput) => string;
  reviewCanvas: (id: string, status: Exclude<AnalyticsCanvasStatus, "draft">, note?: string) => void;
  deleteCanvas: (id: string) => void;
  markChangeRequestCreated: (canvasId: string) => void;
  clearSimulationCanvases: () => void;
}

export const useAnalyticsStore = create<AnalyticsStore>()(
  persist(
    (set) => ({
      canvases: [],
      changeRequestCanvasIds: [],

      createCanvas: (input) => {
        const canvas = generateAnalyticsCanvas(input);
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

      clearSimulationCanvases: () => {
        set((s) => ({ canvases: s.canvases.filter((c) => c.source !== "simulation") }));
      },
    }),
    { name: "dioli-analytics-v1" }
  )
);
