import { prisma } from "@/lib/db/client";

// ── Normalization ─────────────────────────────────────────────────────────────
// SQLite (via Prisma) stores JSON fields as raw strings. This normalizer parses
// them at the service boundary so every caller gets proper objects/arrays.

function safeJson(str: string | null | undefined, fallback: unknown): unknown {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

type RawRecord = Awaited<ReturnType<typeof prisma.clientRequestDb.findUniqueOrThrow>>;

export interface NormalizedClientRequest extends Omit<RawRecord, "services" | "objectives" | "briefingJson" | "sdrHandoffJson" | "attachmentsJson"> {
  services:        string[];
  objectives:      string[];
  briefingJson:    Record<string, unknown> | null;
  sdrHandoffJson:  Record<string, unknown> | null;
  attachmentsJson: unknown[];
}

export function normalizeClientRequest(raw: RawRecord): NormalizedClientRequest {
  return {
    ...raw,
    services:        safeJson(raw.services, [])        as string[],
    objectives:      safeJson(raw.objectives, [])      as string[],
    briefingJson:    safeJson(raw.briefingJson, null)  as Record<string, unknown> | null,
    sdrHandoffJson:  safeJson(raw.sdrHandoffJson, null) as Record<string, unknown> | null,
    attachmentsJson: safeJson(raw.attachmentsJson, []) as unknown[],
  };
}

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

export async function createClientRequest(input: CreateClientRequestInput): Promise<NormalizedClientRequest> {
  const raw = await prisma.clientRequestDb.create({
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
  return normalizeClientRequest(raw);
}

export async function getClientRequest(id: string): Promise<NormalizedClientRequest | null> {
  const raw = await prisma.clientRequestDb.findUnique({ where: { id } });
  return raw ? normalizeClientRequest(raw) : null;
}

export async function listClientRequests(options?: {
  workspaceId?: string;
  status?: ClientRequestDbStatus;
  limit?: number;
}): Promise<NormalizedClientRequest[]> {
  const rows = await prisma.clientRequestDb.findMany({
    where: {
      ...(options?.workspaceId ? { workspaceId: options.workspaceId } : {}),
      ...(options?.status      ? { status: options.status }           : {}),
    },
    orderBy: { createdAt: "desc" },
    take: options?.limit ?? 100,
  });
  return rows.map(normalizeClientRequest);
}

export async function updateClientRequest(id: string, input: UpdateClientRequestInput): Promise<NormalizedClientRequest> {
  const raw = await prisma.clientRequestDb.update({
    where: { id },
    data: {
      ...(input.status      ? { status: input.status }                                        : {}),
      ...(input.clientId    ? { clientId: input.clientId }                                    : {}),
      ...(input.workspaceId ? { workspaceId: input.workspaceId }                              : {}),
      ...(input.briefingJson   ? { briefingJson:   JSON.stringify(input.briefingJson)   }     : {}),
      ...(input.sdrHandoffJson ? { sdrHandoffJson: JSON.stringify(input.sdrHandoffJson) }     : {}),
    },
  });
  return normalizeClientRequest(raw);
}
