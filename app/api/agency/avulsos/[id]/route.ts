// PATCH /api/agency/avulsos/[id] { acao: "entregar" | "cobrar" | "fechar", nota? }
// Um passo por vez, nesta ordem. Ver `lib/agency/servico-avulso.ts`.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { avancarAvulso, ehAcaoDoAvulso } from "@/lib/agency/servico-avulso";

export const dynamic = "force-dynamic";
const PODEM_AVANCAR = ["master", "project_manager"];

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;
  if (session.clientId || !PODEM_AVANCAR.includes(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const corpo = (await req.json().catch(() => ({}))) as { acao?: unknown; nota?: unknown };
  if (!ehAcaoDoAvulso(corpo.acao)) return NextResponse.json({ error: "acao inválida — entregar | cobrar | fechar" }, { status: 400 });
  const r = await avancarAvulso(session.workspaceId, id, corpo.acao, typeof corpo.nota === "string" ? corpo.nota : null);
  if (!r.ok) return NextResponse.json({ error: r.motivo }, { status: r.status });
  return NextResponse.json({ servico: r.servico });
}
