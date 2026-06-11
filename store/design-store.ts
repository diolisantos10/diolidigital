"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DesignCanvas, DesignCanvasStatus, DesignAssetStatus } from "@/lib/dioli-brain/design-canvas";
import { generateDesignCanvas, type DesignEngineInput } from "@/lib/dioli-brain/design-engine";

interface DesignStore {
  canvases: DesignCanvas[];
  changeRequestCanvasIds: string[];

  createCanvas: (input: DesignEngineInput) => string;
  reviewCanvas: (id: string, status: Exclude<DesignCanvasStatus, "draft">, note?: string) => void;
  deleteCanvas: (id: string) => void;
  setAssetStatus: (canvasId: string, assetId: string, status: DesignAssetStatus) => void;
  markChangeRequestCreated: (canvasId: string) => void;
  clearSimulationCanvases: () => void;
}

export const useDesignStore = create<DesignStore>()(
  persist(
    (set) => ({
      canvases: [],
      changeRequestCanvasIds: [],

      createCanvas: (input) => {
        const canvas = generateDesignCanvas(input);
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

      setAssetStatus: (canvasId, assetId, status) => {
        set((s) => ({
          canvases: s.canvases.map((c) =>
            c.id === canvasId
              ? {
                  ...c,
                  assetRequirements: c.assetRequirements.map((a) =>
                    a.id === assetId ? { ...a, status } : a
                  ),
                }
              : c
          ),
        }));
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
    { name: "dioli-design-v1" }
  )
);
