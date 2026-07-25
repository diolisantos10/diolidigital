// run-execution.ts — o NÚCLEO da produção autônoma, extraído da rota HTTP para
// que TANTO o botão (rota) QUANTO o cron de recuperação chamem a MESMA lógica.
//
// Confiabilidade (a razão de existir): antes, o motor era disparado do navegador
// e a entrega sumia se a aba fechasse. Agora o progresso é marcado no BANCO
// (executionStatus/attempts/error) e um cron recupera projetos travados. É
// IDEMPOTENTE — um departamento que já produziu é pulado, então re-rodar nunca
// duplica. Nunca inventa: sem chave de IA, pula; faltando material, pergunta ao
// cliente pelo portal.

import { prisma } from "@/lib/db/client";
import { generate } from "@/lib/ai/generate";
import { createApprovalRequest } from "@/lib/agency/persistence/approval-service";
import { planProduction, type ProductionPlan } from "@/lib/agency/execution/pm-conductor";
import { auditDeliverable } from "@/lib/agency/execution/quality-auditor";

interface Ctx {
  businessName: string;
  segment: string;
  targetAudience: string;
  tone: string;
  services: string[];
  objectives: string[];
  strategyHeadline: string;
  hasBrandAssets: boolean;
}

interface DeptConfig {
  id: string;
  label: string;
  agentId: string;
  keywords: RegExp;
  deliverableType: string;
  needs?: { check: (ctx: Ctx) => boolean; ask: string };
  prompt: (ctx: Ctx) => string;
}

/** Conteúdo mínimo aceitável de uma entrega (gate de saída: nada vazio/lixo vai ao cliente). */
const MIN_DELIVERABLE_CHARS = 40;

function ctxBlock(c: Ctx): string {
  return [
    `Negócio: ${c.businessName}`,
    c.segment && `Segmento: ${c.segment}`,
    c.targetAudience && `Público-alvo: ${c.targetAudience}`,
    c.tone && `Tom de voz: ${c.tone}`,
    c.services.length && `Serviços contratados: ${c.services.join(", ")}`,
    c.objectives.length && `Objetivos: ${c.objectives.join(", ")}`,
    c.strategyHeadline && `Direção estratégica: ${c.strategyHeadline}`,
  ].filter(Boolean).join("\n");
}

