// Client-side helper — fire-and-forget artifact persistence on approval.
// Never throws; logs warning on failure so approvals are never blocked.

import type { Department } from "./brain-artifact-service";

interface SaveArtifactInput {
  clientRequestId: string;
  department: Department;
  canvasId: string;
  canvas: object;
  qualityGate?: object;
  cognitiveFlow?: object;
  version?: number;
}

export async function saveArtifactToDb(input: SaveArtifactInput): Promise<void> {
  try {
    const res = await fetch("/api/brain/artifacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      console.warn(`[brain/artifacts] save failed HTTP ${res.status} for ${input.department}/${input.canvasId}`);
    }
  } catch {
    console.warn(`[brain/artifacts] save network error for ${input.department}/${input.canvasId}`);
  }
}
