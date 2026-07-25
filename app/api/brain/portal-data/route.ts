// Returns client-safe Brain pipeline data for the portal.
// Strips internal fields (promptSummary, cognitiveFlow, etc.) before sending.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { validatePortalAccess } from "@/lib/agency/persistence/portal-access-service";
import { requireSession } from "@/lib/auth/api-guard";

const CLIENT_SAFE_DEPARTMENTS: Record<string, string> = {
  proposal:  "Proposta do projeto",
  strategy:  "Estratégia",
  social:    "Social Media",
  design:    "Design",
  traffic:   "Tráfego Pago",
  analytics: "Analytics",
  quality:   "Revisão de Qualidade",
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const token           = searchParams.get("token");
  const clientRequestId = searchParams.get("clientRequestId");
  const clientId        = searchParams.get("clientId");

  // Token-based access — the only public path. Everything else needs a session.
  if (token) {
    const access = await validatePortalAccess(token);
    if (!access.valid) {
      return NextResponse.json({ error: "Access denied", reason: access.reason }, { status: 403 });
    }
    let reqId = access.record?.clientRequestId ?? null;
    // Token issued for a client (not a specific request): resolve the most
    // recent Brain request for that client at view time.
    if (!reqId && access.record?.clientId) {
      const latest = await prisma.clientRequestDb.findFirst({
        where: { clientId: access.record.clientId },
        orderBy: { createdAt: "desc" },
      });
      reqId = latest?.id ?? null;
      if (!reqId) {
        // Valid token, but no Brain request yet — empty portal state.
        const client = await prisma.client.findUnique({ where: { id: access.record.clientId } });
        return NextResponse.json({
          id: null, businessName: client?.name ?? "Cliente", status: "new",
          services: [], objectives: [], createdAt: null, pipeline: [], approvals: [],
        });
      }
    }
    if (!reqId) {
      return NextResponse.json({ error: "Token not linked to a request" }, { status: 404 });
    }
    return NextResponse.json(await buildPortalData(reqId));
  }

  // Direct clientRequestId / clientId — internal use only (agency session).
  const { error } = await requireSession();
  if (error) return error;

  if (clientRequestId) {
    return NextResponse.json(await buildPortalData(clientRequestId));
  }

  // clientId — return all requests for this client (portal by client ID)
  if (clientId) {
    try {
      const requests = await prisma.clientRequestDb.findMany({
        where: { clientId },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      const results = await Promise.all(requests.map((r) => buildPortalData(r.id)));
      return NextResponse.json(results);
    } catch {
      return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
    }
  }

  return NextResponse.json({ error: "token, clientRequestId, or clientId required" }, { status: 400 });
}

// Defensive, client-safe canvas summariser — pulls a headline + a few highlight
// bullets across the varied department canvas shapes, and strips anything that
// looks like a price (the portal never shows values).
function summarizeCanvas(canvas: unknown): { headline: string | null; bullets: string[] } {
  if (!canvas || typeof canvas !== "object") return { headline: null, bullets: [] };
  const c = canvas as Record<string, unknown>;
  const noPrice = (s: string) => !/r\$\s*\d|\d+\s*(reais|\/m[êe]s)/i.test(s);

  const HEAD = ["executiveSummary","summary","businessSummary","mainObjective","contentObjective","visualConcept","positioning","targetAudience","recommendation","diagnosis","overview","visualTone","contentRole"];
  let headline: string | null = null;
  for (const k of HEAD) {
    const v = c[k];
    if (typeof v === "string" && v.trim().length > 8 && noPrice(v)) { headline = v.trim(); break; }
  }

  const BULLETS = ["keyFindings","keyInsights","recommendations","kpis","campaigns","editorialPillars","contentTerritories","contentThemes","differentiators","secondaryObjectives","creativeBriefs","audiences","recommendedChannels","recommendedFormats","performanceGaps","assetRequirements","priorityChannels","formats","objectives"];
  const toStr = (x: unknown): string | null => {
    if (typeof x === "string") return noPrice(x) ? x.trim() || null : null;
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      for (const k of ["title","name","label","summary","objective","description","finding","insight"]) {
        if (typeof o[k] === "string" && (o[k] as string).trim() && noPrice(o[k] as string)) return (o[k] as string).trim();
      }
    }
    return null;
  };
  let bullets: string[] = [];
  for (const k of BULLETS) {
    const v = c[k];
    if (Array.isArray(v) && v.length) {
      bullets = v.map(toStr).filter((x): x is string => !!x).slice(0, 6);
      if (bullets.length) break;
    }
  }
  return { headline, bullets };
}

async function buildPortalData(clientRequestId: string) {
  const [clientRequest, artifacts, approvals] = await Promise.all([
    prisma.clientRequestDb.findUnique({ where: { id: clientRequestId } }),
    prisma.brainArtifact.findMany({
      where: { clientRequestId, status: "approved" },
      orderBy: { approvedAt: "asc" },
      select: {
        id: true, department: true, canvasId: true, canvasJson: true,
        version: true, status: true, approvedAt: true,
      },
    }),
    prisma.approvalRequest.findMany({
      where: { clientRequestId, clientVisible: true },
      orderBy: { createdAt: "desc" },
      include: {
        comments: {
          where: { isClientVisible: true },
          orderBy: { createdAt: "asc" },
          select: { id: true, authorName: true, authorRole: true, body: true, createdAt: true },
        },
      },
    }),
  ]);

  if (!clientRequest) return null;

  const services = (() => { try { return JSON.parse(clientRequest.services); } catch { return []; } })();
  const objectives = (() => { try { return JSON.parse(clientRequest.objectives); } catch { return []; } })();
  const scope = (() => {
    try { return (JSON.parse(clientRequest.briefingJson ?? "{}")?.scope ?? {}) as Record<string, unknown>; }
    catch { return {} as Record<string, unknown>; }
  })();

  // Per-department client-safe content (feeds each contracted service's tab).
  const departments: Record<string, { label: string; headline: string | null; bullets: string[]; approvedAt: Date | string | null }> = {};
  for (const a of artifacts) {
    let canvas: unknown = null;
    try { canvas = JSON.parse(a.canvasJson); } catch { /* ignore */ }
    const { headline, bullets } = summarizeCanvas(canvas);
    departments[a.department] = {
      label: CLIENT_SAFE_DEPARTMENTS[a.department] ?? a.department,
      headline, bullets, approvedAt: a.approvedAt,
    };
  }

  return {
    id:           clientRequest.id,
    businessName: clientRequest.businessName,
    status:       clientRequest.status,
    segment:      clientRequest.segment || (typeof scope.segment === "string" ? scope.segment : ""),
    targetAudience: typeof scope.targetAudience === "string" ? scope.targetAudience : "",
    socialPlatforms: (() => {
      const p = (scope.social as { platforms?: unknown } | undefined)?.platforms;
      return Array.isArray(p) ? p.filter((x): x is string => typeof x === "string") : [];
    })(),
    services,
    objectives,
    departments,
    createdAt:    clientRequest.createdAt,
    pipeline: artifacts.map((a) => ({
      id:           a.id,
      departmentKey: a.department,
      department:   CLIENT_SAFE_DEPARTMENTS[a.department] ?? a.department,
      approvedAt:   a.approvedAt,
      version:      a.version,
    })),
    approvals: approvals.map((ap) => ({
      id:         ap.id,
      department: CLIENT_SAFE_DEPARTMENTS[ap.department] ?? ap.department,
      status:     ap.status,
      reviewedAt: ap.reviewedAt,
      reviewNote: ap.reviewNote,
      comments:   ap.comments,
    })),
  };
}
