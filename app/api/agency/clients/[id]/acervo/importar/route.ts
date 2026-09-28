// POST /api/agency/clients/[id]/acervo/importar — traz o acervo do Instagram
// da marca para dentro de casa (ver `lib/integrations/meta/acervo.ts`). Só
// "master": é a mutação mais cara desta família (até ~104 chamadas à Meta e
// dezenas de MB baixados para o volume), e idempotente por natureza — rodar
// duas vezes sem `forcar` devolve `ja_importado`, nunca duplica.
//
// Guarda igual às outras mutações de `/api/agency/clients/[id]/**` (ex.:
// `dna/gerar/route.ts`): sessão de staff, nunca portal, CSRF, rate limit,
// posse do cliente por `clienteOuNulo` (404, nunca 403).

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { rateLimit } from "@/lib/security/rate-limit";
import { deveBloquearMutacaoCrossSite } from "@/lib/security/navegacao-cross-site";
import { clienteOuNulo } from "@/lib/agency/esteira/posse-do-cliente";
import { importarAcervo } from "@/lib/integrations/meta/acervo";

export const dynamic = "force-dynamic";

const PODEM_IMPORTAR = ["master"] as const;

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { session, error } = await requireSession([...PODEM_IMPORTAR]);
  if (error) return error;
  if (session.clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (deveBloquearMutacaoCrossSite(request)) {
    return NextResponse.json({ error: "Origem não confiável para esta ação." }, { status: 403 });
  }

  // Teto baixo de propósito: cada importação custa dezenas de chamadas à
  // Meta e dezenas de downloads — não é ação para repetir em rajada.
  const { allowed, retryAfter } = rateLimit(`acervo-importar:${session.userId}`, 4, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Muitas importações em pouco tempo. Aguarde um instante." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const { id } = await ctx.params;
  if (!(await clienteOuNulo(id, session))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const corpo = (await request.json().catch(() => ({}))) as { forcar?: unknown } | null;
  const forcar = corpo?.forcar === true;

  const r = await importarAcervo({ workspaceId: session.workspaceId, clientId: id, forcar });
  if (!r.ok) {
    return NextResponse.json({ ok: false, motivo: r.motivo, codigo: r.codigo }, { status: 422 });
  }

  return NextResponse.json({
    ok: true,
    importados: r.importados,
    jaExistiam: r.jaExistiam,
    semInsights: r.semInsights,
    midiasBaixadas: r.midiasBaixadas,
    falhasDeMidia: r.falhasDeMidia.length,
  });
}
