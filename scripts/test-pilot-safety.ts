// Client Pilot Safety Sprint — end-to-end API validation against a live server.
//
// Verifies:
//   1. Internal mutation APIs reject unauthenticated callers (401)
//   2. Server-side quality gate rejects FAIL artifacts (422)
//   3. Approval flow: artifact save → evidence auto-created → pipeline advanced
//   4. Portal token: read access + client approval decision persisted
//   5. portal-data clientRequestId bypass requires session
//
// Usage:
//   BASE_URL=http://127.0.0.1:8125 npx tsx scripts/test-pilot-safety.ts
// (server must be running with a seeded DB — see scripts in package.json)

import { credencialDoMaster } from "./lib/credencial-do-master";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:8125";

let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  console.log(`\n─── Client Pilot Safety — API tests (${BASE}) ───────────────\n`);

  // ── 1. Unauthenticated access is rejected ───────────────────────────────────
  const noAuthArtifact = await fetch(`${BASE}/api/brain/artifacts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientRequestId: "x", department: "strategy", canvasId: "x", canvas: {} }),
  });
  check("POST /api/brain/artifacts without session → 401", noAuthArtifact.status === 401, `got ${noAuthArtifact.status}`);

  const noAuthApproval = await fetch(`${BASE}/api/brain/approvals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientRequestId: "x", department: "strategy" }),
  });
  check("POST /api/brain/approvals without session → 401", noAuthApproval.status === 401, `got ${noAuthApproval.status}`);

  const noAuthEvidence = await fetch(`${BASE}/api/brain/evidence`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ department: "strategy", type: "metric", label: "x" }),
  });
  check("POST /api/brain/evidence without session → 401", noAuthEvidence.status === 401, `got ${noAuthEvidence.status}`);

  const noAuthList = await fetch(`${BASE}/api/brain/client-requests`);
  check("GET /api/brain/client-requests without session → 401", noAuthList.status === 401, `got ${noAuthList.status}`);

  const noAuthPortalData = await fetch(`${BASE}/api/brain/portal-data?clientRequestId=anything`);
  check("GET portal-data?clientRequestId= without session → 401 (bypass closed)", noAuthPortalData.status === 401, `got ${noAuthPortalData.status}`);

  // ── 2. Sign in (seeded master user) ─────────────────────────────────────────
  const signin = await fetch(`${BASE}/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credencialDoMaster()),
  });
  const setCookie = signin.headers.get("set-cookie") ?? "";
  const sessionCookie = setCookie.split(";")[0]; // "dioli-session=…"
  check("Signin master@dioli.studio → session cookie", signin.ok && sessionCookie.startsWith("dioli-session="), `status ${signin.status}`);
  const auth = { "Content-Type": "application/json", Cookie: sessionCookie };

  // ── 3. Public briefing submit creates the pilot request ─────────────────────
  const createReq = await fetch(`${BASE}/api/brain/client-requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      businessName: "Sushi Cazza (pilot safety test)",
      segment: "restaurante japonês premium",
      services: ["Social Media"],
      objectives: ["mais pedidos no delivery"],
      source: "briefing",
    }),
  });
  const reqRecord = await createReq.json();
  check("Public POST client-requests (briefing submit) → 201", createReq.status === 201 && !!reqRecord.id, `status ${createReq.status}`);
  const reqId: string = reqRecord.id;

  // ── 4. Server-side quality gate: FAIL → 422 ─────────────────────────────────
  const failGate = await fetch(`${BASE}/api/brain/artifacts`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      clientRequestId: reqId, department: "strategy", canvasId: "cv_fail_test",
      canvas: { clientName: "Sushi Cazza" },
      qualityGate: { overall: "FAIL", failCount: 2 },
    }),
  });
  const failBody = await failGate.json().catch(() => ({} as { error?: string }));
  check("POST artifacts with FAIL quality gate → 422", failGate.status === 422, `got ${failGate.status}: ${failBody.error ?? ""}`);

  // ── 5. PASS artifact saves, auto-creates evidence, advances pipeline ────────
  const okArtifact = await fetch(`${BASE}/api/brain/artifacts`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      clientRequestId: reqId, department: "strategy", canvasId: "cv_pass_test",
      canvas: { clientName: "Sushi Cazza", segment: "restaurante" },
      qualityGate: { overall: "PASS", passCount: 7, failCount: 0 },
    }),
  });
  check("POST artifacts with PASS gate (session) → 201", okArtifact.status === 201, `got ${okArtifact.status}`);

  const evidence = await fetch(`${BASE}/api/brain/evidence?clientRequestId=${reqId}`, { headers: auth });
  const evidenceItems = (await evidence.json()) as Array<{ label: string }>;
  check(
    "Evidence auto-created on approval (strategy_approved)",
    Array.isArray(evidenceItems) && evidenceItems.some((e) => e.label === "strategy_approved"),
    `found ${Array.isArray(evidenceItems) ? evidenceItems.length : 0} item(s)`,
  );

  // ── 6. Approval request (client-visible) + portal token ─────────────────────
  const approval = await fetch(`${BASE}/api/brain/approvals`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ clientRequestId: reqId, department: "strategy", clientVisible: true }),
  });
  const approvalRecord = await approval.json();
  check("POST approvals (session, clientVisible) → 201", approval.status === 201 && !!approvalRecord.id);

  const portalAccess = await fetch(`${BASE}/api/brain/portal-access`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ clientRequestId: reqId }),
  });
  const accessRecord = await portalAccess.json();
  check("POST portal-access (session) → 201 + token", portalAccess.status === 201 && !!accessRecord.token);
  const token: string = accessRecord.token;

  // ── 7. Portal token reads pipeline + approvals ───────────────────────────────
  const portalData = await fetch(`${BASE}/api/brain/portal-data?token=${token}`);
  const portal = await portalData.json();
  check("GET portal-data?token → 200", portalData.status === 200);
  check("Portal pipeline contains approved strategy step",
    Array.isArray(portal.pipeline) && portal.pipeline.some((p: { departmentKey: string }) => p.departmentKey === "strategy"));
  check("Pipeline status advanced to waiting_social (server-side)", portal.status === "waiting_social", `got ${portal.status}`);
  check("Portal shows pending approval",
    Array.isArray(portal.approvals) && portal.approvals.some((a: { id: string; status: string }) => a.id === approvalRecord.id && a.status === "pending"));

  // ── 8. Client decides via portal token ──────────────────────────────────────
  const decide = await fetch(`${BASE}/api/portal/approvals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token, approvalRequestId: approvalRecord.id, action: "approve",
      comment: "Aprovado! Podem seguir.", authorName: "Kenji (Sushi Cazza)",
    }),
  });
  const decided = await decide.json();
  check("POST /api/portal/approvals (token) approve → 200", decide.status === 200 && decided.status === "approved", `got ${decide.status}`);

  const decideAgain = await fetch(`${BASE}/api/portal/approvals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, approvalRequestId: approvalRecord.id, action: "reject" }),
  });
  check("Second decision on same approval → 409", decideAgain.status === 409, `got ${decideAgain.status}`);

  // ── 9. Agency sees the client decision ──────────────────────────────────────
  const agencyView = await fetch(`${BASE}/api/brain/approvals?clientRequestId=${reqId}`, { headers: auth });
  const agencyApprovals = (await agencyView.json()) as Array<{
    id: string; status: string; reviewedBy: string | null;
    comments: Array<{ authorRole: string; body: string }>;
  }>;
  const decidedApproval = agencyApprovals.find((a) => a.id === approvalRecord.id);
  check("Agency sees approval status = approved", decidedApproval?.status === "approved");
  check("Agency sees client identity in reviewedBy", (decidedApproval?.reviewedBy ?? "").includes("client:"), decidedApproval?.reviewedBy ?? "");
  check("Client comment persisted (authorRole=client)",
    !!decidedApproval?.comments.some((c) => c.authorRole === "client" && c.body.includes("Aprovado")));

  // ── 10. Invalid token is rejected ────────────────────────────────────────────
  const badToken = await fetch(`${BASE}/api/portal/approvals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "invalid-token", approvalRequestId: approvalRecord.id, action: "approve" }),
  });
  check("Decision with invalid token → 403", badToken.status === 403, `got ${badToken.status}`);

  console.log(`\n${failures === 0 ? "✅ PILOT SAFETY PASS" : `❌ PILOT SAFETY FAIL (${failures} failures)`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
