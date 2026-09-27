// GET/PUT /api/agency/clients/[id]/dna — o DNA DA MARCA: registro estruturado,
// versionado, tirado do acervo (ver `lib/agency/esteira/dna-da-marca.ts`).
//
// GET → `{ vigente, versoes }`. `vigente` é `{ versao, conteudo } | null`
//       (nunca um default inventado — ausência de informação não é
//       informação); `versoes` é o histórico (versao, status, geradoPor,
//       createdAt), mais recente primeiro.
// PUT → só "master" grava. Corpo `{ conteudo }`, validado por
//       `DnaDaMarcaConteudoSchema` dentro de `editarDna` — sempre cria uma
//       NOVA versão ("proposto"), nunca sobrescreve.
//
// Guarda igual a `/api/agency/clients/[id]/pacote`: sessão obrigatória, nunca
// sessão de portal, CSRF na mutação, rate limit, e a posse do cliente vem de
// `posse-do-cliente.ts` — 404, nunca 403, para cliente de outro workspace.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";
import { rateLimit } from "@/lib/security/rate-limit";
import { deveBloquearMutacaoCrossSite } from "@/lib/security/navegacao-cross-site";
import { clienteOuNulo } from "@/lib/agency/esteira/posse-do-cliente";
import { dnaVigente, editarDna } from "@/lib/agency/esteira/dna-da-marca";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;
  if (session.clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (!(await clienteOuNulo(id, session))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [vigente, versoes] = await Promise.all([
    dnaVigente(id),
    prisma.dnaDaMarca.findMany({
      where: { clientId: id },
      orderBy: { versao: "desc" },
      select: { versao: true, status: true, geradoPor: true, createdAt: true },
    }),
  ]);

  return NextResponse.json({ vigente, versoes });
}

const PODEM_GRAVAR_DNA = ["master"] as const;

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { session, error } = await requireSession([...PODEM_GRAVAR_DNA]);
  if (error) return error;
  if (session.clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (deveBloquearMutacaoCrossSite(request)) {
    return NextResponse.json({ error: "Origem não confiável para esta ação." }, { status: 403 });
  }

  const { allowed, retryAfter } = rateLimit(`dna-da-marca:${session.userId}`, 20, 60_000);
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
  if (!corpo || typeof corpo !== "object") {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const r = await editarDna({
    workspaceId: session.workspaceId,
    clientId: id,
    conteudo: (corpo as { conteudo?: unknown }).conteudo as never,
    porQuem: session.userId,
  });
  if (!r.ok) {
    return NextResponse.json({ error: r.motivo }, { status: 400 });
  }

  return NextResponse.json({ ok: true, versao: r.versao });
}
