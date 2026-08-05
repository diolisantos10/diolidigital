// Edit / delete a single planned post (agency only).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";

type Params = { id: string };

/** Os estados do contrato (schema: draft|scheduled|approved|published|failed). */
const STATUS_VALIDOS = new Set(["draft", "scheduled", "approved", "published", "failed"]);

export async function PATCH(request: NextRequest, ctx: { params: Promise<Params> }): Promise<NextResponse> {
  const { session, error } = await requireSession(["master", "project_manager", "social_staff"]);
  if (error) return error;
  const { id } = await ctx.params;

  const existing = await prisma.socialPost.findFirst({ where: { id, workspaceId: session.workspaceId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const data: Record<string, unknown> = {};
  if (typeof body.caption === "string") data.caption = body.caption;
  // O CLIENTE do post era ignorado no PATCH: a equipe trocava o cliente no
  // editor, salvava, e nada acontecia — em silêncio. Trocar o cliente reabre a
  // solicitação vinculada (é ela que liga o post à conversa do portal).
  if (typeof body.clientId === "string" || body.clientId === null) {
    const novoClientId = body.clientId || null;
    data.clientId = novoClientId;
    if (novoClientId !== existing.clientId) {
      const latest = novoClientId
        ? await prisma.clientRequestDb.findFirst({
            where: { clientId: novoClientId }, orderBy: { createdAt: "desc" }, select: { id: true },
          })
        : null;
      data.clientRequestId = latest?.id ?? null;
    }
  }
  if (Array.isArray(body.networks)) data.networks = JSON.stringify((body.networks as unknown[]).filter((x) => typeof x === "string"));
  if (typeof body.format === "string") data.format = body.format;
  if (typeof body.pillar === "string" || body.pillar === null) data.pillar = body.pillar;
  if (typeof body.mediaUrl === "string" || body.mediaUrl === null) data.mediaUrl = body.mediaUrl;
  // As telas do carrossel: aceita SOMENTE array de strings e normaliza para
  // JSON — necessário para backfill e ajustes pela API. Qualquer outro tipo é
  // ignorado (não zera o que existe por engano); array vazio limpa de propósito.
  const listaDeTexto = (v: unknown): string[] =>
    (v as unknown[]).filter((x): x is string => typeof x === "string" && !!x.trim());
  const telas = body.telas ?? body.mediaUrlsJson;
  if (Array.isArray(telas)) data.mediaUrlsJson = JSON.stringify(listaDeTexto(telas));
  // As descrições internas das telas — o que o gerador de arte usa para desenhar
  // CADA tela. Sem isto no PATCH, carrossel só entrava pela esteira.
  const cenas = body.cenas ?? body.scenesJson;
  if (Array.isArray(cenas)) data.scenesJson = JSON.stringify(listaDeTexto(cenas));
  if (body.script === null) data.scriptJson = null;
  else if (body.script && typeof body.script === "object") data.scriptJson = JSON.stringify(body.script);
  if (typeof body.status === "string") {
    if (!STATUS_VALIDOS.has(body.status)) {
      return NextResponse.json({ error: `Status inválido: ${body.status}` }, { status: 400 });
    }
    data.status = body.status;
  }
  // A equipe decide o que o cliente vê. Só os dois valores do contrato de
  // visibilidade — qualquer outro cai fora (fail-closed).
  if (body.visibility === "compartilhado" || body.visibility === "interno") {
    // "Compartilhado" sem dono é promessa que ninguém recebe: nenhuma rota de
    // portal consegue alcançar um post sem cliente nem solicitação. Dizer isso
    // é melhor que gravar um estado que a tela mostra como "o cliente vê".
    const clientIdFinal = "clientId" in data ? (data.clientId as string | null) : existing.clientId;
    const requestIdFinal = "clientRequestId" in data
      ? (data.clientRequestId as string | null)
      : existing.clientRequestId;
    if (body.visibility === "compartilhado" && !clientIdFinal && !requestIdFinal) {
      return NextResponse.json(
        { error: "Escolha um cliente antes de compartilhar — sem cliente não existe portal onde este post apareça." },
        { status: 400 },
      );
    }
    data.visibility = body.visibility;
  }
  if (body.scheduledFor === null) data.scheduledFor = null;
  else if (typeof body.scheduledFor === "string" && body.scheduledFor) data.scheduledFor = new Date(body.scheduledFor);

  try {
    const post = await prisma.socialPost.update({ where: { id }, data });
    return NextResponse.json({ ok: true, id: post.id });
  } catch (e) {
    console.error("[social-posts] PATCH error", e);
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<Params> }): Promise<NextResponse> {
  const { session, error } = await requireSession(["master", "project_manager", "social_staff"]);
  if (error) return error;
  const { id } = await ctx.params;
  const existing = await prisma.socialPost.findFirst({ where: { id, workspaceId: session.workspaceId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await prisma.socialPost.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}
