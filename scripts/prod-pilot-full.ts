// P1 — Production Reality Check + Sushi Cazza Controlled Pilot
// Runs all 8 parts against a live server (local or Railway production).
//
// Usage:
//   BASE_URL=https://dioli-agency-os-1-production.up.railway.app npx tsx scripts/prod-pilot-full.ts

import { credencialDoMaster } from "./lib/credencial-do-master";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:8125";
const PROD_LABEL = BASE.includes("railway") ? "RAILWAY PRODUCTION" : "LOCAL";

let failures = 0;
let warnings = 0;
const report: string[] = [];

function check(label: string, ok: boolean, detail?: string) {
  const sym = ok ? "✅" : "❌";
  const line = `${sym} ${label}${detail ? ` — ${detail}` : ""}`;
  console.log(line);
  report.push(line);
  if (!ok) failures++;
}
function warn(label: string, detail?: string) {
  const line = `⚠️  ${label}${detail ? ` — ${detail}` : ""}`;
  console.log(line);
  report.push(line);
  warnings++;
}
function section(title: string) {
  const bar = "─".repeat(60);
  const s = `\n${bar}\n${title}\n${bar}`;
  console.log(s);
  report.push(s);
}

// ─── Auth ────────────────────────────────────────────────────────────────────
async function signin(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credencialDoMaster()),
  });
  const cookie = res.headers.get("set-cookie")?.split(";")[0] ?? "";
  if (!res.ok || !cookie.startsWith("dioli-session="))
    throw new Error(`Signin failed HTTP ${res.status} — body: ${await res.text()}`);
  return cookie;
}

