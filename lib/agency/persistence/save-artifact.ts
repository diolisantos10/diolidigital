// Client-side helper — persists an approved artifact to the DB.
// THROWS on failure: approval flows must only complete after the artifact
// is confirmed saved (no silent data loss).

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

export class ArtifactSaveError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ArtifactSaveError";
  }
}

export async function saveArtifactToDb(input: SaveArtifactInput): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/brain/artifacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    throw new ArtifactSaveError(
      `Erro de rede ao salvar ${input.department}/${input.canvasId} — verifique a conexão.`,
    );
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => ({} as { error?: string }));
    throw new ArtifactSaveError(
      detail.error ?? `Falha HTTP ${res.status} ao salvar ${input.department}/${input.canvasId}.`,
      res.status,
    );
  }
}
