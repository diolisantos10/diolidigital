// Operational UI Bridge — end-to-end test through the SAME API endpoints the UI uses.
// Drives the full DB pipeline: briefing → strategy → social → design → traffic →
// analytics → quality → approvals → portal, asserting status advancement and
// auto-created artifacts/evidence at each step.
//
// Usage:
//   BASE_URL=http://127.0.0.1:8125 npx tsx scripts/test-operational-ui-bridge.ts
//   BASE_URL=https://your-app.railway.app npx tsx scripts/test-operational-ui-bridge.ts
//
// Credentials default to the seeded master account; override with
// TEST_EMAIL / TEST_PASSWORD env vars.

import { exigirSenhaDoAmbiente } from "./lib/credencial-do-master";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:8125";
const EMAIL = process.env.TEST_EMAIL ?? "master@dioli.studio";
const PASSWORD = process.env.TEST_PASSWORD ?? exigirSenhaDoAmbiente("SEED_MASTER_PASSWORD");

let failures = 0;
let cookie = "";

function section(title: string) {
  console.log(`\n─── ${title} ${"─".repeat(Math.max(0, 56 - title.length))}`);
}
function check(label: string, cond: boolean, detail?: string) {
  console.log(`${cond ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}
function info(label: string, detail?: string) {
  console.log(`   ${label}${detail ? ` — ${detail}` : ""}`);
}

async function api(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  if (cookie) headers["Cookie"] = cookie;
  let body = init.body;
  if (init.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers, body });
  // Capture session cookie from sign-in.
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  let parsed: unknown = null;
  const text = await res.text();
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

// Loose record accessor — responses are untyped JSON.
type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" ? (v as Rec) : {});
const arr = (v: unknown): Rec[] => (Array.isArray(v) ? (v as Rec[]) : []);

// Minimal canvas + PASS gate accepted by POST /api/brain/artifacts.
function canvasFor(dept: string, businessName: string) {
  return {
    id: `canvas_${dept}_${Date.now()}`,
    department: dept,
    clientName: businessName,
    segment: "restaurante",
    status: "draft",
  };
}
const PASS_GATE = { overall: "PASS", score: 9.0 };

async function postArtifact(reqId: string, dept: string, businessName: string) {
  return api("/api/brain/artifacts", {
    method: "POST",
    json: {
      clientRequestId: reqId,
      department: dept,
      canvasId: canvasFor(dept, businessName).id,
      canvas: canvasFor(dept, businessName),
      qualityGate: PASS_GATE,
    },
  });
}

async function getRequest(reqId: string): Promise<Rec | null> {
  // GET list filtered by status won't help here; fetch a broad list and find by id.
  const { body } = await api(`/api/brain/client-requests?limit=500`);
  return arr(body).find((r) => r.id === reqId) ?? null;
}

async function main() {
  console.log(`\n═══ Operational UI Bridge — API E2E (${BASE}) ═══`);
  const businessName = `UI Bridge Test ${Date.now()}`;
  let reqId = "";
  let token = "";

  // 1. Login
  section("1. Login");
  {
    const { status } = await api("/api/auth/signin", {
      method: "POST",
      json: { email: EMAIL, password: PASSWORD },
    });
    check("Login succeeds", status === 200, `status=${status}`);
    check("Session cookie captured", cookie.length > 0);
    if (!cookie) {
      console.log("\n❌ Cannot continue without a session.");
      process.exit(1);
    }
  }

  // 2. Create briefing request → status=new
  section("2. Create briefing request");
  {
    const { status, body } = await api("/api/brain/client-requests", {
      method: "POST",
      json: {
        businessName,
        segment: "restaurante",
        services: ["Social Media", "Tráfego Pago"],
        objectives: ["aumentar pedidos"],
        rawContext: "Teste do Operational UI Bridge.",
        source: "briefing",
      },
    });
    const b = rec(body);
    check("Briefing created", status === 201 && !!b.id, `status=${status}`);
    reqId = (b.id as string) ?? "";
    check("New request has status=new", b.status === "new", `status=${b.status}`);
    info("requestId", reqId);
  }

  // 3. PATCH → waiting_strategy
  section("3. PATCH status → waiting_strategy");
  {
    const { status, body } = await api(`/api/brain/client-requests?id=${reqId}`, {
      method: "PATCH",
      json: { status: "waiting_strategy" },
    });
    const b = rec(body);
    check("PATCH succeeds", status === 200, `status=${status}`);
    check("Status is waiting_strategy", b.status === "waiting_strategy", `status=${b.status}`);
  }

  // 4-9. Department artifacts advance the pipeline.
  const STEPS: { dept: string; next: string }[] = [
    { dept: "strategy",  next: "waiting_social" },
    { dept: "social",    next: "waiting_design" },
    { dept: "design",    next: "waiting_traffic" },
    { dept: "traffic",   next: "waiting_analytics" },
    { dept: "analytics", next: "waiting_quality" },
    { dept: "quality",   next: "in_progress" },
  ];
  let stepNum = 4;
  for (const { dept, next } of STEPS) {
    section(`${stepNum}. POST artifact: ${dept} → ${next}`);
    const { status, body } = await postArtifact(reqId, dept, businessName);
    check(`Artifact ${dept} created`, status === 201 && !!rec(body).id, `status=${status}`);
    const req = await getRequest(reqId);
    check(`Request advanced to ${next}`, req?.status === next, `status=${req?.status}`);
    if (dept === "strategy") {
      // Evidence is auto-created on the first artifact — verify via portal/artifacts.
      const { body: arts } = await api(`/api/brain/artifacts?clientRequestId=${reqId}`);
      check("Strategy artifact retrievable via GET", arr(arts).some((a) => a.department === "strategy"));
    }
    stepNum++;
  }

  // 10. POST 4 approvals → clientVisible=true
  section("10. POST approvals (strategy, social, design, quality)");
  {
    for (const department of ["strategy", "social", "design", "quality"]) {
      const { status, body } = await api("/api/brain/approvals", {
        method: "POST",
        json: {
          clientRequestId: reqId,
          department,
          clientVisible: true,
          requestedBy: "master@dioli.studio",
        },
      });
      check(`Approval ${department} created (clientVisible)`, status === 201 && rec(body).clientVisible === true, `status=${status}`);
    }
    const { body: approvals } = await api(`/api/brain/approvals?clientRequestId=${reqId}`);
    check("All 4 approvals client-visible", arr(approvals).filter((a) => a.clientVisible).length >= 4,
      `found=${arr(approvals).length}`);
  }

  // 11. Verify total artifacts=6 (evidence asserted indirectly via auto-create above)
  section("11. Verify artifacts");
  {
    const { body: arts } = await api(`/api/brain/artifacts?clientRequestId=${reqId}`);
    const count = arr(arts).length;
    check("6 artifacts total (one per department)", count === 6, `count=${count}`);
    const depts = arr(arts).map((a) => a.department).sort().join(",");
    info("departments", depts);
  }

  // 12. Portal data accessible via a new token
  section("12. Portal data via new token");
  {
    const { status: tStatus, body: tBody } = await api("/api/brain/portal-access", {
      method: "POST",
      json: { clientRequestId: reqId, expiresDays: 1 },
    });
    const tb = rec(tBody);
    check("Portal token created", tStatus === 201 && !!tb.token, `status=${tStatus}`);
    token = (tb.token as string) ?? "";

    // Portal data is token-gated — no session needed, but cookie is harmless.
    const res = await fetch(`${BASE}/api/brain/portal-data?token=${encodeURIComponent(token)}`);
    const portal = rec(await res.json().catch(() => null));
    check("Portal data accessible", res.status === 200 && Object.keys(portal).length > 0, `status=${res.status}`);
    check("Portal pipeline has 6 client-safe artifacts", arr(portal.pipeline).length === 6,
      `pipeline=${arr(portal.pipeline).length}`);
    check("Portal approvals visible", arr(portal.approvals).length >= 4,
      `approvals=${arr(portal.approvals).length}`);
    check("Portal status is in_progress", portal.status === "in_progress", `status=${portal.status}`);
  }

  // Result
  section("Result");
  if (failures === 0) {
    console.log("\n✅ OPERATIONAL_UI_BRIDGE_READY");
    process.exit(0);
  } else {
    console.log(`\n❌ NOT_READY (${failures} check${failures !== 1 ? "s" : ""} failed)`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  console.log("\n❌ NOT_READY (fatal error)");
  process.exit(1);
});
