// POST /api/meta/publish
// A thin HTTP wrapper over the publish interface, for callers that prefer an
// API to a direct server-side import (e.g. internal tools, manual testing).
// The Planner / autonomous engine can also import publishPost() directly from
// "@/lib/integrations/meta".
//
// Body: PublishInput (connectionId, platform, format?, caption?, mediaUrl?)

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { publishPost } from "@/lib/integrations/meta/client";
import type { PublishInput } from "@/lib/integrations/meta/types";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as PublishInput;
  if (!body?.connectionId || !body?.platform) {
    return NextResponse.json({ error: "connectionId e platform são obrigatórios" }, { status: 400 });
  }

  const result = await publishPost(session.workspaceId, body);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
