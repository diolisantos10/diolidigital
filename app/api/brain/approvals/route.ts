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
import {
  aprovacaoDoWorkspace,
  artefatoDoWorkspace,
  naoEncontrado,
  solicitacaoDoWorkspace,
} from "@/lib/auth/posse-de-workspace";
import { deveBloquearMutacaoCrossSite } from "@/lib/security/navegacao-cross-site";

// A trava que o vizinho `app/api/brain/portal-data` já explicava num parágrafo
// inteiro e que aqui nunca foi aplicada. O que passava sem ela:
//   • GET   → todas as aprovações e comentários de qualquer solicitação;
//   • PATCH → ligar/desligar `clientVisible` de card alheio (publicar ou sumir
//     com uma peça no portal de outro inquilino);
//   • POST  → comentário VISÍVEL AO CLIENTE no portal de outra agência,
//     assinado como se fosse ela, e a decisão da aprovação dela.
// O último é o pior: não é leitura de dado, é falar em nome de outra agência
// com o cliente dela.

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const clientRequestId = searchParams.get("clientRequestId");
  if (!clientRequestId) {
    return NextResponse.json({ error: "clientRequestId required" }, { status: 400 });
  }
  try {
    if (!(await solicitacaoDoWorkspace(clientRequestId, session.workspaceId))) {
      return naoEncontrado();
    }
    const approvals = await getApprovalsForRequest(clientRequestId);
    return NextResponse.json(approvals);
  } catch {
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;

  // FAIXA 1 do CSRF: liga/desliga a visibilidade de um card no portal do cliente.
  if (deveBloquearMutacaoCrossSite(request)) {
    return NextResponse.json({ error: "Origem não confiável para esta ação." }, { status: 403 });
  }

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
    if (!(await aprovacaoDoWorkspace(id, session.workspaceId))) return naoEncontrado();
    const updated = await setApprovalVisibility(id, body.clientVisible);
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;

  // FAIXA 1 do CSRF: comentário/decisão VISÍVEL AO CLIENTE, assinado como a agência.
  if (deveBloquearMutacaoCrossSite(request)) {
    return NextResponse.json({ error: "Origem não confiável para esta ação." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action as string | undefined;

  try {
    if (action === "comment") {
      const approvalRequestId = body.approvalRequestId as string | undefined;
      if (!approvalRequestId) {
        return NextResponse.json({ error: "approvalRequestId required" }, { status: 400 });
      }
      if (!(await aprovacaoDoWorkspace(approvalRequestId, session.workspaceId))) {
        return naoEncontrado();
      }
      const comment = await addApprovalComment({
        approvalRequestId,
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
      const alvo = body.id as string | undefined;
      if (!alvo) return NextResponse.json({ error: "id required" }, { status: 400 });
      if (!(await aprovacaoDoWorkspace(alvo, session.workspaceId))) return naoEncontrado();
      // ── O AUTOR VEM DA SESSÃO, NÃO DO CORPO (15/08/2026) ────────────────
      // Isto aceitava `body.reviewedBy` cru. Numa rota de SESSÃO DA AGÊNCIA
      // isso é a porta para a casa assinar no lugar do cliente: bastava mandar
      // `"client:Fulano"` e a trava de publicação abriria a porta achando que o
      // cliente tinha liberado a peça. Quem decidiu por aqui é quem está
      // logado, e o carimbo diz isso — `equipe:<email>`, que não publica nada.
      const updated = await updateApprovalStatus(
        alvo,
        body.status as ApprovalStatus,
        `equipe:${session.email}`,
        body.reviewNote as string | undefined,
      );
      return NextResponse.json(updated);
    }

    // Default: create new approval request
    const clientRequestId = body.clientRequestId as string | undefined;
    if (!clientRequestId) {
      return NextResponse.json({ error: "clientRequestId required" }, { status: 400 });
    }
    if (!(await solicitacaoDoWorkspace(clientRequestId, session.workspaceId))) {
      return naoEncontrado();
    }
    // O artefato vinculado é a OUTRA porta do mesmo cômodo: um card meu
    // apontando para o canvas do vizinho é o conteúdo dele entrando aqui.
    const artifactId = body.artifactId as string | undefined;
    if (artifactId && !(await artefatoDoWorkspace(artifactId, session.workspaceId))) {
      return naoEncontrado();
    }
    const approval = await createApprovalRequest({
      clientRequestId,
      department:      body.department as string,
      artifactId,
      requestedBy:     (body.requestedBy as string) ?? "internal",
      clientVisible:   Boolean(body.clientVisible),
    });
    return NextResponse.json(approval, { status: 201 });
  } catch (e) {
    console.error("[brain/approvals] error", e);
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}
