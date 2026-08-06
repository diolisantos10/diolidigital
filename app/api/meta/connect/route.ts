// GET /api/meta/connect
// Starts the Facebook Login / Meta OAuth flow. Opened in a popup from the
// Integrations screen, so the parent page keeps its state. On return, the
// callback stores the connected accounts and postMessages the result.
//
// Optional query param: ?clientId=<id> to attach the connection to a specific
// client (default: the agency's own accounts).

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { resolveMetaAppCredentials, DEFAULT_SCOPES } from "@/lib/integrations/meta/config";
import { buildLoginUrl } from "@/lib/integrations/meta/oauth";
import { urlPublica } from "@/lib/http/endereco-publico";
import { popupDeFalha } from "@/lib/integrations/meta/popup";

export async function GET(req: NextRequest): Promise<Response> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "master") {
    return NextResponse.json({ error: "Apenas o master pode conectar contas Meta" }, { status: 403 });
  }

  const creds = await resolveMetaAppCredentials(session.workspaceId);
  if (!creds) {
    return NextResponse.json(
      { error: "App da Meta não configurado — salve App ID e App Secret primeiro." },
      { status: 503 },
    );
  }

  const clientId = req.nextUrl.searchParams.get("clientId") ?? "";

  // Build the redirect URI from the request host so it works on localhost,
  // Railway previews and production without extra env vars.
  // Uma fonte só para o endereço público. `host` cru já devolveu o endereço
  // interno do contêiner para o navegador do cliente (06/08/2026).
  const redirectUri = urlPublica(req, "/api/meta/callback");
  if (!redirectUri) {
    return popupDeFalha("app_nao_configurado", "meta:sem_endereco_publico");
  }

  const state = crypto.randomUUID(); // CSRF token

  const url = buildLoginUrl({
    appId: creds.appId,
    redirectUri,
    state,
    scopes: DEFAULT_SCOPES,
  });

  const res = NextResponse.redirect(url);
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 600, // 10 minutes
    path: "/",
  };
  res.cookies.set("_meta_oauth_state", state, cookieOpts);
  res.cookies.set("_meta_oauth_client", clientId, cookieOpts);
  return res;
}
