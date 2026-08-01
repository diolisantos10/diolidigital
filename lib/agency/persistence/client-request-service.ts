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
  | "scope_ready"
  | "needs_revision"
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

/**
 * A quem esta solicitação pertence.
 *
 * O briefing público é preenchido por quem NÃO está logado — o prospect não tem
 * como saber o workspace, e o formulário não manda. O resultado, até 01/08/2026:
 * 6 das 7 solicitações em produção nasceram órfãs, e toda rota que filtrava por
 * workspace respondia "não encontrada" para briefings que existiam e apareciam
 * na tela. O sintoma engana — parece dado inexistente, e é dado escondido.
 *
 * Com uma agência só, o servidor resolve sozinho: existe um workspace, é aquele.
 * Quando houver mais de um, a escolha passa a ser obrigatória e explícita (por
 * link, subdomínio ou token do formulário) — adivinhar entre dois seria pior que
 * o nulo, porque mandaria o cliente de um para a caixa de entrada de outro.
 */
async function resolverWorkspace(informado?: string): Promise<string | undefined> {
  if (informado) return informado;
  try {
    const todos = await prisma.agencyWorkspace.findMany({ select: { id: true }, take: 2 });
    if (todos.length === 1) return todos[0]!.id;
    if (todos.length > 1) {
      console.warn("[client-request] mais de um workspace — a solicitação nasce sem dono até o formulário dizer qual");
    }
  } catch {
    // Banco indisponível na leitura: seguir sem workspace é melhor que perder
    // o briefing do prospect. A rota de admin aceita o nulo.
  }
  return undefined;
}

export async function createClientRequest(input: CreateClientRequestInput): Promise<NormalizedClientRequest> {
  const workspaceId = await resolverWorkspace(input.workspaceId);
  const raw = await prisma.clientRequestDb.create({
    data: {
      businessName:    input.businessName,
      segment:         input.segment         ?? "",
      services:        JSON.stringify(input.services    ?? []),
      objectives:      JSON.stringify(input.objectives  ?? []),
      rawContext:      input.rawContext       ?? "",
      source:          input.source          ?? "briefing",
      workspaceId,
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
  status?: ClientRequestDbStatus | string;
  limit?: number;
}): Promise<NormalizedClientRequest[]> {
  let statusFilter: Record<string, unknown> | undefined;
  if (options?.status) {
    const statuses = options.status.includes(",")
      ? options.status.split(",").map((s) => s.trim()).filter(Boolean)
      : [options.status];
    statusFilter = statuses.length === 1
      ? { status: statuses[0] }
      : { status: { in: statuses } };
  }
  const rows = await prisma.clientRequestDb.findMany({
    where: {
      ...(options?.workspaceId ? { workspaceId: options.workspaceId } : {}),
      ...statusFilter,
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

// Hard-delete a briefing request. Cascades to BrainArtifact and
// ApprovalRequest (→ ApprovalComment) via the schema's onDelete rules.
// Used to remove test/demo briefings so the agency starts clean.
export async function deleteClientRequest(id: string): Promise<void> {
  await prisma.clientRequestDb.delete({ where: { id } });
}
