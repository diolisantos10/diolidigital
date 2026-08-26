// Social posts — the Planner's storage. GET lists posts (agency session sees
// the whole workspace; a portal token sees only its client's, read-only). POST
// creates a post (agency only).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { PECA_VISIVEL_AO_CLIENTE } from "@/lib/agency/portal/peca-visivel-ao-cliente";
import { requireSession } from "@/lib/auth/api-guard";
import { validatePortalAccess } from "@/lib/agency/persistence/portal-access-service";
import { tokenDoPortal } from "@/lib/agency/persistence/portal-cookie";

interface DbPost {
  /** Quem gerou a peça. Ver o comentário em `toDTO`. */
  deliverableId?: string | null;
  id: string; clientId: string | null; clientRequestId: string | null;
  caption: string; networks: string; format: string; pillar: string | null;
  mediaUrl: string | null; mediaUrlsJson: string | null; scenesJson?: string | null;
  scriptJson: string | null;
  visibility?: string;
  scheduledFor: Date | null; status: string;
  externalPostId?: string | null; permalink?: string | null;
  publishedAt?: Date | null; publishedBy?: string | null; lastError?: string | null;
  createdAt: Date; updatedAt: Date;
}

/** Os estados do contrato (schema: draft|scheduled|approved|published|failed).
 *  Fora dessa lista o post ficaria num estado que nenhuma tela sabe desenhar. */
const STATUS_VALIDOS = new Set(["draft", "scheduled", "approved", "published", "failed"]);

