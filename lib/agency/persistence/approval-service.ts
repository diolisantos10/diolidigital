import { prisma } from "@/lib/db/client";

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "revision_requested"
  | "rejected"
  | "cancelled";

export interface CreateApprovalRequestInput {
  clientRequestId: string;
  department: string;
  artifactId?: string;
  requestedBy?: string;
  clientVisible?: boolean;
  expiresAt?: Date;
}

export interface AddCommentInput {
  approvalRequestId: string;
  authorName: string;
  authorRole?: "internal" | "client";
  body: string;
  isClientVisible?: boolean;
}

export async function createApprovalRequest(input: CreateApprovalRequestInput) {
  return prisma.approvalRequest.create({
    data: {
      clientRequestId: input.clientRequestId,
      department:      input.department,
      artifactId:      input.artifactId,
      requestedBy:     input.requestedBy  ?? "internal",
      clientVisible:   input.clientVisible ?? false,
      expiresAt:       input.expiresAt,
      status:          "pending",
    },
  });
}

export async function updateApprovalStatus(
  id: string,
  status: ApprovalStatus,
  reviewedBy?: string,
  reviewNote?: string,
) {
  return prisma.approvalRequest.update({
    where: { id },
    data: {
      status,
      reviewedBy: reviewedBy ?? null,
      reviewedAt: new Date(),
      reviewNote: reviewNote ?? null,
    },
  });
}

export async function addApprovalComment(input: AddCommentInput) {
  return prisma.approvalComment.create({
    data: {
      approvalRequestId: input.approvalRequestId,
      authorName:        input.authorName,
      authorRole:        input.authorRole ?? "internal",
      body:              input.body,
      isClientVisible:   input.isClientVisible ?? false,
    },
  });
}

export async function getApprovalsForRequest(clientRequestId: string) {
  return prisma.approvalRequest.findMany({
    where: { clientRequestId },
    include: { comments: { orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getLatestApproval(clientRequestId: string, department: string) {
  return prisma.approvalRequest.findFirst({
    where: { clientRequestId, department },
    orderBy: { createdAt: "desc" },
    include: { comments: true },
  });
}
