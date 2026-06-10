import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getAuthSecret } from "@/lib/auth/secret";

const SESSION_COOKIE = "dioli-session";
const AGENCY_PATTERN = /^\/agency(\/|$)/;
const PUBLIC_PATHS = ["/auth/signin", "/auth/signout", "/portal/", "/api/"];

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (AGENCY_PATTERN.test(pathname)) {
    // Obtain signing key — throws in production if AUTH_SECRET is not set.
    let secret: Uint8Array;
    try {
      secret = getAuthSecret();
    } catch (configErr) {
      console.error("[AUTH] Config error:", configErr);
      return new NextResponse(
        "Authentication misconfigured: AUTH_SECRET is not set in Railway Variables.",
        { status: 500 }
      );
    }

    const token = request.cookies.get(SESSION_COOKIE)?.value;

    if (process.env.AUTH_DEBUG === "true") {
      console.log(
        `[PROXY] pathname=${pathname}`,
        `cookiePresent=${Boolean(token)}`,
        `host=${request.headers.get("host")}`,
        `xfProto=${request.headers.get("x-forwarded-proto")}`,
        `secFetchDest=${request.headers.get("sec-fetch-dest")}`,
        `authSecretSet=${Boolean(process.env.AUTH_SECRET)}`
      );
    }

    if (!token) {
      return buildSigninRedirect(request, pathname);
    }

    try {
      await jwtVerify(token, secret);
      return NextResponse.next();
    } catch {
      // JWT invalid or expired — clear cookie and send to signin.
      const response = buildSigninRedirect(request, pathname);
      response.cookies.set(SESSION_COOKIE, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 0,
        path: "/",
      });
      return response;
    }
  }

  return NextResponse.next();
}

function buildSigninRedirect(request: NextRequest, fromPath: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/auth/signin";
  // Preserve the intended destination so the signin page can redirect back.
  // Only /agency/* paths are allowed to prevent open-redirect attacks.
  if (AGENCY_PATTERN.test(fromPath)) {
    url.searchParams.set("callbackUrl", fromPath);
  } else {
    url.search = "";
  }
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
