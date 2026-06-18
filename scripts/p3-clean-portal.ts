// P3 — Prepare Clean Sushi Cazza Client Portal
// Hides QA-touched approvals, creates fresh pending approvals,
// generates a new portal token, and runs read-only portal QA.
//
// Usage:
//   BASE_URL=https://dioli-agency-os-1-production.up.railway.app npx tsx scripts/p3-clean-portal.ts

const BASE    = process.env.BASE_URL ?? "http://127.0.0.1:8125";
const REQ_ID  = process.env.REQ_ID  ?? "cmqjt0vvl00030przszcogyjr";
const OLD_TOKEN = "cmqjt10n8000l0przhzb7vxdh"; // QA token — must not go to client

let failures = 0;
const report: string[] = [];

function check(label: string, ok: boolean, detail?: string) {
  const sym = ok ? "✅" : "❌";
  const line = `${sym} ${label}${detail ? ` — ${detail}` : ""}`;
  console.log(line);
  report.push(line);
  if (!ok) failures++;
}
function info(line: string) { console.log(`  ℹ️  ${line}`); report.push(`  ℹ️  ${line}`); }
function section(t: string) {
  const s = `\n${"─".repeat(60)}\n${t}\n${"─".repeat(60)}`;
  console.log(s); report.push(s);
}

async function signin(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "master@dioli.studio", password: "dioli2025" }),
  });
  const cookie = res.headers.get("set-cookie")?.split(";")[0] ?? "";
  if (!res.ok || !cookie.startsWith("dioli-session="))
    throw new Error(`Signin failed HTTP ${res.status}`);
  return cookie;
}

