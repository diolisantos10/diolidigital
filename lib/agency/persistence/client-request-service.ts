import { prisma } from "@/lib/db/client";
import { apenasDoWorkspace, workspaceUnico } from "@/lib/auth/posse-de-workspace";
import { colunasDeContato } from "@/lib/agency/comercial/contato-do-lead";

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

/**
 * As colunas `contato*` são PROJEÇÃO, não entrada (16/08/2026).
 *
 * Elas nunca vêm do chamador. São derivadas aqui, no ato da gravação, a partir
 * de `lerContato` — o leitor único. Aceitá-las do corpo abriria a porta para uma
 * rota gravar um e-mail na coluna que não está no briefing, e a partir daí a
 * consulta do banco e a tela do operador falariam de conjuntos diferentes.
 *
 * O ponto seguinte é igualmente importante: **toda vez que o `briefingJson`
 * muda, a projeção é refeita.** Coluna que não acompanha a origem vira cache
 * velho com cara de fato — e cache velho de contato manda a proposta para o
 * endereço que a pessoa acabou de corrigir.
 */
function projecaoDeContato(input: { briefingJson?: object; sdrHandoffJson?: object }) {
  return colunasDeContato({
    briefingJson: input.briefingJson,
    sdrHandoffJson: input.sdrHandoffJson,
  });
}

export async function createClientRequest(input: CreateClientRequestInput): Promise<NormalizedClientRequest> {
  const workspaceId = await resolverWorkspacePublico(input.workspaceId);
  const contato = projecaoDeContato(input);
  const raw = await prisma.clientRequestDb.create({
    data: {
      ...contato,
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

/**
 * O FILTRO QUE A COLUNA DESTRAVOU (16/08/2026) — no banco, não em memória.
 *
 * `true`  → só o que tem canal declarado. É a fila que o aviso do orçamento pode
 *           efetivamente responder.
 * `false` → só o que NÃO tem. É a outra fila, e a ação dela é oposta: não é
 *           "alguém responde", é "não há para onde responder". Somar as duas num
 *           número só produz um alarme que ninguém sabe atender.
 *
 * Sem a coluna isto exigia carregar a fila inteira e desserializar um blob de
 * texto por registro — que é por que ninguém fazia.
 */
function filtroDeContato(comContato: boolean): Record<string, unknown> {
  return comContato
    ? { OR: [{ contatoEmail: { not: null } }, { contatoWhatsapp: { not: null } }] }
    : { contatoEmail: null, contatoWhatsapp: null };
}

export async function listClientRequests(options?: {
  workspaceId?: string;
  status?: ClientRequestDbStatus | string;
  limit?: number;
  /**
   * ⚠️ Só encontra o que está NA COLUNA. Registro antigo, cujo contato só existe
   * dentro do `briefingJson`, não foi reescrito por esta frente e por isso não
   * responde a este filtro — `lerContato` continua achando o contato dele na
   * tela, e o backfill da migration subiu o que era seguro subir. Quem precisar
   * da fila COMPLETA não passa este parâmetro e filtra pelo leitor único.
   */
  comContato?: boolean;
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
  //
  // As condições entram numa lista `AND`, não soltas no objeto: o recorte de
  // workspace já usa um `OR`, e o filtro de contato usa outro. Dois `OR` como
  // chaves do mesmo objeto — um sobrescreve o outro EM SILÊNCIO, e o que some é
  // sempre o recorte de posse.
  const condicoes: Record<string, unknown>[] = [];
  if (options?.workspaceId) {
    condicoes.push({ OR: [{ workspaceId: options.workspaceId }, { workspaceId: null }] });
  }
  if (statusFilter) condicoes.push(statusFilter);
  if (options?.comContato !== undefined) condicoes.push(filtroDeContato(options.comContato));

  const rows = await prisma.clientRequestDb.findMany({
    where: condicoes.length > 0 ? { AND: condicoes } : {},
    orderBy: { createdAt: "desc" },
    take: options?.limit ?? 100,
  });
  const visiveis = options?.workspaceId
    ? await apenasDoWorkspace(rows, options.workspaceId)
    : rows;
  return visiveis.map(normalizeClientRequest);
}

export async function updateClientRequest(id: string, input: UpdateClientRequestInput): Promise<NormalizedClientRequest> {
  // A origem mudou → a projeção é refeita no MESMO update. Sem isto, corrigir o
  // e-mail no briefing deixaria a coluna com o endereço antigo, e a consulta do
  // banco continuaria apontando para onde a pessoa já não está.
  //
  // ⚠️ A projeção lê o registro INTEIRO, não só o campo que veio no PATCH. Um
  // update que traz apenas `briefingJson` não pode apagar um contato que mora no
  // `sdrHandoffJson` — reprojetar sobre metade do fato é como perder o dado por
  // ter tocado no arquivo ao lado.
  const reprojetar = input.briefingJson != null || input.sdrHandoffJson != null;
  const atual = reprojetar
    ? await prisma.clientRequestDb.findUnique({
        where: { id },
        select: { briefingJson: true, sdrHandoffJson: true },
      })
    : null;
  const origem = {
    briefingJson:   (input.briefingJson   ?? atual?.briefingJson   ?? undefined) as object | undefined,
    sdrHandoffJson: (input.sdrHandoffJson ?? atual?.sdrHandoffJson ?? undefined) as object | undefined,
  };
  const raw = await prisma.clientRequestDb.update({
    where: { id },
    data: {
      ...(input.status      ? { status: input.status }                                        : {}),
      ...(input.clientId    ? { clientId: input.clientId }                                    : {}),
      ...(input.workspaceId ? { workspaceId: input.workspaceId }                              : {}),
      ...(input.briefingJson   ? { briefingJson:   JSON.stringify(input.briefingJson)   }     : {}),
      ...(input.sdrHandoffJson ? { sdrHandoffJson: JSON.stringify(input.sdrHandoffJson) }     : {}),
      ...(reprojetar ? projecaoDeContato(origem) : {}),
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
