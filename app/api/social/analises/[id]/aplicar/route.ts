// POST /api/social/analises/[id]/aplicar — aplica os ajustes de uma análise
// semanal (F2-F1). Só "master". A partir daqui o gerador do calendário
// (`calendario-editorial.ts`, via `pacoteComUltimaAnaliseAplicada`) passa a
// considerar os pesos de pilar e horários desta análise. Proposta que
// ninguém aplicou não muda nada — é esta rota que muda.
//
// Guarda igual a `/api/agency/clients/[id]/dna/gerar`: só master, CSRF na
// mutação, rate limit, 404 (nunca 403) para análise de outro workspace.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";
import { rateLimit } from "@/lib/security/rate-limit";
import { deveBloquearMutacaoCrossSite } from "@/lib/security/navegacao-cross-site";
import { aplicarAjustes } from "@/lib/agency/esteira/analista-semanal";

export const dynamic = "force-dynamic";

const PODEM_APLICAR = ["master"] as const;

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { session, error } = await requireSession([...PODEM_APLICAR]);
  if (error) return error;
  if (session.clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (deveBloquearMutacaoCrossSite(request)) {
    return NextResponse.json({ error: "Origem não confiável para esta ação." }, { status: 403 });
  }

  const { allowed, retryAfter } = rateLimit(`analise-semanal-aplicar:${session.userId}`, 20, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Muitas gravações em pouco tempo. Aguarde um instante." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const { id } = await ctx.params;
  const existe = await prisma.analiseSemanal
    .findFirst({ where: { id, client: { workspaceId: session.workspaceId } }, select: { id: true } })
    .catch(() => null);
  if (!existe) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const r = await aplicarAjustes({ analiseId: id, porQuem: session.userId });
  if (!r.ok) {
    return NextResponse.json({ error: r.motivo }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
