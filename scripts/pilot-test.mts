// Pilot readiness test: simulates the full Sushi Cazza briefing → pipeline → portal flow
// Parts 5–8 of the pilot sprint (API-based, browser not available in remote env)

const BASE = "http://localhost:3000";

async function api(method: string, path: string, body?: unknown, cookie?: string) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      // `Origin`: este script faz POST em rotas guardadas pela FAIXA 1 do
      // CSRF (`/api/brain/approvals`, `/api/portal/approvals` — ver
      // `lib/security/navegacao-cross-site.ts`, `deveBloquearMutacaoCrossSite`).
      // A trava é fail-CLOSED: sem `Sec-Fetch-Site` (script, não navegador) e
      // sem `Origin`, a ausência dos três sinais vira 403 — a ferramenta
      // interna se identifica, a guarda não muda.
      Origin: BASE,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, json, headers: Object.fromEntries(r.headers.entries()) };
}

// ── Step 0: Login ──────────────────────────────────────────────────────────────
console.log("\n=== STEP 0: Login ===");
const loginRes = await api("POST", "/api/auth/signin", {
  email: "master@dioli.studio",
  password: "dioli2025",
});
console.log("Login status:", loginRes.status);
if (loginRes.status !== 200) {
  console.error("LOGIN FAILED:", loginRes.json);
  process.exit(1);
}
const setCookie = loginRes.headers["set-cookie"] ?? "";
const sessionCookie = setCookie.split(";")[0];
console.log("Session cookie:", sessionCookie.slice(0, 40) + "...");

// ── Step 1: Submit briefing via public API ─────────────────────────────────────
console.log("\n=== STEP 1: Submit Briefing (Sushi Cazza) ===");
const briefingPayload = {
  businessName: "Sushi Cazza",
  segment: "Restaurante / Alimentação",
  services: ["Gestão de Redes Sociais", "Criação de Conteúdo", "Tráfego Pago"],
  objectives: ["Aumentar visibilidade", "Aumentar reservas e pedidos", "Fidelização"],
  rawContext:
    "Sushi Cazza é um restaurante japonês premium em rodízio. " +
    "Rodízio R$99, crianças 6-10 R$49,90. Jantar 18h–23h, almoço 11h–15h seg–sab. " +
    "Delivery e presencial. Identidade visual preto/vermelho/branco. " +
    "Precisa de social media forte (Instagram @sushicazzaoficial), " +
    "planejamento de conteúdo e direção visual. Tráfego pago possível depois. " +
    "Meta: aumentar visibilidade, desejo, reservas e recorrência.",
  source: "briefing",
  briefingJson: {
    transcript: [
      { id: "w", role: "assistant", text: "Olá! Sou sua consultora de orçamento.", createdAt: new Date().toISOString() },
      { id: "c1", role: "client", text: "Sushi Cazza, tenho um restaurante japonês e preciso de redes sociais", createdAt: new Date().toISOString() },
      { id: "a1", role: "assistant", text: "Entendi que estamos falando do Sushi Cazza! Qual é o seu nome?", createdAt: new Date().toISOString() },
      { id: "c2", role: "client", text: "Me chamo Carlos Tanaka, sou o sócio-proprietário", createdAt: new Date().toISOString() },
    ],
    scope: {
      businessName: "Sushi Cazza", segment: "Restaurante / Alimentação",
      wantsSocialMedia: true, wantsPaidTraffic: true, prospectName: "Carlos Tanaka",
      prospectEmail: "carlos@sushicazza.com.br", prospectPhone: "(11) 99999-8888",
    },
    estimate: { totalMin: 2800, totalMax: 4200 },
  },
  sdrHandoffJson: {
    negotiationStage: "proposal_ready",
    qualificationScore: 85,
    budgetSignal: { fitStatus: "fits", amount: 3500 },
    isRestaurant: true,
  },
  attachmentsJson: [
    {
      id: "att1",
      fileName: "Sushi_Cazza_Master_Brand_Book_v2_REVISAO_FIEL.pdf",
      fileType: "PDF",
      sizeBytes: 2450000,
    },
  ],
};

const briefRes = await api("POST", "/api/brain/client-requests", briefingPayload);
console.log("Briefing status:", briefRes.status);
if (briefRes.status !== 201 && briefRes.status !== 200) {
  console.error("BRIEFING SUBMIT FAILED:", briefRes.json);
  process.exit(1);
}
const requestId = (briefRes.json as { id: string }).id;
console.log("ClientRequestDb ID:", requestId);

// ── Step 2: Verify request appears ────────────────────────────────────────────
console.log("\n=== STEP 2: Verify Request ===");
const verifyRes = await api("GET", `/api/brain/client-requests`, undefined, sessionCookie);
console.log("Verify status:", verifyRes.status);
const allReqs = Array.isArray(verifyRes.json) ? verifyRes.json as Record<string, unknown>[] : [];
const reqData = allReqs.find((r) => r.id === requestId) ?? allReqs[0] ?? {} as Record<string, unknown>;
console.log("found in list:", !!allReqs.find((r) => r.id === requestId));
console.log("businessName:", reqData.businessName);
console.log("status:", reqData.status);
console.log("source:", reqData.source);
const rawBriefing = reqData.briefingJson;
const briefingData: Record<string, unknown> = typeof rawBriefing === "string"
  ? JSON.parse(rawBriefing) : (rawBriefing as Record<string, unknown> ?? {});
