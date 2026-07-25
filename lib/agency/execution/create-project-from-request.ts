// Shared: turn an approved briefing/request into a Project + Tasks.
//
// This is the exact project-creation logic the agency review route runs — lifted
// into a helper so the CLIENT's portal approval can create the project too (the
// agency sends the proposal; the client approving it is what creates the project).
// Idempotent: returns the existing project if one already exists for the request.

import { prisma } from "@/lib/db/client";
import { buildClientSnapshot } from "@/lib/dioli-brain/client-snapshot";
import { orchestratePMReasoning } from "@/lib/dioli-brain/pm-orchestrator";
import { getDepartmentDef, type DepartmentId } from "@/lib/agency/departments";

const DEPT_TO_DEF: Record<string, DepartmentId> = {
  strategy: "strategy", social: "social-media", design: "design",
  traffic: "paid-traffic", analytics: "project-management", quality: "project-management",
};
const VALID_TASK_DEPTS = ["strategy", "social-media", "design", "paid-traffic", "analytics", "project-management"];

type Result =
  | { ok: true; projectId: string; created: boolean }
  | { ok: false; error: string };

export async function createProjectFromRequest(clientRequestId: string, approvedBy: string): Promise<Result> {
  const req = await prisma.clientRequestDb.findUnique({ where: { id: clientRequestId } });
  if (!req) return { ok: false, error: "Solicitação não encontrada" };

  // Idempotency: existing project wins (never duplicate on re-approval / retry).
  const existing = await prisma.project.findFirst({ where: { clientRequestId }, orderBy: { createdAt: "asc" } });
  if (existing) return { ok: true, projectId: existing.id, created: false };

  // Resolve the workspace: request's own, else the sole workspace.
  const workspaceId = req.workspaceId ?? (await prisma.agencyWorkspace.findFirst({ select: { id: true } }))?.id;
  if (!workspaceId) return { ok: false, error: "Workspace indisponível" };

  await prisma.brainArtifact.updateMany({ where: { clientRequestId, status: "draft" }, data: { status: "approved", approvedBy } });

  const snapshot = await buildClientSnapshot(clientRequestId);
  if (!snapshot) return { ok: false, error: "Snapshot indisponível" };
  const proposal = await orchestratePMReasoning(snapshot);

  let clientId = req.clientId ?? undefined;
  if (!clientId) {
    const client = await prisma.client.create({ data: { workspaceId, name: req.businessName, industry: req.segment || null } });
    clientId = client.id;
    await prisma.clientRequestDb.update({ where: { id: clientRequestId }, data: { clientId, workspaceId } });
  }

  const project = await prisma.project.create({
    data: { workspaceId, clientId, clientRequestId, name: proposal.name, goal: proposal.goal, stage: "planning", priority: "medium" },
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

  await prisma.clientRequestDb.update({ where: { id: clientRequestId }, data: { status: "in_progress" } });
  return { ok: true, projectId: project.id, created: true };
}
