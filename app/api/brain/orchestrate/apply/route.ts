// POST /api/brain/orchestrate/apply — the ONLY state-mutating orchestrator route.
//
// Agency role only. Reads { clientRequestId, proposal }, validates the proposal
// shape, then creates the Project + Tasks via Prisma and advances the request
// status. This route exists precisely so that nothing is ever created without an
// explicit, human-confirmed apply call (Law 2).

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { naoEncontrado, solicitacaoDoWorkspace } from "@/lib/auth/posse-de-workspace";
import { prisma } from "@/lib/db/client";
import { despacharPlanoPeloGerenteGeral, frazeDoDespacho } from "@/lib/agency/gerencia/entrada-da-demanda";
import { escopoDoBriefingJson } from "@/lib/agency/gerencia/contrato-do-plano";
import { pedirDirecao } from "@/lib/agency/esteira/marcos";
import { criarTarefas } from "@/lib/agency/tarefas/criar-tarefas";
import { prazoAPartirDaEstimativa } from "@/lib/agency/tarefas/portao-do-pm";
import { resolverOuCriarCliente, registrarReaproveitamento } from "@/lib/agency/execution/cliente-do-briefing";
import { deveBloquearMutacaoCrossSite } from "@/lib/security/navegacao-cross-site";

const AGENCY_ROLES = ["master", "project_manager"] as const;
// Reasoning departments accepted in a proposal. "analytics" is a reasoning dept
// without a 1:1 DepartmentDef — handled separately when resolving the owning agent.
const VALID_DEPTS = [
  "strategy", "social-media", "design", "paid-traffic", "analytics", "project-management",
] as const;
// Reasoning dept → DepartmentDef id (for resolving the owning agent). Analytics has
// no dedicated DepartmentDef, so its tasks route to the PM agent.
// `DEPT_TO_DEF` morreu aqui em 25/08/2026: traduzir departamento virou
// trabalho de `lib/agency/gerencia/entrada-da-demanda.ts`.
const VALID_PRIORITIES = ["critical", "high", "medium", "low"];

interface IncomingTask {
  title: string;
  description: string;
  department: string;
  priority: string;
  estimatedDays: number;
}

