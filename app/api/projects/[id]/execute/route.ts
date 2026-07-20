// POST /api/projects/[id]/execute
//
// The autonomous engine. Once a project is approved, each department agent runs
// on its own: if it has what it needs, it PRODUCES the deliverable with AI and
// sends it to the CLIENT's portal for approval; if information is missing, it
// MESSAGES the client (portal chat) asking for exactly what it needs.
//
// The owner's only action is approve/not-approve the project. Deliverables are
// approved by the CLIENT in their portal — not the owner.
//
// Idempotent: a department that already produced a deliverable for this project
// is skipped, so re-triggering never duplicates work.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";
import { generate } from "@/lib/ai/generate";
import { createApprovalRequest } from "@/lib/agency/persistence/approval-service";

interface DeptConfig {
  id: string;
  label: string;
  agentId: string;
  keywords: RegExp;
  deliverableType: string;
  // Optional hard requirement — if missing, the agent asks the client instead.
  needs?: { check: (ctx: Ctx) => boolean; ask: string };
  prompt: (ctx: Ctx) => string;
}

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

const DEPARTMENTS: DeptConfig[] = [
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

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { session, error } = await requireSession(["master", "project_manager", "executivo_comercial"]);
  if (error) return error;
  const { id: projectId } = await ctx.params;

  const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: session.workspaceId } });
  if (!project) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
  if (!project.clientRequestId) return NextResponse.json({ error: "Projeto sem solicitação vinculada" }, { status: 400 });
  const clientRequestId = project.clientRequestId;

  const [req, client, artifacts, existing] = await Promise.all([
    prisma.clientRequestDb.findUnique({ where: { id: clientRequestId } }),
    prisma.client.findFirst({ where: { id: project.clientId }, include: { brandBrain: true } }),
    prisma.brainArtifact.findMany({ where: { clientRequestId, status: "approved" }, select: { department: true, canvasJson: true } }),
    prisma.deliverable.findMany({ where: { projectId }, select: { ownerAgentId: true } }),
  ]);
  if (!req) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });

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

  // Which departments run: matched by service keywords OR present on the project.
  const toRun = DEPARTMENTS.filter(
    (d) => (services.some((s) => d.keywords.test(s)) || agents.includes(d.agentId)) && !producedAgents.has(d.agentId),
  );

  const produced: string[] = [];
  const askedClient: string[] = [];
  const skipped: string[] = [];

  for (const dept of toRun) {
    // Missing a hard requirement → the agent asks the client instead of guessing.
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
      workspaceId: session.workspaceId,
      preferredProvider: "claude",
    });

    if (!result.ok) { skipped.push(`${dept.label} (IA indisponível)`); continue; }
    const data = result.data as Record<string, unknown>;
    const title = typeof data.title === "string" ? data.title : `${dept.label} — ${context.businessName}`;
    const body = deliverableMarkdown(data);
    if (!body) { skipped.push(`${dept.label} (resposta vazia)`); continue; }

    // Deliverable (internal record) + client-visible approval + portal heads-up.
    await prisma.deliverable.create({
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
  }

  return NextResponse.json({ ok: true, produced, askedClient, skipped });
}
