// Shared: turn an approved briefing/request into a Project + Tasks.
//
// This is the exact project-creation logic the agency review route runs — lifted
// into a helper so the CLIENT's portal approval can create the project too (the
// agency sends the proposal; the client approving it is what creates the project).
// Idempotent: returns the existing project if one already exists for the request.

import { prisma } from "@/lib/db/client";
import { buildClientSnapshot } from "@/lib/dioli-brain/client-snapshot";
import { orchestratePMReasoning } from "@/lib/dioli-brain/pm-orchestrator";
import { getDepartmentDef, type DepartmentId } from "@/lib/agency/departments";
import { generate } from "@/lib/ai/generate";
import { semearMarcaDoBriefing } from "@/lib/agency/execution/semear-marca";
import { coletarMaterialDeProduto } from "@/lib/agency/esteira/material-de-produto";
import { sincronizarDoBriefing } from "@/lib/agency/esteira/proibicoes";
import { criarTarefas } from "@/lib/agency/tarefas/criar-tarefas";
import { prazoAPartirDaEstimativa } from "@/lib/agency/tarefas/portao-do-pm";
import { resolverOuCriarCliente, registrarReaproveitamento } from "@/lib/agency/execution/cliente-do-briefing";

const DEPT_TO_DEF: Record<string, DepartmentId> = {
  strategy: "strategy", social: "social-media", design: "design",
  traffic: "paid-traffic", analytics: "project-management", quality: "project-management",
};
const VALID_TASK_DEPTS = ["strategy", "social-media", "design", "paid-traffic", "analytics", "project-management"];

type Result =
  | { ok: true; projectId: string; created: boolean }
  | { ok: false; error: string };

