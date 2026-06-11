import { prisma } from "@/lib/db/client";

export type EvidenceType =
  | "metric"
  | "document"
  | "screenshot"
  | "external_link"
  | "annotation";

export interface CreateEvidenceItemInput {
  clientRequestId?: string;
  artifactId?: string;
  department: string;
  type: EvidenceType;
  label: string;
  value?: Record<string, unknown>;
  sourceUrl?: string;
}

export async function createEvidenceItem(input: CreateEvidenceItemInput) {
  return prisma.evidenceItem.create({
    data: {
      clientRequestId: input.clientRequestId,
      artifactId:      input.artifactId,
      department:      input.department,
      type:            input.type,
      label:           input.label,
      valueJson:       JSON.stringify(input.value ?? {}),
      sourceUrl:       input.sourceUrl,
    },
  });
}

export async function getEvidenceForRequest(clientRequestId: string) {
  return prisma.evidenceItem.findMany({
    where: { clientRequestId },
    orderBy: { createdAt: "asc" },
  });
}

export async function getEvidenceForArtifact(artifactId: string) {
  return prisma.evidenceItem.findMany({
    where: { artifactId },
    orderBy: { createdAt: "asc" },
  });
}

export function parseEvidenceValue(item: { valueJson: string }): Record<string, unknown> {
  try { return JSON.parse(item.valueJson); } catch { return {}; }
}
