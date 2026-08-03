import { NextRequest, NextResponse } from "next/server";
import {
  createApprovalRequest,
  updateApprovalStatus,
  addApprovalComment,
  getApprovalsForRequest,
  setApprovalVisibility,
} from "@/lib/agency/persistence/approval-service";
import type { ApprovalStatus } from "@/lib/agency/persistence/approval-service";
import { requireSession } from "@/lib/auth/api-guard";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { error } = await requireSession();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const clientRequestId = searchParams.get("clientRequestId");
  if (!clientRequestId) {
    return NextResponse.json({ error: "clientRequestId required" }, { status: 400 });
  }
  try {
    const approvals = await getApprovalsForRequest(clientRequestId);
    return NextResponse.json(approvals);
  } catch {
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const { error } = await requireSession();
  if (error) return error;

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = body.id as string | undefined;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  if (typeof body.clientVisible !== "boolean") {
    return NextResponse.json({ error: "clientVisible (boolean) required" }, { status: 400 });
  }

  try {
    const updated = await setApprovalVisibility(id, body.clientVisible);
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { error } = await requireSession();
  if (error) return error;

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action as string | undefined;

  try {
    if (action === "comment") {
      const comment = await addApprovalComment({
        approvalRequestId: body.approvalRequestId as string,
        authorName: (body.authorName as string) ?? "internal",
        authorRole: (body.authorRole as "internal" | "client") ?? "internal",
        // "answer" marca a resposta da agência a uma dúvida do cliente — é o
        // que o card usa para mostrar o par pergunta→resposta (Fase 2, T5b).
        kind: (body.kind as "comment" | "question" | "answer") ?? "comment",
        body: body.body as string,
        isClientVisible: Boolean(body.isClientVisible),
      });
      return NextResponse.json(comment, { status: 201 });
    }

    if (action === "update_status") {
      const updated = await updateApprovalStatus(
        body.id as string,
        body.status as ApprovalStatus,
        body.reviewedBy as string | undefined,
        body.reviewNote as string | undefined,
      );
      return NextResponse.json(updated);
    }

    // Default: create new approval request
    const approval = await createApprovalRequest({
      clientRequestId: body.clientRequestId as string,
      department:      body.department as string,
      artifactId:      body.artifactId as string | undefined,
      requestedBy:     (body.requestedBy as string) ?? "internal",
      clientVisible:   Boolean(body.clientVisible),
    });
    return NextResponse.json(approval, { status: 201 });
  } catch (e) {
    console.error("[brain/approvals] error", e);
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}
