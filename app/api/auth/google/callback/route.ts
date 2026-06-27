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
  const isError = payload.type === "google_auth_error";
  const heading = isError ? "Não foi possível autenticar" : "Login concluído ✓";
  const detail  = isError
    ? `Código do erro: ${safeAttr(payload.error ?? "desconhecido")}`
    : `Bem-vindo, ${safeAttr(payload.name || payload.email || "")}. Já pode fechar esta janela.`;
  const color = isError ? "#dc2626" : "#16a34a";
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family:sans-serif;padding:2rem;text-align:center;color:#1a1a1a">
<h2 style="color:${color};font-size:18px;margin-bottom:8px">${heading}</h2>
<p style="color:#6b7280;font-size:14px;word-break:break-word">${detail}</p>
<script>
var payload = ${json};
var hadOpener = false;
try {
  if (window.opener && typeof window.opener.postMessage === "function") {
    window.opener.postMessage(payload, window.location.origin);
    hadOpener = true;
  }
} catch(e) {}
// Auto-close only when opened as a popup (opener present). When opened directly
// in a standalone tab — the 20s isolated test — keep it open so the result and
// any error code can be read and screenshotted.
if (hadOpener) { setTimeout(function(){ window.close(); }, 600); }
</script>
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
    if (!tokenRes.ok) {
      // Surface Google's actual reason (invalid_client, redirect_uri_mismatch,
      // invalid_grant, …) so the failure is diagnosable without guesswork.
      const raw = await tokenRes.text().catch(() => "");
      let reason = "token_exchange";
      try {
        const j = JSON.parse(raw) as { error?: string; error_description?: string };
        if (j.error) reason = j.error_description ? `${j.error} — ${j.error_description}` : j.error;
      } catch { /* keep generic */ }
      console.error("[auth/google/callback] token exchange failed:", tokenRes.status, raw);
      return popupHtml({ type: "google_auth_error", error: reason });
    }

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
