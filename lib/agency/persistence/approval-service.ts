import { prisma } from "@/lib/db/client";

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "revision_requested"
  | "rejected"
  | "cancelled";

export interface CreateApprovalRequestInput {
  /** A solicitação (fluxo Brain). Opcional desde 04/08/2026: cliente criado
   *  DIRETO não tem ClientRequestDb — a posse passa a ser este campo OU
   *  `clientId`. Pelo menos um é obrigatório. */
  clientRequestId?: string;
  /** O dono quando não há solicitação (cliente direto — caso Foocci). */
  clientId?: string;
  department: string;
  artifactId?: string;
  requestedBy?: string;
  clientVisible?: boolean;
  expiresAt?: Date;
  /** O corpo do card como o portal renderiza: "Título\n\nconteúdo". */
  reviewNote?: string;
  /** Posts do calendário que este card decide — marca a ORIGEM calendário e é
   *  o que a decisão do cliente propaga (aprovar/ajustar). */
  sourcePostIds?: string[];
}

export interface AddCommentInput {
  approvalRequestId: string;
  authorName: string;
  authorRole?: "internal" | "client";
  /** "comment" (default) · "question" (dúvida do cliente, presa ao card) ·
   *  "answer" (resposta da agência à dúvida). */
  kind?: "comment" | "question" | "answer";
  body: string;
  isClientVisible?: boolean;
}

export async function createApprovalRequest(input: CreateApprovalRequestInput) {
  // Aprovação sem dono é card órfão: ninguém consegue vê-lo nem decidi-lo.
  // Falhar aqui, alto, é melhor do que gravar um registro invisível.
  if (!input.clientRequestId && !input.clientId) {
    throw new Error("createApprovalRequest: informe clientRequestId ou clientId — aprovação precisa de dono");
  }
  return prisma.approvalRequest.create({
    data: {
      clientRequestId: input.clientRequestId ?? null,
      clientId:        input.clientId ?? null,
      department:      input.department,
      artifactId:      input.artifactId,
      requestedBy:     input.requestedBy  ?? "internal",
      clientVisible:   input.clientVisible ?? false,
      expiresAt:       input.expiresAt,
      reviewNote:      input.reviewNote,
      sourcePostIdsJson: JSON.stringify(input.sourcePostIds ?? []),
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
      // Sem nota nova, a existente FICA: no card de calendário o reviewNote é o
      // corpo que o cliente leu — apagá-lo no "aprovar" deixaria a decisão
      // registrada sem dizer o que foi decidido.
      ...(reviewNote !== undefined ? { reviewNote } : {}),
    },
  });
}

export async function addApprovalComment(input: AddCommentInput) {
  const comment = await prisma.approvalComment.create({
    data: {
      approvalRequestId: input.approvalRequestId,
      authorName:        input.authorName,
      authorRole:        input.authorRole ?? "internal",
      kind:              input.kind ?? "comment",
      body:              input.body,
      isClientVisible:   input.isClientVisible ?? false,
    },
  });

  // ── DESPAUSA DO PRAZO (Fase 2, T5b) ──────────────────────────────────────
  // Dúvida aberta pausa o `expiresAt`: o relógio não corre contra o cliente
  // enquanto a bola está com a agência. Quando a agência responde no card
  // (comentário interno visível ao cliente), o tempo que ficou pausado é
  // DEVOLVIDO ao prazo — despausar sem devolver seria punir quem perguntou.
  if ((input.authorRole ?? "internal") !== "client" && (input.isClientVisible ?? false)) {
    const approval = await prisma.approvalRequest.findUnique({
      where: { id: input.approvalRequestId },
      select: { questionOpenedAt: true, expiresAt: true },
    });
    if (approval?.questionOpenedAt) {
      const pausadoMs = Date.now() - approval.questionOpenedAt.getTime();
      await prisma.approvalRequest.update({
        where: { id: input.approvalRequestId },
        data: {
          questionOpenedAt: null,
          ...(approval.expiresAt
            ? { expiresAt: new Date(approval.expiresAt.getTime() + Math.max(0, pausadoMs)) }
            : {}),
        },
      });
    }
  }

  return comment;
}

export async function setApprovalVisibility(id: string, clientVisible: boolean) {
  return prisma.approvalRequest.update({
    where: { id },
    data: { clientVisible },
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
