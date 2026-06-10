import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { AgencyRole } from "@/lib/agency/roles";
import { getAuthSecret } from "./secret";

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: AgencyRole;
  workspaceId: string;
  clientId?: string;
  exp?: number;
  iat?: number;
}

export const SESSION_COOKIE = "dioli-session";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

export async function createSession(payload: Omit<SessionPayload, "exp" | "iat">): Promise<void> {
  const token = await new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getAuthSecret());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, getAuthSecret());
    return payload as unknown as SessionPayload;
  } catch (err) {
    // Re-throw config errors in production so they surface instead of silently failing.
    if (
      process.env.NODE_ENV === "production" &&
      err instanceof Error &&
      err.message.includes("AUTH_SECRET")
    ) {
      throw err;
    }
    return null;
  }
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  // Pass the same path used during set() to ensure the correct cookie is targeted.
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}

export function isAgencyRole(role: string): role is AgencyRole {
  return [
    "master",
    "project_manager",
    "social_staff",
    "design_staff",
    "ads_staff",
  ].includes(role);
}
