// GET/PUT /api/agency/clients/[id]/modo-aprovacao — COMO esta marca aprova.
//
// GET → o modo gravado, a troca pendente (se houver) e o modo QUE VALE AGORA
//       (`modoEmVigor`, calculado na hora da leitura — nunca cacheado).
// PUT → só "master" pede a troca. Nunca troca o ciclo em curso: `solicitarTrocaDeModo`
//       grava a troca como PENDENTE, vigente no próximo ciclo. 409 quando recusada
//       (ex.: sair de APROVACAO_CEO antes da primeira semana aprovada).
//
// Guarda igual a `/api/social-posts/publicar-agora`: sessão obrigatória, nunca
// sessão de portal, CSRF na mutação, rate limit, posse do cliente via
// `posse-do-cliente.ts` — 404, nunca 403, para cliente de outro workspace.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";
import { rateLimit } from "@/lib/security/rate-limit";
import { deveBloquearMutacaoCrossSite } from "@/lib/security/navegacao-cross-site";
import { clienteOuNulo } from "@/lib/agency/esteira/posse-do-cliente";
import {
  MODOS_DE_APROVACAO,
  MODO_INICIAL,
  modoEmVigor,
  solicitarTrocaDeModo,
  type ModoAprovacao,
} from "@/lib/agency/esteira/modo-de-aprovacao";

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

  const cliente = await prisma.client.findUnique({
    where: { id },
    select: { modoAprovacao: true, modoPendente: true, modoPendenteVigenteEm: true, primeiraSemanaAprovadaEm: true },
  });
  if (!cliente) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const modoAtual = (MODOS_DE_APROVACAO as readonly string[]).includes(cliente.modoAprovacao)
    ? (cliente.modoAprovacao as ModoAprovacao)
    : MODO_INICIAL;

  return NextResponse.json({
    modoAprovacao: modoAtual,
    modoPendente: cliente.modoPendente,
    modoPendenteVigenteEm: cliente.modoPendenteVigenteEm,
    primeiraSemanaAprovadaEm: cliente.primeiraSemanaAprovadaEm,
    modoEmVigor: modoEmVigor(cliente, new Date()),
  });
}

const PODEM_TROCAR_MODO = ["master"] as const;

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { session, error } = await requireSession([...PODEM_TROCAR_MODO]);
  if (error) return error;
  if (session.clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (deveBloquearMutacaoCrossSite(request)) {
    return NextResponse.json({ error: "Origem não confiável para esta ação." }, { status: 403 });
  }

  const { allowed, retryAfter } = rateLimit(`modo-aprovacao:${session.userId}`, 20, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Muitas trocas em pouco tempo. Aguarde um instante." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const { id } = await ctx.params;
  if (!(await clienteOuNulo(id, session))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const corpo = (await request.json().catch(() => null)) as { novoModo?: unknown } | null;
  const novoModo = corpo?.novoModo;
  if (typeof novoModo !== "string" || !(MODOS_DE_APROVACAO as readonly string[]).includes(novoModo)) {
    return NextResponse.json(
      { error: `novoModo inválido — use um de: ${MODOS_DE_APROVACAO.join(", ")}` },
      { status: 400 },
    );
  }

  const resultado = await solicitarTrocaDeModo({
    workspaceId: session.workspaceId,
    clientId: id,
    novoModo: novoModo as ModoAprovacao,
    agora: new Date(),
  });

  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.motivo }, { status: 409 });
  }

  return NextResponse.json({ ok: true, vigenteEm: resultado.vigenteEm });
}
