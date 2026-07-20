// POST /api/brain/auto-scope/[id]/review — PM confirms section decisions.
// Body: { decisions: { [dept]: { action: "approved"|"revision", note?: string } } }
// All approved → creates Project+Tasks via PM orchestrator, status="in_progress".
// Any revision → marks those artifacts "needs_revision", status="needs_revision".

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { prisma } from "@/lib/db/client";
import { buildClientSnapshot } from "@/lib/dioli-brain/client-snapshot";
import { orchestratePMReasoning } from "@/lib/dioli-brain/pm-orchestrator";
import { getDepartmentDef, type DepartmentId } from "@/lib/agency/departments";

const AGENCY_ROLES = ["master", "project_manager"] as const;

const DEPT_TO_DEF: Record<string, DepartmentId> = {
  strategy: "strategy",
  social: "social-media",
  design: "design",
  traffic: "paid-traffic",
  analytics: "project-management",
  quality: "project-management",
};

const VALID_TASK_DEPTS = ["strategy", "social-media", "design", "paid-traffic", "analytics", "project-management"];

type Params = { id: string };

export async function POST(
  request: NextRequest,
  context: { params: Promise<Params> },
): Promise<NextResponse> {
  const { session, error } = await requireSession([...AGENCY_ROLES]);
  if (error) return error;
  if (session.clientId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: clientRequestId } = await context.params;

  let body: { decisions?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.decisions || typeof body.decisions !== "object" || Array.isArray(body.decisions)) {
    return NextResponse.json({ error: "decisions object required" }, { status: 400 });
  }

  const decisions = body.decisions as Record<string, { action: string; note?: string }>;
  const revisionDepts = Object.entries(decisions)
    .filter(([, d]) => d.action === "revision")
    .map(([dept]) => dept);
  const allApproved = revisionDepts.length === 0;

  try {
    const req = await prisma.clientRequestDb.findUnique({ where: { id: clientRequestId } });
    if (!req) return NextResponse.json({ error: "ClientRequest not found" }, { status: 404 });

    if (allApproved) {
      // Idempotency guard: if a project was already created for this request
      // (double submit, retry, re-opening the scope page), return it instead of
      // creating a duplicate. This is what caused two identical projects.
      const existingProject = await prisma.project.findFirst({
        where: { clientRequestId },
        orderBy: { createdAt: "asc" },
      });
      if (existingProject) {
        return NextResponse.json(
          { ok: true, action: "approved_all", projectId: existingProject.id, alreadyApproved: true },
          { status: 200 },
        );
      }

      // Approve all draft artifacts.
      await prisma.brainArtifact.updateMany({
        where: { clientRequestId, status: "draft" },
        data: { status: "approved", approvedBy: session.name },
      });

      // Build snapshot → orchestrate → create Project + Tasks.
      const snapshot = await buildClientSnapshot(clientRequestId);
      if (!snapshot) return NextResponse.json({ error: "Snapshot unavailable" }, { status: 503 });

      const proposal = await orchestratePMReasoning(snapshot);

      let clientId = req.clientId ?? undefined;
      if (!clientId) {
        const client = await prisma.client.create({
          data: {
            workspaceId: session.workspaceId,
            name: req.businessName,
            industry: req.segment || null,
          },
        });
        clientId = client.id;
        await prisma.clientRequestDb.update({
          where: { id: clientRequestId },
          data: { clientId, workspaceId: session.workspaceId },
        });
      }

      const project = await prisma.project.create({
        data: {
          workspaceId: session.workspaceId,
          clientId,
          clientRequestId,
          name: proposal.name,
          goal: proposal.goal,
          stage: "planning",
          priority: "medium",
        },
      });

      await prisma.task.createMany({
        data: proposal.tasks
          .filter((t) => VALID_TASK_DEPTS.includes(t.department))
          .map((t) => ({
            projectId: project.id,
            title: t.title,
            description: t.description || null,
            agentId: getDepartmentDef(DEPT_TO_DEF[t.department] ?? "project-management")?.primaryAgentId ?? null,
            status: "pending",
          })),
      });

      await prisma.clientRequestDb.update({
        where: { id: clientRequestId },
        data: { status: "in_progress" },
      });

      return NextResponse.json({ ok: true, action: "approved_all", projectId: project.id }, { status: 201 });
    } else {
      // Mark revision artifacts and update request status.
      await prisma.brainArtifact.updateMany({
        where: { clientRequestId, department: { in: revisionDepts }, status: "draft" },
        data: { status: "needs_revision" },
      });

      // Save revision notes as ApprovalRequest records (one per department).
      for (const dept of revisionDepts) {
        const note = decisions[dept]?.note?.trim();
        if (note) {
          await prisma.approvalRequest.create({
            data: {
              clientRequestId,
              department: dept,
              requestedBy: session.name,
              status: "needs_revision",
              reviewNote: note,
            },
          }).catch(() => {}); // best-effort
        }
      }

      await prisma.clientRequestDb.update({
        where: { id: clientRequestId },
        data: { status: "needs_revision" },
      });

      return NextResponse.json({ ok: true, action: "revisions_requested", depts: revisionDepts });
    }
  } catch (e) {
    console.error("[brain/auto-scope/review] error", e);
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}
