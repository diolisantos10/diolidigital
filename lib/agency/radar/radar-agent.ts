// radar-agent.ts — O AGENTE do Radar Dioli: capta e PROPÕE tendências.
//
// Ele varre cada domínio e propõe mudanças/tendências acionáveis. GOVERNANÇA:
// tudo que o agente propõe entra como "trend" → PENDENTE (nunca oficial, nunca
// auto-ativa). Ou seja, mesmo que a IA erre, NADA chega aos agentes de produção
// sem validação humana. Fontes oficiais (Meta/TikTok/Google) entram por outro
// caminho (addInsight source="official"), não por aqui.
//
// HONESTIDADE: sem fontes automáticas (Fase 3), a "atualidade" vem do que a IA
// conhece — por isso o humano valida. A Fase 3 (Meta/TikTok/Trends ao vivo) é o
// que dá frescor de tempo real; a estrutura de governança já está pronta pra ela.

import { prisma } from "@/lib/db/client";
import { generate } from "@/lib/ai/generate";
import { addInsight, type InsightDomain } from "@/lib/agency/radar/library";

const SCAN_DOMAINS: InsightDomain[] = ["social", "design", "paid-traffic", "analytics", "seo"];
const MAX_PER_DOMAIN = 3;

const DOMAIN_LABEL: Record<InsightDomain, string> = {
  social: "redes sociais (Instagram, TikTok, formatos, algoritmo)",
  design: "design e direção de arte para marketing",
  "paid-traffic": "mídia paga (Meta Ads, Google Ads, formatos, segmentação)",
  analytics: "métricas e mensuração de marketing",
  seo: "SEO e Google (busca, conteúdo)",
  general: "marketing digital em geral",
};

export interface RadarScanResult { proposed: number; perDomain: Record<string, number>; skippedNoAi?: boolean }

/** Propõe tendências para um domínio (tudo vira PENDENTE). Dedup por tópico. */
async function scanDomain(workspaceId: string, domain: InsightDomain): Promise<number> {
  // Dedup: não repropor tópicos que já estão ativos ou pendentes.
  const existing = await prisma.marketInsight.findMany({
    where: { workspaceId, domain, status: { in: ["active", "pending"] } },
    select: { topic: true },
  });
  const seenTopics = new Set(existing.map((e) => e.topic.toLowerCase()));

  const result = await generate({
    system: "Você é o Radar Dioli, o radar de tendências de uma agência de marketing brasileira. Proponha SOMENTE mudanças/tendências ATUAIS e ACIONÁVEIS — nada genérico ou atemporal. Se não tiver certeza que algo é atual, proponha menos. Responda SOMENTE JSON válido.",
    user: `Domínio: ${DOMAIN_LABEL[domain]}.
Liste até ${MAX_PER_DOMAIN} tendências/atualizações que uma agência deve APLICAR AGORA nos clientes. Para cada uma: topic (slug curto e estável, ex.: "ig-reels-curtos"), title (curto), guidance (o que fazer na prática, 1-2 frases).
JSON: {"items":[{"topic":"...","title":"...","guidance":"..."}]}`,
    maxTokens: 700,
    workspaceId,
    preferredProvider: "claude",
  });
  if (!result.ok) return 0;

  const items = Array.isArray((result.data as { items?: unknown }).items) ? (result.data as { items: unknown[] }).items : [];
  let count = 0;
  for (const raw of items.slice(0, MAX_PER_DOMAIN)) {
    const it = raw as Record<string, unknown>;
    const topic = String(it.topic ?? "").trim();
    const title = String(it.title ?? "").trim();
    const guidance = String(it.guidance ?? "").trim();
    if (!topic || !title || !guidance) continue;
    if (seenTopics.has(topic.toLowerCase())) continue; // já existe (ativo/pendente)
    seenTopics.add(topic.toLowerCase());
    await addInsight({ workspaceId, domain, topic, title, guidance, source: "trend", sourceName: "Radar Dioli" });
    count++;
  }
  return count;
}

/** Roda o Radar num workspace: propõe tendências por domínio (tudo pendente). */
export async function runRadarScan(workspaceId: string): Promise<RadarScanResult> {
  const perDomain: Record<string, number> = {};
  let proposed = 0;
  for (const domain of SCAN_DOMAINS) {
    const n = await scanDomain(workspaceId, domain).catch(() => 0);
    perDomain[domain] = n;
    proposed += n;
  }
  return { proposed, perDomain };
}
