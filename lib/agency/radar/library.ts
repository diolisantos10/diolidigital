// library.ts — a BIBLIOTECA VIVA do Radar de Ollie.
//
// O acervo de tendências/atualizações de mercado que abastece TODOS os agentes
// (insumo de produção) e as diretrizes da QUALIDADE. É a versão generalizada do
// "Experience Vault" do FOOCCI: um depósito de verdade que todo o sistema consome.
//
// GOVERNANÇA (regra do dono):
//   • source "official" (a própria plataforma — Meta/TikTok/Google): entra ATIVA
//     na hora, sem validação humana. É a fonte da verdade.
//   • source "trend" (tendência não-oficial): entra PENDENTE até um humano aprovar.
//
// VERSIONAMENTO: cada insight tem um `topic`. Ao ATIVAR um insight, os anteriores
// ATIVOS do mesmo tópico são ARQUIVADOS — o "era assim → agora é assim".

import { prisma } from "@/lib/db/client";

export type InsightDomain = "social" | "design" | "paid-traffic" | "analytics" | "seo" | "general";
export type InsightSource = "official" | "trend";

export interface AddInsightInput {
  workspaceId: string;
  domain: InsightDomain;
  topic: string;
  title: string;
  guidance: string;
  source: InsightSource;
  sourceName?: string;
  sourceUrl?: string;
}

/** Arquiva os insights ATIVOS de um tópico (dá lugar à versão nova). */
async function archiveActiveTopic(workspaceId: string, topic: string): Promise<void> {
  await prisma.marketInsight.updateMany({
    where: { workspaceId, topic, status: "active" },
    data: { status: "archived" },
  });
}

/**
 * Adiciona um insight. Oficial → ATIVO na hora (e supersede o tópico); tendência
 * → PENDENTE (só entra em vigor após aprovação humana). Nunca inventa: quem chama
 * fornece o texto; a biblioteca só governa o estado.
 */
export async function addInsight(input: AddInsightInput): Promise<{ id: string; status: string }> {
  const isOfficial = input.source === "official";
  if (isOfficial) await archiveActiveTopic(input.workspaceId, input.topic);
  const row = await prisma.marketInsight.create({
    data: {
      workspaceId: input.workspaceId,
      domain: input.domain,
      topic: input.topic,
      title: input.title,
      guidance: input.guidance,
      source: input.source,
      sourceName: input.sourceName ?? null,
      sourceUrl: input.sourceUrl ?? null,
      status: isOfficial ? "active" : "pending",
      approvedBy: isOfficial ? "official-source" : null,
      approvedAt: isOfficial ? new Date() : null,
    },
    select: { id: true, status: true },
  });
  return row;
}

/** Aprova uma tendência pendente (validação humana) → entra em vigor e supersede o tópico. */
export async function approveInsight(id: string, approvedBy: string): Promise<boolean> {
  const insight = await prisma.marketInsight.findUnique({ where: { id }, select: { workspaceId: true, topic: true, status: true } });
  if (!insight || insight.status !== "pending") return false;
  await archiveActiveTopic(insight.workspaceId, insight.topic);
  await prisma.marketInsight.update({ where: { id }, data: { status: "active", approvedBy, approvedAt: new Date() } });
  return true;
}

export async function rejectInsight(id: string, by: string): Promise<boolean> {
  const r = await prisma.marketInsight.updateMany({ where: { id, status: "pending" }, data: { status: "rejected", approvedBy: by } });
  return r.count > 0;
}

/** Tendências pendentes de validação humana (a fila do humano). */
export async function listPending(workspaceId: string) {
  return prisma.marketInsight.findMany({ where: { workspaceId, status: "pending" }, orderBy: { createdAt: "desc" } });
}

/**
 * As diretrizes VIGENTES (ativas) de um domínio — o insumo que os agentes usam.
 * Inclui sempre "general" (tendências transversais). Bounded para não estourar o prompt.
 */
export async function getActiveInsights(workspaceId: string, domain: InsightDomain, limit = 8) {
  return prisma.marketInsight.findMany({
    where: { workspaceId, status: "active", domain: { in: [domain, "general"] } },
    orderBy: { approvedAt: "desc" },
    take: limit,
    select: { title: true, guidance: true, source: true, sourceName: true },
  });
}

/** Bloco de texto das diretrizes atuais, pra injetar no prompt (produção e auditoria). */
export function buildInsightBlock(insights: Array<{ title: string; guidance: string; source: string; sourceName: string | null }>): string {
  if (!insights.length) return "";
  const lines = insights.map((i) => {
    const tag = i.source === "official" ? `OFICIAL${i.sourceName ? ` (${i.sourceName})` : ""}` : "tendência";
    return `• [${tag}] ${i.title}: ${i.guidance}`;
  });
  return [
    "━━━ RADAR DE OLLIE — o que está ATUAL no mercado (siga estas diretrizes) ━━━",
    ...lines,
    "━━━",
  ].join("\n");
}
