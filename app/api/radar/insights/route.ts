// Radar de Ollie — abastecer e listar a biblioteca.
//   POST — adiciona um insight. source "official" (Meta/TikTok/Google) entra ATIVO
//          na hora; "trend" entra PENDENTE até validação humana.
//   GET  — lista a fila de tendências PENDENTES (pra o humano validar).
// Time-only (master/PM): market intelligence é decisão da agência.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { addInsight, listPending, type InsightDomain, type InsightSource } from "@/lib/agency/radar/library";

const DOMAINS: InsightDomain[] = ["social", "design", "paid-traffic", "analytics", "seo", "general"];

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession(["master", "project_manager"]);
  if (error) return error;

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const domain = String(body.domain ?? "").trim() as InsightDomain;
  const topic = String(body.topic ?? "").trim();
  const title = String(body.title ?? "").trim();
  const guidance = String(body.guidance ?? "").trim();
  const source = (body.source === "official" ? "official" : "trend") as InsightSource;

  if (!DOMAINS.includes(domain)) return NextResponse.json({ error: `domínio inválido (use: ${DOMAINS.join(", ")})` }, { status: 400 });
  if (!topic || !title || !guidance) return NextResponse.json({ error: "topic, title e guidance são obrigatórios" }, { status: 400 });

  const r = await addInsight({
    workspaceId: session.workspaceId, domain, topic, title, guidance, source,
    sourceName: typeof body.sourceName === "string" ? body.sourceName : undefined,
    sourceUrl: typeof body.sourceUrl === "string" ? body.sourceUrl : undefined,
  });
  return NextResponse.json({ ok: true, id: r.id, status: r.status });
}

export async function GET(): Promise<NextResponse> {
  const { session, error } = await requireSession(["master", "project_manager"]);
  if (error) return error;
  const pending = await listPending(session.workspaceId);
  return NextResponse.json({ ok: true, pending });
}
