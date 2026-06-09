import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "dioli-session";

// Must match the fallback in lib/auth/session.ts — both Edge and Node runtimes
// need the same key. When AUTH_SECRET is set (production) this value is never used.
const DEV_FALLBACK_SECRET = "dioli-dev-fallback-set-AUTH_SECRET-in-production";

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (secret) return new TextEncoder().encode(secret);
  return new TextEncoder().encode(DEV_FALLBACK_SECRET);
}

const AGENCY_PATTERN = /^\/agency(\/|$)/;
const PUBLIC_PATHS = ["/auth/signin", "/auth/signout", "/portal/", "/api/"];

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (AGENCY_PATTERN.test(pathname)) {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) {
      return NextResponse.redirect(new URL("/auth/signin", request.url));
    }
    try {
      await jwtVerify(token, getSecret());
      return NextResponse.next();
    } catch {
      const response = NextResponse.redirect(new URL("/auth/signin", request.url));
      response.cookies.delete(SESSION_COOKIE);
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
