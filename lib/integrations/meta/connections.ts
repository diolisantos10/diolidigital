// DB helpers for MetaConnection rows. SERVER-ONLY.
// Tokens are ALWAYS encrypted here before hitting the database, and decrypted
// only when a Graph call needs them (loadToken).

import { prisma } from "@/lib/db/client";
import { encryptSecret, decryptSecret, keyHint } from "@/lib/security/crypto";
import type { MetaConnectionView, MetaPlatform } from "./types";

interface SaveConnectionInput {
  workspaceId: string;
  clientId?: string | null;
  platform: MetaPlatform;
  name: string;
  externalId: string;
  accessToken: string; // plaintext — encrypted inside this function
  tokenExpiresAt?: Date | null;
  scopes?: string[];
  meta?: Record<string, unknown>;
}

// Row → view (never exposes the token).
function toView(row: {
  id: string; platform: string; name: string; externalId: string; clientId: string | null;
  status: string; tokenHint: string | null; tokenExpiresAt: Date | null; scopes: string;
  connectedAt: Date; lastSyncedAt: Date | null;
}): MetaConnectionView {
  let scopes: string[] = [];
  try { scopes = JSON.parse(row.scopes) as string[]; } catch { /* ignore */ }
  return {
    id: row.id,
    platform: row.platform as MetaPlatform,
    name: row.name,
    externalId: row.externalId,
    clientId: row.clientId,
    status: row.status,
    tokenHint: row.tokenHint,
    tokenExpiresAt: row.tokenExpiresAt ? row.tokenExpiresAt.toISOString() : null,
    scopes,
    connectedAt: row.connectedAt.toISOString(),
    lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
  };
}

// Upsert a connection (unique on workspaceId+platform+externalId).
export async function saveConnection(input: SaveConnectionInput): Promise<MetaConnectionView> {
  const encrypted = encryptSecret(input.accessToken);
  const hint = keyHint(input.accessToken);
  const scopes = JSON.stringify(input.scopes ?? []);
  const metaJson = JSON.stringify(input.meta ?? {});

  const row = await prisma.metaConnection.upsert({
    where: {
      workspaceId_platform_externalId: {
        workspaceId: input.workspaceId,
        platform: input.platform,
        externalId: input.externalId,
      },
    },
    create: {
      workspaceId: input.workspaceId,
      clientId: input.clientId ?? null,
      platform: input.platform,
      name: input.name,
      externalId: input.externalId,
      accessTokenEncrypted: encrypted,
      tokenHint: hint,
      tokenExpiresAt: input.tokenExpiresAt ?? null,
      scopes,
      metaJson,
      status: "connected",
      lastSyncedAt: new Date(),
    },
    update: {
      clientId: input.clientId ?? undefined,
      name: input.name,
      accessTokenEncrypted: encrypted,
      tokenHint: hint,
      tokenExpiresAt: input.tokenExpiresAt ?? null,
      scopes,
      metaJson,
      status: "connected",
      lastSyncedAt: new Date(),
    },
  });

  return toView(row);
}

export async function listConnections(workspaceId: string): Promise<MetaConnectionView[]> {
  const rows = await prisma.metaConnection.findMany({
    where: { workspaceId },
    orderBy: { connectedAt: "desc" },
  });
  return rows.map(toView);
}

// Loads the decrypted token + externalId + platform for a connection. Returns
// null if the connection doesn't exist, isn't in this workspace, or the token
// can't be decrypted.
export async function loadConnectionToken(
  workspaceId: string,
  connectionId: string,
): Promise<{ token: string; externalId: string; platform: MetaPlatform; metaJson: Record<string, unknown> } | null> {
  const row = await prisma.metaConnection.findUnique({ where: { id: connectionId } });
  if (!row || row.workspaceId !== workspaceId) return null;
  const token = decryptSecret(row.accessTokenEncrypted);
  if (!token) return null;
  let metaJson: Record<string, unknown> = {};
  try { metaJson = JSON.parse(row.metaJson) as Record<string, unknown>; } catch { /* ignore */ }
  return { token, externalId: row.externalId, platform: row.platform as MetaPlatform, metaJson };
}

export async function deleteConnection(workspaceId: string, connectionId: string): Promise<boolean> {
  const row = await prisma.metaConnection.findUnique({ where: { id: connectionId } });
  if (!row || row.workspaceId !== workspaceId) return false;
  await prisma.metaConnection.delete({ where: { id: connectionId } });
  return true;
}
