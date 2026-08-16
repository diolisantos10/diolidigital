// POST /api/meta/dispatch
// Cron endpoint: scans ActivityEvent(type="whatsapp_notify") and sends the
// client WhatsApp notifications. Protected by CRON_SECRET (Bearer), same
// pattern as app/api/cron/training/sdr. Point a Railway cron / external
// scheduler at this every few minutes.
//
// Also callable by the workspace master from the UI (session) for a manual run.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { dispatchWhatsAppNotifications } from "@/lib/integrations/meta/notifications";
import { segredoConfere } from "@/lib/security/crypto";
import { deveBloquearMutacaoCrossSite } from "@/lib/security/navegacao-cross-site";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  // Two ways in: a valid CRON_SECRET (scheduler) OR a master session (manual).
  // A guarda de Origin/Referer (FAIXA 1) só vale para o caminho de SESSÃO —
  // quem entra por segredo não tem cookie, e sem cookie não há CSRF a barrar.
  let workspaceId: string | undefined;
  if (segredoConfere(bearer, cronSecret)) {
    workspaceId = undefined; // all workspaces
  } else {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.role !== "master") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (deveBloquearMutacaoCrossSite(request)) {
      return NextResponse.json({ error: "Origem não confiável para esta ação." }, { status: 403 });
    }
    workspaceId = session.workspaceId;
  }

  const result = await dispatchWhatsAppNotifications(workspaceId);
  return NextResponse.json(result);
}
