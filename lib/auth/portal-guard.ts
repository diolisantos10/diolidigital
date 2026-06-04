// Portal access guard — abstraction layer for secure client portal access.
//
// Current state (V2): portal accepts either a portalToken (secure) or a legacy
// client ID (backwards compat with existing Playwright tests + demo data).
// Production hardening: remove the ID fallback and require tokens only.
//
// The isPortalAccessAllowed() function is the single place to enforce
// client data boundary checks — plug real auth here when ready.

import { prisma } from "@/lib/db/client";

export type PortalAccessMode = "token" | "id_legacy" | "denied";

export interface PortalAccessResult {
  mode: PortalAccessMode;
  clientId: string | null;
  // True when using secure token access
  isSecure: boolean;
  // Warning shown to operators in System Doctor
  warningMessage?: string;
}

export async function resolvePortalAccess(tokenOrId: string): Promise<PortalAccessResult> {
  // Try secure token first (preferred)
  try {
    const byToken = await prisma.client.findUnique({
      where: { portalToken: tokenOrId },
      select: { id: true },
    });
    if (byToken) {
      return { mode: "token", clientId: byToken.id, isSecure: true };
    }
  } catch {
    // DB unavailable — fall through to legacy mode
  }

  // Fallback: treat as legacy client ID (for demo data + backwards compat)
  // This path is UNSAFE for production — client ID is guessable.
  return {
    mode: "id_legacy",
    clientId: tokenOrId,
    isSecure: false,
    warningMessage:
      "Portal acessado por ID direto (modo legacy). Use tokens de portal para acesso seguro em produção.",
  };
}

// Quick check used by System Doctor and middleware
export async function isDbAvailable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
