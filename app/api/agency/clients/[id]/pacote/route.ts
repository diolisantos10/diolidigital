// GET/PUT /api/agency/clients/[id]/pacote — o PACOTE DA MARCA: o que se produz.
//
// GET → o pacote atual, já validado (`{ pacote }`), ou `{ pacote: null }` com o
//       motivo quando ainda não existe ou está inválido — nunca um default
//       inventado (ausência de informação não é informação).
// PUT → só "master" grava. Corpo validado por `PacoteDaMarcaSchema` — corpo
//       fora do formato é 400 com o erro legível, e NADA é gravado.
//
// Guarda igual a `/api/social-posts/publicar-agora`: sessão obrigatória, nunca
// sessão de portal, CSRF na mutação, rate limit, e a posse do cliente vem de
// `posse-do-cliente.ts` — 404, nunca 403, para cliente de outro workspace.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";
import { rateLimit } from "@/lib/security/rate-limit";
import { deveBloquearMutacaoCrossSite } from "@/lib/security/navegacao-cross-site";
import { clienteOuNulo } from "@/lib/agency/esteira/posse-do-cliente";
import { PacoteDaMarcaSchema, lerPacote } from "@/lib/agency/esteira/pacote-da-marca";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;
  // Sessão de portal nunca lê a tela administrativa de pacote.
  if (session.clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (!(await clienteOuNulo(id, session))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const cliente = await prisma.client.findUnique({ where: { id }, select: { pacoteJson: true } });
  const lido = lerPacote(cliente?.pacoteJson ?? null);

  return NextResponse.json({
    pacote: lido.ok ? lido.pacote : null,
    motivo: lido.ok ? null : lido.motivo,
  });
}

const PODEM_GRAVAR_PACOTE = ["master"] as const;

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { session, error } = await requireSession([...PODEM_GRAVAR_PACOTE]);
  if (error) return error;
  if (session.clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (deveBloquearMutacaoCrossSite(request)) {
    return NextResponse.json({ error: "Origem não confiável para esta ação." }, { status: 403 });
  }

  const { allowed, retryAfter } = rateLimit(`pacote-da-marca:${session.userId}`, 20, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Muitas gravações em pouco tempo. Aguarde um instante." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const { id } = await ctx.params;
  if (!(await clienteOuNulo(id, session))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const corpo = await request.json().catch(() => null);
  if (!corpo) {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = PacoteDaMarcaSchema.safeParse(corpo);
  if (!parsed.success) {
    const primeiro = parsed.error.issues[0];
    const onde = primeiro?.path?.length ? ` (${primeiro.path.join(".")})` : "";
    return NextResponse.json(
      { error: `pacote inválido${onde}: ${primeiro?.message ?? "formato incorreto"}` },
      { status: 400 },
    );
  }

  await prisma.client.update({
    where: { id },
    data: { pacoteJson: JSON.stringify(parsed.data) },
  });

  return NextResponse.json({ ok: true, pacote: parsed.data });
}
