// Edit / delete a single planned post (agency only).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";

type Params = { id: string };

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
  if (Array.isArray(body.networks)) data.networks = JSON.stringify((body.networks as unknown[]).filter((x) => typeof x === "string"));
  if (typeof body.format === "string") data.format = body.format;
  if (typeof body.pillar === "string" || body.pillar === null) data.pillar = body.pillar;
  if (typeof body.mediaUrl === "string" || body.mediaUrl === null) data.mediaUrl = body.mediaUrl;
  // As telas do carrossel: aceita SOMENTE array de strings e normaliza para
  // JSON — necessário para backfill e ajustes pela API. Qualquer outro tipo é
  // ignorado (não zera o que existe por engano); array vazio limpa de propósito.
  if (Array.isArray(body.mediaUrlsJson)) {
    data.mediaUrlsJson = JSON.stringify(
      (body.mediaUrlsJson as unknown[]).filter((x): x is string => typeof x === "string" && !!x.trim()),
    );
  }
  if (body.script === null) data.scriptJson = null;
  else if (body.script && typeof body.script === "object") data.scriptJson = JSON.stringify(body.script);
  if (typeof body.status === "string") data.status = body.status;
  // A equipe decide o que o cliente vê. Só os dois valores do contrato de
  // visibilidade — qualquer outro cai fora (fail-closed).
  if (body.visibility === "compartilhado" || body.visibility === "interno") data.visibility = body.visibility;
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
