// WhatsApp message templates.
//   GET  — list templates registered under the connected WABA + which of our
//          required templates are still missing/approved.
//   POST — submit all defined templates (e.g. "proposta_pronta") to Meta for
//          approval, under the connected WhatsApp Business Account. Master only.
//
// Requires a WhatsApp connection (see app/api/meta/whatsapp) whose metaJson
// carries the wabaId.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { loadConnectionToken } from "@/lib/integrations/meta/connections";
import { ALL_TEMPLATES, createTemplate, listTemplates } from "@/lib/integrations/meta/templates";

// Find the WhatsApp connection + its WABA id + decrypted token for a workspace.
async function whatsappContext(workspaceId: string) {
  const conn = await prisma.metaConnection.findFirst({
    where: { workspaceId, platform: "whatsapp", status: "connected" },
    orderBy: { connectedAt: "desc" },
  });
  if (!conn) return null;
  const loaded = await loadConnectionToken(workspaceId, conn.id);
  if (!loaded) return null;
  const wabaId = (loaded.metaJson.wabaId as string) || "";
  if (!wabaId) return null;
  return { token: loaded.token, wabaId };
}

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await whatsappContext(session.workspaceId);
  if (!ctx) {
    return NextResponse.json({
      connected: false,
      required: ALL_TEMPLATES.map((t) => ({ name: t.name, status: "no_whatsapp_or_waba" })),
    });
  }

  let remote: Array<{ name: string; status: string; language: string }> = [];
  try { remote = await listTemplates(ctx.wabaId, ctx.token); } catch { /* ignore */ }

  const required = ALL_TEMPLATES.map((t) => {
    const found = remote.find((r) => r.name === t.name);
    return { name: t.name, status: found?.status ?? "not_created" };
  });
  return NextResponse.json({ connected: true, required, remote });
}

export async function POST(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "master") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ctx = await whatsappContext(session.workspaceId);
  if (!ctx) {
    return NextResponse.json(
      { error: "Nenhum número WhatsApp com WABA conectado. Conecte primeiro em /api/meta/whatsapp." },
      { status: 503 },
    );
  }

  const results = [];
  for (const def of ALL_TEMPLATES) {
    const r = await createTemplate(ctx.wabaId, ctx.token, def);
    results.push({ name: def.name, ...r });
  }
  return NextResponse.json({ ok: true, results });
}
