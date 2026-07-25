// Consumes ActivityEvent(type="whatsapp_notify") and sends the client a
// WhatsApp when their proposal is ready. SERVER-ONLY.
//
// Idempotent: every event handled is recorded in WhatsAppOutbox (unique on
// activityEventId), so re-runs never double-send. Called by the cron endpoint
// app/api/meta/dispatch/route.ts.

import { prisma } from "@/lib/db/client";
import { sendWhatsAppMessage } from "./client";
import { PROPOSAL_SENT_TEMPLATE } from "./templates";

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.trim() ||
  "https://dioli-agency-os-1-production.up.railway.app";

interface NotifyPayload {
  kind?: string;
  businessName?: string;
  portalPath?: string;
  clientRequestId?: string; // preferred — makes the phone lookup deterministic
  phone?: string;           // optional — if the producer includes it directly
  name?: string;
}

// WhatsApp expects digits only, with country code, no "+"/spaces/dashes.
// Assumes Brazilian numbers when no country code is present.
function normalizePhone(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (d.length <= 11 && !d.startsWith("55")) d = `55${d}`; // add BR country code
  return d.length >= 10 ? d : null;
}

// Resolve { phone, name } for an event, preferring clientRequestId, then the
// event's clientId, then a businessName match.
async function resolveRecipient(
  workspaceId: string,
  eventClientId: string | null,
  payload: NotifyPayload,
): Promise<{ phone: string; name: string } | null> {
  // 0. Producer supplied the phone directly.
  if (payload.phone) {
    const p = normalizePhone(payload.phone);
    if (p) return { phone: p, name: payload.name || payload.businessName || "" };
  }

  // 1. Deterministic: clientRequestId → briefingJson.prospectPhone.
  let req = payload.clientRequestId
    ? await prisma.clientRequestDb.findUnique({ where: { id: payload.clientRequestId } })
    : null;

  // 2. Fallback: match by clientId, then by businessName (least reliable).
  if (!req && eventClientId) {
    req = await prisma.clientRequestDb.findFirst({
      where: { workspaceId, clientId: eventClientId },
      orderBy: { createdAt: "desc" },
    });
  }
  if (!req && payload.businessName) {
    req = await prisma.clientRequestDb.findFirst({
      where: { workspaceId, businessName: payload.businessName },
      orderBy: { createdAt: "desc" },
    });
  }
  if (!req?.briefingJson) return null;

  let briefing: Record<string, unknown> = {};
  try { briefing = JSON.parse(req.briefingJson) as Record<string, unknown>; } catch { return null; }

  const rawPhone =
    (briefing.prospectPhone as string) ||
    (briefing.phone as string) ||
    (briefing.whatsapp as string) ||
    "";
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  if (!phone) return null;

  const name =
    (briefing.prospectName as string) ||
    (briefing.businessName as string) ||
    req.businessName ||
    "";
  return { phone, name };
}

export interface DispatchResult {
  scanned: number;
  sent: number;
  failed: number;
  skipped: number;
  details: Array<{ eventId: string; status: string; reason?: string }>;
}

export async function dispatchWhatsAppNotifications(
  workspaceId?: string,
  { limit = 50 }: { limit?: number } = {},
): Promise<DispatchResult> {
  const result: DispatchResult = { scanned: 0, sent: 0, failed: 0, skipped: 0, details: [] };

  // Pull recent whatsapp_notify events not yet in the outbox.
  const events = await prisma.activityEvent.findMany({
    where: { type: "whatsapp_notify", ...(workspaceId ? { workspaceId } : {}) },
    orderBy: { timestamp: "desc" },
    take: limit,
  });

  for (const ev of events) {
    // Skip anything already handled (idempotency).
    const existing = await prisma.whatsAppOutbox.findUnique({ where: { activityEventId: ev.id } });
    if (existing) continue;
    result.scanned++;

    let payload: NotifyPayload = {};
    try { payload = JSON.parse(ev.message) as NotifyPayload; } catch { /* keep empty */ }

    const record = async (status: string, extra: { toPhone?: string; externalMessageId?: string; error?: string }) => {
      await prisma.whatsAppOutbox.create({
        data: {
          workspaceId: ev.workspaceId,
          activityEventId: ev.id,
          kind: payload.kind ?? "proposal_sent",
          toPhone: extra.toPhone ?? null,
          status,
          externalMessageId: extra.externalMessageId ?? null,
          error: extra.error ?? null,
        },
      });
    };

    // Need a connected WhatsApp number for this workspace.
    const waConn = await prisma.metaConnection.findFirst({
      where: { workspaceId: ev.workspaceId, platform: "whatsapp", status: "connected" },
    });
    if (!waConn) {
      result.skipped++;
      result.details.push({ eventId: ev.id, status: "skipped", reason: "no_whatsapp_connection" });
      await record("skipped", { error: "no_whatsapp_connection" });
      continue;
    }

    const recipient = await resolveRecipient(ev.workspaceId, ev.clientId, payload);
    if (!recipient) {
      result.skipped++;
      result.details.push({ eventId: ev.id, status: "skipped", reason: "no_phone" });
      await record("skipped", { error: "no_phone" });
      continue;
    }

    const link = payload.portalPath
      ? `${BASE_URL}${payload.portalPath.startsWith("/") ? "" : "/"}${payload.portalPath}`
      : BASE_URL;

    // Send via the approved template (business-initiated, outside 24h window).
    const send = await sendWhatsAppMessage(ev.workspaceId, {
      connectionId: waConn.id,
      to: recipient.phone,
      templateName: PROPOSAL_SENT_TEMPLATE.name,
      templateLanguage: PROPOSAL_SENT_TEMPLATE.language,
      templateComponents: [
        {
          type: "body",
          parameters: [
            { type: "text", text: recipient.name || "tudo bem?" },
            { type: "text", text: link },
          ],
        },
      ],
    });

    if (send.ok) {
      result.sent++;
      result.details.push({ eventId: ev.id, status: "sent" });
      await record("sent", { toPhone: recipient.phone, externalMessageId: send.externalPostId });
    } else {
      result.failed++;
      result.details.push({ eventId: ev.id, status: "failed", reason: send.error });
      await record("failed", { toPhone: recipient.phone, error: send.error });
    }
  }

  return result;
}
