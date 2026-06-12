// Portal access token management — internal (agency session required).
// POST creates a PortalAccess token for a client request or client.
// GET lists active tokens for a request/client.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { createPortalAccess } from "@/lib/agency/persistence/portal-access-service";
import { requireSession } from "@/lib/auth/api-guard";

const DEFAULT_EXPIRY_DAYS = 30;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { error } = await requireSession(["master", "project_manager"]);
  if (error) return error;

  let body: { clientRequestId?: string; clientId?: string; expiresDays?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let { clientRequestId } = body;
  const { clientId } = body;
  if (!clientRequestId && !clientId) {
    return NextResponse.json({ error: "clientRequestId or clientId required" }, { status: 400 });
  }

  try {
    // Resolve the latest Brain request for the client so the token shows the
    // pipeline immediately when one exists. Falls back to a client-only token
    // (portal-data resolves the latest request at view time).
    if (!clientRequestId && clientId) {
      const latest = await prisma.clientRequestDb.findFirst({
        where: { clientId },
        orderBy: { createdAt: "desc" },
      });
      clientRequestId = latest?.id;
    }

    const days = typeof body.expiresDays === "number" && body.expiresDays > 0
      ? Math.min(body.expiresDays, 365)
      : DEFAULT_EXPIRY_DAYS;

    const access = await createPortalAccess({
      clientRequestId,
      clientId,
      expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
    });

    return NextResponse.json(
      {
        token:     access.token,
        url:       `/portal/access/${access.token}`,
        expiresAt: access.expiresAt,
        clientRequestId: access.clientRequestId,
      },
      { status: 201 },
    );
  } catch (e) {
    console.error("[brain/portal-access] POST error", e);
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { error } = await requireSession();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const clientRequestId = searchParams.get("clientRequestId");
  const clientId        = searchParams.get("clientId");
  if (!clientRequestId && !clientId) {
    return NextResponse.json({ error: "clientRequestId or clientId required" }, { status: 400 });
  }

  try {
    const records = await prisma.portalAccess.findMany({
      where: {
        revokedAt: null,
        ...(clientRequestId ? { clientRequestId } : {}),
        ...(clientId ? { clientId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    return NextResponse.json(
      records.map((r) => ({
        token:     r.token,
        url:       `/portal/access/${r.token}`,
        expiresAt: r.expiresAt,
        createdAt: r.createdAt,
        accessCount: r.accessCount,
      })),
    );
  } catch {
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}
