// Meta APP credentials management (App ID + App Secret of the "Dioli Digital"
// app).
//   GET    — status: configured?, appId (public), a hint of the secret. NEVER
//            returns the App Secret.
//   POST   — save/replace App ID + App Secret (secret encrypted at rest).
//   DELETE — remove the stored credentials.
//
// Only the workspace "master" may write. Mirrors app/api/ai-keys/route.ts.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { encryptSecret, keyHint } from "@/lib/security/crypto";
import { META_INTEGRATION_ID, resolveMetaAppCredentials } from "@/lib/integrations/meta/config";

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const row = await prisma.dbIntegrationConfig.findUnique({
    where: { workspaceId_integrationId: { workspaceId: session.workspaceId, integrationId: META_INTEGRATION_ID } },
  });

  // Also report whether env-based credentials exist, so the UI can show "conectado via ambiente".
  const resolved = await resolveMetaAppCredentials(session.workspaceId);

  return NextResponse.json({
    configured: !!resolved,
    source: resolved?.source ?? null,
    appId: row?.accountId ?? (resolved?.source === "env" ? resolved.appId : null),
    secretHint: row?.apiKeyHint ?? null,
    lastConfiguredAt: row?.lastConfiguredAt ?? null,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "master") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as { appId?: string; appSecret?: string };
  const appId = (body.appId ?? "").trim();
  const appSecret = (body.appSecret ?? "").trim();

  if (!/^\d{6,}$/.test(appId)) {
    return NextResponse.json({ error: "App ID inválido (deve ser numérico)" }, { status: 400 });
  }
  if (appSecret.length < 16) {
    return NextResponse.json({ error: "App Secret muito curto" }, { status: 400 });
  }

  await prisma.dbIntegrationConfig.upsert({
    where: { workspaceId_integrationId: { workspaceId: session.workspaceId, integrationId: META_INTEGRATION_ID } },
    create: {
      workspaceId: session.workspaceId,
      integrationId: META_INTEGRATION_ID,
      configured: true,
      accountId: appId, // App ID is public — stored plaintext.
      apiKeyEncrypted: encryptSecret(appSecret), // App Secret — encrypted.
      apiKeyHint: keyHint(appSecret),
      lastTestStatus: "not_run",
      lastConfiguredAt: new Date(),
    },
    update: {
      configured: true,
      accountId: appId,
      apiKeyEncrypted: encryptSecret(appSecret),
      apiKeyHint: keyHint(appSecret),
      lastConfiguredAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true, appId, secretHint: keyHint(appSecret) });
}

export async function DELETE(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "master") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.dbIntegrationConfig.updateMany({
    where: { workspaceId: session.workspaceId, integrationId: META_INTEGRATION_ID },
    data: { configured: false, apiKeyEncrypted: null, apiKeyHint: null, accountId: null },
  });

  return NextResponse.json({ ok: true });
}
