// Client-facing approval actions — authenticated by portal token, not session.
// The client can approve / request revision / reject ONLY approvals that:
//   - belong to the request (or client) the token was issued for
//   - are marked clientVisible
//   - are still pending

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { validatePortalAccess } from "@/lib/agency/persistence/portal-access-service";
import { tokenDoPortal } from "@/lib/agency/persistence/portal-cookie";
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

// "Tenho uma dúvida" (Fase 2, caminho C) não está no mapa acima de propósito:
// dúvida NÃO é decisão — o status permanece "pending" e o prazo pausa.
const ACTION_QUESTION = "question";

// Ajuste e rejeição sem comentário não ensinam nada à refação — a spec manda
// 400 no backend (Fase 2, T3/T4). "Tenho uma dúvida" sem texto é um card mudo.
const ACTIONS_REQUIRING_COMMENT = new Set(["request_revision", "reject", ACTION_QUESTION]);

/** Lê os ids de post de um card de calendário. JSON quebrado vira lista vazia —
 *  nunca exceção: um campo corrompido não pode engolir a decisão do cliente. */
function lerListaDeIds(bruto: string | null | undefined): string[] {
  try {
    const v = JSON.parse(bruto ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

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

  // A4: o token pode vir no corpo (links antigos) ou no cookie httpOnly de
  // sessão do portal — o cookie é o caminho novo, o corpo é compatibilidade.
  const token = tokenDoPortal(request, body.token);
  const { approvalRequestId, action } = body;
  if (!token || !approvalRequestId || !action) {
    return NextResponse.json(
      { error: "token, approvalRequestId, action required" },
      { status: 400 },
    );
  }

  const status = ACTION_TO_STATUS[action];
  if (!status && action !== ACTION_QUESTION) {
    return NextResponse.json(
      { error: `Invalid action. Valid: ${[...Object.keys(ACTION_TO_STATUS), ACTION_QUESTION].join(", ")}` },
      { status: 400 },
    );
  }

  // Validado ANTES de qualquer efeito: até 03/08/2026 o código aceitava
  // "solicitar ajustes" sem uma palavra — e a refação, sem as palavras do
  // cliente, refazia no escuro (Fase 1, 1.10). A UI reforça; a trava é aqui.
  if (ACTIONS_REQUIRING_COMMENT.has(action) && !body.comment?.trim()) {
    return NextResponse.json(
      { error: "Comentário obrigatório: conte o que precisa mudar (ou qual é a dúvida) para a equipe agir." },
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

    // Posse por OR: a aprovação pode pertencer ao token pela SOLICITAÇÃO
    // (fluxo Brain) ou pelo CLIENTE direto (`ApprovalRequest.clientId` —
    // caso Foocci, sem ClientRequestDb). Dono sempre derivado do token; a
    // derivação por clientId só roda quando a chave de solicitação não bateu.
    const tokenRequestId = access.record.clientRequestId;
    let belongsToToken = !!tokenRequestId && approval.clientRequestId === tokenRequestId;
    if (!belongsToToken) {
      let tokenClientId = access.record.clientId;
      if (!tokenClientId && tokenRequestId) {
        const solicitacao = await prisma.clientRequestDb.findUnique({
          where: { id: tokenRequestId }, select: { clientId: true },
        });
        tokenClientId = solicitacao?.clientId ?? null;
      }
      belongsToToken = !!tokenClientId && (
        approval.clientId === tokenClientId ||
        approval.clientRequest?.clientId === tokenClientId
      );
    }
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

    const clientIdentity = body.authorName?.trim() || `portal:${token.slice(0, 8)}…`;

    // ── CAMINHO C — "TENHO UMA DÚVIDA" ────────────────────────────────────────
    // Não decide nada: o status continua "pending", a dúvida fica PRESA ao card
    // (ApprovalComment kind "question", não numa thread geral) e o relógio do
    // prazo pausa — não pode correr contra o cliente enquanto a bola está com
    // a agência (Fase 2, T5). A resposta da agência despausa
    // (approval-service.addApprovalComment).
    if (action === ACTION_QUESTION) {
      await addApprovalComment({
        approvalRequestId,
        authorName:      clientIdentity,
        authorRole:      "client",
        kind:            "question",
        body:            body.comment!.trim(),
        isClientVisible: true,
      });
      if (!approval.questionOpenedAt) {
        await prisma.approvalRequest.update({
          where: { id: approvalRequestId },
          data: { questionOpenedAt: new Date() },
        });
      }
      return NextResponse.json({ id: approvalRequestId, status: "pending", questionOpen: true });
    }

    // Card de CALENDÁRIO (origem: /api/social-posts/aprovacao): o reviewNote é
    // o corpo que o cliente leu — a decisão não pode reescrevê-lo com o
    // comentário (que já fica registrado como ApprovalComment logo abaixo).
    const postsDoCard = lerListaDeIds(approval.sourcePostIdsJson);

    // 3. Apply the decision. reviewedBy records the client identity.
    // (`status` é garantido aqui: a única ação sem status é "question", que já
    // retornou acima.)
    const updated = await updateApprovalStatus(
      approvalRequestId,
      status!,
      `client:${clientIdentity}`,
      postsDoCard.length > 0 ? undefined : (body.comment?.trim() || undefined),
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

    // ── A DECISÃO PROPAGA AOS POSTS DO CARD ───────────────────────────────────
    // É o fechamento do circuito do Lote 1: o clique do cliente nunca pode
    // "gravar um status e acabar ali". Aprovar → as peças viram "approved"
    // (prontas para o agendamento); pedir ajuste ou recusar → viram
    // "revision_requested", e o comentário (obrigatório nas duas) já está no
    // registro do card como ApprovalComment. Filtro por clientId do CARD: um id
    // de post de outro cliente dentro do JSON não seria tocado.
    if (postsDoCard.length > 0 && approval.clientId) {
      const statusDosPosts = status === "approved" ? "approved" : "revision_requested";
      await prisma.socialPost.updateMany({
        where: { id: { in: postsDoCard }, clientId: approval.clientId },
        data: { status: statusDosPosts },
      }).catch((e) => console.error("[portal/approvals] propagação aos posts falhou", e));
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

    // ── O CLIENTE FALOU SOBRE UMA ENTREGA ─────────────────────────────────────
    // Até 02/08/2026 nada acontecia aqui. Os três botões existiam no portal e
    // só o de proposta fazia efeito: o clique numa ENTREGA gravava um status e
    // acabava ali. Nada refeito, ninguém avisado, e a tela do cliente dizia
    // "revisão solicitada" para sempre. Ele acreditava que tinha pedido; a
    // agência não sabia que fora pedido.
    //
    // Best-effort de propósito: a resposta ao clique do cliente nunca depende
    // de uma chamada de IA dar certo.
    if (approval.department !== "proposal" && approval.clientRequestId) {
      if (status === "rejected" || status === "revision_requested") {
        try {
          const { refazerPorPedidoDoCliente } = await import("@/lib/agency/esteira/refacao");
          await refazerPorPedidoDoCliente({
            clientRequestId: approval.clientRequestId,
            department: approval.department,
            comentario: body.comment,
          });
        } catch (e) { console.error("[portal/approvals] refação error", e); }
      }

      // Aprovou a última pendência? Então ele aprovou o pacote — e é isso que
      // abre a operação contínua. Sem esta ponte, `aprovarPacote` só era
      // alcançável por alguém da agência clicando por ele.
      if (status === "approved") {
        try {
          const restantes = await prisma.approvalRequest.count({
            where: { clientRequestId: approval.clientRequestId, status: "pending", clientVisible: true },
          });
          if (restantes === 0) {
            const projeto = await prisma.project.findFirst({
              where: { clientRequestId: approval.clientRequestId, clientApprovedAt: null, presentedAt: { not: null } },
              select: { id: true },
              orderBy: { createdAt: "desc" },
            });
            if (projeto) {
              const { aprovarPacote } = await import("@/lib/agency/esteira/marcos");
              await aprovarPacote(projeto.id);
            }
          }
        } catch (e) { console.error("[portal/approvals] aprovarPacote error", e); }
      }
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
