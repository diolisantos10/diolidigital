// GET /api/agency/clients/[id]/perguntas — os fatos que só o cliente sabe.
// Bloco C (CEO, 04/10/2026). Ver `lib/agency/esteira/perguntas-ao-cliente.ts`.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { clienteOuNulo } from "@/lib/agency/esteira/posse-do-cliente";
import { lerFichaUnica } from "@/lib/agency/esteira/ficha-unica";
import { perguntasAoCliente, mensagemDePerguntas } from "@/lib/agency/esteira/perguntas-ao-cliente";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const sessao = await getSession();
  if (!sessao) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!(await clienteOuNulo(id, sessao))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [ficha, cliente] = await Promise.all([
    lerFichaUnica(id),
    prisma.client.findUnique({ where: { id }, select: { name: true } }),
  ]);
  const perguntas = perguntasAoCliente(ficha);
  return NextResponse.json({
    perguntas,
    abertas: perguntas.filter((p) => !p.respondida).length,
    mensagem: mensagemDePerguntas(cliente?.name ?? "marca", perguntas),
  });
}