/** Parse defensivo de uma lista JSON de strings — JSON quebrado vira []. */
function lerLista(bruto: string | null | undefined): string[] {
  try {
    const v = JSON.parse(bruto ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function toDTO(p: DbPost) {
  let networks: string[] = [];
  try { networks = JSON.parse(p.networks); } catch { /* [] */ }
  let script: unknown = null;
  if (p.scriptJson) { try { script = JSON.parse(p.scriptJson); } catch { /* null */ } }
  return {
    id: p.id, clientId: p.clientId, clientRequestId: p.clientRequestId,
    // ── QUEM GEROU A PEÇA, VISÍVEL PARA QUEM MEDE (6ª rodada) ──────────────
    //
    // `SocialPost.deliverableId` é a chave que liga a peça à entrega que a
    // fez — e é ela que a mira do ajuste passou a usar para saber QUAL entrega
    // refazer (`esteira/refacao.ts`). O DTO da agência não a devolvia, e a
    // consequência foi imediata: durante a jornada de cliente oculto eu li
    // "dlv = nulo" em três peças e quase registrei como causa-raiz que a FK
    // nunca era escrita. Não era nulo — era invisível.
    //
    // Ausência de informação não é informação, e a régua vale para quem audita
    // também. Campo que decide comportamento e não aparece em lugar nenhum é
    // campo que vai ser diagnosticado errado.
    //
    // ⛔ Fica FORA de `toPortalDTO`: é id interno, e o cliente não vê id.
    deliverableId: p.deliverableId ?? null,
    caption: p.caption, networks, format: p.format, pillar: p.pillar,
    mediaUrl: p.mediaUrl,
    // As telas do carrossel (mediaUrlsJson). O cliente aprova a IMAGEM, não a
    // descrição dela — sem este campo o portal só tinha a miniatura da capa.
    // NÃO confundir com scenesJson (descrições internas): estas são as URLs
    // das artes prontas, material que o cliente pode ver.
    telas: lerLista(p.mediaUrlsJson),
    // As descrições das telas (scenesJson) são material INTERNO — o que o
    // especialista escreveu para o gerador de arte desenhar cada tela. A
    // equipe precisa editá-las no Planner; o cliente nunca as vê (toPortalDTO).
    cenas: lerLista(p.scenesJson),
    script,
    scheduledFor: p.scheduledFor ? p.scheduledFor.toISOString() : null,
    status: p.status,
    // Sem estes quatro campos a tela da agência não conseguia dizer se um post
    // foi mesmo publicado (ou por que falhou) — "Publicado" era um estado que
    // alguém marcava à mão e ninguém conseguia conferir.
    visibility: p.visibility ?? "interno",
    externalPostId: p.externalPostId ?? null,
    permalink: p.permalink ?? null,
    publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
    // QUEM registrou a publicação (`esteira` = o relógio · `equipe:<email>` =
    // alguém da casa postou à mão). Fica na vista da AGÊNCIA e fora do portal:
    // é registro de operação nossa, não informação do cliente.
    publishedBy: p.publishedBy ?? null,
    lastError: p.lastError ?? null,
  };
}

// O que o CLIENTE recebe — lista EXPLÍCITA (fail-closed): campo novo no modelo
// não atravessa a fronteira só porque foi criado. Fora de propósito:
//   • `script` — roteiro interno da IA (achado A3 da auditoria do Hub): hook,
//     cenas, áudio e observações do agente sobre o cliente saíam inteiros;
//   • `cenas` — as descrições internas das telas do carrossel;
//   • `lastError` / `externalPostId` — diagnóstico de operação nossa.
function toPortalDTO(p: DbPost) {
  const dto = toDTO(p);
  return {
    id: dto.id, clientId: dto.clientId, clientRequestId: dto.clientRequestId,
    caption: dto.caption, networks: dto.networks, format: dto.format, pillar: dto.pillar,
    mediaUrl: dto.mediaUrl, telas: dto.telas,
    scheduledFor: dto.scheduledFor, status: dto.status,
    permalink: dto.permalink, publishedAt: dto.publishedAt,
  };
}

/** O dono da leitura pelo token: a solicitação E o workspace dela.
 *  O `workspaceId` viaja junto porque `clientRequestId` sozinho é um id global —
 *  filtrar só por ele é confiar que nenhum id de outro inquilino jamais encosta
 *  aqui. O filtro do portal leva os dois. `false` = token inválido. */
async function resolveTokenScope(
  token: string,
): Promise<{ reqId: string | null; workspaceId: string | null } | false> {
  const access = await validatePortalAccess(token);
  if (!access.valid || !access.record) return false;
  if (access.record.clientRequestId) {
    const req = await prisma.clientRequestDb.findUnique({
      where: { id: access.record.clientRequestId }, select: { id: true, workspaceId: true },
    });
    return { reqId: req?.id ?? null, workspaceId: req?.workspaceId ?? null };
  }
  if (access.record.clientId) {
    const cliente = await prisma.client.findUnique({
      where: { id: access.record.clientId }, select: { workspaceId: true },
    });
    const latest = await prisma.clientRequestDb.findFirst({
      where: { clientId: access.record.clientId }, orderBy: { createdAt: "desc" },
      select: { id: true, workspaceId: true },
    });
    return { reqId: latest?.id ?? null, workspaceId: cliente?.workspaceId ?? latest?.workspaceId ?? null };
  }
  return { reqId: null, workspaceId: null };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  // A4: query (compatibilidade) ou cookie httpOnly da sessão de portal.
  const token = tokenDoPortal(request, searchParams.get("token"));

  if (token) {
    const escopo = await resolveTokenScope(token);
    if (escopo === false) return NextResponse.json({ error: "Access denied" }, { status: 403 });
    // Sem solicitação OU sem workspace resolvido, não há o que mostrar. Devolver
    // lista vazia é melhor que devolver uma consulta larga: fail-closed.
    if (!escopo.reqId || !escopo.workspaceId) return NextResponse.json({ posts: [] });
    // Filtro por contrato de visibilidade, não por convenção de rota: só o que
    // foi explicitamente compartilhado sai pelo token. "interno" NUNCA — é a
    // regra fail-closed da Fase 1 (2.2) virando código. E sempre dentro do
    // workspace do token: o inquilino é parte do filtro, não uma suposição.
    // ── O CARIMBO NÃO BASTA: TEM DE HAVER PEÇA (26/08/2026) ────────────────
    //
    // `visibility: "compartilhado"` é carimbado no NASCIMENTO do post, em cinco
    // lugares da esteira — antes de a arte existir. É o desenho certo (a
    // escada de exposição decide o QUE o cliente pode ver, não o QUANDO), e ele
    // deixa um vão medido em produção em 26/08/2026: **três posts em `draft`,
    // carimbados `compartilhado`, com `mediaUrl: null`** porque o portão do
    // fundo reprovou a arte três vezes. O cliente abria o portal e via cartão
    // de peça sem peça — e nada na tela dizia que aquilo era produção em curso.
    //
    // Peça sem arquivo não é entrega; é trabalho em andamento. Ela volta a
    // aparecer sozinha na rodada em que a arte sair — e a arte só sai depois de
    // `regua-da-peca-final.ts`, que é a outra metade deste conserto.
    //
    // Fail-closed de propósito: o filtro é positivo (`not: null`), então um
    // estado novo de mídia não passa a vazar por omissão.
    const posts = await prisma.socialPost.findMany({
      where: {
        workspaceId: escopo.workspaceId,
        clientRequestId: escopo.reqId,
        ...PECA_VISIVEL_AO_CLIENTE,
      },
      orderBy: { scheduledFor: "asc" },
    });
    return NextResponse.json({ posts: posts.map(toPortalDTO) });
  }

  const { session, error } = await requireSession();
  if (error) return error;
  const clientId = searchParams.get("clientId") ?? undefined;
  try {
    const posts = await prisma.socialPost.findMany({
      where: { workspaceId: session.workspaceId, ...(clientId ? { clientId } : {}) },
      orderBy: { scheduledFor: "asc" },
    });
    return NextResponse.json({ posts: posts.map(toDTO) });
  } catch {
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession(["master", "project_manager", "social_staff"]);
  if (error) return error;

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const networks = Array.isArray(body.networks)
    ? (body.networks as unknown[]).filter((x): x is string => typeof x === "string") : [];

  const clientId = typeof body.clientId === "string" && body.clientId ? body.clientId : null;
  // ⚠️ O `clientId` vem do CORPO: confira contra o workspace da sessão antes de
  // gravar. Sem isso, staff do workspace A cria uma peça apontando para cliente
  // do workspace B — e ela nasce "compartilhado" no portal do cliente do B.
  if (clientId) {
    const cliente = await prisma.client.findFirst({
      where: { id: clientId, workspaceId: session.workspaceId }, select: { id: true },
    });
    if (!cliente) return NextResponse.json({ error: "Cliente inválido" }, { status: 400 });
  }
  // Resolve the client's latest Brain request so the post shows on their portal.
  // O `clientRequestId` do corpo também é do inquilino, ou não vale.
  let clientRequestId = typeof body.clientRequestId === "string" && body.clientRequestId
    ? body.clientRequestId : null;
  if (clientRequestId) {
    const pedido = await prisma.clientRequestDb.findFirst({
      where: { id: clientRequestId, workspaceId: session.workspaceId }, select: { id: true },
    });
    if (!pedido) return NextResponse.json({ error: "Solicitação inválida" }, { status: 400 });
  }
  if (!clientRequestId && clientId) {
    const latest = await prisma.clientRequestDb.findFirst({
      where: { clientId, workspaceId: session.workspaceId },
      orderBy: { createdAt: "desc" }, select: { id: true },
    });
    clientRequestId = latest?.id ?? null;
  }

  // ── Visibilidade: DECISÃO DECLARADA, não efeito colateral ────────────────
  // O que existia aqui era `clientRequestId ? "compartilhado" : "interno"`. Para
  // cliente DIRETO (criado sem briefing, como a Foocci) não existe solicitação
  // Brain — logo todo post programado pelo Planner nascia "interno" e o cliente
  // pagante abria o portal e não via NADA. Falha silenciosa: ninguém erra, a
  // agência programa o mês e o trabalho some.
  // Agora quem decide é a tela (campo "Quem vê"), com dois travas:
  //   • sem cliente não existe quem veja → "interno", mesmo se pedirem outro;
  //   • sem pedido explícito, mantém a regra antiga (compatibilidade da esteira).
  const pedido = body.visibility === "compartilhado" || body.visibility === "interno"
    ? body.visibility
    : null;
  const temDono = !!clientId || !!clientRequestId;
  const visibility =
    pedido === "compartilhado" ? (temDono ? "compartilhado" : "interno")
    : pedido === "interno"      ? "interno"
    : clientRequestId           ? "compartilhado"
    : "interno";

  // Telas do carrossel: `telas` (artes prontas) e `cenas` (descrição interna de
  // cada tela). Aceita só array de string — qualquer outro tipo vira lista vazia.
  const listaDeTexto = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : [];
  const telas = listaDeTexto(body.telas ?? body.mediaUrlsJson);
  const cenas = listaDeTexto(body.cenas ?? body.scenesJson);

  // ── INVARIANTE "A CAPA É A TELA 1" — no DADO, na criação também ────────────
  // `publicacao.ts:232` publica a partir de `mediaUrlsJson`; o card do portal
  // mostra `mediaUrl`. Se nascerem discordantes, o cliente aprova uma imagem e
  // sai outra. Havendo telas, a capa é a primeira delas — o que o corpo mandar
  // em `mediaUrl` não decide isso.
  const capaDoCorpo = typeof body.mediaUrl === "string" ? body.mediaUrl : null;
  const mediaUrl = telas.length > 0 ? telas[0] : capaDoCorpo;

  try {
    const post = await prisma.socialPost.create({
      data: {
        workspaceId:     session.workspaceId,
        clientId,
        clientRequestId,
        // ── A TERCEIRA PORTA TAMBÉM CARREGA A CHAVE (6ª rodada) ────────────
        //
        // `publicacao.ts` e `story-instagram-v1.ts` gravam `deliverableId` ao
        // criar a peça; esta rota — a terceira porta, por onde a equipe cria à
        // mão — não gravava. "Guarda que existe em um caminho e não no outro é
        // guarda que não existe": a peça nascida por aqui chegaria ao ajuste
        // sem dizer de qual entrega veio, e a mira cairia no fallback que esta
        // rodada acabou de consertar.
        deliverableId:   typeof body.deliverableId === "string" && body.deliverableId.trim()
          ? body.deliverableId.trim() : null,
        caption:         typeof body.caption === "string" ? body.caption : "",
        networks:        JSON.stringify(networks),
        format:          typeof body.format === "string" ? body.format : "feed",
        pillar:          typeof body.pillar === "string" ? body.pillar : null,
        mediaUrl,
        mediaUrlsJson:   JSON.stringify(telas),
        scenesJson:      JSON.stringify(cenas),
        scriptJson:      body.script && typeof body.script === "object" ? JSON.stringify(body.script) : null,
        scheduledFor:    typeof body.scheduledFor === "string" && body.scheduledFor ? new Date(body.scheduledFor) : null,
        status:          STATUS_VALIDOS.has(String(body.status)) ? String(body.status) : "scheduled",
        visibility,
      },
    });
    return NextResponse.json(toDTO(post), { status: 201 });
  } catch (e) {
    console.error("[social-posts] POST error", e);
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}
