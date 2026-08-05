// GET /api/brain/updates — pending BrainUpdate records (learning loop).
// Agency role only. Optional ?clientRequestId= filter.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import {
  naoEncontrado,
  solicitacaoDoWorkspace,
  solicitacoesDoWorkspace,
} from "@/lib/auth/posse-de-workspace";
import { listPendingBrainUpdates } from "@/lib/dioli-brain/brain-update";

const AGENCY_ROLES = ["master", "project_manager"] as const;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession([...AGENCY_ROLES]);
  if (error) return error;
  if (session.clientId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const clientRequestId = searchParams.get("clientRequestId") ?? searchParams.get("clientId") ?? undefined;

  // `BrainUpdate` não guarda workspace — o dono dele é a solicitação que o
  // gerou. Com filtro, confere-se a solicitação; SEM filtro, a lista vinha da
  // base inteira: o posicionamento, o público-alvo e a voz de marca propostos
  // para os clientes de toda agência, num GET só.
  try {
    if (clientRequestId && !(await solicitacaoDoWorkspace(clientRequestId, session.workspaceId))) {
      return naoEncontrado();
    }
    const updates = await listPendingBrainUpdates(clientRequestId);
    const meus = clientRequestId
      ? updates
      : await (async () => {
          const donos = await solicitacoesDoWorkspace(
            updates.map((u) => u.clientRequestId),
            session.workspaceId,
          );
          return updates.filter((u) => donos.has(u.clientRequestId));
        })();
    return NextResponse.json(meus);
  } catch (e) {
    console.error("[brain/updates] GET error", e);
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}