export const DEPARTMENTS: DeptConfig[] = [
  {
    id: "social-media", label: "Social Media", agentId: "a3",
    keywords: /social|stories?|reels?|instagram|conte[úu]do|redes|feed|post/i,
    deliverableType: "social",
    prompt: (c) => `Você é o agente de Social Media da Dioli Digital. Produza um PACOTE de conteúdo pronto para o cliente aprovar.

CONTEXTO
${ctxBlock(c)}

Gere de 4 a 6 peças (stories/posts) específicas para este negócio e público. Para cada peça: título, formato (story/feed/reel), legenda pronta e ideia de visual. Português do Brasil, nada genérico.

Responda em JSON: {"title": "Pacote de Social Media — <negócio>", "summary": "1 frase", "items": [{"format": "story|feed|reel", "headline": "...", "caption": "...", "visual": "..."}]}`,
  },
  {
    id: "design", label: "Design",  agentId: "a2",
    keywords: /design|identidade|visual|logo|marca|arte|pe[çc]a/i,
    deliverableType: "design",
    needs: {
      check: (c) => c.hasBrandAssets,
      ask: "Para começar as peças de design, precisamos dos materiais da sua marca: logo (se tiver), cores, fontes e alguma referência visual que você goste. Pode enviar por aqui? 🎨",
    },
    prompt: (c) => `Você é o agente de Design da Dioli Digital. Produza um conceito de peças visuais para o cliente aprovar.

CONTEXTO
${ctxBlock(c)}

Descreva de 3 a 4 peças/conceitos visuais (direção de arte, paleta sugerida, tipografia, e o que cada peça comunica). Específico ao segmento.

Responda em JSON: {"title": "Conceito Visual — <negócio>", "summary": "1 frase", "items": [{"headline": "...", "direction": "...", "palette": "...", "note": "..."}]}`,
  },
  {
    id: "paid-traffic", label: "Tráfego Pago", agentId: "a4",
    keywords: /tr[áa]fego|ads|an[úu]ncio|m[íi]dia\s*paga|campanha|google|meta/i,
    deliverableType: "campaign",
    prompt: (c) => `Você é o agente de Tráfego Pago da Dioli Digital. Produza um plano inicial de campanha para o cliente aprovar.

CONTEXTO
${ctxBlock(c)}

Entregue: objetivo da campanha, público-alvo detalhado, plataformas recomendadas, 3 a 4 ângulos de anúncio (com headline e chamada), e como mediremos resultado. Sem inventar valores de verba.

Responda em JSON: {"title": "Plano de Tráfego — <negócio>", "summary": "1 frase", "items": [{"angle": "...", "headline": "...", "cta": "...", "audience": "..."}]}`,
  },
  {
    id: "analytics", label: "Analytics", agentId: "a5",
    keywords: /analytics|kpi|m[ée]trica|relat[óo]rio|resultado|performance|dados|indicador/i,
    deliverableType: "analytics",
    prompt: (c) => `Você é o agente de Analytics da Dioli Digital. Produza um PLANO DE MEDIÇÃO para o cliente aprovar — como vamos medir sucesso.

CONTEXTO
${ctxBlock(c)}

Defina de 3 a 5 KPIs primários adequados ao objetivo e ao segmento (com o que cada um mede e a meta de referência quando fizer sentido — sem inventar número que dependa de histórico que não temos), a cadência de relatório (semanal/mensal) e quais canais alimentam cada indicador. Nada genérico.

Responda em JSON: {"title": "Plano de Métricas — <negócio>", "summary": "1 frase", "items": [{"headline": "<KPI>", "note": "o que mede + meta/cadência", "audience": "canal/fonte do dado"}]}`,
  },
];

function deliverableMarkdown(data: Record<string, unknown>): string {
  const items = Array.isArray(data.items) ? data.items : [];
  const lines: string[] = [];
  if (typeof data.summary === "string") lines.push(data.summary, "");
  items.forEach((raw, i) => {
    const it = raw as Record<string, unknown>;
    const head = (it.headline ?? it.angle ?? it.direction ?? `Item ${i + 1}`) as string;
    lines.push(`**${i + 1}. ${head}**`);
    for (const [k, label] of [["format", "Formato"], ["caption", "Legenda"], ["visual", "Visual"], ["direction", "Direção"], ["palette", "Paleta"], ["cta", "CTA"], ["audience", "Público"], ["note", "Obs"]] as const) {
      if (typeof it[k] === "string" && (it[k] as string).trim()) lines.push(`- ${label}: ${it[k]}`);
    }
    lines.push("");
  });
  return lines.join("\n").trim();
}

export interface ExecutionResult {
  ok: boolean;
  status: "done" | "failed" | "skipped_running";
  produced: string[];
  askedClient: string[];
  skipped: string[];
  /** Como o PM regeu esta produção (ordem dos departamentos, objetivo). */
  pmPlan?: { orderedDepartments: string[]; goal: string; pmMode: string };
  /** Parecer da Qualidade por entrega (SOMBRA — não bloqueia; só registra). */
  qualityAudit?: Array<{ department: string; verdict: "pass" | "flag"; issues: string[] }>;
  error?: string;
}

/**
 * Roda a produção de um projeto de ponta a ponta, com estado durável no banco.
 * Sem sessão — a rota HTTP já autentica; o cron chama direto. Idempotente.
 */
