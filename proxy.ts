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

    // Forensic log — one line per /agency request, visible in Railway logs.
    // sec-fetch-dest=document → real navigation; =empty → fetch (RSC/Flight).
    const meta = [
      `pathname=${pathname}`,
      `cookiePresent=${Boolean(token)}`,
      `host=${request.headers.get("host")}`,
      `xfProto=${request.headers.get("x-forwarded-proto")}`,
      `xfHost=${request.headers.get("x-forwarded-host")}`,
      `secFetchDest=${request.headers.get("sec-fetch-dest")}`,
      `secFetchMode=${request.headers.get("sec-fetch-mode")}`,
      `authSecretSet=${Boolean(process.env.AUTH_SECRET)}`,
    ].join(" ");

    if (!token) {
      console.log(`[PROXY] ${meta} sessionValid=false reason=no_cookie action=redirect_signin`);
      const signinUrl = request.nextUrl.clone();
      signinUrl.pathname = "/auth/signin";
      signinUrl.search = "";
      return NextResponse.redirect(signinUrl);
    }
    try {
      const { payload } = await jwtVerify(token, getSecret());
      const email = (payload as { email?: string }).email ?? "?";
      console.log(`[PROXY] ${meta} sessionValid=true email=${email} action=next`);
      return NextResponse.next();
    } catch (err) {
      const errInfo = err instanceof Error ? `${err.name}:${err.message}` : String(err);
      console.log(`[PROXY] ${meta} sessionValid=false reason=jwt_verify_failed err=${errInfo} action=redirect_signin_and_delete_cookie`);
      const signinUrl = request.nextUrl.clone();
      signinUrl.pathname = "/auth/signin";
      signinUrl.search = "";
      const response = NextResponse.redirect(signinUrl);
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
