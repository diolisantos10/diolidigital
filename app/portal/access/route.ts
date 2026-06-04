// Portal access via secure token — redirects to /portal/client/[clientId]
// after verifying the token resolves to a real client.
// Usage: /portal/access?token=<portalToken>

import { NextRequest, NextResponse } from "next/server";
import { resolvePortalAccess } from "@/lib/auth/portal-guard";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/portal/invalid", request.url));
  }

  const result = await resolvePortalAccess(token);
  if (!result.clientId) {
    return NextResponse.redirect(new URL("/portal/invalid", request.url));
  }

  // Redirect to the actual portal page with the resolved client ID
  // The portal page itself does not expose the internal ID in a meaningful way
  return NextResponse.redirect(
    new URL(`/portal/client/${result.clientId}`, request.url)
  );
}
