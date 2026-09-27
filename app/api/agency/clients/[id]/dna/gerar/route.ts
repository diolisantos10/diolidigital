// POST /api/agency/clients/[id]/dna/gerar — gera uma NOVA VERSÃO ("proposto")
// do DNA da marca a partir do acervo importado. Só "master".
//
// Recusa 422 com o motivo quando não há acervo importado, ou quando qualquer
// outra coisa impede a gravação — nunca 500 mudo (o motivo é sempre legível).
// Visão indisponível NÃO recusa: os campos qualitativos saem "preciso
// confirmar" e a versão é gravada do mesmo jeito (ver `gerarDnaDaMarca`).
//
// Guarda igual às outras mutações de `/api/agency/clients/[id]/**`.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { rateLimit } from "@/lib/security/rate-limit";
import { deveBloquearMutacaoCrossSite } from "@/lib/security/navegacao-cross-site";
import { clienteOuNulo } from "@/lib/agency/esteira/posse-do-cliente";
import { gerarDnaDaMarca } from "@/lib/agency/esteira/dna-da-marca";

export const dynamic = "force-dynamic";

const PODEM_GERAR_DNA = ["master"] as const;

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { session, error } = await requireSession([...PODEM_GERAR_DNA]);
  if (error) return error;
  if (session.clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (deveBloquearMutacaoCrossSite(request)) {
    return NextResponse.json({ error: "Origem não confiável para esta ação." }, { status: 403 });
  }

  // Teto baixo de propósito: cada geração pode chamar visão (custo real).
  const { allowed, retryAfter } = rateLimit(`dna-da-marca-gerar:${session.userId}`, 6, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Muitas gerações em pouco tempo. Aguarde um instante." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const { id } = await ctx.params;
  if (!(await clienteOuNulo(id, session))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const r = await gerarDnaDaMarca({ workspaceId: session.workspaceId, clientId: id, porQuem: session.userId });
  if (!r.ok) {
    return NextResponse.json({ error: r.motivo }, { status: 422 });
  }

  return NextResponse.json({ ok: true, dnaId: r.dnaId, versao: r.versao });
}
