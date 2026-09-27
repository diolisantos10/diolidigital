// POST /api/agency/clients/[id]/dna/vigente — promove uma versão do DNA da
// marca a "vigente" ({ versao }). A anterior vigente (se houver) vira
// "substituido". Só "master". Nunca apaga nada.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { rateLimit } from "@/lib/security/rate-limit";
import { deveBloquearMutacaoCrossSite } from "@/lib/security/navegacao-cross-site";
import { clienteOuNulo } from "@/lib/agency/esteira/posse-do-cliente";
import { tornarVigente } from "@/lib/agency/esteira/dna-da-marca";

export const dynamic = "force-dynamic";

const PODEM_PROMOVER_DNA = ["master"] as const;

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { session, error } = await requireSession([...PODEM_PROMOVER_DNA]);
  if (error) return error;
  if (session.clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (deveBloquearMutacaoCrossSite(request)) {
    return NextResponse.json({ error: "Origem não confiável para esta ação." }, { status: 403 });
  }

  const { allowed, retryAfter } = rateLimit(`dna-da-marca-vigente:${session.userId}`, 20, 60_000);
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
  const versao = corpo && typeof corpo === "object" ? (corpo as { versao?: unknown }).versao : null;
  if (typeof versao !== "number" || !Number.isInteger(versao) || versao < 1) {
    return NextResponse.json({ error: "versao inválida — informe um número inteiro >= 1" }, { status: 400 });
  }

  const r = await tornarVigente({ workspaceId: session.workspaceId, clientId: id, versao });
  if (!r.ok) {
    return NextResponse.json({ error: r.motivo }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
