// GET /api/agency/clients/[id]/falta-para-publicar — o painel "Falta para
// publicar" (CEO, 04/10/2026). Ver `lib/agency/esteira/falta-para-publicar.ts`.
// Só leitura. Equipe da agência; nunca sessão de portal.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { clienteOuNulo } from "@/lib/agency/esteira/posse-do-cliente";
import { faltaParaPublicar } from "@/lib/agency/esteira/falta-para-publicar";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { session, error } = await requireSession(["master", "project_manager", "social_staff", "design_staff"]);
  if (error) return error;
  if (session.clientId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  if (!(await clienteOuNulo(id, session))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(await faltaParaPublicar(session.workspaceId, id));
}
