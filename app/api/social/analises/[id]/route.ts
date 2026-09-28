// GET /api/social/analises/[id] — uma análise semanal completa (F2-F1):
// métricas por post, o que funcionou/não funcionou (com postId como
// evidência), os ajustes propostos e o relatório.
//
// 404, nunca 403, para análise de outro workspace — mesma régua de
// `posse-do-cliente.ts`: o escopo vai no `where`, nunca numa comparação depois.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";

export const dynamic = "force-dynamic";

/** JSON gravado por este mesmo módulo não deveria vir quebrado — mas ler sem
 *  proteção transformaria um dado antigo/corrompido em 500 cru. `[]` é o
 *  vazio honesto, nunca um `500`. */
function parseOuVazio(json: string): unknown[] {
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;
  if (session.clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const analise = await prisma.analiseSemanal
    .findFirst({ where: { id, client: { workspaceId: session.workspaceId } } })
    .catch(() => null);
  if (!analise) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: analise.id,
    clientId: analise.clientId,
    semanaDe: analise.semanaDe,
    semanaAte: analise.semanaAte,
    metricas: parseOuVazio(analise.metricasJson),
    funcionou: parseOuVazio(analise.funcionouJson),
    naoFuncionou: parseOuVazio(analise.naoFuncionouJson),
    ajustes: parseOuVazio(analise.ajustesJson),
    dnaPropostoVersao: analise.dnaPropostoVersao,
    relatorio: analise.relatorio,
    status: analise.status,
    criadaEm: analise.criadaEm,
  });
}
