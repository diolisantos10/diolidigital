// GET /api/projects/[id]/execution
// DB-backed execution view: the project, its tasks, and the approved department
// canvases (BrainArtifact) produced automatically at intake. This is the page a
// PM lands on after approving a scope — it surfaces the work the agents already
// generated, replacing the old per-department "Gerar/Aprovar" relay.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";

const DEPT_LABEL: Record<string, string> = {
  strategy:  "Estratégia",
  social:    "Social Media",
  design:    "Design",
  traffic:   "Tráfego Pago",
  analytics: "Analytics",
  quality:   "Qualidade",
};
const DEPT_ORDER = ["strategy", "social", "design", "traffic", "analytics", "quality"];

// Defensive canvas summariser — canvases differ per department, so we probe a
// set of common keys rather than hard-coding each shape. Returns a headline and
// a few highlight bullets so the UI can render any department uniformly.
function summarizeCanvas(canvas: unknown): { headline: string | null; bullets: string[] } {
  if (!canvas || typeof canvas !== "object") return { headline: null, bullets: [] };
  const c = canvas as Record<string, unknown>;

  // Ordered most-descriptive-first; covers all six department canvas shapes.
  const HEADLINE_KEYS = [
    "executiveSummary", "summary", "businessSummary", "mainObjective",
    "contentObjective", "visualConcept", "positioning", "targetAudience",
    "headline", "recommendation", "diagnosis", "overview", "visualTone", "contentRole",
  ];
  let headline: string | null = null;
  for (const k of HEADLINE_KEYS) {
    if (typeof c[k] === "string" && (c[k] as string).trim().length > 8) { headline = (c[k] as string).trim(); break; }
  }

  const BULLET_KEYS = [
    "keyFindings", "keyInsights", "recommendations", "kpis", "campaigns",
    "editorialPillars", "contentTerritories", "differentiators", "painPoints",
    "secondaryObjectives", "creativeBriefs", "audiences", "recommendedChannels",
    "recommendedFormats", "performanceGaps", "assetRequirements", "competitiveAdvantages",
    "patternsIdentified", "priorityChannels", "contentThemes", "formats", "objectives",
  ];
  const itemToStr = (x: unknown): string | null => {
    if (typeof x === "string") return x.trim() || null;
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      for (const k of ["title", "name", "label", "summary", "objective", "description", "finding", "insight"]) {
        if (typeof o[k] === "string" && (o[k] as string).trim()) return (o[k] as string).trim();
      }
    }
    return null;
  };
  let bullets: string[] = [];
  for (const k of BULLET_KEYS) {
    const v = c[k];
    if (Array.isArray(v) && v.length) {
      bullets = v.map(itemToStr).filter((x): x is string => !!x).slice(0, 5);
      if (bullets.length) break;
    }
  }
  return { headline, bullets };
}

function gateOverall(gateJson: string | null): string | null {
  if (!gateJson) return null;
  try {
    const g = JSON.parse(gateJson) as Record<string, unknown>;
    const v = g.overall ?? g.overallVerdict;
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;
  const { id } = await context.params;

  try {
    const project = await prisma.project.findFirst({
      where: { id, workspaceId: session.workspaceId },
      include: {
        client: { select: { id: true, name: true } },
        tasks:  { orderBy: { createdAt: "asc" } },
      },
    });
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Approved department canvases for the originating Brain request.
    let departments: Array<{
      department: string; label: string; status: string;
      gate: string | null; approvedAt: string | null;
      headline: string | null; bullets: string[];
    }> = [];

    if (project.clientRequestId) {
      const artifacts = await prisma.brainArtifact.findMany({
        where: { clientRequestId: project.clientRequestId, status: "approved" },
        orderBy: { approvedAt: "desc" },
      });
      // Keep the latest approved artifact per department.
      const byDept = new Map<string, (typeof artifacts)[number]>();
      for (const a of artifacts) if (!byDept.has(a.department)) byDept.set(a.department, a);

      departments = DEPT_ORDER.filter((d) => byDept.has(d)).map((d) => {
        const a = byDept.get(d)!;
        let canvas: unknown = null;
        try { canvas = JSON.parse(a.canvasJson); } catch { /* ignore */ }
        const { headline, bullets } = summarizeCanvas(canvas);
        return {
          department: d,
          label: DEPT_LABEL[d] ?? d,
          status: a.status,
          gate: gateOverall(a.qualityGateJson),
          approvedAt: a.approvedAt ? a.approvedAt.toISOString() : null,
          headline,
          bullets,
        };
      });
    }

    return NextResponse.json({
      project: {
        id: project.id,
        name: project.name,
        goal: project.goal,
        stage: project.stage,
        clientName: project.client?.name ?? null,
        createdAt: project.createdAt.toISOString(),
      },
      clientRequestId: project.clientRequestId ?? undefined,
      tasks: project.tasks.map((t) => ({
        id: t.id, title: t.title, description: t.description,
        status: t.status, agentId: t.agentId,
      })),
      departments,
    });
  } catch (e) {
    console.error("[projects/execution] GET error", e);
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}
