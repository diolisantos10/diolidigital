// GET /api/health
// Lightweight liveness probe for Railway's healthcheck. Intentionally does NO
// database, auth, or env work — it only proves the Node process is up and
// serving HTTP. Railway polls this during a deploy and only switches traffic to
// the new container once it responds 200, so the old container is drained
// gracefully instead of being flagged "crashed".
//
// Keep it dependency-free and always-200. A heavier readiness check (DB, etc.)
// would make transient DB hiccups look like crashes — the opposite of the goal.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ status: "ok" });
}
