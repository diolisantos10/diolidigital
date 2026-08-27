import { prisma } from "@/lib/db/client";
import { apenasDoWorkspace, workspaceUnico } from "@/lib/auth/posse-de-workspace";
import { chaveDaSolicitacao } from "@/lib/agency/comercial/chave-do-prospect";

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
  /**
   * O FIO DA CONVERSA DE ORIGEM — só quando o pedido nasceu de uma conversa
   * parada que a casa recuperou sozinha. Ver a coluna homônima no schema.
   *
   * ⚠️ NUNCA vem do corpo de rota pública: quem preenche é
   * `promover-conversas-paradas.ts`, e o valor é o fio já higienizado pelo
   * servidor. É ele que carrega o índice único que impede duas batidas do
   * relógio de gerarem dois pedidos — a trava é do banco, não deste arquivo.
   */
  fioDaConversa?: string;
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

  // ── A CHAVE DO PROSPECT (16/08/2026) ───────────────────────────────────────
  //
  // Pergunta do CEO: *"se entrar um cliente com o mesmo e-mail e fizer cinco
  // briefings um atrás do outro, o que acontece com o sistema?"*
  //
  // Acontecia que este `create` puro produzia cinco linhas **anônimas**: o
  // contato mora dentro de `briefingJson`, e não dá para indexar nem agrupar por
  // dentro de um JSON no SQLite. A caixa de entrada não tinha como dizer "esta é
  // a 3ª vez que esta pessoa escreve".
  //
  // ⚠️ Continua sendo `create`, NUNCA `upsert`. Um `upsert` por contato
  // sobrescreveria o briefing anterior — e **perder o que o cliente escreveu é
  // pior que ter duplicata**. Cada briefing continua sendo sua própria linha,
  // inteira; o que muda é que agora ela carrega de quem é.
  const chaveDoProspect = chaveDaSolicitacao({
    briefingJson:   input.briefingJson,
    sdrHandoffJson: input.sdrHandoffJson,
  });

  const raw = await prisma.clientRequestDb.create({
    data: {
      chaveDoProspect,
      // Ausente vira `undefined` (coluna nula), NUNCA string vazia: duas linhas
      // com "" colidiriam no índice único e o segundo pedido legítimo da porta
      // da frente seria recusado por uma trava que não é dele.
      fioDaConversa:   input.fioDaConversa?.trim() || undefined,
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

// ── QUANTOS IRMÃOS EXISTEM DE VERDADE (16/08/2026) ─────────────────────────
//
// `listClientRequests` lê no máximo `limit` linhas (hoje, 200 em
// `app/api/agency/leads/route.ts`), e `agruparPorProspect` agrupa repetição
// só sobre essa janela. Um contato que já escreveu 6 vezes, cuja 6ª linha
// caiu fora das 200 mais recentes, aparecia como "5ª vez" — número completo
// com cara de errado.
//
// O caminho barato: `chaveDoProspect` já é coluna gravada (ver
// `createClientRequest` acima) e o índice `@@index([workspaceId,
// chaveDoProspect])` já existe no schema — não é varredura, é consulta sobre
// índice. **Não** se aumenta o teto de `limit`: já é lição registrada da
// casa (varredura de fichas legadas, teto de 1000) que aumentar só empurra o
// problema adiante — a 201ª vira a 1001ª, e o defeito volta calado.
//
// Somente leitura. Não funde, não decide, não escreve nada — só conta.
export async function contarIrmaosPorChave(params: {
  /** Mesmo critério de `listClientRequests`/`apenasDoWorkspace` ("meu OU
   *  órfão"). NÃO se inventa uma segunda política de visibilidade aqui —
   *  duas verdades sobre quem vê o quê é o defeito nº 2 do incidente do
   *  Drive. `undefined` = sem filtro de workspace (mesmo comportamento de
   *  `listClientRequests` sem `workspaceId`). */
  workspaceId?: string;
  /** As chaves candidatas, tipicamente as `chaveDoProspect` já presentes na
   *  janela que a rota buscou. Nulas, indefinidas e vazias são descartadas
   *  ANTES da consulta — chave nula não consulta nada e não agrupa com
   *  ninguém (a lei de `chave-do-prospect.ts`). */
  chaves: Array<string | null | undefined>;
}): Promise<Map<string, number>> {
  const distintas = [
    ...new Set(
      params.chaves
        .map((c) => (typeof c === "string" ? c.trim() : ""))
        .filter((c) => c.length > 0),
    ),
  ];
  // Nenhuma chave válida: nem vale a pena ir ao banco.
  if (distintas.length === 0) return new Map();

  const linhas = await prisma.clientRequestDb.findMany({
    where: {
      chaveDoProspect: { in: distintas },
      // ⚠️ NÃO filtra por status. A pergunta é "quantas vezes esta pessoa
      // escreveu", e um briefing que já virou projeto continua sendo uma vez
      // que ela escreveu — escolha declarada, não esquecimento.
      ...(params.workspaceId
        ? { OR: [{ workspaceId: params.workspaceId }, { workspaceId: null }] }
        : {}),
    },
    select: { chaveDoProspect: true, workspaceId: true, clientId: true },
  });

  // A MESMA política de "meu OU órfão" de `listClientRequests` —
  // reaproveitada, não reinventada.
  const visiveis = params.workspaceId
    ? await apenasDoWorkspace(linhas, params.workspaceId)
    : linhas;

  const contagem = new Map<string, number>();
  for (const linha of visiveis) {
    if (!linha.chaveDoProspect) continue; // defesa: o `where` já garante isto
    contagem.set(linha.chaveDoProspect, (contagem.get(linha.chaveDoProspect) ?? 0) + 1);
  }
  return contagem;
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
