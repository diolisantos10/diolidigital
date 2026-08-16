import { prisma } from "@/lib/db/client";
import { apenasDoWorkspace, workspaceUnico } from "@/lib/auth/posse-de-workspace";

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
  /**
   * Chegou com contato e está na fila para virar proposta. É o estado normal.
   */
  | "new"
  /**
   * Chegou SEM forma de falar com a pessoa (08/08/2026).
   *
   * Não é lixo e não some: a conversa inteira fica gravada, o lead aparece na
   * fila com o motivo, e o raio-x cobra. O que ele **não** faz é virar proposta
   * — `runAutoScope` não roda, porque proposta que ninguém pode receber é
   * fatura de IA sem destinatário.
   */
  | "lead_incompleto"
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
  /**
   * ⚠️ CONTROLADO PELO SERVIDOR, nunca pelo corpo da requisição.
   *
   * Só existem dois valores possíveis na criação e quem escolhe é o gate de
   * contato da rota (`new` com canal, `lead_incompleto` sem). Qualquer outro
   * valor é ignorado — a rota `POST /api/brain/client-requests` é **pública**, e
   * aceitar `status` do corpo deixaria qualquer pessoa plantar uma solicitação
   * já em `completed` para sair da fila e fugir do raio-x.
   */
  status?: "new" | "lead_incompleto";
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
export async function resolverWorkspacePublico(informado?: string): Promise<string | undefined> {
  if (informado) return informado;
  // Banco indisponível devolve `{id:null, ambiguo:false}` — seguir sem workspace
  // é melhor que perder o briefing do prospect. A rota de admin aceita o nulo.
  const unico = await workspaceUnico();
  if (unico.id) return unico.id;
  if (unico.ambiguo) {
    console.warn("[client-request] mais de um workspace — a solicitação nasce sem dono até o formulário dizer qual");
  }
  return undefined;
}

export async function createClientRequest(input: CreateClientRequestInput): Promise<NormalizedClientRequest> {
  const workspaceId = await resolverWorkspacePublico(input.workspaceId);
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
      // Lista fechada, não passagem livre: ver o comentário do campo.
      status: input.status === "lead_incompleto" ? "lead_incompleto" : "new",
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
  // O `workspaceId` entra na consulta como "meu OU órfão", e a órfã é decidida
  // depois por `apenasDoWorkspace` (a política única). Filtrar só por
  // `workspaceId` esconderia 6 das 7 solicitações reais; não filtrar nada
  // listava a agência inteira do vizinho.
  const rows = await prisma.clientRequestDb.findMany({
    where: {
      ...(options?.workspaceId
        ? { OR: [{ workspaceId: options.workspaceId }, { workspaceId: null }] }
        : {}),
      ...statusFilter,
    },
    orderBy: { createdAt: "desc" },
    take: options?.limit ?? 100,
  });
  const visiveis = options?.workspaceId
    ? await apenasDoWorkspace(rows, options.workspaceId)
    : rows;
  return visiveis.map(normalizeClientRequest);
}

export async function updateClientRequest(id: string, input: UpdateClientRequestInput): Promise<NormalizedClientRequest> {
  // ── 🔴 O SEGUNDO RE-APONTADOR (15/08/2026, rodada 3) ──────────────────────
  //
  // `PATCH /api/brain/client-requests?id=X` com `{"clientId":"B"}` re-apontava
  // A→B **incondicionalmente**, guardado só por `requireSession()` — sem lista
  // de papéis. O `seguranca` provou: `PROBE-REAPONTADOR 200 era alfa… agora:
  // beta`. Eu fechei o balcão na rodada 2 e deixei este de pé.
  //
  // Mover a solicitação de um cliente para outro é o gesto que produziu o
  // incidente inteiro: leva conversa, projeto, aprovações e portal junto. Se
  // for para acontecer, é decisão de gente com nome — não efeito colateral de
  // um PATCH genérico.
  //
  // A regra: **carimbar dono NULO pode; TROCAR dono não.** A guarda é o
  // `updateMany` com `clientId: null` no WHERE (o banco decide, não o código —
  // decidir no código perde a corrida entre duas chamadas simultâneas).
  if (input.clientId) {
    const atual = await prisma.clientRequestDb.findUnique({
      where: { id }, select: { clientId: true },
    });
    if (atual?.clientId && atual.clientId !== input.clientId) {
      throw new Error(
        "Esta solicitação já tem cliente. Trocar o dono de uma solicitação move conversa, "
        + "projeto e portal junto — não é edição, é fusão de fichas, e precisa de decisão humana.",
      );
    }
    if (!atual?.clientId) {
      await prisma.clientRequestDb.updateMany({
        where: { id, clientId: null }, data: { clientId: input.clientId },
      });
    }
  }
  const raw = await prisma.clientRequestDb.update({
    where: { id },
    data: {
      ...(input.status      ? { status: input.status }                                        : {}),
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
