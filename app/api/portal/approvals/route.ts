// Client-facing approval actions — authenticated by portal token, not session.
// The client can approve / request revision / reject ONLY approvals that:
//   - belong to the request (or client) the token was issued for
//   - are marked clientVisible
//   - are still pending

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { validatePortalAccess } from "@/lib/agency/persistence/portal-access-service";
import {
  updateApprovalStatus,
  addApprovalComment,
  type ApprovalStatus,
} from "@/lib/agency/persistence/approval-service";
import { createProjectFromRequest } from "@/lib/agency/execution/create-project-from-request";
import { runProjectExecution } from "@/lib/agency/execution/run-execution";
import { negotiateProposal } from "@/lib/agency/execution/negotiate-proposal";
import { assessResources } from "@/lib/agency/execution/assess-resources";

const ACTION_TO_STATUS: Record<string, ApprovalStatus> = {
  approve:          "approved",
  request_revision: "revision_requested",
  reject:           "rejected",
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: {
    token?: string;
    approvalRequestId?: string;
    action?: string;
    comment?: string;
    authorName?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { token, approvalRequestId, action } = body;
  if (!token || !approvalRequestId || !action) {
    return NextResponse.json(
      { error: "token, approvalRequestId, action required" },
      { status: 400 },
    );
  }

  const status = ACTION_TO_STATUS[action];
  if (!status) {
    return NextResponse.json(
      { error: `Invalid action. Valid: ${Object.keys(ACTION_TO_STATUS).join(", ")}` },
      { status: 400 },
    );
  }

  // 1. Validate the portal token.
  const access = await validatePortalAccess(token);
  if (!access.valid || !access.record) {
    return NextResponse.json({ error: "Access denied", reason: access.reason }, { status: 403 });
  }

  try {
    // 2. Load the approval and verify it belongs to this token's scope.
    const approval = await prisma.approvalRequest.findUnique({
      where: { id: approvalRequestId },
      include: { clientRequest: { select: { id: true, clientId: true } } },
    });
    if (!approval) {
      return NextResponse.json({ error: "Approval not found" }, { status: 404 });
    }

    const tokenRequestId = access.record.clientRequestId;
    const tokenClientId  = access.record.clientId;
    const belongsToToken =
      (tokenRequestId && approval.clientRequestId === tokenRequestId) ||
      (!tokenRequestId && tokenClientId && approval.clientRequest?.clientId === tokenClientId);
    if (!belongsToToken) {
      return NextResponse.json({ error: "Approval not accessible with this token" }, { status: 403 });
    }

    if (!approval.clientVisible) {
      return NextResponse.json({ error: "Approval is not client-visible" }, { status: 403 });
    }
    if (approval.status !== "pending") {
      return NextResponse.json(
        { error: `Approval already decided (${approval.status})` },
        { status: 409 },
      );
    }

    // 3. Apply the decision. reviewedBy records the client identity.
    const clientIdentity = body.authorName?.trim() || `portal:${token.slice(0, 8)}…`;
    const updated = await updateApprovalStatus(
      approvalRequestId,
      status,
      `client:${clientIdentity}`,
      body.comment?.trim() || undefined,
    );

    // 4. Persist the comment as a client-visible ApprovalComment.
    if (body.comment?.trim()) {
      await addApprovalComment({
        approvalRequestId,
        authorName:      clientIdentity,
        authorRole:      "client",
        body:            body.comment.trim(),
        isClientVisible: true,
      });
    }

    // The client approving a PROPOSAL is what creates the project and sets the
    // agents running — the whole point of "the client decides". Best-effort:
    // a failure here never blocks the approval response (a cron also recovers
    // stuck execution).
    let projectId: string | undefined;
    if (approval.department === "proposal" && status === "approved" && approval.clientRequestId) {
      try {
        const created = await createProjectFromRequest(approval.clientRequestId, `client:${clientIdentity}`);
        if (created.ok) {
          projectId = created.projectId;
          // Resource gate: do we have everything to create what the client asked
          // for? YES → produce. NO → request exactly what's missing and hold.
          const gate = await assessResources(approval.clientRequestId);
          if (gate.sufficient) {
            void runProjectExecution(created.projectId).catch(() => {});
          } else {
            for (const m of gate.missing) {
              await prisma.materialRequest.create({ data: { projectId: created.projectId, type: m.type, description: m.description } });
            }
            const list = gate.missing.map((m) => `• ${m.description}`).join("\n");
            await prisma.portalMessage.create({
              data: {
                clientRequestId: approval.clientRequestId, authorRole: "team", authorName: "Equipe Dioli",
                body: `Seu projeto foi aprovado! 🎉 Pra gente começar a produzir com qualidade, só precisamos de alguns materiais seus:\n\n${list}\n\nÉ só enviar na aba "Materiais" aqui do portal — assim que chegarem, os agentes começam na hora. 💛`,
                readByTeam: false,
              },
            });
          }
        }
      } catch (e) {
        console.error("[portal/approvals] proposal→project error", e);
      }
    }

    // Client rejected or asked to revise the proposal → the SDR re-engages to
    // negotiate (within the budget agent's floor) and re-opens an offer.
    if (approval.department === "proposal" && (status === "rejected" || status === "revision_requested") && approval.clientRequestId) {
      try { await negotiateProposal(approval.clientRequestId, body.comment); }
      catch (e) { console.error("[portal/approvals] negotiate error", e); }
    }

    return NextResponse.json({
      id:         updated.id,
      status:     updated.status,
      reviewedAt: updated.reviewedAt,
      ...(projectId ? { projectId, executionStarted: true } : {}),
    });
  } catch (e) {
    console.error("[portal/approvals] POST error", e);
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}