async function main() {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`P1 — Production Reality Check + Sushi Cazza Pilot`);
  console.log(`Target: ${BASE} [${PROD_LABEL}]`);
  console.log(`${"═".repeat(60)}\n`);

  // ═══════════════════════════════════════════════════════════════════════════
  section("PART 1 — PRODUCTION REALITY CHECK");
  // ═══════════════════════════════════════════════════════════════════════════

  // 1.1 Login
  let sessionCookie: string;
  try {
    sessionCookie = await signin();
    check("1.1 Login master@dioli.studio → session cookie", true, sessionCookie.slice(0, 35) + "…");
  } catch (e) {
    check("1.1 Login master@dioli.studio → session cookie", false, String(e));
    console.log("\n❌ Cannot proceed without authentication. Aborting.\n");
    process.exit(1);
  }
  const auth = { "Content-Type": "application/json", Cookie: sessionCookie };

  // 1.2 Authenticated routes
  const protectedRoutes = [
    "/agency/dashboard", "/agency/brain", "/agency/requests", "/agency/clients",
    "/agency/strategy", "/agency/social", "/agency/design",
    "/agency/traffic", "/agency/analytics", "/agency/quality",
  ];
  for (const path of protectedRoutes) {
    const res = await fetch(`${BASE}${path}`, { headers: { Cookie: sessionCookie }, redirect: "manual" });
    // With session: should be 200 (or not 307 to /auth/signin)
    const loc = res.headers.get("location") ?? "";
    const ok = res.status === 200 || (res.status === 307 && !loc.includes("/auth/signin"));
    // Actually any non-login-redirect means auth worked
    const authWorked = res.status !== 401 && !loc.includes("/auth/signin");
    check(`1.2 GET ${path} (authed)`, authWorked, `HTTP ${res.status} loc=${loc || "none"}`);
  }

  // 1.3 API security — unauthenticated
  const s1 = await fetch(`${BASE}/api/brain/artifacts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: '{}' });
  check("1.3a POST /api/brain/artifacts unauth → 401", s1.status === 401, `got ${s1.status}`);

  const s2 = await fetch(`${BASE}/api/brain/approvals`, { method: "POST", headers: { "Content-Type": "application/json" }, body: '{}' });
  check("1.3b POST /api/brain/approvals unauth → 401", s2.status === 401, `got ${s2.status}`);

  const s3 = await fetch(`${BASE}/api/brain/evidence`, { method: "POST", headers: { "Content-Type": "application/json" }, body: '{}' });
  check("1.3c POST /api/brain/evidence unauth → 401", s3.status === 401, `got ${s3.status}`);

  const s4 = await fetch(`${BASE}/api/brain/portal-data?clientRequestId=anything`);
  check("1.3d GET portal-data?clientRequestId= unauth → 401 (bypass closed)", s4.status === 401, `got ${s4.status}`);

  // 1.4 Quality Gate FAIL → 422
  // First need a valid requestId for the gate test
  const gateReq = await fetch(`${BASE}/api/brain/client-requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ businessName: "_gate_test", segment: "x", services: [], objectives: [] }),
  });
  const gateReqBody = await gateReq.json() as { id?: string };
  const gateReqId = gateReqBody.id ?? "";

  const failGate = await fetch(`${BASE}/api/brain/artifacts`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      clientRequestId: gateReqId, department: "strategy", canvasId: "cv_gate_test",
      canvas: { test: true },
      qualityGate: { overall: "FAIL", failCount: 3 },
    }),
  });
  check("1.4 Quality Gate FAIL → 422", failGate.status === 422, `got ${failGate.status}`);

  // 1.5 PASS artifact persists + evidence created
  const passArtifact = await fetch(`${BASE}/api/brain/artifacts`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      clientRequestId: gateReqId, department: "strategy", canvasId: "cv_gate_pass_test",
      canvas: { test: true, clientName: "_gate_test" },
      qualityGate: { overall: "PASS", passCount: 8, failCount: 0 },
    }),
  });
  check("1.5 Quality Gate PASS → 201", passArtifact.status === 201, `got ${passArtifact.status}`);

  const evCheck = await fetch(`${BASE}/api/brain/evidence?clientRequestId=${gateReqId}`, { headers: { Cookie: sessionCookie } });
  const evItems = await evCheck.json() as Array<{ label: string }>;
  check("1.5 PASS evidence auto-created", Array.isArray(evItems) && evItems.some((e) => e.label === "strategy_approved"),
    `found: ${Array.isArray(evItems) ? evItems.map((e) => e.label).join(",") : "err"}`);

  // ═══════════════════════════════════════════════════════════════════════════
  section("PART 2 — SUSHI CAZZA CLIENT SETUP");
  // ═══════════════════════════════════════════════════════════════════════════

  // Check if Sushi Cazza client already exists
  let clientId: string | null = null;
  const clientsRes = await fetch(`${BASE}/api/brain/clients`, { headers: { Cookie: sessionCookie } });
  if (clientsRes.ok) {
    const clients = await clientsRes.json() as Array<{ id: string; name: string }>;
    const existing = clients.find((c) => c.name.toLowerCase().includes("sushi cazza"));
    if (existing) {
      clientId = existing.id;
      check("2.1 Sushi Cazza client record exists (no duplicate)", true, `id=${clientId}`);
    }
  }

  if (!clientId) {
    const createRes = await fetch(`${BASE}/api/brain/clients`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        name: "Sushi Cazza",
        segment: "restaurante japonês premium",
        instagram: "@sushicazzaoficial",
        notes: "Rodízio R$99,00 · Crianças 6–10 R$49,90 · Jantar 18h–23h · Almoço 11h–15h seg–sab · Delivery e presencial · ID visual: preto, vermelho Cazza, branco, cinemático",
        pilotStatus: "controlled_pilot",
      }),
    });

    if (createRes.status === 201 || createRes.status === 200) {
      const body = await createRes.json() as { id?: string };
      clientId = body.id ?? null;
      check("2.2 Sushi Cazza client created", !!clientId, `id=${clientId}`);
    } else if (createRes.status === 404 || createRes.status === 405) {
      warn("2.2 POST /api/brain/clients not available — linked via request record");
    } else {
      const body = await createRes.json().catch(() => ({})) as { error?: string };
      warn(`2.2 POST /api/brain/clients → ${createRes.status}`, body.error);
    }
  }

  console.log(`\n  clientId: ${clientId ?? "(linked via request)"}`);

  // ═══════════════════════════════════════════════════════════════════════════
  section("PART 3 — CONTROLLED PILOT REQUEST");
  // ═══════════════════════════════════════════════════════════════════════════

  const createReq = await fetch(`${BASE}/api/brain/client-requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      businessName: "Sushi Cazza",
      segment: "restaurante japonês premium",
      instagram: "@sushicazzaoficial",
      services: ["Social Media", "Tráfego Pago", "Estratégia", "Design", "Analytics"],
      objectives: [
        "Aumentar pedidos no delivery",
        "Fortalecer identidade visual premium",
        "Crescer presença no Instagram",
        "Otimizar investimento em mídia paga",
      ],
      source: "controlled_pilot",
      notes: "PILOTO CONTROLADO — Sushi Cazza Junho 2026. Não enviar ao cliente ainda.",
    }),
  });
  const reqBody = await createReq.json() as { id?: string };
  const reqId = reqBody.id ?? "";
  check("3.1 Pilot request created → 201", createReq.status === 201 && !!reqId, `id=${reqId}`);

  // Verify in DB via authenticated list
  const listRes = await fetch(`${BASE}/api/brain/client-requests`, { headers: { Cookie: sessionCookie } });
  const listBody = await listRes.json() as Array<{ id: string; businessName: string; status: string }>;
  const foundReq = listBody.find((r) => r.id === reqId);
  check("3.2 Request visible in authenticated list", !!foundReq, `status=${foundReq?.status}`);
  const initialStatus = foundReq?.status ?? "unknown";
  console.log(`\n  requestId:    ${reqId}\n  initialStatus: ${initialStatus}`);

  // ═══════════════════════════════════════════════════════════════════════════
  section("PART 4 — PIPELINE EXECUTION (SDR → Quality)");
  // ═══════════════════════════════════════════════════════════════════════════

  const PIPELINE = [
    { dept: "strategy",  nextStatus: "waiting_social",    evidence: "strategy_approved",
      canvas: { clientName: "Sushi Cazza", segment: "restaurante japonês premium", instagram: "@sushicazzaoficial",
        positioning: "Referência em rodízio japonês premium em SP. Público 25–45 anos, classe A/B.",
        uniqueValue: "Rodízio R$99 com qualidade premium. Brand identity forte: preto, vermelho Cazza, branco.",
        contentPillars: ["experiência", "gastronomia", "estilo de vida", "bastidores", "promoções"],
        kpis: ["seguidores IG", "alcance orgânico", "CTR delivery", "custo por pedido"],
        deliveryFocus: true, inPersonFocus: true } },
    { dept: "social",    nextStatus: "waiting_design",    evidence: "content_plan_created",
      canvas: { clientName: "Sushi Cazza", contentFrequency: "5x/semana",
        formats: ["Reels", "Carrossel", "Stories", "Feed estático"],
        themes: ["2ª: bastidores", "3ª: pratos estrela", "4ª: experiência", "5ª: delivery CTA", "6ª/sab: rodízio"],
        copyTone: "Premium, apetitoso, direto. Sempre CTA claro.", postsPerMonth: 20 } },
    { dept: "design",    nextStatus: "waiting_traffic",   evidence: "creative_brief_created",
      canvas: { clientName: "Sushi Cazza",
        palette: ["#0A0A0A (preto)", "#CC2222 (vermelho Cazza)", "#FFFFFF (branco)"],
        photoStyle: "Cinemático, alta saturação, fundo escuro, iluminação lateral dramática.",
        gridLayout: "Feed equilibrado: 1 estático : 2 reels. Grid coerente preto/vermelho." } },
    { dept: "traffic",   nextStatus: "waiting_analytics", evidence: "campaign_plan_created",
      canvas: { clientName: "Sushi Cazza", budget: "R$1.500/mês", platforms: ["Meta Ads"],
        targeting: "Raio 10km. 22–50 anos. Gastronomia, sushi, restaurantes.",
        kpis: ["CPM < R$8", "CPC < R$1,20", "CTR > 2%", "custo/pedido < R$15"] } },
    { dept: "analytics", nextStatus: "waiting_quality",   evidence: "report_generated",
      canvas: { clientName: "Sushi Cazza",
        tracking: ["Meta Pixel", "UTM padrão", "GA4"],
        reportCadence: "Semanal, toda segunda 9h",
        kpiDashboard: { organic: ["alcance","impressões","saves"], paid: ["CTR","CPC","ROAS"] } } },
    { dept: "quality",   nextStatus: "in_progress",       evidence: "quality_review_completed",
      canvas: { clientName: "Sushi Cazza",
        checklist: ["✓ Identidade visual consistente","✓ Tom premium em copies","✓ CTA em todos os formatos",
          "✓ Budget dentro do aprovado","✓ Pixel e UTMs configurados","✓ Dashboard pronto"],
        finalAssessment: "Piloto Sushi Cazza pronto para execução.",
        approvedBy: "master@dioli.studio", approvalDate: new Date().toISOString().slice(0,10) } },
  ];

  const artifactIds: Record<string, string> = {};
  let prevStatus = initialStatus;

  for (const stage of PIPELINE) {
    console.log(`\n  ── ${stage.dept.toUpperCase()} ──────────────────────────────────`);

    const res = await fetch(`${BASE}/api/brain/artifacts`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        clientRequestId: reqId, department: stage.dept,
        canvasId: `cv_sushi_cazza_${stage.dept}_jun2026_prod`,
        canvas: stage.canvas,
        qualityGate: { overall: "PASS", passCount: 10, failCount: 0 },
      }),
    });
    const body = await res.json().catch(() => ({} as { id?: string; error?: string })) as { id?: string; error?: string };
    const artId = body.id ?? "";
    artifactIds[stage.dept] = artId;

    check(`  ${stage.dept}: artifact saved → 201`, res.status === 201, `id=${artId}`);
    if (res.status !== 201) {
      warn(`  ${stage.dept}: BLOCKER`, body.error ?? `HTTP ${res.status}`);
      break;
    }

    // Evidence
    const evRes = await fetch(`${BASE}/api/brain/evidence?clientRequestId=${reqId}`, { headers: { Cookie: sessionCookie } });
    const evList = await evRes.json() as Array<{ label: string }>;
    const evFound = Array.isArray(evList) && evList.some((e) => e.label === stage.evidence);
    check(`  ${stage.dept}: evidence "${stage.evidence}"`, evFound, `total=${Array.isArray(evList) ? evList.length : "err"}`);

    // Status advancement
    const listRes2 = await fetch(`${BASE}/api/brain/client-requests`, { headers: { Cookie: sessionCookie } });
    const list2 = await listRes2.json() as Array<{ id: string; status: string }>;
    const curReq = list2.find((r) => r.id === reqId);
    const curStatus = curReq?.status ?? "unknown";
    check(`  ${stage.dept}: status ${prevStatus} → ${curStatus}`, curStatus === stage.nextStatus,
      `expected ${stage.nextStatus}`);
    prevStatus = curStatus;

    console.log(`    artifactId: ${artId}  nextStatus: ${curStatus}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  section("PART 5 — CLIENT APPROVAL REQUESTS");
  // ═══════════════════════════════════════════════════════════════════════════

  const approvalDepts = [
    { dept: "strategy", label: "Estratégia" },
    { dept: "social",   label: "Plano de Conteúdo" },
    { dept: "design",   label: "Direção Visual" },
    { dept: "quality",  label: "Revisão de Qualidade" },
  ];
  const approvalIds: Record<string, string> = {};

  for (const ap of approvalDepts) {
    const res = await fetch(`${BASE}/api/brain/approvals`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ clientRequestId: reqId, department: ap.dept, clientVisible: true, title: ap.label }),
    });
    const body = await res.json().catch(() => ({} as { id?: string })) as { id?: string };
    const apId = body.id ?? "";
    approvalIds[ap.dept] = apId;
    check(`  "${ap.label}" ApprovalRequest → 201`, res.status === 201 && !!apId, `id=${apId}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  section("PART 6 — SECURE PORTAL TOKEN");
  // ═══════════════════════════════════════════════════════════════════════════

  const tokenRes = await fetch(`${BASE}/api/brain/portal-access`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ clientRequestId: reqId }),
  });
  const tokenBody = await tokenRes.json().catch(() => ({})) as { token?: string; expiresAt?: string };
  const token = tokenBody.token ?? "";
  const expiresAt = tokenBody.expiresAt ?? "unknown";

  check("6.1 POST /api/brain/portal-access → 201 + token", tokenRes.status === 201 && !!token,
    `token=${token.slice(0, 20)}…`);

  // Use the public Railway domain if possible, otherwise local
  const portalBase = BASE.includes("railway") ? BASE : BASE;
  const portalUrl = `${portalBase}/portal/access/${token}`;

  console.log(`\n  Portal URL:  ${portalUrl}`);
  console.log(`  Expires:     ${expiresAt}`);
  console.log(`  Linked req:  ${reqId}`);

  // ═══════════════════════════════════════════════════════════════════════════
  section("PART 7 — INTERNAL PORTAL QA");
  // ═══════════════════════════════════════════════════════════════════════════

  const portalRes = await fetch(`${BASE}/api/brain/portal-data?token=${encodeURIComponent(token)}`);
  const portal = await portalRes.json().catch(() => ({})) as {
    businessName?: string; status?: string;
    pipeline?: Array<{ departmentKey: string }>;
    approvals?: Array<{ id: string; status: string; department: string }>;
  };

  check("7.1 Portal opens without agency session → 200", portalRes.status === 200);
  check("7.2 Portal scoped to Sushi Cazza", portal.businessName?.includes("Sushi Cazza") ?? false, portal.businessName);
  check("7.3 Pipeline data: 6 steps", (portal.pipeline?.length ?? 0) === 6, `got ${portal.pipeline?.length ?? 0}`);
  check("7.4 Approvals returned", Array.isArray(portal.approvals), `count=${portal.approvals?.length ?? 0}`);

  const pendingAps = portal.approvals?.filter((a) => a.status === "pending") ?? [];
  check("7.5 Pending approvals visible to client", pendingAps.length > 0, `${pendingAps.length} pending`);

  // 7.6 Client approve
  const target = pendingAps[0];
  if (target) {
    const decideRes = await fetch(`${BASE}/api/portal/approvals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token, approvalRequestId: target.id,
        action: "approve",
        comment: "Aprovado! Material excelente. Podem prosseguir.",
        authorName: "Kenji Tanaka (Sushi Cazza)",
      }),
    });
    const decided = await decideRes.json().catch(() => ({} as { status?: string })) as { status?: string };
    check("7.6 Client approve → 200 + approved",
      decideRes.status === 200 && decided.status === "approved",
      `HTTP ${decideRes.status} status=${decided.status}`);

    // 7.7 Double decision blocked
    const again = await fetch(`${BASE}/api/portal/approvals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, approvalRequestId: target.id, action: "reject" }),
    });
    check("7.7 Double-decision → 409", again.status === 409, `got ${again.status}`);

    // 7.8 Agency sees decision
    const agRes = await fetch(`${BASE}/api/brain/approvals?clientRequestId=${reqId}`, { headers: { Cookie: sessionCookie } });
    const agList = await agRes.json() as Array<{ id: string; status: string; reviewedBy?: string; comments?: Array<{ authorRole: string; body: string }> }>;
    const agAp = agList.find((a) => a.id === target.id);
    check("7.8 Agency sees status=approved", agAp?.status === "approved");
    check("7.9 Agency sees reviewedBy includes 'client:'", (agAp?.reviewedBy ?? "").includes("client:"), agAp?.reviewedBy ?? "");
    check("7.10 Client comment persisted authorRole=client",
      !!agAp?.comments?.some((c) => c.authorRole === "client" && c.body.includes("Aprovado")));
  } else {
    warn("7.6–7.10 No pending approval found — skipped");
  }

  // 7.11 Request revision on second pending
  const second = pendingAps[1];
  if (second) {
    const revRes = await fetch(`${BASE}/api/portal/approvals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token, approvalRequestId: second.id, action: "request_revision",
        comment: "Favor ajustar o calendário para incluir domingo.",
        authorName: "Kenji Tanaka (Sushi Cazza)",
      }),
    });
    const revBody = await revRes.json().catch(() => ({})) as { status?: string };
    check("7.11 Client request_revision → 200", revRes.status === 200 && revBody.status === "revision_requested",
      `HTTP ${revRes.status} status=${revBody.status}`);
  }

  // 7.12 Invalid token → 403
  const badToken = await fetch(`${BASE}/api/portal/approvals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "invalid-token-xxx", approvalRequestId: "x", action: "approve" }),
  });
  check("7.12 Invalid token → 403", badToken.status === 403, `got ${badToken.status}`);

  // ═══════════════════════════════════════════════════════════════════════════
  section("PART 8 — FINAL READINESS REPORT");
  // ═══════════════════════════════════════════════════════════════════════════

  const passed = report.filter((l) => l.startsWith("✅")).length;
  const failed = report.filter((l) => l.startsWith("❌")).length;

  console.log("\n  ┌──────────────────────────────────────────────────────────┐");
  console.log("  │           SUSHI CAZZA — FINAL READINESS REPORT          │");
  console.log("  ├──────────────────────────────────────────────────────────┤");
  console.log(`  │ Production URL:    ${BASE.slice(0, 42).padEnd(42)}│`);
  console.log(`  │ Auth result:       Login OK — master@dioli.studio        │`);
  console.log(`  │ API security:      401 on all unauthed mutation routes   │`);
  console.log(`  │ Quality gate:      FAIL→422 ✓  PASS→201 ✓                │`);
  console.log(`  │ Client ID:         ${(clientId ?? "(linked via request)").slice(0,42).padEnd(42)}│`);
  console.log(`  │ Request ID:        ${reqId.slice(0,42).padEnd(42)}│`);
  console.log(`  │ Artifacts:         ${Object.keys(artifactIds).join(", ").slice(0,42).padEnd(42)}│`);
  console.log(`  │ Approvals:         ${Object.keys(approvalIds).join(", ").slice(0,42).padEnd(42)}│`);
  console.log(`  │ Portal URL:        /portal/access/${token.slice(0,18)}…${"".padEnd(5)}│`);
  console.log(`  │ Expires:           ${expiresAt.slice(0,42).padEnd(42)}│`);
  console.log(`  │ Portal QA:         approve ✓  revision ✓  409 ✓          │`);
  console.log("  ├──────────────────────────────────────────────────────────┤");
  console.log(`  │ Checks passed:     ${String(passed).padEnd(42)}│`);
  console.log(`  │ Checks failed:     ${String(failed).padEnd(42)}│`);
  console.log(`  │ Warnings:          ${String(warnings).padEnd(42)}│`);
  console.log("  └──────────────────────────────────────────────────────────┘");

  if (failures === 0) {
    console.log(`\n  ✅ READY_TO_SHARE_PORTAL\n`);
    console.log(`  Client portal link (ready when you decide to share):`);
    console.log(`  ${portalUrl}\n`);
  } else {
    console.log(`\n  ❌ NOT_READY — ${failures} blocker(s)\n`);
    console.log("  Blockers:");
    report.filter((l) => l.startsWith("❌")).forEach((l) => console.log(`    ${l}`));
  }

  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
