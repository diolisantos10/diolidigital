// GET /api/projects/[id]/marketing
// Consolidated marketing-intelligence for the internal project dashboard.
// Binds REAL data only, parsed from the ACTUAL stored Brain canvases (per
// clientRequestId) + BrandBrain (per-client) + Meta connections + posts.
// Every absent field is returned null/empty so the UI shows an honest
// "não informado / conecte" state. Nothing is invented here.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";

function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean) : []);

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;
  const { id } = await context.params;

  const project = await prisma.project.findFirst({
    where: { id, workspaceId: session.workspaceId },
    select: { id: true, name: true, clientId: true, clientRequestId: true },
  });
  if (!project) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });

  const reqId = project.clientRequestId ?? null;

  const [clientRequest, artifacts, brandBrain, connections, posts] = await Promise.all([
    reqId
      ? prisma.clientRequestDb.findUnique({ where: { id: reqId }, select: { businessName: true, segment: true, services: true, objectives: true, briefingJson: true } })
      : Promise.resolve(null),
    reqId
      ? prisma.brainArtifact.findMany({ where: { clientRequestId: reqId, status: "approved" }, orderBy: { approvedAt: "asc" }, select: { department: true, canvasJson: true, approvedAt: true } })
      : Promise.resolve([] as { department: string; canvasJson: string; approvedAt: Date | null }[]),
    prisma.brandBrain.findUnique({ where: { clientId: project.clientId }, select: { brandName: true, tagline: true, primaryColor: true, secondaryColor: true, typography: true, tone: true, values: true, targetAudience: true, positioning: true, updatedAt: true } }).catch(() => null),
    prisma.metaConnection.findMany({ where: { workspaceId: session.workspaceId, clientId: project.clientId }, select: { platform: true, name: true, status: true, lastSyncedAt: true } }).catch(() => [] as { platform: string; name: string; status: string; lastSyncedAt: Date | null }[]),
    reqId
      ? prisma.socialPost.findMany({ where: { OR: [{ clientRequestId: reqId }, { clientId: project.clientId }] }, orderBy: { scheduledFor: "asc" }, take: 12, select: { caption: true, networks: true, format: true, pillar: true, scheduledFor: true, status: true } }).catch(() => [] as { caption: string; networks: string; format: string; pillar: string | null; scheduledFor: Date | null; status: string }[])
      : Promise.resolve([] as { caption: string; networks: string; format: string; pillar: string | null; scheduledFor: Date | null; status: string }[]),
  ]);

  const canvasOf = (dept: string): Record<string, unknown> => {
    const a = artifacts.find((x) => x.department === dept);
    return a ? rec(parseJson<unknown>(a.canvasJson, {})) : {};
  };
  const strat = canvasOf("strategy");
  const social = canvasOf("social");
  const design = canvasOf("design");
  const traffic = canvasOf("traffic");
  const analytics = canvasOf("analytics");

  const scope = rec(parseJson<Record<string, unknown>>(clientRequest?.briefingJson, {}).scope);
  const brandValues = strArr(parseJson<unknown>(brandBrain?.values, []));
  const kpiDash = rec(analytics.kpiDashboard);

  const hasBrandBoard = !!(brandBrain || Object.keys(design).length);

  const payload = {
    project: { id: project.id, name: project.name },
    hasRequest: !!reqId,
    hasArtifacts: artifacts.length > 0,
    businessName: clientRequest?.businessName ?? null,
    segment: str(clientRequest?.segment) || str(scope.segment),
    services: strArr(parseJson<unknown>(clientRequest?.services, [])),
    objectives: strArr(parseJson<unknown>(clientRequest?.objectives, [])),

    // ── Brand Board — visual identity (design canvas) + BrandBrain when present
    brandBoard: hasBrandBoard ? {
      brandName: str(brandBrain?.brandName),
      tagline: str(brandBrain?.tagline),
      palette: (() => {
        const p = strArr(design.palette);
        if (p.length) return p;
        return [brandBrain?.primaryColor, brandBrain?.secondaryColor].map(str).filter((x): x is string => !!x);
      })(),
      typography: str(design.typography) || str(brandBrain?.typography),
      photoStyle: str(design.photoStyle),
      gridLayout: str(design.gridLayout),
      storyTemplate: str(design.storyTemplate),
      moodboard: str(design.moodboard),
      brandSafety: str(design.brandSafety),
      values: brandValues,
      updatedAt: brandBrain?.updatedAt ?? null,
    } : null,

    // ── Persona da marca (tom + identidade)
    brandPersona: {
      tone: str(social.copyTone) || str(brandBrain?.tone),
      advantage: str(strat.competitiveAdvantage),
      moodboard: str(design.moodboard),
      values: brandValues,
    },

    // ── Persona do comprador (público-alvo real, do plano de tráfego)
    buyerPersona: {
      audience: str(traffic.targeting) || str(brandBrain?.targetAudience) || str(scope.targetAudience),
      objectives: strArr(traffic.objectives),
    },

    // ── Território de conteúdo (pilares + temas + formatos)
    territory: {
      pillars: strArr(strat.contentPillars),
      themes: strArr(social.themes),
      formats: [...new Set([...strArr(social.formats), ...strArr(traffic.adFormats)])],
    },

    // ── Posicionamento & negócio
    positioning: {
      statement: str(strat.positioning) || str(brandBrain?.positioning),
      uniqueValue: str(strat.uniqueValue),
      advantage: str(strat.competitiveAdvantage),
    },

    // ── Redes sociais
    social: {
      handle: str(social.instagramHandle),
      frequency: str(social.contentFrequency),
      postsPerMonth: typeof social.postsPerMonth === "number" ? social.postsPerMonth : null,
      mainCTA: str(social.mainCTA),
      platforms: [...new Set([...strArr(scope.social ? (rec(scope.social).platforms as unknown) : []), ...strArr(traffic.platforms)])],
    },
    connections: connections.map((c) => ({ platform: c.platform, name: c.name, status: c.status, lastSyncedAt: c.lastSyncedAt })),

    // ── Tráfego pago (plano real)
    traffic: Object.keys(traffic).length ? {
      budget: str(traffic.budget),
      platforms: strArr(traffic.platforms),
      objectives: strArr(traffic.objectives),
      targeting: str(traffic.targeting),
      adFormats: strArr(traffic.adFormats),
      kpis: strArr(traffic.kpis),
    } : null,

    // ── KPIs & medição
    kpis: {
      strategic: strArr(strat.kpis),
      traffic: strArr(traffic.kpis),
      organic: strArr(kpiDash.organic),
      paid: strArr(kpiDash.paid),
      tracking: strArr(analytics.trackingSetup),
      cadence: str(analytics.reportingCadence),
    },

    posts: posts.map((p) => ({ caption: p.caption, networks: parseJson<string[]>(p.networks, []), format: p.format, pillar: p.pillar, scheduledFor: p.scheduledFor, status: p.status })),
  };

  return NextResponse.json(payload);
}
