// POST /api/agency/clients/[id]/drive/importar — TRAZ OS ARQUIVOS DE UMA
// SUBPASTA PARA O VOLUME DA CASA.
//
// Corpo: { subpasta: "Brand book" | "Logos" | "Fotos de produto" | "Fotos de ambiente" | "Referências" }.
// "Entrada de material" fica de fora — essa é varrida pela vigia periódica do
// bloco 1D, não por este botão.
//
// Só "master" pede. Guarda igual a `.../pacote/route.ts`: sessão obrigatória,
// nunca sessão de portal, CSRF, rate limit, posse do cliente — 404, nunca 403.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { rateLimit } from "@/lib/security/rate-limit";
import { deveBloquearMutacaoCrossSite } from "@/lib/security/navegacao-cross-site";
import { clienteOuNulo } from "@/lib/agency/esteira/posse-do-cliente";
import {
  importarMaterialDaPasta,
  SUBPASTAS_IMPORTAVEIS,
  type SubpastaImportavel,
} from "@/lib/integrations/google/drive-conta-de-servico";

export const dynamic = "force-dynamic";

const PODEM_IMPORTAR = ["master"] as const;

function subpastaValida(v: unknown): SubpastaImportavel | null {
  return typeof v === "string" && (SUBPASTAS_IMPORTAVEIS as readonly string[]).includes(v)
    ? (v as SubpastaImportavel)
    : null;
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { session, error } = await requireSession([...PODEM_IMPORTAR]);
  if (error) return error;
  if (session.clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (deveBloquearMutacaoCrossSite(request)) {
    return NextResponse.json({ error: "Origem não confiável para esta ação." }, { status: 403 });
  }

  const { allowed, retryAfter } = rateLimit(`drive-importar:${session.userId}`, 10, 60_000);
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

  const corpo = await request.json().catch(() => null);
  const subpasta = subpastaValida((corpo as Record<string, unknown> | null)?.subpasta);
  if (!subpasta) {
    return NextResponse.json(
      { error: `subpasta inválida — use uma de: ${SUBPASTAS_IMPORTAVEIS.join(", ")}` },
      { status: 400 },
    );
  }

  const resultado = await importarMaterialDaPasta({ workspaceId: session.workspaceId, clientId: id, subpasta });
  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.motivo }, { status: 422 });
  }

  return NextResponse.json(resultado);
}