export async function runProjectExecution(projectId: string): Promise<ExecutionResult> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { ok: false, status: "failed", produced: [], askedClient: [], skipped: [], error: "Projeto não encontrado" };
  if (!project.clientRequestId) {
    await prisma.project.update({ where: { id: projectId }, data: { executionStatus: "failed", executionError: "Projeto sem solicitação vinculada" } });
    return { ok: false, status: "failed", produced: [], askedClient: [], skipped: [], error: "Projeto sem solicitação vinculada" };
  }

  // Trava anti-concorrência: se já está rodando há pouco, não roda de novo.
  if (project.executionStatus === "running" && project.executionStartedAt && Date.now() - project.executionStartedAt.getTime() < 10 * 60_000) {
    return { ok: true, status: "skipped_running", produced: [], askedClient: [], skipped: [], error: "já em execução" };
  }

  await prisma.project.update({
    where: { id: projectId },
    data: {
      executionStatus: "running",
      executionStartedAt: new Date(),
      executionRequestedAt: project.executionRequestedAt ?? new Date(),
      executionAttempts: { increment: 1 },
      executionError: null,
    },
  });

  const clientRequestId = project.clientRequestId;
  try {
    const [req, client, artifacts, existing] = await Promise.all([
      prisma.clientRequestDb.findUnique({ where: { id: clientRequestId } }),
      prisma.client.findFirst({ where: { id: project.clientId }, include: { brandBrain: true } }),
      prisma.brainArtifact.findMany({ where: { clientRequestId, status: "approved" }, select: { department: true, canvasJson: true } }),
      prisma.deliverable.findMany({ where: { projectId }, select: { ownerAgentId: true } }),
    ]);
    if (!req) throw new Error("Solicitação não encontrada");

    const scope = (() => { try { return JSON.parse(req.briefingJson ?? "{}")?.scope ?? {}; } catch { return {}; } })() as Record<string, unknown>;
    const services = (() => { try { return JSON.parse(req.services ?? "[]"); } catch { return []; } })() as string[];
    const objectives = (() => { try { return JSON.parse(req.objectives ?? "[]"); } catch { return []; } })() as string[];
    const strategyArtifact = artifacts.find((a) => a.department === "strategy");
    const strategyHeadline = (() => {
      if (!strategyArtifact) return "";
      try { const c = JSON.parse(strategyArtifact.canvasJson); return (c.positioning ?? c.mainObjective ?? c.summary ?? "") as string; } catch { return ""; }
    })();
    const brand = client?.brandBrain ?? null;

    const context: Ctx = {
      businessName: req.businessName || client?.name || "o cliente",
      segment: req.segment || (typeof scope.segment === "string" ? scope.segment : "") || client?.industry || "",
      targetAudience: typeof scope.targetAudience === "string" ? scope.targetAudience : (brand?.targetAudience ?? ""),
      tone: brand?.tone ?? "",
      services, objectives, strategyHeadline,
      hasBrandAssets: !!(brand && (brand.primaryColor || brand.typography || brand.tagline)),
    };

    const agents = (() => { try { return JSON.parse(project.agents ?? "[]"); } catch { return []; } })() as string[];
    const producedAgents = new Set(existing.map((d) => d.ownerAgentId).filter(Boolean));

    // ── O PM REGE: planeja quais departamentos e em QUE ORDEM (dependência) ──────
    // Plano determinístico (sempre funciona); os produtores é que geram com IA.
    const plan: ProductionPlan = await planProduction(clientRequestId, DEPARTMENTS.map((d) => d.id));
    const byId = new Map(DEPARTMENTS.map((d) => [d.id, d]));
    const orderedConfigs: DeptConfig[] = [];
    const added = new Set<string>();
    // 1) na ordem que o PM definiu;
    for (const deptId of plan.orderedDepartments) {
      const cfg = byId.get(deptId);
      if (cfg && !added.has(cfg.id)) { orderedConfigs.push(cfg); added.add(cfg.id); }
    }
    // 2) robustez: departamentos atribuídos ao projeto ou por serviço que o PM não listou.
    for (const d of DEPARTMENTS) {
      if (added.has(d.id)) continue;
      if (agents.includes(d.agentId) || services.some((s) => d.keywords.test(s))) { orderedConfigs.push(d); added.add(d.id); }
    }
    const toRun = orderedConfigs.filter((d) => !producedAgents.has(d.agentId));

    const produced: string[] = [];
    const askedClient: string[] = [];
    const skipped: string[] = [];
    const qualityAudit: Array<{ department: string; verdict: "pass" | "flag"; issues: string[] }> = [];

    for (const dept of toRun) {
      if (dept.needs && !dept.needs.check(context)) {
        await prisma.portalMessage.create({
          data: { clientRequestId, authorRole: "team", authorName: `Agente de ${dept.label}`, body: dept.needs.ask, readByTeam: true },
        });
        askedClient.push(dept.label);
        continue;
      }

      const result = await generate({
        system: "Você é um agente sênior de uma agência de marketing brasileira. Produza conteúdo real, específico e pronto para o cliente. Responda SOMENTE com JSON válido.",
        user: dept.prompt(context),
        maxTokens: 1800,
        workspaceId: project.workspaceId,
        preferredProvider: "claude",
      });

      if (!result.ok) { skipped.push(`${dept.label} (IA indisponível)`); continue; }
      const data = result.data as Record<string, unknown>;
      const title = typeof data.title === "string" ? data.title : `${dept.label} — ${context.businessName}`;
      const body = deliverableMarkdown(data);
      // Gate de saída: nada vazio/curto demais chega ao cliente.
      if (!body || body.length < MIN_DELIVERABLE_CHARS) { skipped.push(`${dept.label} (resposta insuficiente)`); continue; }

      const created = await prisma.deliverable.create({
        data: { projectId, name: title, type: dept.deliverableType, status: "in_review", content: body, ownerAgentId: dept.agentId },
      });
      await createApprovalRequest({ clientRequestId, department: dept.id, requestedBy: `Agente de ${dept.label}`, clientVisible: true });
      await prisma.portalMessage.create({
        data: {
          clientRequestId, authorRole: "team", authorName: `Agente de ${dept.label}`,
          body: `Sua entrega de ${dept.label} está pronta! Dê uma olhada na aba de aprovações e me diga se posso seguir. ✅`,
          readByTeam: true,
        },
      });
      produced.push(dept.label);

      // QUALIDADE (SOMBRA): audita e registra o parecer — NÃO bloqueia (o cliente
      // já vê a entrega). Serve pra medir o juízo da Qualidade antes de ligar o freio.
      const audit = await auditDeliverable({
        deptLabel: dept.label, title, content: body, brandContext: ctxBlock(context), workspaceId: project.workspaceId,
      });
      await prisma.deliverable.update({
        where: { id: created.id },
        data: { revisionStatus: audit.verdict === "flag" ? "quality_flag" : "quality_ok", lastFeedback: audit.note || null },
      }).catch(() => { /* parecer é sombra — nunca derruba a produção */ });
      qualityAudit.push({ department: dept.label, verdict: audit.verdict, issues: audit.issues });
    }

    // "done" quando não restou nenhum departamento pendente de produção (o que
    // falhou por IA fica pra próxima passada do cron re-tentar).
    const allHandled = skipped.length === 0;
    await prisma.project.update({
      where: { id: projectId },
      data: {
        executionStatus: allHandled ? "done" : "failed",
        executionFinishedAt: new Date(),
        executionError: allHandled ? null : `pendências: ${skipped.join("; ")}`,
      },
    });
    return {
      ok: true, status: allHandled ? "done" : "failed", produced, askedClient, skipped, qualityAudit,
      pmPlan: { orderedDepartments: plan.orderedDepartments, goal: plan.goal, pmMode: plan.pmMode },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 200) : "erro na execução";
    await prisma.project.update({
      where: { id: projectId },
      data: { executionStatus: "failed", executionFinishedAt: new Date(), executionError: msg },
    }).catch(() => { /* best-effort */ });
    return { ok: false, status: "failed", produced: [], askedClient: [], skipped: [], error: msg };
  }
}