function validateProposal(p: unknown): { name: string; goal: string; stage: string; tasks: IncomingTask[] } | null {
  if (!p || typeof p !== "object") return null;
  const o = p as Record<string, unknown>;
  if (typeof o.name !== "string" || o.name.trim().length === 0) return null;
  if (typeof o.goal !== "string") return null;
  if (typeof o.stage !== "string" || o.stage.trim().length === 0) return null;
  if (!Array.isArray(o.tasks) || o.tasks.length === 0) return null;
  const tasks: IncomingTask[] = [];
  for (const t of o.tasks) {
    if (!t || typeof t !== "object") return null;
    const tt = t as Record<string, unknown>;
    if (typeof tt.title !== "string" || tt.title.trim().length === 0) return null;
    if (typeof tt.department !== "string" || !(VALID_DEPTS as readonly string[]).includes(tt.department)) return null;
    if (typeof tt.priority !== "string" || !VALID_PRIORITIES.includes(tt.priority)) return null;
    tasks.push({
      title: tt.title,
      description: typeof tt.description === "string" ? tt.description : "",
      department: tt.department,
      priority: tt.priority,
      estimatedDays: typeof tt.estimatedDays === "number" ? tt.estimatedDays : 3,
    });
  }
  return { name: o.name, goal: o.goal, stage: o.stage, tasks };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession([...AGENCY_ROLES]);
  if (error) return error;
  if (session.clientId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // FAIXA 1 do CSRF: esta é a ÚNICA rota que cria Project + Tasks de verdade
  // a partir da proposta do orquestrador (ver o cabeçalho do arquivo).
  if (deveBloquearMutacaoCrossSite(request)) {
    return NextResponse.json({ error: "Origem não confiável para esta ação." }, { status: 403 });
  }

  let body: { clientRequestId?: unknown; proposal?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const clientRequestId = body.clientRequestId;
  if (!clientRequestId || typeof clientRequestId !== "string") {
    return NextResponse.json({ error: "clientRequestId required" }, { status: 400 });
  }
  const proposal = validateProposal(body.proposal);
  if (!proposal) {
    return NextResponse.json({ error: "Invalid proposal shape" }, { status: 400 });
  }

  try {
    // A solicitação órfã é adotada aqui (`data: { clientId, workspaceId }`) —
    // e era essa adoção, sem posse, que virava SEQUESTRO: bastava o id de uma
    // solicitação de outra agência para ela mudar de dono junto com o projeto.
    if (!(await solicitacaoDoWorkspace(clientRequestId, session.workspaceId))) {
      return naoEncontrado();
    }
    const req = await prisma.clientRequestDb.findUnique({ where: { id: clientRequestId } });
    if (!req) return NextResponse.json({ error: "ClientRequest not found" }, { status: 404 });

    // ── O CLIENTE: REAPROVEITADO QUANDO O CONTATO BATE (16/08/2026) ─────────
    //
    // Esta é a SEGUNDA porta que criava `Client` a partir de uma solicitação —
    // a outra é `execution/create-project-from-request.ts`. As duas faziam
    // `prisma.client.create` olhando só `req.clientId == null`, e nenhuma
    // perguntava se aquele contato já era cliente da casa.
    //
    // Pergunta do CEO em 16/08: *"se entrar um cliente com o mesmo e-mail e
    // fizer cinco briefings um atrás do outro, o que acontece?"*. Por aqui a
    // resposta era a mesma: cinco cadastros homônimos.
    //
    // Consertar só a outra porta deixaria esta vazando em silêncio, então a
    // regra mora num lugar só (`execution/cliente-do-briefing.ts`) e as duas
    // portas a chamam. Duas cópias da mesma regra divergem — é o defeito nº 2
    // do incidente do Drive, e não se repete aqui.
    let clientId = req.clientId ?? undefined;
    if (!clientId) {
      const resolvido = await resolverOuCriarCliente({
        workspaceId: session.workspaceId,
        businessName: req.businessName,
        segment: req.segment,
        briefingJson: req.briefingJson,
        sdrHandoffJson: req.sdrHandoffJson,
      });
      clientId = resolvido.clientId;
      await prisma.clientRequestDb.update({
        where: { id: clientRequestId },
        data: { clientId, workspaceId: session.workspaceId },
      });
      if (resolvido.reaproveitado) {
        await registrarReaproveitamento({
          workspaceId: session.workspaceId,
          clientId,
          clientRequestId,
          motivo: resolvido.motivo,
        });
      }
    }

    const project = await prisma.project.create({
      data: {
        workspaceId: session.workspaceId,
        clientId,
        // SEM ISTO O PROJETO NASCE MUDO: o motor recusa produzir num projeto que
        // não sabe de que solicitação veio — é dela que sai o briefing. Faltava,
        // e era uma das razões de a produção nunca começar.
        clientRequestId,
        name: proposal.name,
        goal: proposal.goal,
        stage: proposal.stage,
        priority: "medium",
      },
    });

    // Map each proposal task to a Task row. department → owning agent id (for routing).
    // PORTÃO DO PM (`lib/agency/tarefas/portao-do-pm.ts`): sem dono ou sem prazo
    // a tarefa NÃO é gravada. O prazo sai do `estimatedDays` da própria proposta.
    // A SEGUNDA PORTA DA MESMA DEMANDA — e ela passa pelo Gerente Geral igual.
    // Regra desta casa: duas cópias da mesma decisão divergem, e é assim que
    // uma porta passa a respeitar a hierarquia e a outra não. As duas usam
    // `despacharPlanoPeloGerenteGeral`. O aceite aqui é o operador da agência
    // que apertou o botão — `session.name`, o mesmo que vai em `approvedBy`.
    const plano = despacharPlanoPeloGerenteGeral(
      proposal.tasks.map((t) => ({
        title: t.title,
        description: t.description || null,
        department: t.department,
        estimatedDays: (t as { estimatedDays?: number }).estimatedDays ?? null,
      })),
      {
        aceiteComercial: Boolean(session.name?.trim()),
        clienteId: clientId ?? undefined,
        correlationId: `projeto:${project.id}`,
        // O ESCOPO DO CLIENTE, LIDO DO BANCO PELO SERVIDOR — nunca do corpo da
        // requisicao. Escopo que vem de quem chama nao e escopo, e a proposta
        // deste corpo e justamente a saida de IA que o contrato existe para
        // conferir.
        escopo: escopoDoBriefingJson(req.briefingJson),
      },
    );
    console.log(`[brain/orchestrate/apply] ${frazeDoDespacho(plano)}`);
    for (const r of plano.recusadas) {
      await prisma.activityEvent
        .create({
          data: {
            workspaceId: session.workspaceId,
            projectId: project.id,
            type: "gerente_geral_recusou_demanda",
            message: `Gerente Geral recusou "${r.tarefa.title}": ${r.motivo}`,
          },
        })
        .catch((e) => console.error("[brain/orchestrate/apply] recusa do GG não registrada", e));
    }
    await criarTarefas(
      project.id,
      plano.despachadas.map((d) => ({
        title: d.tarefa.title,
        description: d.tarefa.description || null,
        agentId: d.executorId,
        status: "pending",
        dueDate: prazoAPartirDaEstimativa(d.tarefa.estimatedDays ?? undefined),
      })),
    );

    // Advance the request — a project now exists for it.
    await prisma.clientRequestDb
      .update({ where: { id: clientRequestId }, data: { status: "in_progress" } })
      .catch((e) => console.error("[brain/orchestrate/apply] status advance failed", e));

    // A ESTEIRA ANDA SOZINHA: o projeto nasce e o cliente já recebe a direção
    // para avalizar. Aprovou, a produção dispara. Antes, o projeto era criado e
    // ficava parado esperando alguém que nunca vinha.
    const direcao = await pedirDirecao(project.id).catch(() => ({ ok: false, avisouCliente: false }));

    return NextResponse.json(
      { ok: true, projectId: project.id, taskCount: proposal.tasks.length, direcaoEnviada: direcao.avisouCliente === true },
      { status: 201 },
    );
  } catch (e) {
    console.error("[brain/orchestrate/apply] POST error", e);
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}
