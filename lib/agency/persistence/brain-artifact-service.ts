import { prisma } from "@/lib/db/client";

export type Department =
  | "strategy"
  | "social"
  | "design"
  | "traffic"
  | "analytics"
  | "quality";

export interface CreateBrainArtifactInput {
  clientRequestId: string;
  department: Department;
  canvasId: string;
  canvas: object;
  qualityGate?: object;
  cognitiveFlow?: object;
  version?: number;
  approvedBy?: string;
}

export async function createBrainArtifact(input: CreateBrainArtifactInput) {
  // Supersede any previous artifact for the same request+department
  await prisma.brainArtifact.updateMany({
    where: {
      clientRequestId: input.clientRequestId,
      department:      input.department,
      status:          "approved",
    },
    data: { status: "superseded" },
  });

  return prisma.brainArtifact.create({
    data: {
      clientRequestId:   input.clientRequestId,
      department:        input.department,
      canvasId:          input.canvasId,
      canvasJson:        JSON.stringify(input.canvas),
      qualityGateJson:   input.qualityGate   ? JSON.stringify(input.qualityGate)   : null,
      cognitiveFlowJson: input.cognitiveFlow ? JSON.stringify(input.cognitiveFlow) : null,
      version:           input.version ?? 1,
      status:            "approved",
      approvedBy:        input.approvedBy ?? "internal",
    },
  });
}

export async function getArtifactsForRequest(clientRequestId: string) {
  return prisma.brainArtifact.findMany({
    where: { clientRequestId },
    orderBy: { createdAt: "asc" },
  });
}

export async function getLatestArtifact(clientRequestId: string, department: Department) {
  return prisma.brainArtifact.findFirst({
    where: { clientRequestId, department, status: "approved" },
    orderBy: { createdAt: "desc" },
  });
}

export function parseArtifactCanvas<T = unknown>(artifact: { canvasJson: string }): T {
  return JSON.parse(artifact.canvasJson) as T;
}
