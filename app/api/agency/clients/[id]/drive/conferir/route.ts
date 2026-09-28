// POST /api/agency/clients/[id]/drive/conferir — LISTA A PASTA, SEM IMPORTAR NADA.
//
// Confirma que a conta de serviço alcança a raiz e as 5 subpastas padrão, e
// diz qual falta. Só leitura — nenhum byte é baixado aqui (isso é
// `.../drive/importar`). Só "master" pede, porque é ele quem decide se o
// cadastro do Drive está pronto para a esteira usar.
//
// Guarda igual a `.../pacote/route.ts`: sessão obrigatória, nunca sessão de
// portal, CSRF, rate limit, posse do cliente via `posse-do-cliente.ts` — 404,
// nunca 403.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { rateLimit } from "@/lib/security/rate-limit";
import { deveBloquearMutacaoCrossSite } from "@/lib/security/navegacao-cross-site";
import { clienteOuNulo } from "@/lib/agency/esteira/posse-do-cliente";
import { conferirPastaDaMarca } from "@/lib/integrations/google/drive-conta-de-servico";

export const dynamic = "force-dynamic";

const PODEM_CONFERIR = ["master"] as const;

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { session, error } = await requireSession([...PODEM_CONFERIR]);
  if (error) return error;
  if (session.clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (deveBloquearMutacaoCrossSite(request)) {
    return NextResponse.json({ error: "Origem não confiável para esta ação." }, { status: 403 });
  }

  const { allowed, retryAfter } = rateLimit(`drive-conferir:${session.userId}`, 10, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Muitas conferências em pouco tempo. Aguarde um instante." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const { id } = await ctx.params;
  if (!(await clienteOuNulo(id, session))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const resultado = await conferirPastaDaMarca({ workspaceId: session.workspaceId, clientId: id });
  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.motivo }, { status: 422 });
  }

  return NextResponse.json(resultado);
}
