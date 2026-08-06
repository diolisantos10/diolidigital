// ⚠️ A TRAVA QUE FALTAVA (raio-x de 05/08/2026): a rota conferia o PAPEL e nunca
// a POSSE. O `id` do caminho é global e ia direto para `transitionChangeRequest`
// — um master do workspace A aprovava e APLICAVA (o que cria `BrainVersion`) a
// mudança de Brain proposta no workspace B. Papel responde "quem é você"; nada
// nele responde "isto é seu".

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { mudancaDeBrainDoWorkspace, naoEncontrado } from "@/lib/auth/posse-de-workspace";
import {
  transitionChangeRequest,
  type GovernanceAction,
} from "@/lib/dioli-brain/governance-service";

const VALID_ACTIONS: GovernanceAction[] = ["submit", "approve", "reject", "apply", "archive"];

// PATCH — transition a BrainChangeRequest through the governance lifecycle.
// Body: { action: "submit" | "approve" | "reject" | "apply" | "archive", reviewNote?: string }
// Lifecycle: draft → pending_review → approved/rejected → applied → archived
// "apply" creates a BrainVersion entry. Governance only — no runtime Brain mutation.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "master")
    return NextResponse.json({ error: "Forbidden — master role required" }, { status: 403 });

  const { id } = await params;

  let body: { action?: string; reviewNote?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!VALID_ACTIONS.includes(body.action as GovernanceAction)) {
    return NextResponse.json(
      { error: `Invalid action. Valid values: ${VALID_ACTIONS.join(", ")}` },
      { status: 400 },
    );
  }

  // A POSSE, antes da transição. 404 nos dois casos ("não existe" e "é do
  // vizinho") para a rota não virar oráculo de enumeração de ids.
  if (!(await mudancaDeBrainDoWorkspace(id, session.workspaceId))) return naoEncontrado();

  try {
    const updated = await transitionChangeRequest(
      id,
      body.action as GovernanceAction,
      body.reviewNote,
    );
    return NextResponse.json(updated);
  } catch (err) {
    const message = String(err);
    const status = message.includes("Invalid transition") ? 409
      : message.includes("not found") ? 404
      : 500;
    return NextResponse.json({ error: "Transition failed", detail: message }, { status });
  }
}
