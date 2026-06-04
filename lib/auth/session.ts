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

// Prefer the configured AUTH_SECRET (required for sessions that survive
// restarts / multiple instances). If it is missing we fall back to a secret
// generated once per process so the app still boots and login works, instead
// of crashing. This is NOT a hardcoded secret — it is random per process — and
// AUTH_SECRET should always be set in production (see Railway Variables).
let fallbackSecret: Uint8Array | null = null;

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (secret) return new TextEncoder().encode(secret);

  if (!fallbackSecret) {
    console.warn(
      "[auth] AUTH_SECRET is not set — using an ephemeral per-process secret. " +
      "Sessions will be invalidated on restart. Set AUTH_SECRET in your environment."
    );
    fallbackSecret = crypto.getRandomValues(new Uint8Array(32));
  }
  return fallbackSecret;
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
