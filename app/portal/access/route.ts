// Legacy entry point: /portal/access?token=<token>
// Forwards to the secure token portal page, which validates the token itself
// (PortalAccess: expiry, revocation, scope). The old redirect to the legacy
// /portal/client/[id] page is retired — that page is store-backed and
// unprotected, and must not be the client-facing portal.

import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/portal/invalid", request.url));
  }
  return NextResponse.redirect(
    new URL(`/portal/access/${encodeURIComponent(token)}`, request.url),
  );
}