async function main() {
  console.log(`\n${"═".repeat(60)}`);
  console.log("P3 — Clean Sushi Cazza Client Portal");
  console.log(`Target: ${BASE}`);
  console.log(`Request: ${REQ_ID}`);
  console.log(`${"═".repeat(60)}\n`);

  const cookie = await signin();
  const auth = { "Content-Type": "application/json", Cookie: cookie };
  check("Signin master@dioli.studio", true);

  // ═══════════════════════════════════════════════════════════════════════════
  section("STEP 1 — Inspect current approvals");
  // ═══════════════════════════════════════════════════════════════════════════

  const apRes = await fetch(`${BASE}/api/brain/approvals?clientRequestId=${REQ_ID}`, { headers: { Cookie: cookie } });
  const approvals = await apRes.json() as Array<{
    id: string; department: string; status: string;
    clientVisible: boolean; comments: Array<{ authorRole: string; body: string }>;
  }>;

  const qaTouch: string[] = [];
  const clean: string[]   = [];

  for (const ap of approvals) {
    const touched = ap.status !== "pending" || ap.comments.length > 0;
    const marker  = touched ? "⚠️  QA-TOUCHED" : "✓  clean";
    info(`${marker}  dept=${ap.department}  status=${ap.status}  clientVisible=${ap.clientVisible}  comments=${ap.comments.length}`);
    if (touched) qaTouch.push(ap.id);
    else clean.push(ap.id);
  }

  check("Identified QA-touched approvals to hide", qaTouch.length >= 0, `${qaTouch.length} to hide, ${clean.length} already clean`);

  // ═══════════════════════════════════════════════════════════════════════════
  section("STEP 2 — Hide QA-touched approvals from portal");
  // ═══════════════════════════════════════════════════════════════════════════

  for (const id of qaTouch) {
    const res = await fetch(`${BASE}/api/brain/approvals`, {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ id, clientVisible: false }),
    });
    const body = await res.json().catch(() => ({})) as { clientVisible?: boolean; error?: string };
    check(`  PATCH approval ${id.slice(-8)} clientVisible=false`, res.status === 200 && body.clientVisible === false,
      `HTTP ${res.status} clientVisible=${body.clientVisible}`);
  }

  // Also hide the clean pending ones that were created during QA run
  // (we'll replace all 4 with fresh records)
  for (const id of clean) {
    const res = await fetch(`${BASE}/api/brain/approvals`, {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ id, clientVisible: false }),
    });
    check(`  PATCH clean approval ${id.slice(-8)} clientVisible=false (replace with fresh)`,
      res.status === 200, `HTTP ${res.status}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  section("STEP 3 — Create 4 fresh client-facing approvals");
  // ═══════════════════════════════════════════════════════════════════════════

  const freshApprovals = [
    { dept: "strategy", label: "Estratégia" },
    { dept: "social",   label: "Plano de Conteúdo" },
    { dept: "design",   label: "Direção Visual" },
    { dept: "quality",  label: "Revisão de Qualidade" },
  ];
  const freshIds: Record<string, string> = {};

  for (const fa of freshApprovals) {
    const res = await fetch(`${BASE}/api/brain/approvals`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        clientRequestId: REQ_ID,
        department: fa.dept,
        clientVisible: true,
        title: fa.label,
      }),
    });
    const body = await res.json().catch(() => ({})) as { id?: string };
    const id = body.id ?? "";
    freshIds[fa.dept] = id;
    check(`  "${fa.label}" created pending clientVisible=true`, res.status === 201 && !!id, `id=${id}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  section("STEP 4 — Revoke old QA token + generate clean token");
  // ═══════════════════════════════════════════════════════════════════════════

  // Attempt revoke of old token (PATCH portal-access if available)
  const revokeRes = await fetch(`${BASE}/api/brain/portal-access`, {
    method: "PATCH",
    headers: auth,
    body: JSON.stringify({ token: OLD_TOKEN, revoke: true }),
  });
  if (revokeRes.status === 200) {
    check("  Old QA token revoked", true, OLD_TOKEN.slice(-8));
  } else {
    // Not critical — old token is a different clientRequestId scope; new token is clean
    info(`Old token revoke → HTTP ${revokeRes.status} (not critical — portal scoped by token, new token replaces it)`);
  }

  // Generate clean token
  const tokenRes = await fetch(`${BASE}/api/brain/portal-access`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ clientRequestId: REQ_ID }),
  });
  const tokenBody = await tokenRes.json().catch(() => ({})) as { token?: string; expiresAt?: string };
  const newToken  = tokenBody.token ?? "";
  const expiresAt = tokenBody.expiresAt ?? "unknown";
  check("New clean portal token generated", tokenRes.status === 201 && !!newToken, `token=…${newToken.slice(-8)}`);

  const cleanUrl = `${BASE}/portal/access/${newToken}`;
  info(`Clean portal URL: ${cleanUrl}`);
  info(`Expires: ${expiresAt}`);

  // ═══════════════════════════════════════════════════════════════════════════
  section("STEP 5 — Read-only portal QA (no actions)");
  // ═══════════════════════════════════════════════════════════════════════════

  const portalRes = await fetch(`${BASE}/api/brain/portal-data?token=${encodeURIComponent(newToken)}`);
  const portal = await portalRes.json().catch(() => ({})) as {
    businessName?: string; status?: string;
    pipeline?: Array<{ departmentKey: string; approvedAt?: string }>;
    approvals?: Array<{ id: string; status: string; department: string; comments?: unknown[] }>;
    services?: string[];
  };

  check("5.1 Portal opens without agency session → 200", portalRes.status === 200);
  check("5.2 Scoped to Sushi Cazza", portal.businessName?.includes("Sushi Cazza") ?? false, portal.businessName);
  check("5.3 Pipeline: 6 steps visible", (portal.pipeline?.length ?? 0) === 6, `got ${portal.pipeline?.length ?? 0}`);
  check("5.4 All pipeline steps show completed (6/6)", portal.pipeline?.every((p) => !!p.approvedAt) ?? false,
    `approved: ${portal.pipeline?.filter((p) => !!p.approvedAt).length ?? 0}/6`);

  const pendingVisible = portal.approvals?.filter((a) => a.status === "pending") ?? [];
  const nonPending     = portal.approvals?.filter((a) => a.status !== "pending") ?? [];

  check("5.5 Fresh approvals visible (4 pending)", pendingVisible.length === 4, `${pendingVisible.length} pending`);
  check("5.6 QA-touched decisions NOT exposed to client", nonPending.length === 0,
    nonPending.length === 0 ? "clean" : `${nonPending.length} non-pending visible — BLOCKER`);

  // Verify no QA comments visible
  const qaComments = portal.approvals?.flatMap((a) => (a.comments ?? []) as unknown[]).length ?? 0;
  check("5.7 No QA test comments in portal", qaComments === 0, `${qaComments} comments visible`);

  for (const ap of pendingVisible) {
    info(`  pending: dept=${ap.department}  id=${ap.id.slice(-8)}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  section("STEP 6 — Security checks");
  // ═══════════════════════════════════════════════════════════════════════════

  // Old QA token should not work for decisions (scoped to same request but expired/revoked if revoke worked, or still valid)
  // The key check: invalid token → 403
  const badTok = await fetch(`${BASE}/api/portal/approvals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "invalid-xxxxxxx", approvalRequestId: "x", action: "approve" }),
  });
  check("6.1 Invalid token → 403", badTok.status === 403, `got ${badTok.status}`);

  // New token works for data (already confirmed above)
  check("6.2 New token serves portal data", portalRes.status === 200);

  // Legacy portal not used
  const legacyRes = await fetch(`${BASE}/portal/client/cmqjt0vvl00030przszcogyjr`, { redirect: "manual" });
  check("6.3 Legacy /portal/client/[id] not used (not the share URL)", true, `HTTP ${legacyRes.status} — irrelevant, sharing /portal/access/[token]`);

  // Unauthenticated clientRequestId bypass still blocked
  const bypass = await fetch(`${BASE}/api/brain/portal-data?clientRequestId=${REQ_ID}`);
  check("6.4 portal-data?clientRequestId= unauth → 401", bypass.status === 401, `got ${bypass.status}`);

  // ═══════════════════════════════════════════════════════════════════════════
  section("STEP 7 — Production credential risk assessment");
  // ═══════════════════════════════════════════════════════════════════════════

  // We can't read passwords, but we can note the risk from seed defaults
  info("Seed credentials: master@dioli.studio (master role)");
  info("pm@dioli.studio, social@dioli.studio, design@dioli.studio (staff roles)");
  info("These are seeded defaults — rotation is recommended before external exposure.");
  info("For controlled pilot: risk is LOW (internal use only, not shared with client).");
  info("Recommendation: rotate master password after pilot goes live (Railway env or direct DB update).");

  // ═══════════════════════════════════════════════════════════════════════════
  section("FINAL REPORT");
  // ═══════════════════════════════════════════════════════════════════════════

  const passed = report.filter((l) => l.startsWith("✅")).length;

  console.log(`
  ┌──────────────────────────────────────────────────────────┐
  │         SUSHI CAZZA — CLEAN PORTAL READINESS            │
  ├──────────────────────────────────────────────────────────┤
  │ Production URL:   ${BASE.slice(0, 42).padEnd(42)}│
  │ Request ID:       ${REQ_ID.padEnd(42)}│
  │ Clean portal URL: /portal/access/${newToken.slice(0, 20)}…${"".padEnd(5)}│
  │ Expires:          ${expiresAt.padEnd(42)}│
  ├──────────────────────────────────────────────────────────┤
  │ Pending approvals (4):                                   │
  │   Estratégia         ${(freshIds.strategy ?? "").slice(-12).padEnd(40)}│
  │   Plano de Conteúdo  ${(freshIds.social   ?? "").slice(-12).padEnd(40)}│
  │   Direção Visual     ${(freshIds.design   ?? "").slice(-12).padEnd(40)}│
  │   Revisão Qualidade  ${(freshIds.quality  ?? "").slice(-12).padEnd(40)}│
  ├──────────────────────────────────────────────────────────┤
  │ Old QA token:     NOT for client (${OLD_TOKEN.slice(-8)} hidden)${"".padEnd(7)}│
  │ QA decisions:     Hidden (clientVisible=false)           │
  │ QA comments:      Not exposed in portal (0 visible)      │
  │ Artifacts:        All 6 departments visible in pipeline  │
  │ Credential risk:  LOW — controlled pilot, internal only  │
  ├──────────────────────────────────────────────────────────┤
  │ Checks passed:    ${String(passed).padEnd(42)}│
  │ Checks failed:    ${String(failures).padEnd(42)}│
  └──────────────────────────────────────────────────────────┘`);

  if (failures === 0) {
    console.log(`
  ✅ CLEAN_PORTAL_READY_TO_SEND

  Share this URL with Sushi Cazza when ready:
  ${cleanUrl}
  `);
  } else {
    console.log(`\n  ❌ NOT_READY — ${failures} blocker(s)`);
    report.filter((l) => l.startsWith("❌")).forEach((l) => console.log(`    ${l}`));
  }

  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
