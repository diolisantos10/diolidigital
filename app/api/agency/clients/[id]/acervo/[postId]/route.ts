// PATCH /api/agency/clients/[id]/acervo/[postId] — marca (ou desmarca) um
// post do acervo como REFERÊNCIA de estilo, e opcionalmente classifica a
// família de layout (ver `marcarReferencia` em `lib/integrations/meta/acervo.ts`).
// Só "master": é decisão de curadoria, não produção automática.
//
// Guarda igual às outras mutações de `/api/agency/clients/[id]/**`: sessão
// de staff, nunca portal, CSRF, rate limit, posse do cliente por
// `clienteOuNulo` (404, nunca 403) — e a posse do POST em si é conferida
// dentro de `marcarReferencia` (clientId + workspaceId no `where`), então um
// `postId` de outro cliente também recusa, não só o `id` da URL.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { rateLimit } from "@/lib/security/rate-limit";
import { deveBloquearMutacaoCrossSite } from "@/lib/security/navegacao-cross-site";
import { clienteOuNulo } from "@/lib/agency/esteira/posse-do-cliente";
import { marcarReferencia } from "@/lib/integrations/meta/acervo";

export const dynamic = "force-dynamic";

const PODEM_MARCAR = ["master"] as const;

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; postId: string }> },
): Promise<NextResponse> {
  const { session, error } = await requireSession([...PODEM_MARCAR]);
  if (error) return error;
  if (session.clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (deveBloquearMutacaoCrossSite(request)) {
    return NextResponse.json({ error: "Origem não confiável para esta ação." }, { status: 403 });
  }

  const { allowed, retryAfter } = rateLimit(`acervo-marcar:${session.userId}`, 60, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Muitas gravações em pouco tempo. Aguarde um instante." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const { id, postId } = await ctx.params;
  if (!(await clienteOuNulo(id, session))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const corpo = (await request.json().catch(() => null)) as
    | { referencia?: unknown; familiaLayout?: unknown }
    | null;
  if (!corpo || typeof corpo.referencia !== "boolean") {
    return NextResponse.json({ error: '"referencia" (boolean) é obrigatório' }, { status: 400 });
  }
  if (corpo.familiaLayout !== undefined && corpo.familiaLayout !== null && typeof corpo.familiaLayout !== "string") {
    return NextResponse.json({ error: '"familiaLayout" precisa ser string ou null' }, { status: 400 });
  }

  const r = await marcarReferencia({
    workspaceId: session.workspaceId,
    clientId: id,
    acervoPostId: postId,
    referencia: corpo.referencia,
    familiaLayout: corpo.familiaLayout as string | null | undefined,
  });
  if (!r.ok) {
    return NextResponse.json({ error: r.motivo }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
