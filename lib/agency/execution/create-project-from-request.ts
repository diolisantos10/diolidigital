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
import { generate } from "@/lib/ai/generate";

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
  const proposal = await orchestratePMReasoning(snapshot, workspaceId);

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

  // Phase 2 — released ONLY after the client approves: the detailed schedule.
  // Kept out of the proposal so the plan isn't exposed before the deal closes.
  // Best-effort: never blocks project creation.
  try {
    const sched = await generate({
      system: "Você é um Project Manager de uma agência de marketing brasileira. Monte um cronograma simples e claro para um cliente que NÃO é da área (sem jargão). Responda SOMENTE JSON válido.",
      user: `Projeto: ${proposal.name}. Objetivo: ${proposal.goal}.\nEntregas previstas: ${(proposal.tasks ?? []).map((t) => t.title).slice(0, 10).join("; ")}.\nMonte um cronograma de 4 semanas: em cada semana, 2 a 3 coisas que acontecem, em linguagem simples e direta.\nJSON: {"weeks":[{"label":"Semana 1","items":["...","..."]}]}`,
      maxTokens: 900, workspaceId, preferredProvider: "claude",
    });
    if (sched.ok) {
      const weeks = ((sched.data as { weeks?: Array<{ label?: string; items?: string[] }> }).weeks ?? []).slice(0, 6);
      if (weeks.length) {
        const body = "🗓️ Seu projeto foi aprovado! Aqui está o cronograma de como tudo vai acontecer:\n\n" +
          weeks.map((w) => `*${w.label ?? "Etapa"}*\n${(w.items ?? []).map((i) => `• ${i}`).join("\n")}`).join("\n\n");
        await prisma.portalMessage.create({
          data: { clientRequestId, authorRole: "team", authorName: "Equipe Dioli", body, readByTeam: true },
        });
      }
    }
  } catch { /* schedule is best-effort */ }

  return { ok: true, projectId: project.id, created: true };
}
