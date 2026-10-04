// GET /api/auth/google
// Initiates the Google OAuth flow. Called from the /briefing page via a popup
// window — no page redirect on the parent, so conversation state is preserved.

import { NextRequest, NextResponse } from "next/server";
import { fraseDoErroGoogle } from "@/lib/auth/erro-do-google";

export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    // Esta rota abre DENTRO de um popup: JSON cru aqui é o que o cliente lê.
    // Devolve a mesma página do retorno, com a frase amigável e o recado
    // para a tela de origem (que mostra o formulário).
    console.warn("[auth/google] GOOGLE_CLIENT_ID ausente — botão Google indisponível");
    const carga = JSON.stringify({ type: "google_auth_error", error: "nao_configurado" });
    return new NextResponse(
      `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;padding:2rem;text-align:center;color:#1a1a1a">
<h2 style="color:#B91C1C;font-size:18px;margin-bottom:8px">Não deu para entrar com o Google</h2>
<p style="color:#57534E;font-size:14px">${fraseDoErroGoogle("nao_configurado")}</p>
<script>try{if(window.opener){window.opener.postMessage(${carga},window.location.origin);setTimeout(function(){window.close()},1500)}}catch(e){}</script>
</body></html>`,
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
    );
  }

  // Build the redirect URI from the request host so this works on any domain
  // (localhost, Railway preview, production) without extra env vars.
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host  = req.headers.get("host") ?? "localhost:3000";
  const redirectUri = `${proto}://${host}/api/auth/google/callback`;

  const state = crypto.randomUUID(); // CSRF token

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: "code",
    scope:         "openid email profile",
    state,
    access_type:   "online",
    prompt:        "select_account",
  });

  const googleUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

  const res = NextResponse.redirect(googleUrl);
  res.cookies.set("_goauth_state", state, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge:   600, // 10 minutes
    path:     "/",
  });

  return res;
}