export async function createProjectFromRequest(clientRequestId: string, approvedBy: string): Promise<Result> {
  const req = await prisma.clientRequestDb.findUnique({ where: { id: clientRequestId } });
  if (!req) return { ok: false, error: "Solicitação não encontrada" };

  // Idempotency: existing project wins (never duplicate on re-approval / retry).
  const existing = await prisma.project.findFirst({ where: { clientRequestId }, orderBy: { createdAt: "asc" } });
  if (existing) return { ok: true, projectId: existing.id, created: false };

  // Resolve the workspace: request's own, else the sole workspace.
  const workspaceId = req.workspaceId ?? (await prisma.agencyWorkspace.findFirst({ select: { id: true } }))?.id;
  if (!workspaceId) return { ok: false, error: "Workspace indisponível" };

  await prisma.brainArtifact.updateMany({ where: { clientRequestId, status: "draft" }, data: { status: "approved", approvedBy } });

  const snapshot = await buildClientSnapshot(clientRequestId);
  if (!snapshot) return { ok: false, error: "Snapshot indisponível" };
  const proposal = await orchestratePMReasoning(snapshot, workspaceId);

  // ── O CLIENTE: REAPROVEITADO QUANDO O CONTATO BATE (16/08/2026) ───────────
  //
  // Pergunta do CEO: *"se entrar um cliente com o mesmo e-mail e fizer cinco
  // briefings um atrás do outro, o que acontece com o sistema?"*
  //
  // Até aqui, esta linha respondia: **cinco `Client` homônimos**, cinco portais,
  // cinco históricos. Ela fazia `prisma.client.create` sempre que `req.clientId`
  // era nulo, sem nunca perguntar se aquele contato já era cliente da casa — e
  // ainda criava a ficha SEM `email` e SEM `phone`, o que tornava qualquer busca
  // por contato impossível daí para a frente. A Camila Pereira duplicada em
  // produção (08/08/2026) nasceu exatamente aqui.
  //
  // A decisão de quem é o mesmo cliente mora num lugar só
  // (`execution/cliente-do-briefing.ts`), compartilhado com a outra porta que
  // criava ficha (`/api/brain/orchestrate/apply`) — duas cópias da regra
  // divergiriam, e é assim que uma porta passa a deduplicar e a outra não.
  //
  // ⚠️ **O que continua possível de propósito:** o MESMO cliente pedir um
  // SEGUNDO projeto. A idempotência acima (`:34`) é por SOLICITAÇÃO, nunca por
  // cliente — ver `IDEMPOTENCIA_E_POR_SOLICITACAO`. Não duplicar cadastro é o
  // objetivo; impedir pedido novo seria uma prisão, e o Diretor vetou.
  let clientId = req.clientId ?? undefined;
  if (!clientId) {
    const resolvido = await resolverOuCriarCliente({
      workspaceId,
      businessName: req.businessName,
      segment: req.segment,
      briefingJson: req.briefingJson,
      sdrHandoffJson: req.sdrHandoffJson,
    });
    clientId = resolvido.clientId;
    await prisma.clientRequestDb.update({ where: { id: clientRequestId }, data: { clientId, workspaceId } });
    if (resolvido.reaproveitado) {
      await registrarReaproveitamento({ workspaceId, clientId, clientRequestId, motivo: resolvido.motivo });
    }
  }

  // O CÉREBRO DE MARCA NASCE AQUI. Antes disto, o cliente contava cor, tom de
  // voz e público no briefing e nada daquilo era gravado — os especialistas
  // produziam sem saber de quem era a marca. Semeia só o que o cliente contou;
  // o que ele não contou continua vazio e vira pedido de material.
  await semearMarcaDoBriefing(clientId, clientRequestId)
    .catch((e) => console.error("[projeto] não consegui semear a marca:", e));

  // ── AS PROIBIÇÕES DO CLIENTE NASCEM AQUI, E ANTES DA PRIMEIRA PEÇA ────────
  // `sincronizarDoBriefing` existia desde 06/08/2026 com a justificativa certa
  // escrita no próprio docstring ("a proibição mais forte que um cliente
  // escreve costuma estar no briefing") — e NENHUM chamador no repositório
  // inteiro. Ou seja: o cliente escrevia "nada de emprego garantido" no
  // briefing, o extrator determinístico sabia ler aquilo, e a proibição
  // simplesmente não existia na hora em que a peça era produzida.
  //
  // É o defeito das 31 checagens com outra roupa: mecanismo construído,
  // correto, testado — e sem ninguém puxando o gatilho. Regra que ninguém
  // executa não é regra, é documentação.
  //
  // O lugar é este e não a produção: a proibição precisa estar registrada
  // ANTES da primeira peça, não junto com ela. Idempotente pela deduplicação
  // de `registrarProibicoes`, e best-effort porque um extrator com defeito não
  // pode impedir o projeto de nascer — mas a falha é gritada no log.
  await sincronizarDoBriefing(clientId)
    .then((r) => {
      if (r.erro) console.error("[projeto] proibições do briefing falharam:", r.erro);
      else console.log(`[projeto] proibições do briefing: ${r.novas.length} nova(s), ${r.total} no total`);
    })
    .catch((e) => console.error("[projeto] não consegui ler as proibições do briefing:", e));

  const project = await prisma.project.create({
    data: { workspaceId, clientId, clientRequestId, name: proposal.name, goal: proposal.goal, stage: "planning", priority: "medium" },
  });

  // PORTÃO DO PM: tarefa sem dono ou sem prazo NÃO é criada (`portao-do-pm.ts`).
  // O prazo não é inventado aqui — sai do `estimatedDays` que o próprio PM
  // estimou na proposta. Sem estimativa utilizável, a tarefa é barrada e o
  // bloqueio vira `ActivityEvent`, em vez de virar uma linha sem prazo no banco.
  await criarTarefas(
    project.id,
    proposal.tasks
      .filter((t) => VALID_TASK_DEPTS.includes(t.department))
      .map((t) => ({
        title: t.title,
        description: t.description || null,
        agentId: getDepartmentDef(DEPT_TO_DEF[t.department] ?? "project-management")?.primaryAgentId ?? null,
        status: "pending",
        dueDate: prazoAPartirDaEstimativa(t.estimatedDays),
      })),
  );

  // A ETAPA DE ONBOARDING QUE NÃO EXISTIA: pedir o PRODUTO do cliente.
  // Sem captura de tela, embalagem, uniforme e logo em arquivo, o Design nunca
  // põe o produto na peça — e foi assim que o produto do cliente apareceu em
  // 0 de 6 peças nossas contra 7 de 10 das de referência (06/08/2026).
  // Material ausente vira pergunta ao cliente, nunca invenção.
  await coletarMaterialDeProduto({ projectId: project.id, clientRequestId })
    .catch((e) => console.error("[projeto] não consegui abrir a coleta de produto:", e));

  await prisma.clientRequestDb.update({ where: { id: clientRequestId }, data: { status: "in_progress" } });

  // Phase 2 — released ONLY after the client approves: the detailed schedule.
  // Kept out of the proposal so the plan isn't exposed before the deal closes.
  // Best-effort: never blocks project creation.
  try {
    const sched = await generate({
      system: "Você é um Project Manager de uma agência de marketing brasileira. Monte um cronograma simples e claro para um cliente que NÃO é da área (sem jargão). Responda SOMENTE JSON válido.",
      user: `Projeto: ${proposal.name}. Objetivo: ${proposal.goal}.\nEntregas previstas: ${(proposal.tasks ?? []).map((t) => t.title).slice(0, 10).join("; ")}.\nMonte um cronograma de 4 semanas: em cada semana, 2 a 3 coisas que acontecem, em linguagem simples e direta.\nJSON: {"weeks":[{"label":"Semana 1","items":["...","..."]}]}`,
      maxTokens: 900, workspaceId, preferredProvider: "claude", agentId: "pm-cronograma", clientId: req.clientId ?? null, projectId: project.id,
    });
    if (sched.ok) {
      const weeks = ((sched.data as { weeks?: Array<{ label?: string; items?: string[] }> }).weeks ?? []).slice(0, 6);
      if (weeks.length) {
        const body = "🗓️ Seu projeto foi aprovado! Aqui está o cronograma de como tudo vai acontecer:\n\n" +
          weeks.map((w) => `*${w.label ?? "Etapa"}*\n${(w.items ?? []).map((i) => `• ${i}`).join("\n")}`).join("\n\n");
        await prisma.portalMessage.create({
          data: { clientRequestId, authorRole: "team", authorName: "Equipe Dioli", body, readByTeam: true },
        });
      }
    }
  } catch { /* schedule is best-effort */ }

  return { ok: true, projectId: project.id, created: true };
}
