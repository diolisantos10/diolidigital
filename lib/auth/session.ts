import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { AgencyRole } from "@/lib/agency/roles";

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: AgencyRole;
  workspaceId: string;
  clientId?: string;
  exp?: number;
}

const SESSION_COOKIE = "dioli-session";
const SESSION_DURATION_DAYS = 7;

// Must match the fallback in proxy.ts — Edge middleware and Node server actions
// share no module state, so both must agree on the same literal string.
// When AUTH_SECRET is set (production) this value is never used.
const DEV_FALLBACK_SECRET = "dioli-dev-fallback-set-AUTH_SECRET-in-production";

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (secret) return new TextEncoder().encode(secret);

  console.warn(
    "[auth] AUTH_SECRET is not set — using static dev fallback. " +
    "Set AUTH_SECRET in Railway Variables for production security."
  );
  return new TextEncoder().encode(DEV_FALLBACK_SECRET);
}

export async function createSession(payload: Omit<SessionPayload, "exp">): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);
  const token = await new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export function isAgencyRole(role: string): role is AgencyRole {
  return ["master", "project_manager", "social_staff", "design_staff", "ads_staff"].includes(role);
}
