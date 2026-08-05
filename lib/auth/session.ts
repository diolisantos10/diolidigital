import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { ROLE_PERMISSIONS, type AgencyRole } from "@/lib/agency/roles";
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

/**
 * O papel é um papel conhecido da agência?
 *
 * ⚠️ A lista NÃO é escrita à mão aqui, e isso é o conserto — não estilo.
 * Ela era, e omitia `executivo_comercial`: o papel existia em
 * `lib/agency/roles.ts`, não existia aqui, e o login (que caía em "master"
 * quando não reconhecia) entregava JWT de MASTER a quem tivesse esse papel.
 * Acesso a `/api/admin/reset`, `/api/ai-keys`, `/api/meta/config` (App Secret)
 * e `/api/backup` — por uma linha esquecida numa cópia de lista.
 *
 * Derivando de `ROLE_PERMISSIONS` (o mapa que o TypeScript OBRIGA a ter uma
 * entrada por `AgencyRole`), papel novo em `roles.ts` já nasce reconhecido
 * aqui. Não há mais duas listas para manter em sincronia.
 */
export function isAgencyRole(role: string): role is AgencyRole {
  return Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, role);
}
