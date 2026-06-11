import { prisma } from "@/lib/db/client";

export type ClientRequestDbStatus =
  | "new"
  | "waiting_strategy"
  | "waiting_social"
  | "waiting_design"
  | "waiting_traffic"
  | "waiting_analytics"
  | "waiting_quality"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface CreateClientRequestInput {
  workspaceId?: string;
  clientId?: string;
  businessName: string;
  segment?: string;
  services?: string[];
  objectives?: string[];
  rawContext?: string;
  source?: string;
  briefingJson?: object;
  sdrHandoffJson?: object;
  attachmentsJson?: object[];
}

export interface UpdateClientRequestInput {
  status?: ClientRequestDbStatus;
  sdrHandoffJson?: object;
  briefingJson?: object;
  clientId?: string;
  workspaceId?: string;
}

export async function createClientRequest(input: CreateClientRequestInput) {
  return prisma.clientRequestDb.create({
    data: {
      businessName:    input.businessName,
      segment:         input.segment         ?? "",
      services:        JSON.stringify(input.services    ?? []),
      objectives:      JSON.stringify(input.objectives  ?? []),
      rawContext:      input.rawContext       ?? "",
      source:          input.source          ?? "briefing",
      workspaceId:     input.workspaceId,
      clientId:        input.clientId,
      briefingJson:    input.briefingJson    ? JSON.stringify(input.briefingJson)    : null,
      sdrHandoffJson:  input.sdrHandoffJson  ? JSON.stringify(input.sdrHandoffJson)  : null,
      attachmentsJson: JSON.stringify(input.attachmentsJson ?? []),
      status: "new",
    },
  });
}

export async function getClientRequest(id: string) {
  return prisma.clientRequestDb.findUnique({ where: { id } });
}

export async function listClientRequests(options?: {
  workspaceId?: string;
  status?: ClientRequestDbStatus;
  limit?: number;
}) {
  return prisma.clientRequestDb.findMany({
    where: {
      ...(options?.workspaceId ? { workspaceId: options.workspaceId } : {}),
      ...(options?.status      ? { status: options.status }           : {}),
    },
    orderBy: { createdAt: "desc" },
    take: options?.limit ?? 100,
  });
}

export async function updateClientRequest(id: string, input: UpdateClientRequestInput) {
  return prisma.clientRequestDb.update({
    where: { id },
    data: {
      ...(input.status      ? { status: input.status }                                        : {}),
      ...(input.clientId    ? { clientId: input.clientId }                                    : {}),
      ...(input.workspaceId ? { workspaceId: input.workspaceId }                              : {}),
      ...(input.briefingJson   ? { briefingJson:   JSON.stringify(input.briefingJson)   }     : {}),
      ...(input.sdrHandoffJson ? { sdrHandoffJson: JSON.stringify(input.sdrHandoffJson) }     : {}),
    },
  });
}
