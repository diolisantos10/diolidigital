"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ContentStatus, SocialCanvas, SocialCanvasStatus } from "@/lib/dioli-brain/social-canvas";
import { generateSocialCanvas, type SocialEngineInput } from "@/lib/dioli-brain/social-engine";

interface SocialStore {
  canvases: SocialCanvas[];
  // ids of canvases that already generated a BrainChangeRequest (avoid duplicates)
  changeRequestCanvasIds: string[];

  createCanvas: (input: SocialEngineInput) => string;
  reviewCanvas: (id: string, status: Exclude<SocialCanvasStatus, "draft">, note?: string) => void;
  deleteCanvas: (id: string) => void;
  setCalendarEntryStatus: (canvasId: string, entryId: string, status: ContentStatus) => void;
  markChangeRequestCreated: (canvasId: string) => void;
  clearSimulationCanvases: () => void;
}

export const useSocialStore = create<SocialStore>()(
  persist(
    (set) => ({
      canvases: [],
      changeRequestCanvasIds: [],

      createCanvas: (input) => {
        const canvas = generateSocialCanvas(input);
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

      setCalendarEntryStatus: (canvasId, entryId, status) => {
        set((s) => ({
          canvases: s.canvases.map((c) =>
            c.id === canvasId
              ? {
                  ...c,
                  editorialCalendar: {
                    ...c.editorialCalendar,
                    entries: c.editorialCalendar.entries.map((e) =>
                      e.id === entryId ? { ...e, status } : e
                    ),
                  },
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

      // Simulations are synthetic — allow cleanup without touching real pipeline canvases.
      clearSimulationCanvases: () => {
        set((s) => ({ canvases: s.canvases.filter((c) => c.source !== "simulation") }));
      },
    }),
    { name: "dioli-social-v1" }
  )
);
