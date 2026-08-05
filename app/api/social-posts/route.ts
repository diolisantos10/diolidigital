// Social posts — the Planner's storage. GET lists posts (agency session sees
// the whole workspace; a portal token sees only its client's, read-only). POST
// creates a post (agency only).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";
import { validatePortalAccess } from "@/lib/agency/persistence/portal-access-service";
import { tokenDoPortal } from "@/lib/agency/persistence/portal-cookie";

interface DbPost {
  id: string; clientId: string | null; clientRequestId: string | null;
  caption: string; networks: string; format: string; pillar: string | null;
  mediaUrl: string | null; mediaUrlsJson: string | null; scenesJson?: string | null;
  scriptJson: string | null;
  visibility?: string;
  scheduledFor: Date | null; status: string;
  externalPostId?: string | null; permalink?: string | null;
  publishedAt?: Date | null; lastError?: string | null;
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
    const posts = await prisma.socialPost.findMany({
      where: {
        workspaceId: escopo.workspaceId,
        clientRequestId: escopo.reqId,
        visibility: "compartilhado",
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
