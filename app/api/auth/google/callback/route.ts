// GET /api/auth/google/callback
// Google redirects here after the user authenticates. This route:
//   1. Validates the state cookie (CSRF).
//   2. Exchanges the code for an access token.
//   3. Fetches the user's profile (email, name, picture).
//   4. Returns a small HTML page that postMessages the result back to the
//      opener (the /briefing parent window) and closes the popup.
//
// No session is created — the email travels from the popup to the parent
// in-memory, then is included in the briefing submission. This keeps the
// auth flow stateless for the briefing use-case.

import { NextRequest } from "next/server";

interface GoogleTokens { access_token: string }
interface GoogleUser   { email: string; name: string; picture?: string; email_verified?: boolean }

function safeAttr(s: string) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;");
}

function popupHtml(payload: Record<string, string>): Response {
  const json = JSON.stringify(payload).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<script>
try {
  if (window.opener && typeof window.opener.postMessage === "function") {
    window.opener.postMessage(${json}, window.location.origin);
  }
} catch(e) {}
setTimeout(function(){ window.close(); }, 300);
</script>
<p style="font-family:sans-serif;color:#6b7280;padding:2rem">Autenticando…</p>
</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code  = searchParams.get("code");
  const state = searchParams.get("state");
  const err   = searchParams.get("error");

  if (err || !code || !state) {
    return popupHtml({ type: "google_auth_error", error: err ?? "no_code" });
  }

  // CSRF: compare state with the cookie we set in /api/auth/google
  const storedState = req.cookies.get("_goauth_state")?.value;
  if (!storedState || storedState !== state) {
    return popupHtml({ type: "google_auth_error", error: "state_mismatch" });
  }

  const clientId     = process.env.GOOGLE_CLIENT_ID ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";

  const proto      = req.headers.get("x-forwarded-proto") ?? "http";
  const host       = req.headers.get("host") ?? "localhost:3000";
  const redirectUri = `${proto}://${host}/api/auth/google/callback`;

  try {
    // Exchange authorization code → access token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  redirectUri,
        grant_type:    "authorization_code",
      }),
    });
    if (!tokenRes.ok) return popupHtml({ type: "google_auth_error", error: "token_exchange" });

    const tokens = (await tokenRes.json()) as GoogleTokens;

    // Fetch user profile
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userRes.ok) return popupHtml({ type: "google_auth_error", error: "userinfo" });

    const user = (await userRes.json()) as GoogleUser;

    return popupHtml({
      type:    "google_auth_success",
      email:   safeAttr(user.email),
      name:    safeAttr(user.name),
      picture: safeAttr(user.picture ?? ""),
    });
  } catch {
    return popupHtml({ type: "google_auth_error", error: "unknown" });
  }
}
