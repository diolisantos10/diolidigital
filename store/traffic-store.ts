"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TrafficCanvas, TrafficCanvasStatus } from "@/lib/dioli-brain/traffic-canvas";
import { generateTrafficCanvas, type TrafficEngineInput } from "@/lib/dioli-brain/traffic-engine";

interface TrafficStore {
  canvases: TrafficCanvas[];
  changeRequestCanvasIds: string[];

  createCanvas: (input: TrafficEngineInput) => string;
  reviewCanvas: (id: string, status: Exclude<TrafficCanvasStatus, "draft">, note?: string) => void;
  deleteCanvas: (id: string) => void;
  markChangeRequestCreated: (canvasId: string) => void;
  clearSimulationCanvases: () => void;
}

export const useTrafficStore = create<TrafficStore>()(
  persist(
    (set) => ({
      canvases: [],
      changeRequestCanvasIds: [],

      createCanvas: (input) => {
        const canvas = generateTrafficCanvas(input);
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
    { name: "dioli-traffic-v1" }
  )
);
