// PATCH /api/admin/training/sdr/suggestions/[id]
//
// ⚠️ A TRAVA QUE FALTAVA (raio-x de 05/08/2026): esta rota conferia o PAPEL
// ("é master?") e nunca a POSSE ("esta sugestão é sua?"). O `id` vem do
// caminho, é global, e ia direto para o `update`. Master do workspace A
// aprovava — e portanto promovia a mudança de Brain de — sugestão do workspace
// B. Estar logado não é ser dono.
//
// A posse é DERIVADA do token (`session.workspaceId`), nunca comparada com algo
// que o cliente mandou, e mora na fronteira única (`lib/auth/posse-de-workspace`).

import { NextRequest, NextResponse } from "next/server";
import { getSession }              from "@/lib/auth/session";
import { sugestaoDoWorkspace, naoEncontrado } from "@/lib/auth/posse-de-workspace";
import { updateSuggestionStatus }  from "@/lib/agency/training/training-store-service";
import type { ImprovementStatus }  from "@/lib/agency/training/types";

const VALID_STATUSES: ImprovementStatus[] = ["approved", "rejected", "applied"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getSession();
  if (!session)                 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "master")
    return NextResponse.json({ error: "Forbidden — master role required" }, { status: 403 });

  const { id } = await params;

  let body: { status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!VALID_STATUSES.includes(body.status as ImprovementStatus)) {
    return NextResponse.json(
      { error: `Invalid status. Valid values: ${VALID_STATUSES.join(", ")}` },
      { status: 400 },
    );
  }

  // A POSSE, antes de qualquer escrita. 404 e não 403: responder "proibido"
  // confirmaria que aquele id existe — um oráculo de enumeração.
  if (!(await sugestaoDoWorkspace(id, session.workspaceId))) return naoEncontrado();

  try {
    await updateSuggestionStatus(id, body.status as ImprovementStatus, session.workspaceId);
    return NextResponse.json({ ok: true, id, status: body.status });
  } catch (err) {
    return NextResponse.json({ error: "Update failed", detail: String(err) }, { status: 500 });
  }
}
