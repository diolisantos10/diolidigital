// Admin operational data reset — clears test/pilot records from all
// operational tables while preserving workspace, users, auth, and migrations.
//
// DELETE /api/admin/reset
//   Requires: master role session
//   Body:     { confirm: "DELETE_ALL_OPERATIONAL_DATA" }
//   Returns:  { before, after, tablesCleared }
//
// This endpoint exists to support clean-slate rehearsal runs before the
// first real client session. Remove or gate behind env flag post-launch.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";

const CONFIRM_PHRASE = "DELETE_ALL_OPERATIONAL_DATA";

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "master")
    return NextResponse.json({ error: "Forbidden — master role required" }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.confirm !== CONFIRM_PHRASE) {
    return NextResponse.json(
      { error: `confirm phrase required: "${CONFIRM_PHRASE}"` },
      { status: 400 },
    );
  }

  // Count before
  const [
    clientRequests, artifacts, approvals, comments, evidence, portalAccess,
    clients, projects,
  ] = await Promise.all([
    prisma.clientRequestDb.count(),
    prisma.brainArtifact.count(),
    prisma.approvalRequest.count(),
    prisma.approvalComment.count(),
    prisma.evidenceItem.count(),
    prisma.portalAccess.count(),
    prisma.client.count(),
    prisma.project.count(),
  ]);

  const before = { clientRequests, artifacts, approvals, comments, evidence, portalAccess, clients, projects };

  // Delete order: children without cascade first, then parents (which cascade the rest)
  await prisma.evidenceItem.deleteMany({});
  await prisma.portalAccess.deleteMany({});
  // clientRequestDb cascades → BrainArtifact, ApprovalRequest → ApprovalComment
  await prisma.clientRequestDb.deleteMany({});
  // client cascades → Project → Deliverable, MaterialRequest, Task, TimelineEvent, Briefing, StrategyRoom
  // also cascades → BrandBrain, BrandUpdate
  await prisma.client.deleteMany({});

  // Count after
  const [
    clientRequestsA, artifactsA, approvalsA, commentsA, evidenceA, portalAccessA,
    clientsA, projectsA,
  ] = await Promise.all([
    prisma.clientRequestDb.count(),
    prisma.brainArtifact.count(),
    prisma.approvalRequest.count(),
    prisma.approvalComment.count(),
    prisma.evidenceItem.count(),
    prisma.portalAccess.count(),
    prisma.client.count(),
    prisma.project.count(),
  ]);

  const after = { clientRequests: clientRequestsA, artifacts: artifactsA, approvals: approvalsA, comments: commentsA, evidence: evidenceA, portalAccess: portalAccessA, clients: clientsA, projects: projectsA };

  return NextResponse.json({
    ok: true,
    tablesCleared: ["evidenceItem", "portalAccess", "clientRequestDb", "client"],
    before,
    after,
  });
}
