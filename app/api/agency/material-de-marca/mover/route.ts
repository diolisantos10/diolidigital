// POST /api/agency/material-de-marca/mover — "Mover para outro cliente".
//
// Só MASTER. Devolve ao cliente certo um arquivo que caiu no errado, sem
// apagar nada. Corpo: { mediaAssetId, deClientId, paraClientId }.
// A lógica é `lib/agency/brand/mover-material.ts` (a mesma do script).

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { moverMaterialDeCliente } from "@/lib/agency/brand/mover-material";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession(["master"]);
  if (error) return error;
  // Sessão de cliente do portal nunca move arquivo, nem com papel de master.
  if (session.clientId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const texto = (k: string) => (typeof corpo?.[k] === "string" ? (corpo[k] as string).trim() : "");
  const mediaAssetId = texto("mediaAssetId");
  const deClientId = texto("deClientId");
  const paraClientId = texto("paraClientId");
  if (!mediaAssetId || !deClientId || !paraClientId) {
    return NextResponse.json({ error: "Informe o arquivo, o cliente de origem e o de destino." }, { status: 400 });
  }

  const r = await moverMaterialDeCliente({
    workspaceId: session.workspaceId,
    mediaAssetId, deClientId, paraClientId,
    quem: session.name || session.email,
  });
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: r.status });
  return NextResponse.json(r);
}
