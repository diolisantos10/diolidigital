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
  if (typeof body.status === "string") data.status = body.status;
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
