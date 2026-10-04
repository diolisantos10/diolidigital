// POST /api/agency/clients/[id]/marca/reler-brand-books — relê os brand books
// já guardados deste cliente (os que ficaram esperando a IA, ou deram erro).
// Ver `lib/agency/brand/reler-brand-books.ts`.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { clienteOuNulo } from "@/lib/agency/esteira/posse-do-cliente";
import { relerBrandBooksGuardados } from "@/lib/agency/brand/reler-brand-books";
import { AGUARDANDO_O_COFRE, cofreAprovado } from "@/lib/ai/cofre";

export const dynamic = "force-dynamic";

const PODEM_RELER = new Set(["master", "project_manager", "social_staff", "design_staff"]);

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const sessao = await getSession();
  if (!sessao) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (sessao.clientId || !PODEM_RELER.has(sessao.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  if (!(await clienteOuNulo(id, sessao))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Sem o cofre, reler daria o mesmo "aguardando" — e a tela diz isso, em vez
  // de fingir que alguma coisa começou.
  if (!cofreAprovado()) return NextResponse.json({ error: AGUARDANDO_O_COFRE, aguardandoIa: true }, { status: 409 });

  const plano = await relerBrandBooksGuardados({ workspaceId: sessao.workspaceId, clientId: id });
  return NextResponse.json(plano);
}
