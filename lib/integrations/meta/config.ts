// Central resolver for the Meta APP credentials (App ID + App Secret) of the
// "Dioli Digital" app. SERVER-ONLY.
//
// Mirrors lib/ai/resolve-key.ts exactly:
//   1. Credentials saved through the Integrations UI (encrypted in the DB) win.
//   2. Environment variables (META_APP_ID / META_APP_SECRET) are the fallback.
//
// This lets the non-technical owner paste the App ID/Secret in the UI without
// touching env vars, while a Railway env-based setup keeps working unchanged.

import { prisma } from "@/lib/db/client";
import { decryptSecret } from "@/lib/security/crypto";
import type { MetaAppCredentials } from "./types";

// The DbIntegrationConfig row key that stores the Meta App credentials.
//   apiKeyEncrypted -> App Secret (encrypted)
//   accountId       -> App ID (public, not a secret)
export const META_INTEGRATION_ID = "int-meta";

// Graph API version. Overridable via env so we can bump without a code change.
export const GRAPH_VERSION = (process.env.META_GRAPH_VERSION?.trim() || "v21.0").replace(/^\/?/, "");
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

// OAuth authorize endpoint (Facebook Login).
export const FB_OAUTH_DIALOG = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;

// Default scopes we request. These cover Instagram publishing + insights,
// Facebook page management, and WhatsApp messaging. The app must have these
// permissions approved in the Meta App Review for production (non-test) use.
export const DEFAULT_SCOPES = [
  "public_profile",
  "email",
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "pages_manage_metadata",
  "business_management",
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_insights",
  "instagram_manage_comments",
  "read_insights",
  "whatsapp_business_management",
  "whatsapp_business_messaging",
];

// Resolves the Meta App credentials for a workspace. Returns null when neither
// the UI vault nor env vars have both an App ID and App Secret.
export async function resolveMetaAppCredentials(
  workspaceId?: string,
): Promise<MetaAppCredentials | null> {
  try {
    const row = workspaceId
      ? await prisma.dbIntegrationConfig.findUnique({
          where: { workspaceId_integrationId: { workspaceId, integrationId: META_INTEGRATION_ID } },
        })
      : await prisma.dbIntegrationConfig.findFirst({
          where: { integrationId: META_INTEGRATION_ID, apiKeyEncrypted: { not: null } },
        });

    if (row?.apiKeyEncrypted && row.accountId) {
      const appSecret = decryptSecret(row.apiKeyEncrypted);
      if (appSecret) {
        return { appId: row.accountId, appSecret, source: "ui" };
      }
    }
  } catch {
    // DB unavailable — fall through to env.
  }

  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (appId && appSecret) return { appId, appSecret, source: "env" };

  return null;
}

export async function isMetaConfigured(workspaceId?: string): Promise<boolean> {
  return (await resolveMetaAppCredentials(workspaceId)) !== null;
}

// WhatsApp Cloud API sender resolved from environment variables. This is the
// zero-UI path: set META_WHATSAPP_PHONE_ID / META_WHATSAPP_TOKEN (+ optional
// META_WHATSAPP_WABA_ID) in Railway and the notifier + template tools work
// without a stored MetaConnection row. A DB connection (when present) wins.
export interface WhatsAppEnvSender {
  phoneNumberId: string;
  token: string;
  wabaId: string;
}
export function resolveWhatsAppEnv(): WhatsAppEnvSender | null {
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_ID?.trim();
  const token = process.env.META_WHATSAPP_TOKEN?.trim();
  const wabaId = process.env.META_WHATSAPP_WABA_ID?.trim() ?? "";
  if (phoneNumberId && token) return { phoneNumberId, token, wabaId };
  return null;
}

// The verify token used to validate webhook subscription (GET challenge).
// Falls back to a stable default derived from nothing sensitive; set
// META_WEBHOOK_VERIFY_TOKEN in Railway to a value you also paste in the Meta
// dashboard's webhook config.
export function webhookVerifyToken(): string {
  return process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() || "dioli-meta-webhook";
}
