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
import { segredoConfere } from "@/lib/security/crypto";
import { recordInbound, updateMessageStatus, resolveWorkspaceForPhone } from "@/lib/integrations/meta/inbox";

// Webhooks are request-time and must never be cached/prerendered.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  // `segredoConfere` também trata o caso "token não configurado": a função
  // devolve false para lado vazio, então uma instância sem
  // META_WEBHOOK_VERIFY_TOKEN não confirma assinatura de webhook para ninguém.
  if (mode === "subscribe" && segredoConfere(token, webhookVerifyToken()) && challenge) {
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

  // Persist WhatsApp messages + statuses into the single inbox. Best-effort:
  // never throw back to Meta (that would trigger re-delivery storms).
  try {
    await handleWhatsAppPayload(payload);
  } catch (e) {
    console.error("[meta/webhooks] processing error:", e instanceof Error ? e.message : e);
  }

  // Meta requires a fast 200 to avoid re-delivery.
  return new NextResponse("EVENT_RECEIVED", { status: 200 });
}

// Parse a WhatsApp Cloud API webhook payload: store inbound messages and apply
// delivery-status updates to outbound ones. Comments/DMs from IG/FB land under
// object!="whatsapp_business_account" and are ignored here for now.
interface WaValue {
  metadata?: { phone_number_id?: string };
  contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
  messages?: Array<{ id?: string; from?: string; timestamp?: string; type?: string; text?: { body?: string } }>;
  statuses?: Array<{ id?: string; status?: string }>;
}

async function handleWhatsAppPayload(payload: { object?: string; entry?: unknown[] }): Promise<void> {
  if (payload.object !== "whatsapp_business_account") return;
  for (const entryRaw of payload.entry ?? []) {
    const entry = entryRaw as { changes?: Array<{ value?: WaValue }> };
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;
      const phoneNumberId = value.metadata?.phone_number_id ?? "";
      const workspaceId = await resolveWorkspaceForPhone(phoneNumberId);
      if (!workspaceId) continue;

      const nameByWaId = new Map<string, string>();
      for (const c of value.contacts ?? []) {
        if (c.wa_id) nameByWaId.set(c.wa_id, c.profile?.name ?? "");
      }

      for (const m of value.messages ?? []) {
        if (!m.from) continue;
        await recordInbound({
          workspaceId,
          phoneNumberId,
          contactWaId: m.from,
          contactName: nameByWaId.get(m.from) || undefined,
          type: m.type ?? "text",
          body: m.text?.body ?? "",
          externalId: m.id,
          timestamp: m.timestamp ? new Date(Number(m.timestamp) * 1000) : undefined,
        });
      }

      for (const s of value.statuses ?? []) {
        if (s.id && s.status) await updateMessageStatus(s.id, s.status);
      }
    }
  }
}
