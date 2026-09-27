// GET/PUT /api/agency/clients/[id]/refacoes — o LIMITE MENSAL DE REFAÇÕES do
// cliente (`lib/agency/esteira/limite-de-refacoes.ts`).
//
// GET → o teto configurado (ou `null`, caindo no padrão da casa), o padrão em
//       si (para a tela nunca hardcodar o número), o mês corrente em Brasília,
//       quantas já foram usadas e quantas restam, e as últimas regeneradas —
//       para o painel responder "por que essa peça não foi refeita" sem
//       precisar de uma segunda tela.
// PUT → só "master" grava. `0..50 | null` — fora da faixa é 400, e nada é
//       gravado.
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
import {
  LIMITE_PADRAO_MENSAL_DA_CASA,
  mesReferenciaBrasilia,
  refacoesNoMes,
} from "@/lib/agency/esteira/limite-de-refacoes";

export const dynamic = "force-dynamic";

const LIMITE_MINIMO = 0;
const LIMITE_MAXIMO = 50;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;
  // Sessão de portal nunca lê a tela administrativa de limite.
  if (session.clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (!(await clienteOuNulo(id, session))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const cliente = await prisma.client.findUnique({
    where: { id },
    select: { limiteRefacoesMes: true },
  });

  const agora = new Date();
  const mes = mesReferenciaBrasilia(agora);
  const limiteEfetivo = cliente?.limiteRefacoesMes ?? LIMITE_PADRAO_MENSAL_DA_CASA;

  let usadasNoMes: number;
  try {
    usadasNoMes = await refacoesNoMes(id, mes);
  } catch {
    // A MESMA régua do resto da casa: leitura indisponível recusa em número
    // (não em acesso) — devolve o pior caso, nunca um "zero" inventado que
    // faria a tela mostrar mais folga do que existe de verdade.
    usadasNoMes = limiteEfetivo;
  }

  const ultimasRefacoes = await prisma.refacaoDaPeca.findMany({
    where: { clientId: id },
    orderBy: { criadoEm: "desc" },
    take: 10,
    select: {
      socialPostId: true,
      motivo: true,
      origem: true,
      contaNoLimite: true,
      criadoEm: true,
    },
  });

  return NextResponse.json({
    limiteRefacoesMes: cliente?.limiteRefacoesMes ?? null,
    padrao: LIMITE_PADRAO_MENSAL_DA_CASA,
    mes,
    usadasNoMes,
    restantes: limiteEfetivo - usadasNoMes,
    ultimas: ultimasRefacoes,
  });
}

const PODEM_GRAVAR_LIMITE = ["master"] as const;

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { session, error } = await requireSession([...PODEM_GRAVAR_LIMITE]);
  if (error) return error;
  if (session.clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (deveBloquearMutacaoCrossSite(request)) {
    return NextResponse.json({ error: "Origem não confiável para esta ação." }, { status: 403 });
  }

  const { allowed, retryAfter } = rateLimit(`limite-refacoes:${session.userId}`, 20, 60_000);
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

  const bruto: unknown = (corpo as Record<string, unknown>).limiteRefacoesMes;
  const valido =
    bruto === null ||
    (typeof bruto === "number" && Number.isInteger(bruto) && bruto >= LIMITE_MINIMO && bruto <= LIMITE_MAXIMO);
  if (!valido) {
    return NextResponse.json(
      { error: `limiteRefacoesMes inválido — precisa ser um inteiro entre ${LIMITE_MINIMO} e ${LIMITE_MAXIMO}, ou null` },
      { status: 400 },
    );
  }
  const valor: number | null = bruto as number | null;

  await prisma.client.update({
    where: { id },
    data: { limiteRefacoesMes: valor },
  });

  return NextResponse.json({ ok: true, limiteRefacoesMes: valor });
}
