// GET /api/auth/google
// Initiates the Google OAuth flow. Called from the /briefing page via a popup
// window — no page redirect on the parent, so conversation state is preserved.

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Google OAuth not configured" }, { status: 503 });
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
