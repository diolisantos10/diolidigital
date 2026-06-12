// API route session guard.
// Returns the session, or a ready-to-return 401/403 NextResponse.

import { NextResponse } from "next/server";
import { getSession, type SessionPayload } from "@/lib/auth/session";
import type { AgencyRole } from "@/lib/agency/roles";

export type GuardResult =
  | { session: SessionPayload; error: null }
  | { session: null; error: NextResponse };

export async function requireSession(allowedRoles?: AgencyRole[]): Promise<GuardResult> {
  const session = await getSession();
  if (!session) {
    return {
      session: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (allowedRoles && !allowedRoles.includes(session.role)) {
    return {
      session: null,
      error: NextResponse.json(
        { error: `Forbidden — requires role: ${allowedRoles.join(" | ")}` },
        { status: 403 },
      ),
    };
  }
  return { session, error: null };
}
