// POST /api/admin/reset-request  { requestId: string }
//
// Surgical reset of ONE client request back to the post-SDR / briefing stage.
// KEEPS: the ClientRequest (the briefing), the Client, the BrandBrain.
// DELETES everything produced after the briefing: project(s) + all their
// children (tasks, deliverables, strategy rooms, material requests, timeline
// events, project briefings), the Brain scope artifacts, the client-facing
// approval requests, and the portal conversation. Status returns to "new".
//
// Auth: a master session OR the x-admin-secret header (== ADMIN_TASK_SECRET env).
// Scoped to a single request by id or businessName — never a global wipe.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { runProjectExecution } from "@/lib/agency/execution/run-execution";
import { buildClientSnapshot } from "@/lib/dioli-brain/client-snapshot";
import { orchestratePMReasoning } from "@/lib/dioli-brain/pm-orchestrator";
import { createApprovalRequest } from "@/lib/agency/persistence/approval-service";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = request.headers.get("x-admin-secret");
  const secretOk = !!process.env.ADMIN_TASK_SECRET && secret === process.env.ADMIN_TASK_SECRET;

  let workspaceScope: string | undefined;
  if (!secretOk) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.role !== "master") {
      return NextResponse.json({ error: "Forbidden — master role required" }, { status: 403 });
    }
    workspaceScope = session.workspaceId;
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  const businessName = typeof body.businessName === "string" ? body.businessName.trim() : "";
  if (!requestId && !businessName) {
    return NextResponse.json({ error: "requestId ou businessName obrigatório" }, { status: 400 });
  }

  const keepMostRecent = body.keepMostRecent === true;

  // Thorough: ALL requests for this business (there may be duplicates), and ALL
  // projects for the linked client(s) — including any orphaned/mislinked ones.
  const requests = await prisma.clientRequestDb.findMany({
    where: {
      ...(workspaceScope ? { workspaceId: workspaceScope } : {}),
      ...(requestId ? { id: requestId } : { businessName: { contains: businessName } }),
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, clientId: true, businessName: true, createdAt: true, status: true },
  });
  if (requests.length === 0) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });

  const action = typeof body.action === "string" ? body.action : "";
  const reqIds0 = requests.map((r) => r.id);
  const clientIds0 = [...new Set(requests.map((r) => r.clientId).filter((c): c is string => !!c))];
  const projectWhere = { OR: [{ clientRequestId: { in: reqIds0 } }, ...(clientIds0.length ? [{ clientId: { in: clientIds0 } }] : [])] };

  // Read-only: where is this business in the pipeline right now?
  if (action === "status") {
    const projects = await prisma.project.findMany({
      where: projectWhere,
      select: { id: true, name: true, stage: true, proposalStatus: true, executionStatus: true, executionError: true, createdAt: true },
    });
    const projectIds = projects.map((p) => p.id);
    const [deliverables, approvals, messages, artifacts] = await Promise.all([
      prisma.deliverable.count({ where: { projectId: { in: projectIds } } }),
      prisma.approvalRequest.count({ where: { clientRequestId: { in: reqIds0 } } }),
      prisma.portalMessage.count({ where: { clientRequestId: { in: reqIds0 } } }),
      prisma.brainArtifact.count({ where: { clientRequestId: { in: reqIds0 } } }),
    ]);
    const pendingProposals = await prisma.approvalRequest.count({ where: { clientRequestId: { in: reqIds0 }, department: "proposal", status: "pending" } });
    const portal = await prisma.portalAccess.findFirst({ where: { clientRequestId: { in: reqIds0 }, revokedAt: null }, select: { token: true } });
    return NextResponse.json({
      ok: true, action: "status", businessName: requests[0].businessName,
      requests: requests.map((r) => ({ id: r.id, status: r.status, createdAt: r.createdAt })),
      projects, counts: { deliverables, approvals, messages, artifacts, pendingProposals },
      portalToken: portal?.token ?? null,
    });
  }

  // Agency sends the proposal to the client: generate it, drop a readable
  // summary in the portal, and create a client-visible "proposal" approval.
  // The CLIENT approving it (in the portal) is what creates the project.
  if (action === "send-proposal") {
    const target = requests[0];
    const snapshot = await buildClientSnapshot(target.id);
    if (!snapshot) return NextResponse.json({ ok: false, error: "Snapshot indisponível — briefing incompleto?" }, { status: 409 });
    const proposal = await orchestratePMReasoning(snapshot);
    const scopeLines = (proposal.tasks ?? []).slice(0, 8).map((t: { title: string }) => `• ${t.title}`).join("\n");
    const msg = `📋 ${target.businessName}, sua proposta está pronta!\n\n*${proposal.name}*\nObjetivo: ${proposal.goal}\n\nO que vamos fazer:\n${scopeLines}\n\nRevise e, se estiver tudo certo, é só aprovar aqui no portal que a equipe já começa. Se quiser ajustar algo, me diz. 🚀`;
    await prisma.portalMessage.create({
      data: { clientRequestId: target.id, authorRole: "team", authorName: "Equipe Dioli", body: msg, readByTeam: true },
    });
    const approval = await createApprovalRequest({ clientRequestId: target.id, department: "proposal", requestedBy: "Agência", clientVisible: true });
    await prisma.clientRequestDb.update({ where: { id: target.id }, data: { status: "scope_ready" } });
    // Ensure the client has portal access to read + approve the proposal.
    let portal = await prisma.portalAccess.findFirst({ where: { clientRequestId: target.id, revokedAt: null } });
    if (!portal) portal = await prisma.portalAccess.create({ data: { clientRequestId: target.id, clientId: target.clientId ?? undefined } });
    return NextResponse.json({ ok: true, action: "send-proposal", businessName: target.businessName, approvalId: approval.id, proposalName: proposal.name, portalToken: portal.token });
  }

  // Fire the durable execution core for this business's project (must exist).
  if (action === "fire") {
    const project = await prisma.project.findFirst({ where: projectWhere, orderBy: { createdAt: "desc" }, select: { id: true } });
    if (!project) {
      return NextResponse.json({ ok: false, action: "fire", error: "Sem projeto — gere o escopo e aprove primeiro (ou marca parceira)." }, { status: 409 });
    }
    const result = await runProjectExecution(project.id);
    return NextResponse.json({ ok: true, action: "fire", projectId: project.id, result });
  }

  // Dedupe: keep the most recent request (index 0), delete the older duplicates
  // (cascades their artifacts/approvals/messages). The kept briefing stays.
  if (keepMostRecent && requests.length > 1) {
    const older = requests.slice(1).map((r) => r.id);
    const del = await prisma.clientRequestDb.deleteMany({ where: { id: { in: older } } });
    return NextResponse.json({
      ok: true, action: "dedupe", businessName: requests[0].businessName,
      kept: requests[0].id, keptCreatedAt: requests[0].createdAt, deletedDuplicates: del.count,
    });
  }

  const reqIds = requests.map((r) => r.id);
  const clientIds = [...new Set(requests.map((r) => r.clientId).filter((c): c is string => !!c))];

  // Projects linked either by request OR by client (catches mislinked/orphaned).
  const projects = await prisma.project.findMany({
    where: { OR: [{ clientRequestId: { in: reqIds } }, ...(clientIds.length ? [{ clientId: { in: clientIds } }] : [])] },
    select: { id: true },
  });
  const projectIds = projects.map((p) => p.id);

  const removed = { requests: reqIds.length, projects: projectIds.length, artifacts: 0, approvals: 0, messages: 0 };

  await prisma.$transaction(async (tx) => {
    if (projectIds.length) {
      await tx.activityEvent.updateMany({ where: { projectId: { in: projectIds } }, data: { projectId: null } });
      await tx.aIRunLog.updateMany({ where: { projectId: { in: projectIds } }, data: { projectId: null } });
      await tx.project.deleteMany({ where: { id: { in: projectIds } } });
    }
    removed.artifacts = (await tx.brainArtifact.deleteMany({ where: { clientRequestId: { in: reqIds } } })).count;
    removed.approvals = (await tx.approvalRequest.deleteMany({ where: { clientRequestId: { in: reqIds } } })).count;
    removed.messages  = (await tx.portalMessage.deleteMany({ where: { clientRequestId: { in: reqIds } } })).count;
    // All matching requests back to the post-SDR briefing stage.
    await tx.clientRequestDb.updateMany({ where: { id: { in: reqIds } }, data: { status: "new" } });
  });

  return NextResponse.json({
    ok: true,
    businessName: requests[0].businessName,
    resetTo: "new",
    removed,
  });
}
