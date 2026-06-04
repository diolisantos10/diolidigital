// Data Access Layer — verifies session and provides typed current-user helpers.
// Always call verifySession() at the start of any server action / route handler
// that accesses sensitive data.
import "server-only";

import { redirect } from "next/navigation";
import { getSession, type SessionPayload } from "@/lib/auth/session";
import { cache } from "react";

// React cache ensures session is only verified once per request tree
export const verifySession = cache(async (): Promise<SessionPayload> => {
  const session = await getSession();
  if (!session) {
    redirect("/auth/signin");
  }
  return session;
});

// Returns null instead of redirecting — for optional auth checks
export const getOptionalSession = cache(async (): Promise<SessionPayload | null> => {
  return getSession();
});

export async function requireRole(
  session: SessionPayload,
  ...roles: string[]
): Promise<void> {
  if (!roles.includes(session.role)) {
    redirect("/agency/dashboard");
  }
}
