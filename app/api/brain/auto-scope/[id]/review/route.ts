// POST /api/brain/auto-scope/[id]/review — PM confirms section decisions.
// Body: { decisions: { [dept]: { action: "approved"|"revision", note?: string } } }
// All approved → creates Project+Tasks via PM orchestrator, status="in_progress".
// Any revision → marks those artifacts "needs_revision", status="needs_revision".

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { naoEncontrado, solicitacaoDoWorkspace } from "@/lib/auth/posse-de-workspace";
import { prisma } from "@/lib/db/client";
import { pedirDirecao } from "@/lib/agency/esteira/marcos";
import { createProjectFromRequest } from "@/lib/agency/execution/create-project-from-request";

const AGENCY_ROLES = ["master", "project_manager"] as const;

type Params = { id: string };

export async function POST(
  request: NextRequest,
  context: { params: Promise<Params> },
): Promise<NextResponse> {
  const { session, error } = await requireSession([...AGENCY_ROLES]);
  if (error) return error;
  if (session.clientId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: clientRequestId } = await context.params;

  let body: { decisions?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.decisions || typeof body.decisions !== "object" || Array.isArray(body.decisions)) {
    return NextResponse.json({ error: "decisions object required" }, { status: 400 });
  }

  const decisions = body.decisions as Record<string, { action: string; note?: string }>;
  const revisionDepts = Object.entries(decisions)
    .filter(([, d]) => d.action === "revision")
    .map(([dept]) => dept);
  const allApproved = revisionDepts.length === 0;

  try {
    // Mesma adoção do /orchestrate/apply, mesmo risco: aprovar o escopo de uma
    // solicitação alheia criava Cliente, Projeto e Tarefas NESTE workspace a
    // partir do briefing dela — e reescrevia o `workspaceId` dela para cá.
    if (!(await solicitacaoDoWorkspace(clientRequestId, session.workspaceId))) {
      return naoEncontrado();
    }
    const req = await prisma.clientRequestDb.findUnique({ where: { id: clientRequestId } });
    if (!req) return NextResponse.json({ error: "ClientRequest not found" }, { status: 404 });

    if (allApproved) {
      // Idempotency guard: if a project was already created for this request
      // (double submit, retry, re-opening the scope page), return it instead of
      // creating a duplicate. This is what caused two identical projects.
      const existingProject = await prisma.project.findFirst({
        where: { clientRequestId },
        orderBy: { createdAt: "asc" },
      });
      if (existingProject) {
        return NextResponse.json(
          { ok: true, action: "approved_all", projectId: existingProject.id, alreadyApproved: true },
          { status: 200 },
        );
      }

      // ── A PORTA É UMA SÓ ────────────────────────────────────────────────
      // Até 07/08/2026 esta rota tinha uma CÓPIA da criação de projeto — e a
      // cópia estava incompleta. Faltavam nela as duas etapas que só existiam
      // no helper compartilhado:
      //
      //   • `semearMarcaDoBriefing` — sem ela o `BrandBrain` do cliente nasce
      //     VAZIO, e `moldeDoCliente` (design/molde.ts:198) cai no molde
      //     NEUTRO: o cliente recebe a peça cinza padrão em vez da cor dele,
      //     e nada na tela diz que aquele cinza é ausência de marca;
      //   • `coletarMaterialDeProduto` — sem ela o pedido de captura de tela,
      //     embalagem e uniforme nunca é aberto, e o Design nunca põe o
      //     produto do cliente na peça (o defeito medido em
      //     `docs/projetos/foocci/comparativo-06-08.md`: 0 de 6 contra 7 de 10).
      //
      // O comentário logo abaixo já dizia "dois caminhos com comportamentos
      // diferentes é exatamente como nasce sistema imprevisível" — e o arquivo
      // era o exemplo do que ele alertava. Agora as duas portas são a MESMA
      // função: `createProjectFromRequest`, que aprova os artefatos, monta o
      // snapshot, orquestra o PM, cria o Cliente quando falta, semeia a marca,
      // abre a coleta de material, cria as tarefas pelo portão do PM e é
      // idempotente por `clientRequestId`.
      const criacao = await createProjectFromRequest(clientRequestId, session.name);
      if (!criacao.ok) {
        return NextResponse.json({ error: criacao.error }, { status: 503 });
      }

      // A ESTEIRA ANDA SOZINHA: nasce o projeto, o cliente já recebe a direção
      // para avalizar. Aprovou, a produção dispara.
      const direcao = await pedirDirecao(criacao.projectId).catch(() => ({ ok: false, avisouCliente: false }));

      return NextResponse.json(
        { ok: true, action: "approved_all", projectId: criacao.projectId, direcaoEnviada: direcao.avisouCliente === true },
        { status: 201 },
      );
    } else {
      // Mark revision artifacts and update request status.
      await prisma.brainArtifact.updateMany({
        where: { clientRequestId, department: { in: revisionDepts }, status: "draft" },
        data: { status: "needs_revision" },
      });

      // Save revision notes as ApprovalRequest records (one per department).
      for (const dept of revisionDepts) {
        const note = decisions[dept]?.note?.trim();
        if (note) {
          await prisma.approvalRequest.create({
            data: {
              clientRequestId,
              department: dept,
              requestedBy: session.name,
              status: "needs_revision",
              reviewNote: note,
            },
          }).catch(() => {}); // best-effort
        }
      }

      await prisma.clientRequestDb.update({
        where: { id: clientRequestId },
        data: { status: "needs_revision" },
      });

      return NextResponse.json({ ok: true, action: "revisions_requested", depts: revisionDepts });
    }
  } catch (e) {
    console.error("[brain/auto-scope/review] error", e);
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}
