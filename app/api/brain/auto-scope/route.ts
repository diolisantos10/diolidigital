// POST /api/brain/auto-scope — re-runs the 6-engine scope chain for a ClientRequest.
// Used by the PM to manually re-trigger scope generation (e.g. after "needs_revision").
// Agency role only. The primary path is automatic: scope runs when the briefing is created.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { naoEncontrado, solicitacaoDoWorkspace } from "@/lib/auth/posse-de-workspace";
import { runAutoScope } from "@/lib/dioli-brain/run-auto-scope";
import { buildClientSnapshot } from "@/lib/dioli-brain/client-snapshot";

const AGENCY_ROLES = ["master", "project_manager"] as const;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession([...AGENCY_ROLES]);
  if (error) return error;
  if (session.clientId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { clientRequestId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const clientRequestId = body.clientRequestId;
  if (!clientRequestId || typeof clientRequestId !== "string") {
    return NextResponse.json({ error: "clientRequestId required" }, { status: 400 });
  }

  // Existir não basta: tem que ser SUA. Sem isto, um PM disparava a cadeia de 6
  // motores sobre a solicitação de outra agência — sobrescrevendo os artefatos
  // dela e gastando a chave de IA DESTE workspace com o briefing dela.
  if (!(await solicitacaoDoWorkspace(clientRequestId, session.workspaceId))) {
    return naoEncontrado();
  }

  // Verify the request exists before running engines.
  let exists: boolean;
  try {
    const snap = await buildClientSnapshot(clientRequestId);
    exists = snap !== null;
  } catch (e) {
    console.error("[brain/auto-scope] snapshot error", e);
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
  if (!exists) {
    return NextResponse.json({ error: "ClientRequest not found" }, { status: 404 });
  }

  try {
    await runAutoScope(clientRequestId, {
      approvedBy:  session.name,
      workspaceId: session.workspaceId,
    });
  } catch (e) {
    console.error("[brain/auto-scope] engine error", e);
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }

  return NextResponse.json({ ok: true, requestId: clientRequestId });
}
