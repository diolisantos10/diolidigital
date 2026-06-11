"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { QualityCanvas, QualityCanvasStatus } from "@/lib/dioli-brain/quality-canvas";
import { generateQualityCanvas, type QualityEngineInput } from "@/lib/dioli-brain/quality-engine";

interface QualityStore {
  canvases: QualityCanvas[];
  changeRequestCanvasIds: string[];

  createCanvas: (input: QualityEngineInput) => string;
  reviewCanvas: (id: string, status: Exclude<QualityCanvasStatus, "draft">, note?: string) => void;
  deleteCanvas: (id: string) => void;
  markChangeRequestCreated: (canvasId: string) => void;
  clearSimulationCanvases: () => void;
}

export const useQualityStore = create<QualityStore>()(
  persist(
    (set) => ({
      canvases: [],
      changeRequestCanvasIds: [],

      createCanvas: (input) => {
        const canvas = generateQualityCanvas(input);
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
    { name: "dioli-quality-v1" }
  )
);
