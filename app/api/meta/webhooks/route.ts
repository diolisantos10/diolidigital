// Meta webhooks endpoint.
//   GET  — subscription verification challenge (hub.mode / hub.verify_token /
//          hub.challenge). Returns the challenge when the token matches.
//   POST — receives events (comments, DMs, WhatsApp messages). ALWAYS verifies
//          the X-Hub-Signature-256 HMAC against the raw body with the App
//          Secret before trusting anything.
//
// Configure this URL in the Meta App dashboard → Webhooks, using the same
// verify token you set in META_WEBHOOK_VERIFY_TOKEN.

import { NextRequest, NextResponse } from "next/server";
import { resolveMetaAppCredentials, webhookVerifyToken } from "@/lib/integrations/meta/config";
import { verifyWebhookSignature } from "@/lib/integrations/meta/webhooks";

// Webhooks are request-time and must never be cached/prerendered.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token && token === webhookVerifyToken() && challenge) {
    // Meta expects the raw challenge echoed back as text/plain.
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Read the RAW body first — the signature is computed over these exact bytes.
  const rawBody = await req.text();

  // App-level credentials (no session on a webhook) — resolve from env/vault.
  const creds = await resolveMetaAppCredentials();
  if (!creds) {
    // No secret to verify with — reject rather than trust blindly.
    console.error("[meta/webhooks] no App Secret available to verify signature");
    return new NextResponse("Not configured", { status: 503 });
  }

  const signature = req.headers.get("x-hub-signature-256");
  if (!verifyWebhookSignature(rawBody, signature, creds.appSecret)) {
    console.warn("[meta/webhooks] invalid signature — rejected");
    return new NextResponse("Invalid signature", { status: 401 });
  }

  // Signature valid — safe to parse.
  let payload: { object?: string; entry?: unknown[] } = {};
  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    return new NextResponse("Bad payload", { status: 400 });
  }

  // Log the event shape. Deeper routing (persisting comments/DMs, replying via
  // the Social Agent) plugs in here as those consumers come online.
  const entries = Array.isArray(payload.entry) ? payload.entry.length : 0;
  console.log(`[meta/webhooks] verified event object=${payload.object ?? "?"} entries=${entries}`);

  // Meta requires a fast 200 to avoid ret/re-delivery.
  return new NextResponse("EVENT_RECEIVED", { status: 200 });
}
