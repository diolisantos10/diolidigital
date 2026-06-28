// Client ↔ team chat for the portal.
//   - Clients authenticate with a portal token (?token=) — authorRole "client".
//   - Team authenticates with a session (?clientRequestId=) — authorRole "team".
// One thread per Brain request (clientRequestId). GET also marks the *other*
// side's messages as read so unread badges clear on view.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { validatePortalAccess } from "@/lib/agency/persistence/portal-access-service";
import { requireSession } from "@/lib/auth/api-guard";

// Resolve which request thread a portal token points at. Mirrors portal-data:
// a token may be issued for a specific request, or for a client (→ latest request).
async function resolveTokenRequestId(token: string): Promise<
  { ok: true; clientRequestId: string | null } | { ok: false; status: number; reason?: string }
> {
  const access = await validatePortalAccess(token);
  if (!access.valid || !access.record) {
    return { ok: false, status: 403, reason: access.reason };
  }
  if (access.record.clientRequestId) {
    return { ok: true, clientRequestId: access.record.clientRequestId };
  }
  if (access.record.clientId) {
    const latest = await prisma.clientRequestDb.findFirst({
      where: { clientId: access.record.clientId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    return { ok: true, clientRequestId: latest?.id ?? null };
  }
  return { ok: true, clientRequestId: null };
}

interface MessageDTO {
  id: string;
  authorRole: string;
  authorName: string;
  body: string;
  createdAt: string;
  mine: boolean;
}

function toDTO(
  m: { id: string; authorRole: string; authorName: string; body: string; createdAt: Date },
  viewer: "client" | "team",
): MessageDTO {
  return {
    id: m.id,
    authorRole: m.authorRole,
    authorName: m.authorName,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    mine: m.authorRole === viewer,
  };
}

// ── GET: list the thread ────────────────────────────────────────────────────
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  let clientRequestId: string | null;
  let viewer: "client" | "team";

  if (token) {
    const r = await resolveTokenRequestId(token);
    if (!r.ok) return NextResponse.json({ error: "Access denied", reason: r.reason }, { status: r.status });
    clientRequestId = r.clientRequestId;
    viewer = "client";
  } else {
    const { error } = await requireSession();
    if (error) return error;
    clientRequestId = searchParams.get("clientRequestId");
    viewer = "team";
    if (!clientRequestId) {
      return NextResponse.json({ error: "clientRequestId required" }, { status: 400 });
    }
  }

  if (!clientRequestId) {
    // Valid token but no request thread yet — empty conversation.
    return NextResponse.json({ messages: [], unread: 0 });
  }

  try {
    const rows = await prisma.portalMessage.findMany({
      where: { clientRequestId },
      orderBy: { createdAt: "asc" },
    });

    // Mark the other side's messages as read for this viewer.
    if (viewer === "client") {
      await prisma.portalMessage.updateMany({
        where: { clientRequestId, authorRole: "team", readByClient: false },
        data: { readByClient: true },
      });
    } else {
      await prisma.portalMessage.updateMany({
        where: { clientRequestId, authorRole: "client", readByTeam: false },
        data: { readByTeam: true },
      });
    }

    return NextResponse.json({ messages: rows.map((m) => toDTO(m, viewer)) });
  } catch (e) {
    console.error("[portal/messages] GET error", e);
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}

// ── POST: send a message ────────────────────────────────────────────────────
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { token?: string; clientRequestId?: string; body?: string; authorName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text) return NextResponse.json({ error: "body required" }, { status: 400 });
  if (text.length > 4000) return NextResponse.json({ error: "message too long" }, { status: 400 });

  let clientRequestId: string | null;
  let authorRole: "client" | "team";
  let authorName: string;

  if (body.token) {
    const r = await resolveTokenRequestId(body.token);
    if (!r.ok) return NextResponse.json({ error: "Access denied", reason: r.reason }, { status: r.status });
    clientRequestId = r.clientRequestId;
    authorRole = "client";
    authorName = body.authorName?.trim() || "Cliente";
  } else {
    const { session, error } = await requireSession();
    if (error) return error;
    clientRequestId = typeof body.clientRequestId === "string" ? body.clientRequestId : null;
    authorRole = "team";
    authorName = session.name || "Equipe Dioli";
  }

  if (!clientRequestId) {
    return NextResponse.json({ error: "No conversation thread for this token yet" }, { status: 404 });
  }

  try {
    const created = await prisma.portalMessage.create({
      data: {
        clientRequestId,
        authorRole,
        authorName,
        body: text,
        // The author has implicitly read their own side.
        readByTeam:   authorRole === "team",
        readByClient: authorRole === "client",
      },
    });
    return NextResponse.json(toDTO(created, authorRole), { status: 201 });
  } catch (e) {
    console.error("[portal/messages] POST error", e);
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}