const transcriptLen = Array.isArray(briefingData?.transcript)
  ? (briefingData.transcript as unknown[]).length : 0;
console.log("transcript entries:", transcriptLen);
const rawAttachments = reqData.attachmentsJson;
const attachmentsArr: unknown[] = typeof rawAttachments === "string"
  ? JSON.parse(rawAttachments) : (Array.isArray(rawAttachments) ? rawAttachments : []);
console.log("attachments:", attachmentsArr.length);

// ── Step 3: Admin advances to strategy ────────────────────────────────────────
console.log("\n=== STEP 3: Admin → waiting_strategy ===");
const advanceRes = await api("PATCH", `/api/brain/client-requests?id=${requestId}`,
  { status: "waiting_strategy" }, sessionCookie);
console.log("Advance status:", advanceRes.status);

// ── Step 4: Generate Strategy Artifact ────────────────────────────────────────
console.log("\n=== STEP 4: Save Strategy Artifact ===");
const stratArtifactRes = await api("POST", "/api/brain/artifacts", {
  clientRequestId: requestId,
  department: "strategy",
  canvasId: `strat-${Date.now()}`,
  canvas: {
    businessName: "Sushi Cazza",
    businessSummary: "Restaurante japonês premium com rodízio e delivery em SP.",
    positioningStatement: "O melhor rodízio japonês premium da região, com identidade visual marcante e presença digital forte.",
    primaryAudience: "Casais e famílias 28–45, classe AB, amantes de culinária japonesa.",
    priorityChannels: ["Instagram", "Google My Business", "iFood"],
    opportunities: ["Mercado de rodízio em expansão", "Alta busca por experiências gastronômicas"],
    risks: ["Sazonalidade", "Concorrência crescente"],
    recommendedServices: ["Social Media", "Tráfego Pago", "Produção de Conteúdo"],
    objectives: ["Aumentar reservas", "Fidelização", "Reconhecimento de marca"],
    mainObjective: "Aumentar visibilidade e reservas em 30% nos próximos 3 meses",
    qualityItems: [],
    passCount: 6, warningCount: 1, failCount: 0,
  },
  qualityGate: { overall: "PASS", passCount: 6, warningCount: 1, failCount: 0 },
  approvedBy: "master@dioli.studio",
}, sessionCookie);
console.log("Strategy artifact status:", stratArtifactRes.status);
if (stratArtifactRes.status !== 201) {
  console.error("Strategy artifact FAILED:", stratArtifactRes.json);
} else {
  const artifactData = stratArtifactRes.json as { id: string; department: string };
  console.log("Artifact ID:", artifactData.id);
  console.log("Department:", artifactData.department);
}

// ── Step 5: Create approval request for client ─────────────────────────────────
console.log("\n=== STEP 5: Create Client Approval Request ===");
const approvalRes = await api("POST", "/api/brain/approvals", {
  action: "create",
  clientRequestId: requestId,
  department: "strategy",
  requestedBy: "master@dioli.studio",
  clientVisible: true,
}, sessionCookie);
console.log("Approval create status:", approvalRes.status);
const approvalData = approvalRes.json as { id: string };
const approvalId = approvalData.id;
console.log("Approval ID:", approvalId);

// ── Step 6: Generate portal token ─────────────────────────────────────────────
console.log("\n=== STEP 6: Generate Portal Token ===");
const portalRes = await api("POST", "/api/brain/portal-access", {
  clientRequestId: requestId,
  expiresDays: 30,
}, sessionCookie);
console.log("Portal token status:", portalRes.status);
if (portalRes.status !== 201) {
  console.error("Portal token FAILED:", portalRes.json);
} else {
  const portalData = portalRes.json as { token: string; url: string; expiresAt: string };
  console.log("Token:", portalData.token);
  console.log("URL:", portalData.url);
  console.log("Expires:", portalData.expiresAt);

  // ── Step 7: Access portal as client ─────────────────────────────────────────
  console.log("\n=== STEP 7: Portal Data Access ===");
  const portalDataRes = await api("GET", `/api/brain/portal-data?token=${portalData.token}`);
  console.log("Portal data status:", portalDataRes.status);
  const pData = portalDataRes.json as Record<string, unknown>;
  console.log("businessName:", pData.businessName);
  console.log("status:", pData.status);
  const approvalsVisible = Array.isArray(pData.approvals) ? (pData.approvals as unknown[]).length : 0;
  console.log("visible approvals:", approvalsVisible);

  // ── Step 8: Client approves via portal ──────────────────────────────────────
  if (approvalId && approvalsVisible > 0) {
    console.log("\n=== STEP 8: Client Approval Action ===");
    const clientApproveRes = await api("POST", "/api/portal/approvals", {
      token: portalData.token,
      approvalRequestId: approvalId,
      action: "approve",
      comment: "Teste interno de aprovação — fluxo validado.",
      authorName: "Carlos Tanaka",
    });
    console.log("Client approve status:", clientApproveRes.status);
    console.log("Result:", clientApproveRes.json);
  } else {
    console.log("SKIP: No visible approvals or no approvalId");
  }
}

console.log("\n=== PILOT TEST COMPLETE ===");
