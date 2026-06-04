import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "dioli-session";

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET ?? "";
  return new TextEncoder().encode(secret);
}

// Routes that require an authenticated agency session
const AGENCY_PATTERN = /^\/agency(\/|$)/;
// Routes that are always public
const PUBLIC_PATHS = ["/auth/signin", "/auth/signout", "/portal/", "/api/"];

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Allow public paths through
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Protect agency routes
  if (AGENCY_PATTERN.test(pathname)) {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) {
      return NextResponse.redirect(new URL("/auth/signin", request.url));
    }
    try {
      await jwtVerify(token, getSecret());
      return NextResponse.next();
    } catch {
      // Invalid / expired token — clear and redirect
      const response = NextResponse.redirect(new URL("/auth/signin", request.url));
      response.cookies.delete(SESSION_COOKIE);
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except Next.js internals and static files
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
