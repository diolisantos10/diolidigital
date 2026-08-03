// Social posts — the Planner's storage. GET lists posts (agency session sees
// the whole workspace; a portal token sees only its client's, read-only). POST
// creates a post (agency only).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";
import { validatePortalAccess } from "@/lib/agency/persistence/portal-access-service";

interface DbPost {
  id: string; clientId: string | null; clientRequestId: string | null;
  caption: string; networks: string; format: string; pillar: string | null;
  mediaUrl: string | null; scriptJson: string | null; scheduledFor: Date | null; status: string;
  createdAt: Date; updatedAt: Date;
}
function toDTO(p: DbPost) {
  let networks: string[] = [];
  try { networks = JSON.parse(p.networks); } catch { /* [] */ }
  let script: unknown = null;
  if (p.scriptJson) { try { script = JSON.parse(p.scriptJson); } catch { /* null */ } }
  return {
    id: p.id, clientId: p.clientId, clientRequestId: p.clientRequestId,
    caption: p.caption, networks, format: p.format, pillar: p.pillar,
    mediaUrl: p.mediaUrl, script,
    scheduledFor: p.scheduledFor ? p.scheduledFor.toISOString() : null,
    status: p.status,
  };
}

// O que o CLIENTE recebe. Sem `script`: o roteiro é material de trabalho
// interno da IA (hook, cenas, áudio, observações do agente) e saía inteiro no
// ramo token — achado A3 da auditoria do Hub. Se um roteiro contiver instrução
// interna ou observação sobre o cliente, chegava nele. Conteúdo não curado
// não atravessa a fronteira do portal.
function toPortalDTO(p: DbPost) {
  const { script: _interno, ...dto } = toDTO(p);
  return dto;
}

async function resolveTokenRequestId(token: string): Promise<string | null | false> {
  const access = await validatePortalAccess(token);
  if (!access.valid || !access.record) return false;
  if (access.record.clientRequestId) return access.record.clientRequestId;
  if (access.record.clientId) {
    const latest = await prisma.clientRequestDb.findFirst({
      where: { clientId: access.record.clientId }, orderBy: { createdAt: "desc" }, select: { id: true },
    });
    return latest?.id ?? null;
  }
  return null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (token) {
    const reqId = await resolveTokenRequestId(token);
    if (reqId === false) return NextResponse.json({ error: "Access denied" }, { status: 403 });
    if (!reqId) return NextResponse.json({ posts: [] });
    // Filtro por contrato de visibilidade, não por convenção de rota: só o que
    // foi explicitamente compartilhado sai pelo token. "interno" NUNCA — é a
    // regra fail-closed da Fase 1 (2.2) virando código.
    const posts = await prisma.socialPost.findMany({
      where: { clientRequestId: reqId, visibility: "compartilhado" },
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

  const clientId = typeof body.clientId === "string" ? body.clientId : null;
  // Resolve the client's latest Brain request so the post shows on their portal.
  let clientRequestId = typeof body.clientRequestId === "string" ? body.clientRequestId : null;
  if (!clientRequestId && clientId) {
    const latest = await prisma.clientRequestDb.findFirst({
      where: { clientId }, orderBy: { createdAt: "desc" }, select: { id: true },
    });
    clientRequestId = latest?.id ?? null;
  }

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
        mediaUrl:        typeof body.mediaUrl === "string" ? body.mediaUrl : null,
        scriptJson:      body.script && typeof body.script === "object" ? JSON.stringify(body.script) : null,
        scheduledFor:    typeof body.scheduledFor === "string" && body.scheduledFor ? new Date(body.scheduledFor) : null,
        status:          typeof body.status === "string" ? body.status : "scheduled",
        // A intenção declarada desta rota é "o post aparece no portal do
        // cliente" (resolução do clientRequestId acima) — então o vínculo à
        // solicitação é a decisão de compartilhar. Post sem cliente é interno.
        visibility:      clientRequestId ? "compartilhado" : "interno",
      },
    });
    return NextResponse.json(toDTO(post), { status: 201 });
  } catch (e) {
    console.error("[social-posts] POST error", e);
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}
