// WhatsApp Business number registration.
//   GET    — the connected WhatsApp number for this workspace (no token).
//   POST   — register/replace a WhatsApp number: { phoneNumberId, wabaId,
//            token, displayName? }. The token (a permanent System-User token
//            or long-lived token) is encrypted at rest. Master only.
//   DELETE — disconnect the WhatsApp number.
//
// This is the manual bridge until WhatsApp Embedded Signup discovery is wired
// into the OAuth callback. Everything else (templates, dispatch) plugs into the
// MetaConnection row this creates.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { saveConnection, deleteConnection } from "@/lib/integrations/meta/connections";
import { autorizarAtivos } from "@/lib/integrations/meta/ativos-autorizados";

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const conn = await prisma.metaConnection.findFirst({
    where: { workspaceId: session.workspaceId, platform: "whatsapp" },
    orderBy: { connectedAt: "desc" },
  });
  if (!conn) return NextResponse.json({ connected: false });

  let meta: Record<string, unknown> = {};
  try { meta = JSON.parse(conn.metaJson) as Record<string, unknown>; } catch { /* ignore */ }
  return NextResponse.json({
    connected: true,
    id: conn.id,
    name: conn.name,
    phoneNumberId: conn.externalId,
    wabaId: meta.wabaId ?? null,
    status: conn.status,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "master") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as {
    phoneNumberId?: string;
    wabaId?: string;
    token?: string;
    displayName?: string;
  };
  const phoneNumberId = (body.phoneNumberId ?? "").trim();
  const wabaId = (body.wabaId ?? "").trim();
  const token = (body.token ?? "").trim();

  if (!phoneNumberId || !token) {
    return NextResponse.json({ error: "phoneNumberId e token são obrigatórios" }, { status: 400 });
  }

  const nome = body.displayName || `WhatsApp ${phoneNumberId}`;

  // ── A ESCOLHA JÁ ACONTECEU: ELE DIGITOU O NÚMERO ──────────────────────────
  // Desde 06/08/2026 (noite) `saveConnection` exige que TODO ativo — inclusive
  // os da própria agência — esteja na lista de autorizados. Aqui não há
  // varredura: o master digitou este `phoneNumberId` à mão, um por vez. Isso é
  // uma escolha explícita, e é a metade "não atrapalhar o autorizado" da trava.
  // O registro na lista é o que mantém o número visível e revogável na tela.
  await autorizarAtivos(
    session.workspaceId, null,
    [{ tipo: "whatsapp", externalId: phoneNumberId, nome }],
    `master:${session.userId}`,
  );

  const view = await saveConnection({
    workspaceId: session.workspaceId,
    platform: "whatsapp",
    name: nome,
    externalId: phoneNumberId, // the id we POST /{id}/messages to
    accessToken: token,
    scopes: ["whatsapp_business_messaging", "whatsapp_business_management"],
    meta: { wabaId, phoneNumberId },
  });

  return NextResponse.json({ ok: true, id: view.id });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "master") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as { connectionId?: string };
  if (!body.connectionId) return NextResponse.json({ error: "connectionId obrigatório" }, { status: 400 });
  const ok = await deleteConnection(session.workspaceId, body.connectionId);
  if (!ok) return NextResponse.json({ error: "Conexão não encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
